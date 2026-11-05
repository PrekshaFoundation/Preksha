import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminNav } from '@/components/Nav'
import { createNews, deleteNews } from '@/app/actions'

export default async function AdminNews({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: allowed } = await supabase.rpc('has_permission', { p_module: 'news', p_action: 'view' })
  if (!allowed) redirect('/dashboard')
  const { data: canCreate } = await supabase.rpc('has_permission', { p_module: 'news', p_action: 'create' })
  const { data: canDelete } = await supabase.rpc('has_permission', { p_module: 'news', p_action: 'delete' })

  const { data: items } = await supabase.from('news').select('*').order('publish_at', { ascending: false }).limit(100)
  const now = Date.now()

  return (
    <main className="page">
      <AdminNav />
      <h1>News</h1>
      {searchParams.error && <p className="error" role="alert">{searchParams.error}</p>}

      {canCreate && (
        <form action={createNews} className="panel stack">
          <h2>Publish news</h2>
          <label>Heading<input name="title" required /></label>
          <label>Description<textarea name="body" required rows={5} /></label>
          <label>Event date (optional)<input type="date" name="event_date" /></label>
          <label>Publish on (leave empty to publish now, Indian time)<input type="datetime-local" name="publish_at" /></label>
          <label>Image (optional, JPG/PNG/WEBP, up to 5 MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp" /></label>
          <button className="btn">Publish</button>
        </form>
      )}

      <h2>All news</h2>
      {!items?.length && <p className="muted">No news yet.</p>}
      {items?.map((n) => (
        <article key={n.id} className="row-card single">
          <div>
            <h2>{n.title}</h2>
            <p className="muted small">
              {new Date(n.publish_at).getTime() > now ? 'Scheduled for ' : 'Published '}
              {new Date(n.publish_at).toLocaleString('en-IN')}
            </p>
            <p className="prewrap">{n.body}</p>
            {canDelete && (
              <form action={deleteNews}>
                <input type="hidden" name="id" value={n.id} />
                <button className="link">Delete</button>
              </form>
            )}
          </div>
        </article>
      ))}
    </main>
  )
}
