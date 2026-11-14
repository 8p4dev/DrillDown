// 상대 시각 한 벌(r3 삭제 목록: TreeListPage ago · AccountPage rel 통합)
const rtf = new Intl.RelativeTimeFormat('ko')
/** '방금' · 'n분 전' · 'n시간 전' · 'n일 전' · 'n개월 전' · 'n년 전' */
export function ago(t: number): string {
  const s = (Date.now() - t) / 1000
  if (s < 60) return '방금'
  for (const [u, sec] of [['year', 31_536_000], ['month', 2_592_000], ['day', 86_400], ['hour', 3_600]] as const)
    if (s >= sec) return rtf.format(-Math.floor(s / sec), u)
  return rtf.format(-Math.floor(s / 60), 'minute')
}
