'use client'

export type EventEditPanelProps = {
  eventId: string
  onSaved?: (text: string) => void
}

export function EventEditPanel({ eventId }: EventEditPanelProps) {
  return <p className="text-xs text-muted">{`正在加载 ${eventId} ...`}</p>
}
