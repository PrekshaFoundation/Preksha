import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AdminNav } from '@/components/Nav'
import { reviewActivity } from '@/app/actions'

const FILTERS = ['pending', 'correction_requested', 'approved', 'rejected']

export default async function AdminActivities({ searchParams }: { searchParams: { status?: string; error?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: allowed } = await supabase.rpc('has_permission', { p_module: 'activities', p_action: 'view' })
  if (!allowed) redirect('/dashboard')
  const { data: canApprove } = await supabase.rpc('has_permission', { p_module: 'activities', p_action: 'approve' })

  const status = FILTERS.includes(searchParams.status ?? '') ? searchParams.status! : 'pending'
  const { data: items } = await supabase
    .from('activities')
    .select('*, trainers(full_name, trainer_code, city, state, level)')
    .eq('status', status).order('created_at', { ascending: false }).limit(50)

  const ids: string[] = (items ?? []).map((a) => a.id)
  const { data: photoRows } = ids.length
    ? await supabase.from('activity_photos').select('activity_id, storage_path, sort_order').in('activity_id', ids).order('sort_order')
    : { data: [] as any[] }
  const paths: string[] = (photoRows ?? []).map((p: any) => p.storage_path)
  const urls = new Map<string, string>()
  if (paths.length) {
    const { data } = await supabase.storage.from('activity-photos').createSignedUrls(paths, 3600)
    data?.forEach((d) => { if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl) })
  }

  return (
    <main className="page">
      <AdminNav />
      <h1>Activity approvals</h1>
      <div className="tabs">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin/activities?status=${f}`} className={f === status ? 'tab on' : 'tab'}>
            {f.replace('_', ' ')}
          </Link>
        ))}
      </div>
      {searchParams.error && <p className="error" role="alert">{searchParams.error}</p>}
      {!items?.length && <p className="muted">No activities with status “{status.replace('_', ' ')}”.</p>}

      {items?.map((a) => {
        const mine = (photoRows ?? []).filter((p: any) => p.activity_id === a.id)
        return (
          <article key={a.id} className="row-card">
            <div>
              <h2>{a.title}</h2>
              <p><strong>{a.trainers?.full_name}</strong> {a.trainers?.trainer_code} · {a.trainers?.level} · {a.trainers?.city}, {a.trainers?.state}</p>
              <p className="muted small">{a.event_date} · {a.location}, {a.city}, {a.state}, {a.country}</p>
              <p className="prewrap">{a.description}</p>
              {mine.length > 0 && (
                <div className="gallery">
                  {mine.map((p: any) => urls.get(p.storage_path) && (
                    <a key={p.storage_path} href={urls.get(p.storage_path)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls.get(p.storage_path)} alt="Activity photograph" />
                    </a>
                  ))}
                </div>
              )}
              {a.admin_remarks && <p><strong>Remarks:</strong> {a.admin_remarks}</p>}
              {a.category && <p className="muted small">Category: {a.category}</p>}
            </div>
            {canApprove && (
              <form action={reviewActivity} className="actions">
                <input type="hidden" name="id" value={a.id} />
                <label>Category (optional)<input name="category" defaultValue={a.category ?? ''} /></label>
                <label>Remarks (required to reject or request corrections)
                  <input name="remarks" defaultValue={a.admin_remarks ?? ''} />
                </label>
                <div className="btns">
                  <button className="btn" name="status" value="approved">Approve</button>
                  <button className="btn ghost" name="status" value="correction_requested">Request corrections</button>
                  <button className="btn ghost" name="status" value="rejected">Reject</button>
                </div>
              </form>
            )}
          </article>
        )
      })}
    </main>
  )
}
