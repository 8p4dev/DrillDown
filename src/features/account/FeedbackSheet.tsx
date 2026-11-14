// 피드백·버그 보내기 시트 — 계정 화면 버튼으로 연다(비로그인도 가능). POST /api/feedback(종류·≤500자·관련 트리 선택). T4 #43.
// 이메일을 저장하지 않는 서비스라 사용자가 운영자에게 닿는 유일한 글 통로 — 입력란에 "연락처를 적지 마세요". 처리 결과·운영자 메모는 계정 화면 "내 피드백"(GET /api/me/feedback)
import { useEffect, useState } from 'react'
import { api, ApiError, FEEDBACK_CATEGORY, type FeedbackCategory } from '../../core/api'
import { listTrees } from '../../core/repo'
import type { Tree } from '../../core/types'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import { Sheet } from '../../ui/Sheet'
import { toast } from '../Toast'
import '../share/share-list.css'


export default function FeedbackSheet({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent?: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [text, setText] = useState('')
  const [treeId, setTreeId] = useState('')
  const [trees, setTrees] = useState<Tree[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) void listTrees().then(setTrees, () => setTrees([])) }, [open])
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api('/api/feedback', { body: { category, text: text.trim(), tree_id: treeId || undefined } })
      toast('보냈어요 · 처리 결과는 계정 화면에서 볼 수 있어요')
      setText(''); setTreeId('')
      onSent?.()
      onClose()
    } catch (err) {
      toast(err instanceof ApiError && err.status !== 0 ? err.message : '보내지 못했어요 · 다시 시도해 주세요')
    } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} label="피드백 보내기">
      <form className="share-sheet feedback-sheet" onSubmit={(e) => void send(e)}>
        <header className="sheet-head">
          <h2>피드백·버그</h2>
          <button type="button" className="ghost sheet-x" aria-label="닫기" data-tip="닫기" onClick={onClose}><Icon d={I.x} /></button>
        </header>
        <label className="toggle">종류
          <select aria-label="종류" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
            {(Object.keys(FEEDBACK_CATEGORY) as FeedbackCategory[]).map((k) => <option key={k} value={k}>{FEEDBACK_CATEGORY[k]}</option>)}
          </select>
        </label>
        {trees.length > 0 && (
          <label className="toggle">관련 트리
            <select aria-label="관련 트리" value={treeId} onChange={(e) => setTreeId(e.target.value)}>
              <option value="">없음</option>
              {trees.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
          </label>
        )}
        <textarea aria-label="내용" required rows={5} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="무엇이 잘못됐거나, 무엇을 바라는지 적어 주세요" />
        <span className="stat tnum">{text.length}/500 · 연락처(이메일·전화)는 적지 마세요 · 처리 후 90일 뒤 지워집니다</span>
        <div className="actions" style={{ justifyContent: 'flex-end', margin: 0 }}>
          <button type="submit" className="primary" disabled={busy || !text.trim()}>보내기</button>
        </div>
      </form>
    </Sheet>
  )
}
