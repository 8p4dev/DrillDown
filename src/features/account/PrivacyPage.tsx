// 개인정보 처리방침 #/privacy — 03 §3.7 항목 ①~⑩(법 제30조 1항 + 지침). 보호책임자 = GET /api/auth/providers 의 privacy_contact(비면 "운영자 설정 필요").
import { useProviders } from '../../core/me'
import { href } from '../../router'
import './account.css'

const EFFECTIVE = '2026-11-14'
/** 변경 이력 — 표준지침 §21 변경 전·후 비교 공개. 최신이 위 */
const HISTORY: [string, string][] = [
  ['2026-11-14', '추가: 소명 글(처리 후 90일). 관리자 작업 기록에 사용자 정보 조회 기록 포함. 숨김·정지 사유를 당사자에게 앱 내·로그인 화면으로 알림'],
  ['2026-11-08', '최초 시행'],
]

const ITEMS: [string, string, string][] = [
  ['제공자 고유 ID (Google·카카오)', '로그인 식별', '탈퇴 후 7일'],
  ['닉네임', '화면 표시·공유 트리 소유자 표시', '탈퇴 후 7일'],
  ['프로필 사진 주소 (켠 경우만)', '화면 표시', '끄면 즉시 삭제'],
  ['가입·접속·정지·탈퇴 시각, 역할', '운영·통계', '탈퇴 후 7일'],
  ['로그인 기기 (예: "Chrome · Android")', '로그인된 기기 목록', '로그아웃·세션 만료 시'],
  ['트리·노드·학습 기록', '동기화·공유', '탈퇴 후 7일'],
  ['신고 메모', '신고 처리', '처리 후 90일'],
  ['소명 글 (숨김된 트리의 소유자가 보낸 글)', '숨김 재검토', '처리 후 90일'],
  ['관리자 작업·조회 기록', '책임 추적·접속기록 보관', '1년'],
  ['암호화 백업 (위 전부)', '장애 복구', '14일'],
]

export default function PrivacyPage() {
  const contact = useProviders()?.privacy_contact
  return (
    <section className="account privacy">
      <h1>개인정보 처리방침</h1>
      <span className="stat">시행일 {EFFECTIVE}</span>

      <h2>① 처리 목적</h2>
      <p>로그인, 기기 간 동기화, 트리 공유, 서비스 운영(남용 방지·장애 복구)에만 씁니다.</p>

      <h2>② 처리 항목과 보유 기간</h2>
      <table>
        <thead><tr><th>항목</th><th>목적</th><th>보유</th></tr></thead>
        <tbody>{ITEMS.map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)}</tbody>
      </table>
      <p className="stat">수집하지 않음: 이메일·실명·전화번호·생년월일·성별·IP 주소·원문 User-Agent·위치·결제 정보.</p>

      <h2>③ 제3자 제공</h2>
      <p>없습니다.</p>

      <h2>④ 파기 절차·방법</h2>
      <p>탈퇴하면 7일 유예 뒤 DB 에서 지웁니다(7일 안에 다시 로그인하면 취소). 암호화 백업은 14일 뒤 자동 삭제됩니다.</p>

      <h2>⑤ 처리위탁·국외이전</h2>
      <p>Cloudflare(트래픽 경유, 미국 — 접속 IP 를 24시간 보관), Backblaze(암호화 백업 보관, 미국).</p>

      <h2>⑥ 정보주체의 권리</h2>
      <p><a href={href.account()}>계정 화면</a>에서 바로 열람·정정(닉네임)·내보내기·삭제(탈퇴)를 할 수 있습니다.</p>

      <h2>⑦ 개인정보 보호책임자</h2>
      <p>{contact || '운영자 설정 필요'}</p>

      <h2>⑧ 자동 수집 장치(쿠키)</h2>
      <p><code>sid</code>(로그인 유지), <code>oauth</code>(로그인 중 10분), <code>theme</code>(화면 테마). 모두 기능에 필요하며 광고 쿠키는 없습니다.</p>

      <h2>⑨ AI 학습 활용</h2>
      <p>없습니다.</p>

      <h2>⑩ 안전성 확보조치</h2>
      <p>암호화 전송(HTTPS), 세션은 해시로만 저장, 백업 암호화, 관리자 접근 통제·작업 기록(변경·조회 모두, 수정·삭제 불가).</p>

      <h2>⑪ 변경 이력</h2>
      <ul className="muted">{HISTORY.map(([d, t]) => <li key={d}><strong>{d}</strong> — {t}</li>)}</ul>
      <p className="stat">신고·게시중단·소명 절차는 <a href={href.terms()}>이용약관</a>에 있습니다.</p>
    </section>
  )
}
