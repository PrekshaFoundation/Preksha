import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminNav } from '@/components/Nav'
import { createNotification, deleteNotification } from '@/app/actions'

const TYPES = ['General Announcement', 'Important Notice', 'Event Announcement', 'Training Programme', 'Foundation Update', 'Camp Information', 'Administrative Notice']
const LEVELS = ['Facilitator', 'Level 1', 'Level 2', 'Senior Trainer']

export default async function AdminNotifications({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: allowed } = await supabase.rpc('has_permission', { p_module: 'notifications', p_action: 'view' })
  if (!allowed) redirect('/dashboard')
  const { data: canCreate } = await supabase.rpc('has_permission', { p_module: 'notifications', p_action: 'create' })
  const { data: canDelete } = await supabase.rpc('has_permission', { p_module: 'notifications', p_action: 'delete' })

  const { data: items } = await supabase.from('notifications').select('*').order('publish_at', { ascending: false }).limit(100)
  const now = Date.now()

  function audience(n: any): string {
    if (n.target_all) return 'All trainers'
    return [
      n.target_levels?.length ? `Levels: ${n.target_levels.join(', ')}` : '',
      n.target_states?.length ? `States: ${n.target_states.join(', ')}` : '',
      n.target_cities?.length ? `Cities: ${n.target_cities.join(', ')}` : '',
    ].filter(Boolean).join(' · ')
  }

  return (
    <main className="page">
      <AdminNav />
      <h1>Notifications</h1>
      {searchParams.error && <p className="error" role="alert">{searchParams.error}</p>}

      {canCreate && (
        <form action={createNotification} className="panel stack">
          <h2>Publish a notification</h2>
          <label>Type
            <select name="type">{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
          </label>
          <label>Heading<input name="title" required /></label>
          <label>Description<textarea name="body" required rows={4} /></label>
          <label>Attachment (optional: image or PDF, up to 5 MB)
            <input type="file" name="attachment" accept="image/jpeg,image/png,image/webp,application/pdf" />
          </label>
          <label>Publish on (leave empty to publish now, Indian time)<input type="datetime-local" name="publish_at" /></label>
          <label>Expires on (optional)<input type="datetime-local" name="expires_at" /></label>
          <fieldset>
            <legend>Audience</legend>
            <label className="check"><input type="checkbox" name="target_all" defaultChecked /> All trainers</label>
            <p className="muted small">Untick “All trainers” to target by level, state or city.</p>
            {LEVELS.map((l) => (
              <label key={l} className="check"><input type="checkbox" name="levels" value={l} /> {l}</label>
            ))}
            <label>States (comma separated)<input name="states" placeholder="Maharashtra, Rajasthan" /></label>
            <label>Cities (comma separated)<input name="cities" placeholder="Mumbai, Ladnun" /></label>
          </fieldset>
          <button className="btn">Publish</button>
        </form>
      )}

      <h2>History</h2>
      {!items?.length && <p className="muted">No notifications yet.</p>}
      {items?.map((n) => {
        const start = new Date(n.publish_at).getTime()
        const end = n.expires_at ? new Date(n.expires_at).getTime() : null
        const state = start > now ? 'Scheduled' : end && end < now ? 'Expired' : 'Live'
        return (
          <article key={n.id} className="row-card single">
            <div>
              <h2>{n.title} <span className="badge">{state}</span></h2>
              <p className="muted small">{n.type} · {new Date(n.publish_at).toLocaleString('en-IN')} · {audience(n)}</p>
              <p className="prewrap">{n.body}</p>
              {canDelete && (
                <form action={deleteNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button className="link">Delete</button>
                </form>
              )}
            </div>
          </article>
        )
      })}
    </main>
  )
}
