// 공개 트리 탭 — 목록·숨김 2종(보류 30일 = 임시조치 / 확정)·해제·확정, 신고 큐(트리별 묶음), 소명 큐, 삭제 트리 복구. 03 §3.4 공개 트리 행, T2 #27(hidden_until D-N, 상단 요약).
// 게시중단·정보주체 요청 큐는 RequestsTab. 보류 숨김은 30일 뒤 legalDaily 가 해제하므로 D-7 안에 확정/해제를 결정한다.
import { useRef, useState } from 'react'
import { REASON, type AdminTree, type Appeal, type Report } from '../../core/api'
import { eye, eyeOff } from '../../ui/icons.all'
import { I } from '../../ui/icons'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import { date, dday, guard, post, useGet, usePaged, when } from './shared'
import { Dday, Loading, More, TreeLink } from './widgets'

export default function TreesTab() {
  const { items: trees, loaded, next, more, patch } = usePaged<AdminTree>('/api/admin/trees')
  const [reports, setReports] = useGet<{ items: Report[] }>('/api/admin/reports?status=open')
  const [appeals, setAppeals] = useGet<{ items: Appeal[] }>('/api/admin/appeals?status=open')
  const openAppeals = appeals?.items ?? []
  // 소명 처리: 수용 = 숨김 해제(서버가 같은 트리 소명 전부 처리), 기각 = 당사자 공유 화면에 표시
  const decide = (a: Appeal, resolution: 'accepted' | 'rejected') =>
    void post<{ appeal: Appeal }>(`/api/admin/appeals/${a.id}/resolve`, { resolution }).then(() => {
      setAppeals((p) => (p ? { items: p.items.filter((x) => x.tree.id !== a.tree.id) } : p))
      if (resolution === 'accepted') patch((xs) => xs.map((t) => (t.id === a.tree.id ? { ...t, hidden_by_admin_at: null, hidden_until: null } : t)))
      toast(resolution === 'accepted' ? '숨김 해제' : '소명 기각')
    }, guard)
  const live = trees.filter((t) => !t.deleted_at)
  const holds = live.filter((t) => t.hidden_by_admin_at && t.hidden_until)
  const soon = holds.filter((t) => dday(t.hidden_until!) <= 7)
  const open = (reports?.items ?? []).filter((r) => !r.resolved_at)
  // 같은 트리의 신고를 한 묶음으로 — 서버도 숨김 때 그 트리의 열린 신고를 전부 처리한다(admin.ts resolve)
  const groups = Object.values(open.reduce<Record<string, Report[]>>((m, r) => ((m[r.tree.id] ??= []).push(r), m), {}))
  const deleted = trees.filter((t) => t.deleted_at)
  const put = (t: Partial<AdminTree> & { id: string }) => patch((xs) => xs.map((x) => (x.id === t.id ? { ...x, ...t } : x)))
  const resolve = (r: Report, resolution: 'hidden' | 'dismissed') =>
    void post<{ report: Report }>(`/api/admin/reports/${r.id}/resolve`, { resolution }).then(() => {
      const gone = (x: Report) => (resolution === 'hidden' ? x.tree.id === r.tree.id : x.id === r.id)
      setReports((p) => (p ? { items: p.items.filter((x) => !gone(x)) } : p))
      patch((xs) => xs.map((t) => (t.id !== r.tree.id ? t
        : { ...t, open_reports: resolution === 'hidden' ? 0 : Math.max(0, t.open_reports - 1), hidden_by_admin_at: resolution === 'hidden' ? Date.now() : t.hidden_by_admin_at, hidden_until: resolution === 'hidden' ? null : t.hidden_until })))
      toast(resolution === 'hidden' ? '숨김(확정)' : '기각')
    }, guard)
  // 보류 30일: 신고는 열린 채 두고 트리만 임시 숨김 — 기한 안에 숨김(확정) 또는 기각(+해제)으로 마무리
  const hold = (treeId: string) =>
    void post<{ tree: AdminTree }>(`/api/admin/trees/${treeId}/hold`).then((x) => { put(x.tree); toast('임시 숨김 30일') }, guard)
  // 신고 묶음의 "숨김 중" 은 trees(행 동작·소명으로 바뀜)에서 파생 — reports 응답의 tree 는 로드 시점 값
  const hiddenAt = (t: Report['tree']) => live.find((x) => x.id === t.id)?.hidden_by_admin_at ?? t.hidden_by_admin_at
  // 복구된 트리는 비공개일 수 있어 공개 표에 섞지 않는다 — 목록에서 빼고, 공개면 다음 로드에 나타난다
  const restore = (t: AdminTree) =>
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/restore`).then(() => { patch((xs) => xs.filter((x) => x.id !== t.id)); toast('복구됨') }, guard)
  return (
    <>
      {holds.length > 0 && (
        <p className="muted hold-summary"><Icon d={eyeOff} /> 임시조치(보류 숨김) {holds.length}건{soon.length > 0 && <> · <strong className="over">7일 내 만료 {soon.length}건</strong> — 만료되면 자동 해제됩니다. 확정 또는 해제를 정하세요</>}</p>
      )}
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
            const hidden = hiddenAt(t)
            return (
              <li key={t.id}>
                <span className="grow">
                  <strong>{t.title}</strong> <TreeLink slug={t.slug} />{hidden && <> · <Icon d={eyeOff} /> 숨김 중</>}
                  {rs.map((r) => (
                    <span key={r.id} className="sub">
                      {when(r.created_at)} · {REASON[r.reason]}{r.note && ` — ${r.note}`}{' '}
                      <button type="button" className="link" aria-label={`${t.title} 신고 기각`} onClick={() => resolve(r, 'dismissed')}>기각</button>
                    </span>
                  ))}
                </span>
                {!hidden && <TwoStep label="보류 30일" confirmLabel="정말 보류" verb="임시 숨김 30일" onConfirm={() => hold(t.id)} />}
                <TwoStep label={<><Icon d={eyeOff} /> 숨김</>} confirmLabel="정말 숨김" verb="확정 숨김" onConfirm={() => resolve(rs[0], 'hidden')} />
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
              <TwoStep label={<><Icon d={eye} /> 숨김 해제</>} confirmLabel="정말 해제" verb="숨김 해제" onConfirm={() => decide(a, 'accepted')} />
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
              <button type="button" aria-label={`${t.title} 복구`} onClick={() => restore(t)}><Icon d={I.undo2} /> 복구</button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
/** 행 동작: 숨김(보류 30일 기본 / 확정 선택) · 보류 중이면 [확정][해제], 확정이면 [해제] */
function TreeRow({ t, put }: { t: AdminTree; put: (t: Partial<AdminTree> & { id: string }) => void }) {
  const reason = useRef<HTMLInputElement>(null)
  const opts = useRef<HTMLSpanElement>(null)
  const [arming, setArming] = useState(false)
  const [mode, setMode] = useState<'hold' | 'hide'>('hold')
  const hidden = !!t.hidden_by_admin_at
  const act = (a: 'hide' | 'unhide' | 'hold' | 'confirm', why?: string) => {
    setArming(false)
    void post<{ tree: AdminTree }>(`/api/admin/trees/${t.id}/${a}`, why ? { reason: why } : {}).then((r) => put(r.tree), guard)
  }
  return (
    <tr>
      <td data-l="제목" className="name" title={hidden ? `${when(t.hidden_by_admin_at!)} ${t.hidden_until ? '임시' : '확정'} 숨김` : undefined}>
        {hidden && <Icon d={eyeOff} />} {t.title} <TreeLink slug={t.slug} />{hidden && t.hidden_until && <Dday at={t.hidden_until} soon={7} clamp title={`${when(t.hidden_until)} 만료 → 자동 해제`} />}
      </td>
      <td data-l="소유자">{t.owner.nickname}</td>
      <td data-l="노드" className="tnum">{t.node_count}</td>
      <td data-l="갱신" className="tnum">{date(t.updated_at)}</td>
      <td data-l="신고" className="tnum">{t.open_reports}</td>
      <td className="act">
        {arming && !hidden && (
          <span ref={opts} className="hide-opts">
            <select className="mode" aria-label="숨김 종류" value={mode} onChange={(e) => setMode(e.target.value as 'hold' | 'hide')}>
              <option value="hold">보류 30일</option><option value="hide">확정</option>
            </select>
            <input ref={reason} className="reason" aria-label="숨김 사유" placeholder="사유(선택 · 개인정보 금지)" maxLength={200} />
          </span>
        )}
        <span onClickCapture={() => setArming(true)}>
          {hidden
            ? <>
                {t.hidden_until && <TwoStep label="확정" confirmLabel="정말 확정" verb="확정 숨김" onConfirm={() => act('confirm')} />}
                <TwoStep label="해제" confirmLabel="정말 해제" onConfirm={() => act('unhide')} />
              </>
            : <TwoStep label="숨김" confirmLabel="정말 숨김" pauseWhileFocused={opts} onDisarm={() => setArming(false)} onConfirm={() => act(mode, reason.current?.value.trim() || undefined)} />}
        </span>
      </td>
    </tr>
  )
}
