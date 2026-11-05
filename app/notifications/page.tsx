import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'

export default async function NotificationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })

  const now = new Date().toISOString()
  const { data: items } = await supabase.from('notifications').select('*')
    .lte('publish_at', now).or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('publish_at', { ascending: false }).limit(50)

  const paths: string[] = (items ?? []).map((n) => n.attachment_path).filter(Boolean)
  const urls = new Map<string, string>()
  if (paths.length) {
    const { data } = await supabase.storage.from('content-files').createSignedUrls(paths, 3600)
    data?.forEach((d) => { if (d.path) urls.set(d.path, d.signedUrl) })
  }

  return (
    <main className="page narrow">
      <TrainerNav staff={!!staff} />
      <h1>Notifications</h1>
      {!items?.length && <p className="muted">No current notifications.</p>}
      {items?.map((n) => (
        <article key={n.id} className={n.type === 'Important Notice' ? 'feed-card important' : 'feed-card'}>
          <p className="muted small">{n.type} · {new Date(n.publish_at).toLocaleDateString('en-IN')}</p>
          <h2>{n.title}</h2>
          <p className="prewrap">{n.body}</p>
          {n.attachment_path && urls.get(n.attachment_path) && (
            <a href={urls.get(n.attachment_path)} target="_blank" rel="noreferrer">Open attachment</a>
          )}
        </article>
      ))}
    </main>
  )
}
