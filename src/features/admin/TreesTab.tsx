// 공개 트리 탭 — 목록·숨김/해제, 신고 큐(트리별 묶음), 소명 큐, 삭제 트리 복구. 03 §3.4 공개 트리 행. 게시중단·임시조치 30일은 T2 #23·#27.
import { useRef, useState } from 'react'
import type { AdminTree, Appeal, Report } from '../../core/api'
import { eye, eyeOff, undo2 } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import { date, guard, post, REASON, useGet, usePaged, when } from './shared'
import { Loading, More, TreeLink } from './widgets'

export default function TreesTab() {
  const { items: trees, loaded, next, more, patch } = usePaged<AdminTree>('/api/admin/trees')
  const [reports, setReports] = useGet<{ items: Report[] }>('/api/admin/reports?status=open')
  const [appeals, setAppeals] = useGet<{ items: Appeal[] }>('/api/admin/appeals?status=open')
  const openAppeals = appeals?.items ?? []
  // 소명 처리: 수용 = 숨김 해제(서버가 같은 트리 소명 전부 처리), 기각 = 당사자 공유 화면에 표시
  const decide = (a: Appeal, resolution: 'accepted' | 'rejected') =>
    void post<{ appeal: Appeal }>(`/api/admin/appeals/${a.id}/resolve`, { resolution }).then(() => {
      setAppeals((p) => (p ? { items: p.items.filter((x) => x.tree.id !== a.tree.id) } : p))
      if (resolution === 'accepted') patch((xs) => xs.map((t) => (t.id === a.tree.id ? { ...t, hidden_by_admin_at: null } : t)))
      toast(resolution === 'accepted' ? '숨김 해제' : '소명 기각')
    }, guard)
  const live = trees.filter((t) => !t.deleted_at)
  const open = (reports?.items ?? []).filter((r) => !r.resolved_at)
  // 같은 트리의 신고를 한 묶음으로 — 서버도 숨김 때 그 트리의 열린 신고를 전부 처리한다(admin.ts resolve)
  const groups = Object.values(open.reduce<Record<string, Report[]>>((m, r) => ((m[r.tree.id] ??= []).push(r), m), {}))
  const deleted = trees.filter((t) => t.deleted_at)
  const put = (t: AdminTree) => patch((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  const resolve = (r: Report, resolution: 'hidden' | 'dismissed') =>
    void post<{ report: Report }>(`/api/admin/reports/${r.id}/resolve`, { resolution }).then(() => {
      const gone = (x: Report) => (resolution === 'hidden' ? x.tree.id === r.tree.id : x.id === r.id)
      setReports((p) => (p ? { items: p.items.filter((x) => !gone(x)) } : p))
      patch((xs) => xs.map((t) => (t.id !== r.tree.id ? t
        : { ...t, open_reports: resolution === 'hidden' ? 0 : Math.max(0, t.open_reports - 1), hidden_by_admin_at: resolution === 'hidden' ? Date.now() : t.hidden_by_admin_at })))
      toast(resolution === 'hidden' ? '숨김' : '기각')
    }, guard)
  // 복구된 트리는 비공개일 수 있어 공개 표에 섞지 않는다 — 목록에서 빼고, 공개면 다음 로드에 나타난다
  const restore = (t: AdminTree) =>
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/restore`).then(() => { patch((xs) => xs.filter((x) => x.id !== t.id)); toast('복구됨') }, guard)
  return (
    <>
      <table>
        <thead><tr><th>제목</th><th>소유자</th><th>노드</th><th>갱신</th><th>신고</th><th aria-label="동작" /></tr></thead>
        <tbody>{live.map((t) => <TreeRow key={t.id} t={t} put={put} />)}</tbody>
      </table>
      {!loaded && <Loading />}
      {loaded && live.length === 0 && <p className="muted">공개 트리 없음</p>}
      <More next={next} more={more} />
      <h2>신고 {open.length}건</h2>
      {!reports ? <Loading /> : groups.length === 0 ? <p className="muted">열린 신고 없음</p> : (
        <ul className="reports">
          {groups.map((rs) => {
            const t = rs[0].tree
            return (
              <li key={t.id}>
                <span className="grow">
                  <strong>{t.title}</strong> <TreeLink slug={t.slug} />{t.hidden_by_admin_at && <> · <Icon d={eyeOff} /> 숨김 중</>}
                  {rs.map((r) => (
                    <span key={r.id} className="sub">
                      {when(r.created_at)} · {REASON[r.reason]}{r.note && ` — ${r.note}`}{' '}
                      <button type="button" className="link" aria-label={`${t.title} 신고 기각`} onClick={() => resolve(r, 'dismissed')}>기각</button>
                    </span>
                  ))}
                </span>
                <button type="button" aria-label={`${t.title} 숨김`} onClick={() => resolve(rs[0], 'hidden')}><Icon d={eyeOff} /> 숨김</button>
              </li>
            )
          })}
        </ul>
      )}
      <h2>소명 {openAppeals.length}건</h2>
      {!appeals ? <Loading /> : openAppeals.length === 0 ? <p className="muted">검토할 소명 없음</p> : (
        <ul className="reports">
          {openAppeals.map((a) => (
            <li key={a.id}>
              <span className="grow">
                <strong>{a.tree.title}</strong> <TreeLink slug={a.tree.slug} /> · {a.owner}
                <span className="sub">{when(a.created_at)} — {a.text}</span>
              </span>
              <button type="button" aria-label={`${a.tree.title} 소명 수용`} onClick={() => decide(a, 'accepted')}><Icon d={eye} /> 숨김 해제</button>
              <button type="button" aria-label={`${a.tree.title} 소명 기각`} onClick={() => decide(a, 'rejected')}>기각</button>
            </li>
          ))}
        </ul>
      )}
      <h2>삭제된 트리 (7일)</h2>
      {deleted.length === 0 ? <p className="muted">없음</p> : (
        <ul className="reports">
          {deleted.map((t) => (
            <li key={t.id}>
              <span className="grow"><strong>{t.title}</strong> · {t.owner.nickname}<br /><span className="muted">{when(t.deleted_at!)} 삭제</span></span>
              <button type="button" aria-label={`${t.title} 복구`} onClick={() => restore(t)}><Icon d={undo2} /> 복구</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
function TreeRow({ t, put }: { t: AdminTree; put: (t: AdminTree) => void }) {
  const reason = useRef<HTMLInputElement>(null)
  const [arming, setArming] = useState(false)
  const hidden = !!t.hidden_by_admin_at
  const act = (a: 'hide' | 'unhide', why?: string) => {
    setArming(false)
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/${a}`, why ? { reason: why } : {}).then((r) => put(r.tree), guard)
  }
  return (
    <tr>
      <td data-l="제목" className="name" title={hidden ? `${when(t.hidden_by_admin_at!)} 숨김` : undefined}>{hidden && <Icon d={eyeOff} />} {t.title} <TreeLink slug={t.slug} /></td>
      <td data-l="소유자">{t.owner.nickname}</td>
      <td data-l="노드" className="tnum">{t.node_count}</td>
      <td data-l="갱신" className="tnum">{date(t.updated_at)}</td>
      <td data-l="신고" className="tnum">{t.open_reports}</td>
      <td className="act">
        {arming && !hidden && <input ref={reason} className="reason" aria-label="숨김 사유" placeholder="사유(선택 · 개인정보 금지)" maxLength={200} />}
        <span onClickCapture={() => setArming(true)}>
          {hidden
            ? <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => act('unhide')} />
            : <TwoStep label="숨김" confirmLabel="정말 숨김" pauseWhileFocused={reason} onDisarm={() => setArming(false)} onConfirm={() => act('hide', reason.current?.value.trim() || undefined)} />}
        </span>
      </td>
    </tr>
  )
}

