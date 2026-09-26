import { eventStaticParams } from '@/lib/data/load'

export function generateStaticParams() {
  return eventStaticParams()
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
