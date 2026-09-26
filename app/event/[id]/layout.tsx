import { listEventIds } from '@/lib/data/load'

export function generateStaticParams() {
  return listEventIds().map((id) => ({ id }))
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
