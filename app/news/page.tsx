import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'

export default async function NewsPage({ searchParams }: { searchParams: { q?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: staff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })

  const q = (searchParams.q ?? '').replace(/[%,()]/g, ' ').trim()
  let query = supabase.from('news').select('*').lte('publish_at', new Date().toISOString())
    .order('publish_at', { ascending: false }).limit(50)
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`)
  const { data: items } = await query

  const paths: string[] = (items ?? []).map((n) => n.image_path).filter(Boolean)
  const urls = new Map<string, string>()
  if (paths.length) {
    const { data } = await supabase.storage.from('content-files').createSignedUrls(paths, 3600)
    data?.forEach((d) => { if (d.path) urls.set(d.path, d.signedUrl) })
  }

  return (
    <main className="page narrow">
      <TrainerNav staff={!!staff} />
      <h1>News</h1>
      <form method="get" className="filters">
        <input name="q" placeholder="Search news" defaultValue={searchParams.q} />
        <button className="btn">Search</button>
      </form>
      {!items?.length && <p className="muted">No news to show.</p>}
      {items?.map((n) => (
        <article key={n.id} className="feed-card">
          <h2>{n.title}</h2>
          <p className="muted small">
            Published {new Date(n.publish_at).toLocaleDateString('en-IN')}
            {n.event_date ? ` · Event date ${n.event_date}` : ''}
          </p>
          {n.image_path && urls.get(n.image_path) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls.get(n.image_path)} alt="" className="news-img" />
          )}
          <p className="prewrap">{n.body}</p>
        </article>
      ))}
    </main>
  )
}
