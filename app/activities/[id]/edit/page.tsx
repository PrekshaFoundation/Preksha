import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { TrainerNav } from '@/components/Nav'
import ActivityForm from '@/components/ActivityForm'

export default async function EditActivity({
  params, searchParams,
}: { params: { id: string }; searchParams: { photo_error?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: trainer } = await supabase.from('trainers').select('*').eq('user_id', user.id).maybeSingle()
  if (!trainer) redirect('/register')
  const { data: activity } = await supabase
    .from('activities').select('*').eq('id', params.id).eq('trainer_id', trainer.id).maybeSingle()
  if (!activity || !['pending', 'correction_requested'].includes(activity.status)) redirect('/activities')
  const { data: staff } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })

  const { data: rows } = await supabase
    .from('activity_photos').select('id, storage_path').eq('activity_id', activity.id).order('sort_order')
  const paths: string[] = (rows ?? []).map((r) => r.storage_path)
  const urlFor = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('activity-photos').createSignedUrls(paths, 3600)
    signed?.forEach((x) => { if (x.path && x.signedUrl) urlFor.set(x.path, x.signedUrl) })
  }
  const photos = (rows ?? []).map((r) => ({ id: r.id, storage_path: r.storage_path, url: urlFor.get(r.storage_path) ?? null }))

  return (
    <main className="page narrow">
      <TrainerNav staff={!!staff} />
      <h1>Edit activity</h1>
      {activity.admin_remarks && <p className="notice"><strong>Back Office remarks:</strong> {activity.admin_remarks}</p>}
      {searchParams.photo_error && (
        <p className="error">Your activity was saved, but a photograph could not be uploaded. Please add it again below.</p>
      )}
      <ActivityForm
        orgId={trainer.organisation_id}
        trainerId={trainer.id}
        defaults={{ city: trainer.city, state: trainer.state, country: trainer.country }}
        activity={activity}
        photos={photos}
      />
    </main>
  )
}
