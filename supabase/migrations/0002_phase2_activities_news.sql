-- PREKSHA PLATFORM - PHASE 2: ACTIVITIES, FEED, NEWS, NOTIFICATIONS
-- Run once in Supabase: SQL Editor > New query > paste all > Run.

-- HELPERS
create or replace function public.is_approved_trainer() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.trainers where user_id = auth.uid() and status = 'approved') $$;

create or replace function public.photo_is_approved_profile(p_path text) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.trainers where photo_path = p_path and status = 'approved') $$;

-- ACTIVITIES
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_org() references public.organisations(id),
  trainer_id uuid not null references public.trainers(id),
  title text not null,
  event_date date not null,
  location text not null,
  city text not null,
  state text not null,
  country text not null default 'India',
  description text not null,
  category text,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','correction_requested')),
  admin_remarks text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_trainer_idx on public.activities (trainer_id, created_at desc);
create index activities_feed_idx on public.activities (organisation_id, status, event_date desc);

create table public.activity_photos (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  storage_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index activity_photos_idx on public.activity_photos (activity_id, sort_order);

create or replace function public.photos_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.activity_photos where activity_id = new.activity_id) >= 5 then
    raise exception 'An activity can have at most 5 photographs.';
  end if;
  return new;
end $$;
create trigger photos_limit_trg before insert on public.activity_photos
for each row execute function public.photos_limit();

create table public.activity_history (
  id bigserial primary key,
  activity_id uuid not null references public.activities(id) on delete cascade,
  changed_by uuid references auth.users(id),
  from_status text,
  to_status text not null,
  remarks text,
  created_at timestamptz not null default now()
);

create table public.activity_likes (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

-- Guard: trainers can never approve their own work or change protected fields.
create or replace function public.activities_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.has_permission('activities','approve') then
      new.status := 'pending'; new.admin_remarks := null; new.reviewed_by := null;
      new.reviewed_at := null; new.category := null;
    end if;
  else
    if not public.has_permission('activities','approve') then
      new.trainer_id := old.trainer_id; new.organisation_id := old.organisation_id;
      new.admin_remarks := old.admin_remarks; new.reviewed_by := old.reviewed_by;
      new.reviewed_at := old.reviewed_at; new.category := old.category;
      new.status := case when old.status = 'correction_requested' then 'pending' else old.status end;
      if old.status = 'correction_requested' then
        insert into public.activity_history (activity_id, changed_by, from_status, to_status, remarks)
        values (old.id, auth.uid(), old.status, 'pending', 'Resubmitted by trainer');
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger activities_guard_trg before insert or update on public.activities
for each row execute function public.activities_guard();

create or replace function public.activities_log_submit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.activity_history (activity_id, changed_by, from_status, to_status, remarks)
  values (new.id, auth.uid(), null, new.status, 'Submitted');
  return new;
end $$;
create trigger activities_log_submit_trg after insert on public.activities
for each row execute function public.activities_log_submit();

-- REVIEW (approve / reject / request corrections)
create or replace function public.admin_review_activity(
  p_activity uuid, p_status text, p_remarks text, p_category text default null
) returns void language plpgsql security definer set search_path = public as $$
declare a public.activities%rowtype; uemail text;
begin
  if not public.has_permission('activities','approve') then raise exception 'You do not have permission to do this.'; end if;
  if p_status not in ('approved','rejected','correction_requested') then raise exception 'Invalid status.'; end if;
  if p_status in ('rejected','correction_requested') and coalesce(trim(p_remarks), '') = '' then
    raise exception 'Please write a remark explaining the reason.'; end if;
  select * into a from public.activities where id = p_activity and organisation_id = public.current_org() for update;
  if not found then raise exception 'Activity not found.'; end if;

  update public.activities set status = p_status, admin_remarks = nullif(p_remarks, ''),
    category = coalesce(nullif(p_category, ''), category), reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_activity;

  select email into uemail from auth.users where id = auth.uid();
  insert into public.activity_history (activity_id, changed_by, from_status, to_status, remarks)
  values (p_activity, auth.uid(), a.status, p_status, nullif(p_remarks, ''));
  insert into public.audit_logs (organisation_id, user_id, user_email, action, module, record_ref, old_value, new_value, remarks)
  values (a.organisation_id, auth.uid(), uemail, 'Activity ' || p_status, 'activities', a.id::text,
          jsonb_build_object('status', a.status), jsonb_build_object('status', p_status), nullif(p_remarks, ''));
end $$;
grant execute on function public.admin_review_activity(uuid, text, text, text) to authenticated;

-- FEED (approved activities only, with trainer details, photos and like counts)
create or replace function public.get_feed(
  p_city text default null, p_state text default null, p_level text default null,
  p_from date default null, p_to date default null, p_search text default null,
  p_limit int default 10, p_offset int default 0
) returns table (
  id uuid, title text, description text, event_date date, location text, city text, state text, country text,
  trainer_name text, trainer_level text, trainer_city text, trainer_state text, trainer_photo text,
  photos text[], likes bigint, liked boolean
) language sql stable security definer set search_path = public as $$
  select a.id, a.title, a.description, a.event_date, a.location, a.city, a.state, a.country,
         t.full_name, t.level, t.city, t.state, t.photo_path,
         coalesce((select array_agg(ap.storage_path order by ap.sort_order) from public.activity_photos ap where ap.activity_id = a.id), '{}'::text[]),
         (select count(*) from public.activity_likes l where l.activity_id = a.id),
         exists (select 1 from public.activity_likes l where l.activity_id = a.id and l.user_id = auth.uid())
  from public.activities a join public.trainers t on t.id = a.trainer_id
  where a.status = 'approved' and a.organisation_id = public.current_org()
    and (public.is_approved_trainer() or public.has_permission('activities','view'))
    and (coalesce(p_city,'') = '' or lower(a.city) = lower(p_city))
    and (coalesce(p_state,'') = '' or lower(a.state) = lower(p_state))
    and (coalesce(p_level,'') = '' or t.level = p_level)
    and (p_from is null or a.event_date >= p_from)
    and (p_to is null or a.event_date <= p_to)
    and (coalesce(p_search,'') = '' or t.full_name ilike '%' || p_search || '%')
  order by a.event_date desc, a.created_at desc
  limit least(p_limit, 50) offset greatest(p_offset, 0)
$$;
grant execute on function public.get_feed(text, text, text, date, date, text, int, int) to authenticated;

-- NEWS
create table public.news (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_org() references public.organisations(id),
  title text not null,
  body text not null,
  image_path text,
  event_date date,
  publish_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index news_pub_idx on public.news (organisation_id, publish_at desc);

-- NOTIFICATIONS
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null default public.current_org() references public.organisations(id),
  type text not null check (type in ('General Announcement','Important Notice','Event Announcement','Training Programme','Foundation Update','Camp Information','Administrative Notice')),
  title text not null,
  body text not null,
  attachment_path text,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  target_all boolean not null default true,
  target_levels text[] not null default '{}',
  target_states text[] not null default '{}',   -- stored in lower case
  target_cities text[] not null default '{}',   -- stored in lower case
  created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index notifications_pub_idx on public.notifications (organisation_id, publish_at desc);

create or replace function public.trainer_matches(p_all boolean, p_levels text[], p_states text[], p_cities text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trainers t
    where t.user_id = auth.uid() and t.status = 'approved'
      and (p_all or t.level = any(p_levels) or lower(t.state) = any(p_states) or lower(t.city) = any(p_cities)))
$$;

-- AUDIT TRIGGER FOR NEWS AND NOTIFICATIONS
create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare uemail text; org uuid; ref text;
begin
  select email into uemail from auth.users where id = auth.uid();
  if tg_op = 'DELETE' then org := old.organisation_id; ref := old.id::text;
  else org := new.organisation_id; ref := new.id::text; end if;
  insert into public.audit_logs (organisation_id, user_id, user_email, action, module, record_ref, old_value, new_value)
  values (org, auth.uid(), uemail, tg_argv[0] || ' ' || lower(tg_op), tg_argv[0], ref,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger news_audit after insert or update or delete on public.news
for each row execute function public.audit_row('news');
create trigger notifications_audit after insert or update or delete on public.notifications
for each row execute function public.audit_row('notifications');

-- PERMISSIONS FOR THE DEFAULT ROLES
insert into public.role_permissions (role_id, module, action)
select r.id, m.module, m.action from public.roles r
cross join (values
  ('activities','view'),('activities','edit'),('activities','approve'),('activities','export'),
  ('news','view'),('news','create'),('news','edit'),('news','delete'),
  ('notifications','view'),('notifications','create'),('notifications','edit'),('notifications','delete')
) as m(module, action)
where r.key = 'back_office'
on conflict do nothing;
insert into public.role_permissions (role_id, module, action)
select r.id, m.module, 'view' from public.roles r
cross join (values ('activities'),('news'),('notifications')) as m(module)
where r.key = 'read_only'
on conflict do nothing;

-- ROW LEVEL SECURITY
alter table public.activities enable row level security;
alter table public.activity_photos enable row level security;
alter table public.activity_history enable row level security;
alter table public.activity_likes enable row level security;
alter table public.news enable row level security;
alter table public.notifications enable row level security;

create policy act_read on public.activities for select to authenticated using (
  organisation_id = public.current_org() and (
    exists (select 1 from public.trainers t where t.id = trainer_id and t.user_id = auth.uid())
    or public.has_permission('activities','view')
    or (status = 'approved' and public.is_approved_trainer())));
create policy act_insert on public.activities for insert to authenticated with check (
  public.is_approved_trainer()
  and exists (select 1 from public.trainers t where t.id = trainer_id and t.user_id = auth.uid()));
create policy act_update on public.activities for update to authenticated
  using (status in ('pending','correction_requested')
         and exists (select 1 from public.trainers t where t.id = trainer_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trainers t where t.id = trainer_id and t.user_id = auth.uid()));

create policy photos_read_rows on public.activity_photos for select to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id));
create policy photos_insert_rows on public.activity_photos for insert to authenticated
  with check (exists (select 1 from public.activities a join public.trainers t on t.id = a.trainer_id
    where a.id = activity_id and t.user_id = auth.uid() and a.status in ('pending','correction_requested')));
create policy photos_delete_rows on public.activity_photos for delete to authenticated
  using (exists (select 1 from public.activities a join public.trainers t on t.id = a.trainer_id
    where a.id = activity_id and t.user_id = auth.uid() and a.status in ('pending','correction_requested')));

create policy hist_read on public.activity_history for select to authenticated
  using (exists (select 1 from public.activities a where a.id = activity_id
    and (public.has_permission('activities','view')
         or exists (select 1 from public.trainers t where t.id = a.trainer_id and t.user_id = auth.uid()))));

create policy likes_read on public.activity_likes for select to authenticated using (user_id = auth.uid());
create policy likes_insert on public.activity_likes for insert to authenticated with check (
  user_id = auth.uid() and public.is_approved_trainer()
  and exists (select 1 from public.activities a where a.id = activity_id and a.status = 'approved'));
create policy likes_delete on public.activity_likes for delete to authenticated using (user_id = auth.uid());

create policy news_read on public.news for select to authenticated using (
  organisation_id = public.current_org() and (public.has_permission('news','view')
    or (public.is_approved_trainer() and publish_at <= now())));
create policy news_insert on public.news for insert to authenticated
  with check (organisation_id = public.current_org() and public.has_permission('news','create'));
create policy news_update on public.news for update to authenticated
  using (organisation_id = public.current_org() and public.has_permission('news','edit'));
create policy news_delete on public.news for delete to authenticated
  using (organisation_id = public.current_org() and public.has_permission('news','delete'));

create policy notif_read on public.notifications for select to authenticated using (
  organisation_id = public.current_org() and (public.has_permission('notifications','view')
    or (publish_at <= now() and (expires_at is null or expires_at > now())
        and public.trainer_matches(target_all, target_levels, target_states, target_cities))));
create policy notif_insert on public.notifications for insert to authenticated
  with check (organisation_id = public.current_org() and public.has_permission('notifications','create'));
create policy notif_update on public.notifications for update to authenticated
  using (organisation_id = public.current_org() and public.has_permission('notifications','edit'));
create policy notif_delete on public.notifications for delete to authenticated
  using (organisation_id = public.current_org() and public.has_permission('notifications','delete'));

-- STORAGE
insert into storage.buckets (id, name, public) values ('activity-photos', 'activity-photos', false), ('content-files', 'content-files', false)
on conflict (id) do nothing;

create policy actph_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy actph_delete on storage.objects for delete to authenticated
  using (bucket_id = 'activity-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy actph_read on storage.objects for select to authenticated using (
  bucket_id = 'activity-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_permission('activities','view')
    or (public.is_approved_trainer() and exists (
          select 1 from public.activity_photos ap join public.activities a on a.id = ap.activity_id
          where ap.storage_path = name and a.status = 'approved'))));

create policy profph_feed_read on storage.objects for select to authenticated
  using (bucket_id = 'trainer-photos' and public.is_approved_trainer() and public.photo_is_approved_profile(name));

create policy content_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'content-files' and (public.has_permission('news','create') or public.has_permission('notifications','create')));
create policy content_delete on storage.objects for delete to authenticated
  using (bucket_id = 'content-files' and (public.has_permission('news','delete') or public.has_permission('notifications','delete')));
create policy content_read on storage.objects for select to authenticated using (
  bucket_id = 'content-files' and (public.is_approved_trainer()
    or public.has_permission('news','view') or public.has_permission('notifications','view')));
