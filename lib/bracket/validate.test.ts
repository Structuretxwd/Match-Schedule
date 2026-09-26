import { describe, expect, it } from 'vitest'
import { isValidBO, validateScore, winsNeeded } from './validate'

describe('winsNeeded', () => {
  it.each([
    [1, 1],
    [3, 2],
    [5, 3],
    [7, 4],
  ])('BO%i 需要赢 %i 局', (bo, need) => {
    expect(winsNeeded(bo)).toBe(need)
  })
})

describe('isValidBO', () => {
  it('接受 1/3/5/7', () => {
    for (const bo of [1, 3, 5, 7]) expect(isValidBO(bo)).toBe(true)
  })

  it('拒绝偶数与负值', () => {
    for (const bo of [0, 2, 4, 6, -1]) expect(isValidBO(bo)).toBe(false)
  })
})

describe('validateScore', () => {
  it('双方为空表示清除结果，合法', () => {
    expect(validateScore(3, null, null)).toEqual({ ok: true })
  })

  it('单侧为空不合法', () => {
    const r = validateScore(3, 2, null)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('同时填写')
  })

  it('BO3 合法比分 2:0 与 2:1', () => {
    expect(validateScore(3, 2, 0)).toEqual({ ok: true })
    expect(validateScore(3, 2, 1)).toEqual({ ok: true })
  })

  it('BO3 拒绝 1:1（未分出胜负）', () => {
    const r = validateScore(3, 1, 1)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('2 局')
  })

  it('BO3 拒绝单方超过 2 局', () => {
    expect(validateScore(3, 3, 0).ok).toBe(false)
    expect(validateScore(3, 2, 2).ok).toBe(false)
  })

  it('BO5 合法比分 3:0 / 3:1 / 3:2', () => {
    expect(validateScore(5, 3, 0)).toEqual({ ok: true })
    expect(validateScore(5, 3, 1)).toEqual({ ok: true })
    expect(validateScore(5, 3, 2)).toEqual({ ok: true })
  })

  it('BO5 拒绝 2:2', () => {
    expect(validateScore(5, 2, 2).ok).toBe(false)
  })

  it('BO1 合法比分 1:0', () => {
    expect(validateScore(1, 1, 0)).toEqual({ ok: true })
    expect(validateScore(1, 0, 0).ok).toBe(false)
  })

  it('拒绝负数与非整数', () => {
    expect(validateScore(3, -1, 2).ok).toBe(false)
    expect(validateScore(3, 2.5, 0).ok).toBe(false)
  })

  it('拒绝非法 BO', () => {
    expect(validateScore(4, 2, 0).ok).toBe(false)
  })
})
