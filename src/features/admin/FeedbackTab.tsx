// 피드백 탭 — 피드백·버그 수집함 목록(열림·처리됨·전체)·처리/되돌리기·운영자 메모(보낸 사람에게 보임) — T4 #43. 서버 server/account/product.ts
import { useState } from 'react'
import { api, FEEDBACK_CATEGORY, type Feedback } from '../../core/api'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import { toast } from '../Toast'
import { guard, useGet, when } from './shared'
import { Loading } from './widgets'

const STATUS: [string, string][] = [['open', '열림'], ['resolved', '처리됨'], ['all', '전체']]

export default function FeedbackTab() {
  const [status, setStatus] = useState('open')
  const [res, setRes] = useGet<{ items: Feedback[] }>(`/api/admin/feedback?status=${status}`)
  const patch = (f: Feedback, body: { resolved?: boolean; note?: string }) =>
    void api<{ item: Feedback }>(`/api/admin/feedback/${f.id}`, { method: 'PATCH', body }).then((r) => {
      setRes((p) => (p ? { items: p.items.map((x) => (x.id === r.item.id ? r.item : x)) } : p))
      toast(body.note !== undefined ? '메모 저장' : body.resolved ? '처리됨' : '다시 열림')
    }, guard)
  return (
    <>
      <div className="seg" role="group" aria-label="상태">
        {STATUS.map(([s, l]) => <button key={s} type="button" aria-pressed={status === s} onClick={() => setStatus(s)}>{l}</button>)}
      </div>
      {!res ? <Loading /> : res.items.length === 0 ? <p className="muted">피드백 없음</p> : (
        <ul className="reports feedback">
          {res.items.map((f) => (
            <li key={f.id}>
              <span className="grow">
                <strong>{FEEDBACK_CATEGORY[f.category]}</strong> · {f.user ?? '비로그인'} · {f.client} · {when(f.created_at)}{f.tree_id && ` · 트리 ${f.tree_id.slice(0, 8)}`}{f.resolved_at && <> · <Icon d={I.check} /> {when(f.resolved_at)} 처리</>}
                <span className="sub">{f.text}</span>
                <form key={f.note ?? ''} className="notice-form" onSubmit={(e) => { e.preventDefault(); patch(f, { note: (new FormData(e.currentTarget).get('note') as string).trim() }) }}>
                  <label className="admin-search"><Icon d={I.pencil} /><input name="note" aria-label="운영자 메모" placeholder="운영자 메모 (보낸 사람에게 보임 · 300자 · 개인정보 금지)" maxLength={300} defaultValue={f.note ?? ''} /></label>
                  <button type="submit">메모 저장</button>
                </form>
              </span>
              <button type="button" aria-label={`${FEEDBACK_CATEGORY[f.category]} 피드백 ${f.resolved_at ? '다시 열기' : '처리'}`} onClick={() => patch(f, { resolved: !f.resolved_at })}>
                {f.resolved_at ? <><Icon d={I.undo2} /> 다시 열기</> : <><Icon d={I.check} /> 처리</>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">처리된 피드백은 90일 뒤 지워집니다 · 비로그인 5/시 · 로그인 20/시</p>
    </>
  )
}
