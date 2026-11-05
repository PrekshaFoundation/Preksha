'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'

const IST = '+05:30' // dates typed in the Back Office are treated as Indian Standard Time

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function updateTrainer(formData: FormData) {
  const supabase = createClient()
  const { error } = await supabase.rpc('admin_set_trainer_status', {
    p_trainer: String(formData.get('id')),
    p_status: String(formData.get('status')),
    p_remarks: String(formData.get('remarks') ?? ''),
    p_level: String(formData.get('level') ?? ''),
  })
  if (error) redirect('/admin?error=' + encodeURIComponent(error.message))
  revalidatePath('/admin')
}

export async function reviewActivity(formData: FormData) {
  const supabase = createClient()
  const { error } = await supabase.rpc('admin_review_activity', {
    p_activity: String(formData.get('id')),
    p_status: String(formData.get('status')),
    p_remarks: String(formData.get('remarks') ?? ''),
    p_category: String(formData.get('category') ?? ''),
  })
  if (error) redirect('/admin/activities?error=' + encodeURIComponent(error.message))
  revalidatePath('/admin/activities')
}

export async function toggleLike(formData: FormData) {
  const supabase = createClient()
  const id = String(formData.get('id'))
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: existing } = await supabase
    .from('activity_likes').select('activity_id').eq('activity_id', id).eq('user_id', user.id).maybeSingle()
  if (existing) {
    await supabase.from('activity_likes').delete().eq('activity_id', id).eq('user_id', user.id)
  } else {
    await supabase.from('activity_likes').insert({ activity_id: id })
  }
  revalidatePath('/feed')
}

async function uploadContent(file: FormDataEntryValue | null, folder: string, allowPdf: boolean): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null
  const types: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  if (allowPdf) types['application/pdf'] = 'pdf'
  const ext = types[file.type]
  if (!ext) throw new Error(allowPdf ? 'Attachment must be JPG, PNG, WEBP or PDF.' : 'Image must be JPG, PNG or WEBP.')
  if (file.size > 5 * 1024 * 1024) throw new Error('File must be under 5 MB.')
  const supabase = createClient()
  const path = `${folder}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('content-files').upload(path, file, { contentType: file.type })
  if (error) throw new Error('Upload failed: ' + error.message)
  return path
}

function toIso(value: FormDataEntryValue | null): string | null {
  const v = String(value ?? '').trim()
  if (!v) return null
  const d = new Date(v + IST)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export async function createNews(formData: FormData) {
  const supabase = createClient()
  let failure: string | null = null
  try {
    const imagePath = await uploadContent(formData.get('image'), 'news', false)
    const row: Record<string, unknown> = {
      title: String(formData.get('title') ?? '').trim(),
      body: String(formData.get('body') ?? '').trim(),
      event_date: String(formData.get('event_date') ?? '') || null,
      image_path: imagePath,
    }
    const publishAt = toIso(formData.get('publish_at'))
    if (publishAt) row.publish_at = publishAt
    const { error } = await supabase.from('news').insert(row)
    if (error) failure = error.message
  } catch (e) {
    failure = e instanceof Error ? e.message : 'Something went wrong.'
  }
  if (failure) redirect('/admin/news?error=' + encodeURIComponent(failure))
  revalidatePath('/admin/news')
  redirect('/admin/news')
}

export async function deleteNews(formData: FormData) {
  const supabase = createClient()
  const { error } = await supabase.from('news').delete().eq('id', String(formData.get('id')))
  if (error) redirect('/admin/news?error=' + encodeURIComponent(error.message))
  revalidatePath('/admin/news')
}

function splitList(value: FormDataEntryValue | null): string[] {
  return String(value ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
}

export async function createNotification(formData: FormData) {
  const supabase = createClient()
  let failure: string | null = null
  try {
    const targetAll = formData.get('target_all') === 'on'
    const levels = formData.getAll('levels').map(String)
    const states = splitList(formData.get('states'))
    const cities = splitList(formData.get('cities'))
    if (!targetAll && !levels.length && !states.length && !cities.length) {
      throw new Error('Choose All trainers, or select at least one level, state or city.')
    }
    const attachment = await uploadContent(formData.get('attachment'), 'notifications', true)
    const row: Record<string, unknown> = {
      type: String(formData.get('type')),
      title: String(formData.get('title') ?? '').trim(),
      body: String(formData.get('body') ?? '').trim(),
      attachment_path: attachment,
      expires_at: toIso(formData.get('expires_at')),
      target_all: targetAll,
      target_levels: targetAll ? [] : levels,
      target_states: targetAll ? [] : states,
      target_cities: targetAll ? [] : cities,
    }
    const publishAt = toIso(formData.get('publish_at'))
    if (publishAt) row.publish_at = publishAt
    const { error } = await supabase.from('notifications').insert(row)
    if (error) failure = error.message
  } catch (e) {
    failure = e instanceof Error ? e.message : 'Something went wrong.'
  }
  if (failure) redirect('/admin/notifications?error=' + encodeURIComponent(failure))
  revalidatePath('/admin/notifications')
  redirect('/admin/notifications')
}

export async function deleteNotification(formData: FormData) {
  const supabase = createClient()
  const { error } = await supabase.from('notifications').delete().eq('id', String(formData.get('id')))
  if (error) redirect('/admin/notifications?error=' + encodeURIComponent(error.message))
  revalidatePath('/admin/notifications')
}
