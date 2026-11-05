'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { compressImage } from '@/lib/compress'

type Existing = { id: string; storage_path: string; url: string | null }
type Activity = {
  id: string; title: string; event_date: string; location: string; city: string
  state: string; country: string; description: string
}
type Props = {
  orgId: string
  trainerId: string
  defaults: { city: string; state: string; country: string }
  activity?: Activity
  photos?: Existing[]
}

export default function ActivityForm({ orgId, trainerId, defaults, activity, photos = [] }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [existing, setExisting] = useState<Existing[]>(photos)
  const [removed, setRemoved] = useState<Existing[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    const next = [...files, ...Array.from(list)]
    if (existing.length + next.length > 5) {
      setMsg('You can attach at most 5 photographs.')
      return
    }
    setMsg(null)
    setFiles(next)
  }

  function removeExisting(p: Existing) {
    setExisting(existing.filter((x) => x.id !== p.id))
    setRemoved([...removed, p])
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const f = new FormData(e.currentTarget)
    const val = (k: string) => String(f.get(k) ?? '').trim()
    const fields = {
      title: val('title'),
      event_date: val('event_date'),
      location: val('location'),
      city: val('city'),
      state: val('state'),
      country: val('country') || 'India',
      description: val('description'),
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return router.replace('/login')

    let activityId = activity?.id ?? ''
    if (activity) {
      const { error } = await supabase.from('activities').update(fields).eq('id', activity.id)
      if (error) {
        setBusy(false)
        return setMsg('Could not save: ' + error.message)
      }
    } else {
      const { data, error } = await supabase
        .from('activities')
        .insert({ ...fields, organisation_id: orgId, trainer_id: trainerId })
        .select('id')
        .single()
      if (error || !data) {
        setBusy(false)
        return setMsg('Could not save: ' + (error?.message ?? 'unknown error'))
      }
      activityId = data.id
    }

    try {
      for (const p of removed) {
        await supabase.from('activity_photos').delete().eq('id', p.id)
        await supabase.storage.from('activity-photos').remove([p.storage_path])
      }
      let order = existing.length
      for (const file of files) {
        const small = await compressImage(file)
        const path = `${user.id}/${activityId}/${crypto.randomUUID()}.jpg`
        const { error: upErr } = await supabase.storage.from('activity-photos').upload(path, small, { contentType: 'image/jpeg' })
        if (upErr) throw new Error(upErr.message)
        const { error: rowErr } = await supabase
          .from('activity_photos').insert({ activity_id: activityId, storage_path: path, sort_order: order++ })
        if (rowErr) throw new Error(rowErr.message)
      }
    } catch (err) {
      setBusy(false)
      router.replace(`/activities/${activityId}/edit?photo_error=1`)
      return
    }
    router.replace('/activities')
    router.refresh()
  }

  const total = existing.length + files.length

  return (
    <form onSubmit={submit} className="stack">
      <fieldset>
        <legend>Event details</legend>
        <label>Event heading<input name="title" required defaultValue={activity?.title} /></label>
        <label>Event date<input name="event_date" type="date" required defaultValue={activity?.event_date} /></label>
        <label>Event location (venue)<input name="location" required defaultValue={activity?.location} /></label>
        <label>City<input name="city" required defaultValue={activity?.city ?? defaults.city} /></label>
        <label>State<input name="state" required defaultValue={activity?.state ?? defaults.state} /></label>
        <label>Country<input name="country" required defaultValue={activity?.country ?? defaults.country} /></label>
        <label>Description / work done
          <textarea name="description" required rows={5} defaultValue={activity?.description} />
        </label>
      </fieldset>

      <fieldset>
        <legend>Photographs ({total} of 5)</legend>
        {existing.length > 0 && (
          <div className="gallery">
            {existing.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.url && <img src={p.url} alt="Uploaded event photograph" />}
                <button type="button" className="link" onClick={() => removeExisting(p)}>Remove</button>
              </figure>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <ul className="filelist">
            {files.map((file, i) => (
              <li key={i}>{file.name}{' '}
                <button type="button" className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Remove</button>
              </li>
            ))}
          </ul>
        )}
        {total < 5 && (
          <label>Add photographs (JPG, PNG or WEBP)
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple
              onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
          </label>
        )}
        <p className="muted small">Photos are reduced in size automatically before upload.</p>
      </fieldset>

      <button className="btn" disabled={busy}>
        {busy ? 'Saving…' : activity ? 'Save and resubmit for approval' : 'Submit for approval'}
      </button>
      {msg && <p className="error" role="alert">{msg}</p>}
    </form>
  )
}
