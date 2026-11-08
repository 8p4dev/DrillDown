// [스텁 — SH 가 교체] 공개 범위 시트. 계약: 04 §3.10 "공개 범위 컨트롤" — 세그먼트 3(비공개/링크/공개), 링크 줄(복사·열기·재발급), 공개 고지 1회.
// 호출: TreeListPage(LM) ⋯ 메뉴 "공유…" → <ShareSheet tree={t} onClose={...} onChange={reload} />. 비로그인은 "로그인하면 링크로 공유할 수 있습니다" 1줄.
import type { Tree } from '../../core/types'

export default function ShareSheet({ tree, onClose }: { tree: Tree; onClose: () => void; onChange?: () => void }) {
  return (
    <div role="dialog" aria-label="공유" className="sheet">
      <p>{tree.title}</p>
      <button type="button" onClick={onClose}>닫기</button>
    </div>
  )
}
