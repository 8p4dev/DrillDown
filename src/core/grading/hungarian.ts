/**
 * 최대 가중 1:1 할당 (헝가리안, O(N³), N = max(행, 열) 로 정사각 패딩).
 * 반환: 행 i 에 할당된 열 인덱스, 없으면 -1.
 * ponytail: O(N³) — 노드 수백 개까지는 즉시. 수천 개 퀴즈가 생기면 희소 후보만 남기는 분할 필요.
 */
export function assignMax(w: number[][]): number[] {
  const rows = w.length
  const cols = rows ? w[0].length : 0
  const n = Math.max(rows, cols)
  if (!n) return []
  const cost = (i: number, j: number) => (i < rows && j < cols ? -w[i][j] : 0)
  // e-maxx 구현 (1-indexed, p[j] = 열 j 에 할당된 행)
  const u = new Array(n + 1).fill(0)
  const v = new Array(n + 1).fill(0)
  const p = new Array(n + 1).fill(0)
  const way = new Array(n + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array(n + 1).fill(Infinity)
    const used = new Array(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0)
  }
  const res = new Array(rows).fill(-1)
  for (let j = 1; j <= n; j++) if (p[j] - 1 < rows && j - 1 < cols) res[p[j] - 1] = j - 1
  return res
}
