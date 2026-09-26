const VALID_BO = [1, 3, 5, 7]

export function isValidBO(bo: number): boolean {
  return Number.isInteger(bo) && VALID_BO.includes(bo)
}

export function winsNeeded(bo: number): number {
  return Math.ceil((bo + 1) / 2)
}

export type ScoreCheck = { ok: true } | { ok: false; message: string }

export function validateScore(
  bo: number,
  scoreA: number | null,
  scoreB: number | null,
): ScoreCheck {
  if (!isValidBO(bo)) {
    return { ok: false, message: `BO 值非法：${bo}，仅支持 1/3/5/7` }
  }

  const aNull = scoreA === null
  const bNull = scoreB === null
  if (aNull && bNull) return { ok: true }
  if (aNull !== bNull) return { ok: false, message: '比分必须同时填写或同时留空' }

  const a = scoreA as number
  const b = scoreB as number
  if (!Number.isInteger(a) || a < 0) return { ok: false, message: '甲队局分必须为非负整数' }
  if (!Number.isInteger(b) || b < 0) return { ok: false, message: '乙队局分必须为非负整数' }

  const need = winsNeeded(bo)
  if (a > need) return { ok: false, message: `BO${bo} 下单方最多赢 ${need} 局，甲队为 ${a}` }
  if (b > need) return { ok: false, message: `BO${bo} 下单方最多赢 ${need} 局，乙队为 ${b}` }

  const aWin = a === need
  const bWin = b === need
  if (aWin && bWin) {
    return { ok: false, message: `BO${bo} 下双方不可能同时达到 ${need} 局` }
  }
  if (!aWin && !bWin) {
    return { ok: false, message: `BO${bo} 下需有一方赢下 ${need} 局才算结束` }
  }

  return { ok: true }
}
