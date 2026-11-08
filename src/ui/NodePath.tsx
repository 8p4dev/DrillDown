// 경로 표시(빵부스러기) 공용 — FlashPage 의 '현재 위치' nav 를 꺼낸 것(T2, SUMMARY §3)
import type { ID, TreeNode } from '../core/types'

/** path = ancestorsOf 결과. onPick 이 있으면 마지막 외 항목이 버튼. skipRoot = 루트(트리 이름과 같음) 생략 */
export function NodePath({ path, onPick, skipRoot, label = '현재 위치', className = '' }: { path: TreeNode[]; onPick?: (id: ID) => void; skipRoot?: boolean; label?: string; className?: string }) {
  const p = skipRoot ? path.slice(1) : path
  if (p.length < 1 || (!skipRoot && p.length < 2)) return null
  return (
    <nav aria-label={label} className={`node-path ${className}`.trim()}>
      {p.map((n, i) => (
        <span key={n.id}>
          {i > 0 && <span className="sep" aria-hidden>›</span>}
          {i < p.length - 1 && onPick ? <button type="button" className="link" onClick={() => onPick(n.id)}>{n.title}</button> : <span aria-current={i === p.length - 1 ? 'location' : undefined}>{n.title}</span>}
        </span>
      ))}
    </nav>
  )
}
