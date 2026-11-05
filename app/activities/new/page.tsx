import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'
import ActivityForm from '@/components/ActivityForm'

export default async function NewActivity() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: trainer } = await supabase.from('trainers').select('*').eq('user_id', user.id).maybeSingle()
  if (!trainer || trainer.status !== 'approved') redirect('/dashboard')
  const { data: staff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })

  return (
    <main className="page narrow">
      <TrainerNav staff={!!staff} />
      <h1>Report an activity</h1>
      <p className="muted">It will appear in the common feed once the Back Office approves it.</p>
      <ActivityForm
        orgId={trainer.organisation_id}
        trainerId={trainer.id}
        defaults={{ city: trainer.city, state: trainer.state, country: trainer.country }}
      />
    </main>
  )
}
