// 공지·점검 모드 — 03 §3.4 시스템 행. 공지 복수·기간·링크·점검 예약은 T2 #29(이 파일에서 확장).
import { useState } from 'react'
import { api, type Settings } from '../../core/api'
import { megaphone } from '../../ui/icons.all'
import { Icon } from '../../ui/Icon'
import { TwoStep } from '../../ui/TwoStep'
import { toast } from '../Toast'
import { guard } from './shared'

export default function NoticeForm({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [text, setText] = useState(settings.notice.text)
  const [enabled, setEnabled] = useState(settings.notice.enabled)
  const save = (s: Settings, msg?: string) =>
    void api<{ settings: Settings }>('/api/admin/settings', { method: 'PUT', body: s }).then((r) => { onSaved(r.settings); if (msg) toast(msg) }, guard)
  const maint = settings.maintenance.enabled
  return (
    <>
      <form className="notice-form" onSubmit={(e) => { e.preventDefault(); save({ ...settings, notice: { text: text.trim(), enabled } }, '게시됨') }}>
        <label className="admin-search">
          <Icon d={megaphone} /><input aria-label="공지" placeholder="공지 한 줄 (80자)" maxLength={80} value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <label className="toggle"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> 켜기</label>
        <button type="submit" className="primary"><Icon d={megaphone} /> 게시</button>
      </form>
      {/* 점검 모드: 한 번에 전 사용자 503 이라 2단계 */}
      <div className="maint-row">
        <span className="dot" data-ok={!maint} /> 점검 모드 {maint ? '켜짐 — 관리자 외 모든 /api 가 503, 동기화 중단' : '꺼짐'}
        <TwoStep label={maint ? '점검 끄기' : '점검 켜기'} confirmLabel={maint ? '정말 끄기' : '정말 켜기'} verb={maint ? '점검 종료' : '점검 시작'}
          onConfirm={() => save({ ...settings, maintenance: { enabled: !maint } }, maint ? '점검 모드 꺼짐' : '점검 모드 켜짐 · 사용자 동기화가 멈춥니다')} />
      </div>
    </>
  )
}
