const SBASE = 0xac00
const SCOUNT = 11172

/** 한글 음절을 초·중·종성 코드로 분해. 그 밖의 문자는 그대로 1코드. 종성 없음은 생략 */
export function toJamo(s: string): number[] {
  const out: number[] = []
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    const i = c - SBASE
    if (i >= 0 && i < SCOUNT) {
      out.push(0x1100 + Math.floor(i / 588), 0x1161 + Math.floor((i % 588) / 28))
      if (i % 28) out.push(0x11a7 + (i % 28))
    } else out.push(c)
  }
  return out
}

export function levenshtein(a: number[], b: number[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}
