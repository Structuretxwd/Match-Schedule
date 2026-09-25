const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? ''

export function withBase(pathname: string): string {
  const p = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${BASE}${p}`
}

export function dataUrl(pathname: string): string {
  return withBase(`/data${pathname.startsWith('/') ? pathname : `/${pathname}`}`)
}

export function pollUrl(pathname: string): string {
  return `${dataUrl(pathname)}?t=${Date.now()}`
}
