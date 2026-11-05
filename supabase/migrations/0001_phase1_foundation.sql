-- PREKSHA PLATFORM - PHASE 1 FOUNDATION
-- Run once in Supabase: SQL Editor > New query > paste all > Run.

create extension if not exists pgcrypto;

-- ORGANISATIONS (multi-organisation ready; one row for now)
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);
insert into public.organisations (name) values ('Preksha Foundation');

-- ROLES AND PERMISSIONS
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  key text not null,
  name text not null,
  is_system boolean not null default false,
  unique (organisation_id, key)
);
create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  module text not null,
  action text not null check (action in ('view','create','edit','approve','delete','export','download','manage_settings')),
  primary key (role_id, module, action)
);

insert into public.roles (organisation_id, key, name, is_system)
select o.id, r.key, r.name, true
from public.organisations o
cross join (values
  ('super_admin','Super Admin'),
  ('back_office','Back Office Administrator'),
  ('centre_admin','Centre Administrator'),
  ('accounts','Accounts User'),
  ('trainer','Trainer'),
  ('read_only','Read-Only User')
) as r(key, name);

-- Back Office can manage trainers; Read-Only can view them. Super Admin has everything (see is_super_admin).
insert into public.role_permissions (role_id, module, action)
select r.id, 'trainers', a.action
from public.roles r
cross join (values ('view'),('create'),('edit'),('approve'),('export')) as a(action)
where r.key = 'back_office';
insert into public.role_permissions (role_id, module, action)
select r.id, 'trainers', 'view' from public.roles r where r.key = 'read_only';

-- USER PROFILES (one row per login, created automatically)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organisation_id uuid not null references public.organisations(id),
  role_id uuid not null references public.roles(id),
  email text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare org uuid; r uuid;
begin
  select id into org from public.organisations order by created_at limit 1;
  select id into r from public.roles where organisation_id = org and key = 'trainer';
  insert into public.profiles (id, organisation_id, role_id, email) values (new.id, org, r, new.email);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- HELPER FUNCTIONS USED BY SECURITY RULES
create or replace function public.current_org() returns uuid
language sql stable security definer set search_path = public as
$$ select organisation_id from public.profiles where id = auth.uid() $$;

create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles p join public.roles r on r.id = p.role_id
                  where p.id = auth.uid() and r.key = 'super_admin') $$;

create or replace function public.has_permission(p_module text, p_action text) returns boolean
language sql stable security definer set search_path = public as
$$ select public.is_super_admin() or exists (
     select 1 from public.profiles p join public.role_permissions rp on rp.role_id = p.role_id
     where p.id = auth.uid() and rp.module = p_module and rp.action = p_action) $$;

-- COUNTERS (for Trainer IDs)
create table public.org_counters (
  organisation_id uuid not null references public.organisations(id),
  key text not null,
  value int not null default 0,
  primary key (organisation_id, key)
);

-- TRAINERS
create table public.trainers (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  user_id uuid not null unique references auth.users(id),
  trainer_code text,
  full_name text not null,
  date_of_birth date not null,
  mobile text not null,
  email text not null,
  photo_path text,
  flat_no text, building_name text, street text, area text,
  city text not null, state text not null, country text not null default 'India', pin_code text not null,
  level text not null default 'Facilitator' check (level in ('Facilitator','Level 1','Level 2','Senior Trainer')),
  date_of_joining date,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','info_requested','suspended','inactive')),
  admin_remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, mobile),
  unique (organisation_id, trainer_code)
);
create index trainers_status_idx on public.trainers (organisation_id, status);
create index trainers_city_idx on public.trainers (organisation_id, city);

-- Protects sensitive columns so a trainer can never approve themselves or change their level.
create or replace function public.trainers_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;  -- SQL editor / server maintenance
  if tg_op = 'INSERT' then
    if not public.has_permission('trainers','create') then
      new.status := 'pending'; new.trainer_code := null; new.admin_remarks := null;
      new.date_of_joining := null;
    end if;
  else
    if not public.has_permission('trainers','edit') then
      new.status := old.status; new.trainer_code := old.trainer_code; new.admin_remarks := old.admin_remarks;
      new.level := old.level; new.user_id := old.user_id; new.organisation_id := old.organisation_id;
      new.date_of_joining := old.date_of_joining;
      if old.status = 'approved' then   -- important details need Back Office approval
        new.full_name := old.full_name; new.date_of_birth := old.date_of_birth;
        new.mobile := old.mobile; new.email := old.email;
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger trainers_guard_trg before insert or update on public.trainers
for each row execute function public.trainers_guard();

-- TRAINER CHANGE HISTORY
create table public.trainer_history (
  id bigserial primary key,
  trainer_id uuid not null references public.trainers(id) on delete cascade,
  changed_by uuid references auth.users(id),
  field text not null,
  old_value text,
  new_value text,
  remarks text,
  created_at timestamptz not null default now()
);

-- AUDIT LOG (append-only: nobody can edit or delete rows through the app)
create table public.audit_logs (
  id bigserial primary key,
  organisation_id uuid,
  user_id uuid,
  user_email text,
  action text not null,
  module text not null,
  record_ref text,
  old_value jsonb,
  new_value jsonb,
  remarks text,
  created_at timestamptz not null default now()
);
revoke update, delete, truncate on public.audit_logs from public, anon, authenticated;

-- APPROVE / REJECT / REQUEST INFO / SUSPEND (the only way staff change status)
create or replace function public.admin_set_trainer_status(
  p_trainer uuid, p_status text, p_remarks text, p_level text default null
) returns void language plpgsql security definer set search_path = public as $$
declare t public.trainers%rowtype; code text; n int; new_level text; uemail text;
begin
  if not public.has_permission('trainers','approve') then raise exception 'You do not have permission to do this.'; end if;
  if p_status not in ('pending','approved','rejected','info_requested','suspended','inactive') then
    raise exception 'Invalid status.'; end if;
  select * into t from public.trainers where id = p_trainer and organisation_id = public.current_org() for update;
  if not found then raise exception 'Trainer not found.'; end if;

  code := t.trainer_code;
  if p_status = 'approved' and code is null then
    insert into public.org_counters (organisation_id, key, value) values (t.organisation_id, 'trainer', 1)
    on conflict (organisation_id, key) do update set value = public.org_counters.value + 1
    returning value into n;
    code := 'PT-' || lpad(n::text, 4, '0');
  end if;
  new_level := coalesce(nullif(p_level, ''), t.level);

  update public.trainers set
    status = p_status, admin_remarks = nullif(p_remarks, ''), trainer_code = code, level = new_level,
    date_of_joining = case when p_status = 'approved' and date_of_joining is null then current_date else date_of_joining end
  where id = p_trainer;

  select email into uemail from auth.users where id = auth.uid();
  if t.status <> p_status then
    insert into public.trainer_history (trainer_id, changed_by, field, old_value, new_value, remarks)
    values (p_trainer, auth.uid(), 'status', t.status, p_status, nullif(p_remarks, ''));
    insert into public.audit_logs (organisation_id, user_id, user_email, action, module, record_ref, old_value, new_value, remarks)
    values (t.organisation_id, auth.uid(), uemail, 'Trainer status changed', 'trainers', coalesce(code, t.id::text),
            jsonb_build_object('status', t.status), jsonb_build_object('status', p_status), nullif(p_remarks, ''));
  end if;
  if t.level <> new_level then
    insert into public.trainer_history (trainer_id, changed_by, field, old_value, new_value, remarks)
    values (p_trainer, auth.uid(), 'level', t.level, new_level, nullif(p_remarks, ''));
    insert into public.audit_logs (organisation_id, user_id, user_email, action, module, record_ref, old_value, new_value, remarks)
    values (t.organisation_id, auth.uid(), uemail, 'Trainer level changed', 'trainers', coalesce(code, t.id::text),
            jsonb_build_object('level', t.level), jsonb_build_object('level', new_level), nullif(p_remarks, ''));
  end if;
end $$;
grant execute on function public.admin_set_trainer_status(uuid, text, text, text) to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;

-- ROW LEVEL SECURITY
alter table public.organisations enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.org_counters enable row level security;
alter table public.trainers enable row level security;
alter table public.trainer_history enable row level security;
alter table public.audit_logs enable row level security;

create policy org_read on public.organisations for select to authenticated using (id = public.current_org());
create policy roles_read on public.roles for select to authenticated using (organisation_id = public.current_org());
create policy role_perm_read on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id and r.organisation_id = public.current_org()));
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (public.is_super_admin() and organisation_id = public.current_org()));

create policy trainers_read on public.trainers for select to authenticated
  using (user_id = auth.uid() or (organisation_id = public.current_org() and public.has_permission('trainers','view')));
create policy trainers_insert on public.trainers for insert to authenticated
  with check (user_id = auth.uid() and organisation_id = public.current_org());
create policy trainers_update on public.trainers for update to authenticated
  using (user_id = auth.uid() or (organisation_id = public.current_org() and public.has_permission('trainers','edit')))
  with check (user_id = auth.uid() or (organisation_id = public.current_org() and public.has_permission('trainers','edit')));

create policy history_read on public.trainer_history for select to authenticated
  using (exists (select 1 from public.trainers t where t.id = trainer_id
         and (t.user_id = auth.uid() or (t.organisation_id = public.current_org() and public.has_permission('trainers','view')))));
create policy audit_read on public.audit_logs for select to authenticated
  using (public.is_super_admin() and organisation_id = public.current_org());

-- PRIVATE PHOTO STORAGE (each trainer can only use their own folder)
insert into storage.buckets (id, name, public) values ('trainer-photos', 'trainer-photos', false)
on conflict (id) do nothing;
create policy photos_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'trainer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_own_update on storage.objects for update to authenticated
  using (bucket_id = 'trainer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy photos_read on storage.objects for select to authenticated
  using (bucket_id = 'trainer-photos' and ((storage.foldername(name))[1] = auth.uid()::text
         or public.has_permission('trainers','view')));
