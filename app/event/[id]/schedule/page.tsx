import { EventClient } from '@/components/EventClient'
import { loadEvent } from '@/lib/data/load'

export default async function EventSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <EventClient initial={loadEvent(id)} view="schedule" />
}
