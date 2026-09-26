import type { Metadata } from 'next'
import { AdminPage } from '@/components/admin/AdminPage'
import { listEvents } from '@/lib/data/load'

export const metadata: Metadata = { title: '后台管理 · 赛事赛程' }

export default function AdminRoute() {
  return <AdminPage events={listEvents()} />
}
