import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'

const STATUS_TEXT: Record<string, string> = {
  pending: 'Your registration is waiting for Back Office approval. You will be able to use all features once it is approved.',
  info_requested: 'The Back Office needs more information from you. Please read the remarks below.',
  rejected: 'Your registration was not approved. See the remarks below.',
  suspended: 'Your account is suspended. Please contact the Back Office.',
  inactive: 'Your account is inactive. Please contact the Back Office.',
}

export default async function Dashboard() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isStaff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })
  const { data: trainer } = await supabase.from('trainers').select('*').eq('user_id', user.id).maybeSingle()
  if (!trainer && !isStaff) redirect('/register')

  let photoUrl: string | null = null
  if (trainer?.photo_path) {
    const { data } = await supabase.storage.from('trainer-photos').createSignedUrl(trainer.photo_path, 3600)
    photoUrl = data?.signedUrl ?? null
  }

  const approved = trainer?.status === 'approved'
  let total = 0, okCount = 0, pendingCount = 0
  let notes: any[] = [], news: any[] = []
  if (trainer && approved) {
    const count = async (status?: string) => {
      let q = supabase.from('activities').select('id', { count: 'exact', head: true }).eq('trainer_id', trainer.id)
      if (status) q = q.eq('status', status)
      const { count: c } = await q
      return c ?? 0
    }
    total = await count()
    okCount = await count('approved')
    pendingCount = await count('pending')
    const now = new Date().toISOString()
    const n1 = await supabase.from('notifications').select('id, type, title, publish_at')
      .lte('publish_at', now).or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('publish_at', { ascending: false }).limit(3)
    notes = n1.data ?? []
    const n2 = await supabase.from('news').select('id, title, publish_at')
      .lte('publish_at', now).order('publish_at', { ascending: false }).limit(3)
    news = n2.data ?? []
  }

  return (
    <main className="page">
      <TrainerNav staff={!!isStaff} />

      {trainer ? (
        <>
          <section className="profile-head">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Your profile photograph" className="avatar" />
            ) : (
              <div className="avatar placeholder" aria-hidden>{trainer.full_name.charAt(0)}</div>
            )}
            <div>
              <h1>{trainer.full_name}</h1>
              <p className="muted">
                {trainer.trainer_code ? `Trainer ID ${trainer.trainer_code}` : 'Trainer ID not yet assigned'} · {trainer.level}
              </p>
              <p className="muted">{trainer.city}, {trainer.state}</p>
            </div>
          </section>

          {approved ? (
            <>
              <section className="stats">
                <div className="stat"><span>{total}</span>Events reported</div>
                <div className="stat"><span>{okCount}</span>Approved</div>
                <div className="stat"><span>{pendingCount}</span>Pending</div>
              </section>
              <div className="two-col">
                <section>
                  <h2>Latest notifications</h2>
                  {!notes.length && <p className="muted">Nothing new.</p>}
                  {notes.map((n) => <p key={n.id}><strong>{n.title}</strong><br /><span className="muted small">{n.type}</span></p>)}
                  <Link href="/notifications">All notifications →</Link>
                </section>
                <section>
                  <h2>Latest news</h2>
                  {!news.length && <p className="muted">Nothing new.</p>}
                  {news.map((n) => <p key={n.id}><strong>{n.title}</strong></p>)}
                  <Link href="/news">All news →</Link>
                </section>
              </div>
              <p><Link href="/activities/new" className="btn">Report a new activity</Link></p>
            </>
          ) : (
            <section className="notice">
              <p>{STATUS_TEXT[trainer.status]}</p>
              {trainer.admin_remarks && <p><strong>Remarks:</strong> {trainer.admin_remarks}</p>}
            </section>
          )}
        </>
      ) : (
        <section className="notice ok"><p>You are signed in as Back Office staff. Open Back Office to manage trainers, activities, news and notifications.</p></section>
      )}
    </main>
  )
}
