import Link from 'next/link'
import { signOut } from '@/app/actions'

export function TrainerNav({ staff }: { staff: boolean }) {
  return (
    <header className="topbar">
      <strong className="brand">Preksha Foundation</strong>
      <nav>
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/activities">My Activities</Link>
        <Link href="/feed">Activity Feed</Link>
        <Link href="/news">News</Link>
        <Link href="/notifications">Notifications</Link>
        {staff && <Link href="/admin">Back Office</Link>}
        <form action={signOut}><button className="link">Sign out</button></form>
      </nav>
    </header>
  )
}

export function AdminNav() {
  return (
    <header className="topbar">
      <strong className="brand">Back Office</strong>
      <nav>
        <Link href="/admin">Trainers</Link>
        <Link href="/admin/activities">Activity Approvals</Link>
        <Link href="/admin/news">News</Link>
        <Link href="/admin/notifications">Notifications</Link>
        <Link href="/dashboard">My dashboard</Link>
        <form action={signOut}><button className="link">Sign out</button></form>
      </nav>
    </header>
  )
}
