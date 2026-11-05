import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'

const LABEL: Record<string, string> = {
  pending: 'Pending verification',
  approved: 'Approved',
  rejected: 'Rejected',
  correction_requested: 'Corrections requested',
}

export default async function MyActivities() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: trainer } = await supabase.from('trainers').select('id, status').eq('user_id', user.id).maybeSingle()
  if (!trainer) redirect('/register')
  const { data: staff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })

  const { data: activities } = await supabase
    .from('activities').select('*').eq('trainer_id', trainer.id).order('created_at', { ascending: false })

  return (
    <main className="page">
      <TrainerNav staff={!!staff} />
      <div className="head-row">
        <h1>My Activities</h1>
        {trainer.status === 'approved' && <Link href="/activities/new" className="btn">Report new activity</Link>}
      </div>
      {trainer.status !== 'approved' && <p className="notice">You can report activities once your registration is approved.</p>}
      {!activities?.length && trainer.status === 'approved' && <p className="muted">You have not reported any activity yet.</p>}

      {activities?.map((a) => (
        <article key={a.id} className="row-card single">
          <div>
            <h2>{a.title} <span className={`badge ${a.status}`}>{LABEL[a.status]}</span></h2>
            <p className="muted">{a.event_date} · {a.location}, {a.city}, {a.state}</p>
            <p>{a.description}</p>
            {a.admin_remarks && <p><strong>Back Office remarks:</strong> {a.admin_remarks}</p>}
            <p className="muted small">Submitted {new Date(a.created_at).toLocaleDateString('en-IN')}</p>
            {(a.status === 'pending' || a.status === 'correction_requested') && (
              <Link href={`/activities/${a.id}/edit`}>Edit</Link>
            )}
          </div>
        </article>
      ))}
    </main>
  )
}
