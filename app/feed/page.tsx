import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'
import { toggleLike } from '@/app/actions'

const PAGE = 10
const LEVELS = ['Facilitator', 'Level 1', 'Level 2', 'Senior Trainer']
type SP = { city?: string; state?: string; level?: string; from?: string; to?: string; q?: string; page?: string }

function qs(sp: SP, page: number) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) if (v && k !== 'page') p.set(k, v)
  p.set('page', String(page))
  return '?' + p.toString()
}

export default async function Feed({ searchParams }: { searchParams: SP }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })
  const { data: me } = await supabase.from('trainers').select('status').eq('user_id', user.id).maybeSingle()
  if (!staff && me?.status !== 'approved') redirect('/dashboard')

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1)
  const { data: items, error } = await supabase.rpc('get_feed', {
    p_city: searchParams.city || null,
    p_state: searchParams.state || null,
    p_level: searchParams.level || null,
    p_from: searchParams.from || null,
    p_to: searchParams.to || null,
    p_search: searchParams.q || null,
    p_limit: PAGE + 1,
    p_offset: (page - 1) * PAGE,
  })
  const rows: any[] = items ?? []
  const hasNext = rows.length > PAGE
  const shown = rows.slice(0, PAGE)

  const activityPaths: string[] = shown.flatMap((r) => r.photos as string[])
  const profilePaths: string[] = shown.map((r) => r.trainer_photo).filter(Boolean)
  const urls = new Map<string, string>()
  if (activityPaths.length) {
    const { data } = await supabase.storage.from('activity-photos').createSignedUrls(activityPaths, 3600)
    data?.forEach((d) => { if (d.path) urls.set(d.path, d.signedUrl) })
  }
  if (profilePaths.length) {
    const { data } = await supabase.storage.from('trainer-photos').createSignedUrls(profilePaths, 3600)
    data?.forEach((d) => { if (d.path) urls.set(d.path, d.signedUrl) })
  }

  return (
    <main className="page">
      <TrainerNav staff={!!staff} />
      <h1>Activity Feed</h1>
      <form method="get" className="filters">
        <input name="q" placeholder="Search trainer name" defaultValue={searchParams.q} />
        <input name="city" placeholder="City" defaultValue={searchParams.city} />
        <input name="state" placeholder="State" defaultValue={searchParams.state} />
        <select name="level" defaultValue={searchParams.level ?? ''}>
          <option value="">All levels</option>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
        <label className="inline">From<input type="date" name="from" defaultValue={searchParams.from} /></label>
        <label className="inline">To<input type="date" name="to" defaultValue={searchParams.to} /></label>
        <button className="btn">Filter</button>
        <Link href="/feed" className="link">Clear</Link>
      </form>

      {error && <p className="error">{error.message}</p>}
      {!shown.length && !error && <p className="muted">No approved activities match these filters yet.</p>}

      {shown.map((r) => (
        <article key={r.id} className="feed-card">
          <div className="feed-head">
            {r.trainer_photo && urls.get(r.trainer_photo) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urls.get(r.trainer_photo)} alt="" className="avatar small" />
            ) : (
              <div className="avatar small placeholder" aria-hidden>{String(r.trainer_name).charAt(0)}</div>
            )}
            <div>
              <strong>{r.trainer_name}</strong>
              <p className="muted small">{r.trainer_level} · {r.trainer_city}, {r.trainer_state}</p>
            </div>
          </div>
          <h2>{r.title}</h2>
          <p className="muted small">{r.event_date} · {r.location}, {r.city}, {r.state}</p>
          <p>{r.description}</p>
          {r.photos.length > 0 && (
            <div className="gallery">
              {(r.photos as string[]).map((p) => urls.get(p) && (
                <a key={p} href={urls.get(p)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls.get(p)} alt={`Photograph from ${r.title}`} />
                </a>
              ))}
            </div>
          )}
          <form action={toggleLike}>
            <input type="hidden" name="id" value={r.id} />
            <button className={r.liked ? 'btn ghost liked' : 'btn ghost'}>
              {r.liked ? '♥ Appreciated' : '♡ Appreciate'} · {String(r.likes)}
            </button>
          </form>
        </article>
      ))}

      <div className="pager">
        {page > 1 && <Link href={qs(searchParams, page - 1)}>← Newer</Link>}
        {hasNext && <Link href={qs(searchParams, page + 1)}>Older →</Link>}
      </div>
    </main>
  )
}
