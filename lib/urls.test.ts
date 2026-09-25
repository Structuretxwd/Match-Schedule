import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadWithBase(base: string) {
  vi.resetModules()
  vi.stubEnv('NEXT_PUBLIC_BASE_PATH', base)
  return await import('./urls')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('urls', () => {
  it('根路径部署时不加前缀', async () => {
    const { dataUrl, withBase } = await loadWithBase('')
    expect(withBase('/event/x/')).toBe('/event/x/')
    expect(dataUrl('/events/spring-2026.json')).toBe('/data/events/spring-2026.json')
  })

  it('项目站点部署时统一加 basePath 前缀', async () => {
    const { dataUrl, withBase } = await loadWithBase('/match-schedule')
    expect(withBase('/event/x/')).toBe('/match-schedule/event/x/')
    expect(dataUrl('/events/spring-2026.json')).toBe('/match-schedule/data/events/spring-2026.json')
  })

  it('dataUrl 自动补前导斜杠', async () => {
    const { dataUrl } = await loadWithBase('/repo')
    expect(dataUrl('events/a.json')).toBe('/repo/data/events/a.json')
  })

  it('pollUrl 附加时间戳用于绕过 CDN 缓存', async () => {
    const { pollUrl } = await loadWithBase('/repo')
    expect(pollUrl('/events/a.json')).toMatch(/^\/repo\/data\/events\/a\.json\?t=\d+$/)
  })
})
