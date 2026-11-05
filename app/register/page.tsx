'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LEVELS = ['Facilitator', 'Level 1', 'Level 2', 'Senior Trainer']

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [userId, setUserId] = useState('')
  const [orgId, setOrgId] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.replace('/login')
      const { data: existing } = await supabase.from('trainers').select('id').eq('user_id', user.id).maybeSingle()
      if (existing) return router.replace('/dashboard')
      const { data: profile } = await supabase.from('profiles').select('organisation_id').eq('id', user.id).single()
      setUserId(user.id)
      setEmail(user.email ?? '')
      setOrgId(profile?.organisation_id ?? '')
      setReady(true)
    }
    load()
  }, [router, supabase])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const f = new FormData(e.currentTarget)
    const val = (k: string) => String(f.get(k) ?? '').trim()

    const mobile = val('mobile').replace(/[\s-]/g, '')
    if (!/^\+?\d{7,15}$/.test(mobile)) {
      setBusy(false)
      return setMsg('Enter a valid mobile number (7 to 15 digits, optional + at the start).')
    }

    let photoPath: string | null = null
    const photo = f.get('photo') as File | null
    if (photo && photo.size > 0) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) {
        setBusy(false)
        return setMsg('Photo must be a JPG, PNG or WEBP file under 5 MB.')
      }
      const ext = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg'
      const path = `${userId}/profile.${ext}`
      const { error: upErr } = await supabase.storage.from('trainer-photos').upload(path, photo, { upsert: true })
      if (upErr) {
        setBusy(false)
        return setMsg('Photo upload failed: ' + upErr.message)
      }
      photoPath = path
    }

    const { error } = await supabase.from('trainers').insert({
      organisation_id: orgId,
      user_id: userId,
      full_name: val('full_name'),
      date_of_birth: val('date_of_birth'),
      mobile,
      email,
      photo_path: photoPath,
      flat_no: val('flat_no') || null,
      building_name: val('building_name') || null,
      street: val('street') || null,
      area: val('area') || null,
      city: val('city'),
      state: val('state'),
      country: val('country') || 'India',
      pin_code: val('pin_code'),
      level: val('level'),
    })
    setBusy(false)
    if (error) {
      if (error.code === '23505') return setMsg('This mobile number is already registered.')
      return setMsg('Could not save your registration: ' + error.message)
    }
    router.replace('/dashboard')
    router.refresh()
  }

  if (!ready) return <main className="auth-wrap"><p className="muted">Loading…</p></main>

  return (
    <main className="page narrow">
      <h1>Trainer registration</h1>
      <p className="muted">Your details will be reviewed by the Back Office before your account is activated.</p>
      <form onSubmit={submit} className="stack">
        <fieldset>
          <legend>Personal details</legend>
          <label>Full name<input name="full_name" required /></label>
          <label>Date of birth<input name="date_of_birth" type="date" required /></label>
          <label>Mobile number<input name="mobile" inputMode="tel" required placeholder="9876543210" /></label>
          <label>Email address<input value={email} readOnly /></label>
          <label>Profile photograph (optional)<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /></label>
        </fieldset>
        <fieldset>
          <legend>Address</legend>
          <label>Flat / house number<input name="flat_no" /></label>
          <label>Building name<input name="building_name" /></label>
          <label>Street<input name="street" /></label>
          <label>Area / locality<input name="area" /></label>
          <label>City<input name="city" required /></label>
          <label>State<input name="state" required /></label>
          <label>Country<input name="country" defaultValue="India" required /></label>
          <label>PIN / postal code<input name="pin_code" required /></label>
        </fieldset>
        <fieldset>
          <legend>Trainer level</legend>
          <label>Level you are applying as
            <select name="level" defaultValue="Facilitator">
              {LEVELS.map((l) => <option key={l}>{l}</option>)}
            </select>
          </label>
        </fieldset>
        <button className="btn" disabled={busy}>{busy ? 'Submitting…' : 'Submit for approval'}</button>
        {msg && <p className="error" role="alert">{msg}</p>}
      </form>
    </main>
  )
}
