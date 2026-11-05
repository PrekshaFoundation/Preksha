'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
  if (error) {
    redirect('/admin?error=' + encodeURIComponent(error.message))
  }
  revalidatePath('/admin')
}
