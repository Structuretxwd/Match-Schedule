'use client'

import type { ConnectorView } from '@/lib/view'

export type ConnectorsProps = {
  connectors: ConnectorView[]
  width: number
  height: number
}

export function Connectors({ connectors, width, height }: ConnectorsProps) {
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={width}
      height={height}
      aria-hidden="true"
    >
      {connectors.map((c) => (
        <path
          key={c.key}
          d={c.path}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={1.5}
          strokeDasharray={c.dashed ? '4 4' : undefined}
        />
      ))}
    </svg>
  )
}
