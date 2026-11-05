import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { updateTrainer } from '@/app/actions'
import { AdminNav } from '@/components/Nav'

const FILTERS = ['pending', 'info_requested', 'approved', 'rejected', 'suspended', 'inactive']
const LEVELS = ['Facilitator', 'Level 1', 'Level 2', 'Senior Trainer']

export default async function AdminPage({ searchParams }: { searchParams: { status?: string; error?: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: allowed } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'view' })
  if (!allowed) redirect('/dashboard')
  const { data: canApprove } = await supabase.rpc('has_permission', { p_module: 'trainers', p_action: 'approve' })

  const status = FILTERS.includes(searchParams.status ?? '') ? searchParams.status! : 'pending'
  const { data: trainers } = await supabase
    .from('trainers').select('*').eq('status', status).order('created_at', { ascending: false }).limit(100)

  return (
    <main className="page">
      <AdminNav />

      <div className="tabs">
        {FILTERS.map((f) => (
          <Link key={f} href={`/admin?status=${f}`} className={f === status ? 'tab on' : 'tab'}>
            {f.replace('_', ' ')}
          </Link>
        ))}
      </div>

      {searchParams.error && <p className="error" role="alert">{searchParams.error}</p>}
      {!trainers?.length && <p className="muted">No trainers with status “{status.replace('_', ' ')}”.</p>}

      {trainers?.map((t) => (
        <article key={t.id} className="row-card">
          <div>
            <h2>{t.full_name} <span className="muted">{t.trainer_code ?? ''}</span></h2>
            <p>{t.email} · {t.mobile}</p>
            <p className="muted">
              {[t.flat_no, t.building_name, t.street, t.area, t.city, t.state, t.country, t.pin_code].filter(Boolean).join(', ')}
            </p>
            <p className="muted">Born {t.date_of_birth} · Applied as {t.level} · Registered {new Date(t.created_at).toLocaleDateString('en-IN')}</p>
            {t.admin_remarks && <p><strong>Remarks:</strong> {t.admin_remarks}</p>}
          </div>
          {canApprove && (
            <form action={updateTrainer} className="actions">
              <input type="hidden" name="id" value={t.id} />
              <label>Level
                <select name="level" defaultValue={t.level}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
              </label>
              <label>Remarks<input name="remarks" defaultValue={t.admin_remarks ?? ''} /></label>
              <div className="btns">
                <button className="btn" name="status" value="approved">Approve</button>
                <button className="btn ghost" name="status" value="info_requested">Request info</button>
                <button className="btn ghost" name="status" value="rejected">Reject</button>
                <button className="btn ghost" name="status" value="suspended">Suspend</button>
              </div>
            </form>
          )}
        </article>
      ))}
    </main>
  )
}
