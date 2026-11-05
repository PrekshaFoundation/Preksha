import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '@/app/actions'

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

  return (
    <main className="page">
      <header className="topbar">
        <strong className="brand">Preksha Foundation</strong>
        <nav>
          {isStaff && <Link href="/admin">Back Office</Link>}
          <form action={signOut}><button className="link">Sign out</button></form>
        </nav>
      </header>

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

          {trainer.status === 'approved' ? (
            <section className="notice ok">
              <p>Your account is active. Activity reporting, certificates, news and notifications arrive in the next phases.</p>
            </section>
          ) : (
            <section className="notice">
              <p>{STATUS_TEXT[trainer.status]}</p>
              {trainer.admin_remarks && <p><strong>Remarks:</strong> {trainer.admin_remarks}</p>}
            </section>
          )}
        </>
      ) : (
        <section className="notice ok"><p>You are signed in as Back Office staff. Open Back Office to manage trainers.</p></section>
      )}
    </main>
  )
}
