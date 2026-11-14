# W4. 관리자 페이지 — 외부 기준·법규 관점 조사

작성 2026-11-14 · 담당 W4 · 대상 `C:\drilldown\app` (`#/admin`, `server/account/admin.ts`) · 모든 URL 확인일 **2026-11-14**
표기: **[코드]** 파일:줄로 확인한 사실 / **[가정]** 추측 / **[확인 필요]** 법 해석·조문 번호가 1차 출처로 확정되지 않은 것 / 출처는 `[Sn]` → §7

## 0. 핵심 5줄

1. 현재 관리자 페이지(대시보드·사용자·공개 트리·시스템)는 Notion·Quizlet·Discourse 급 "신고 큐 + 숨김 + 감사 로그" 뼈대를 이미 갖췄다. 빠진 것은 **처리 결과를 당사자(신고자·게시자)에게 알리는 경로**와 **기한이 있는 요청 큐**다.
2. 한국 법규 중 이 서비스(비영리·OAuth만·IP 미저장·운영자 1~2인)에 **실제로 적용되는 것**은 개인정보보호법(처리방침 공개, 열람·정정·삭제·처리정지 10일 응답, 유출 72시간 신고·통지, 접속기록 1년), 저작권법 제103조(게시중단·재개·수령인 공지)다. 전기통신사업법 제22조의5(불법촬영물), 정보통신망법 청소년보호책임자, 2026 허위조작정보법은 **규모 기준 미달로 비적용**.
3. 가장 먼저 넣을 것(높·S~M): ① 저작권 게시중단 요청 접수 폼 + 상태 큐(접수→중단→소유자 통보→재개 요구 30일) ② 숨김·정지 사유를 **소유자 화면에 전달**(현재 403만 받음) ③ 정보주체 요청 큐(유형·접수일·D-10 표시) ④ `audit_log` UPDATE/DELETE 차단 트리거 + 관리자 **조회** 기록.
4. 미성년(만 14세 미만)·1년 미이용자 분리보관·약관 변경 공지는 **관리자 도구가 아니라 정책 문서로 해결**(연령 확인 불가 → "만 14세 이상만" 고지, 유효기간제는 2023-09-15 폐지, 약관은 아직 없음).
5. UI 자체 기준: 관리자 세션 24h 절대 상한은 NIST 800-63B-4 AAL2 권고(≤24h)에 맞지만 **비활동 30분 재인증이 없고**, 오류 메시지가 "실패했어요"로 통일돼 WCAG 3.3.1(오류 식별) 미달. 2단계 확인 버튼(3초)은 양호.

---

## 1. 현재 관리자 페이지 요약 [코드]

| 영역 | 현재 | 근거 |
|---|---|---|
| 탭 | 대시보드·사용자·공개 트리·시스템 4개 | `src/features/admin/AdminPage.tsx:15` |
| 대시보드 | 가입자·활성·트리·디스크·백업·일일 작업·가동·정지/탈퇴 대기 카드 + 14일 가입 막대 | `AdminPage.tsx:81-110`, `server/account/admin.ts:65-88` |
| 사용자 | 검색(닉네임·UUID·provider:sub), 정지/해제(사유 ≤200자 선택), 삭제(7일 유예 또는 즉시 purge) | `AdminPage.tsx:114-173`, `admin.ts:131-182` |
| 공개 트리 | 목록·숨김/해제(사유 선택), 열린 신고(숨김/기각 2택), 삭제 트리 7일 복구 | `AdminPage.tsx:176-249`, `admin.ts:184-253` |
| 신고 접수 | 공유 보기에서 `copyright/spam/abuse/other` + 메모 ≤300자, 익명 가능(`reporter_id NULL`), 존재 비노출 201 | `admin.ts:103-121`, `src/features/share/SharedPage.tsx:186-195` |
| 시스템 | 공지 1줄 ≤80자 켜기/끄기, 점검 모드 토글, 감사 로그 50건씩 | `AdminPage.tsx:252-300`, `admin.ts:255-288` |
| 감사 로그 | INSERT만 하는 일반 테이블, meta에 개인정보·IP 금지, 1년 후 일일 작업이 삭제. **UPDATE/DELETE 방지 트리거 없음** | `admin.ts:14-17`, `server/account/daily.ts:31`, `server/migrations/001_account.sql:26-36`(트리거 grep 0건) |
| 보존 | 처리된 신고 90일, 감사 1년, 탈퇴 7일 유예 | `daily.ts:19-32` |
| 세션 | 관리자 절대 24h, 일반 180일(30일 슬라이딩) | `server/account/session.ts:9-12` |
| 접근 통제 | 비관리자 404, 120/분, Cloudflare Access는 `/api/admin/` 경로 2차 인증(배포 문서) | `server/http.ts:41`, `admin.ts:126`, `deploy/cloudflared.md:31-42` |
| 숨김 트리를 소유자가 볼 때 | 403 `hidden` 코드만. **사유·이의 절차 전달 없음** | `server/sync/share.ts:48,80` |
| 처리방침 | `#/privacy` 정적 페이지, 시행일 상수, 책임자 연락처는 `PRIVACY_CONTACT` 환경변수. **이전 버전·변경 이력 없음** | `src/features/account/PrivacyPage.tsx:25,50`, `server/env.ts:22` |
| 이용약관 | **없음**(`약관|terms` grep 0건) | `src/` 전체 |
| 수집 항목 | OAuth `openid profile`(Google) / `openid profile_nickname profile_image`(Kakao). 이메일·생년월일·IP 없음 | `server/account/oauth.ts:16-17` |
| 콘텐츠 형식 | 트리·노드 텍스트만. 이미지·파일 업로드 없음 | `server/migrations/002_trees.sql`(image/blob grep 0건) |
| 유출 대응 | 런북 §5에 72시간 절차·영향 범위 쿼리·공지 수단 기술 | `docs/ops/runbook.md:83-92` |

---

## 2. 비슷한 서비스·소규모 SaaS 관리자 표준 구성 요소

조사 대상: AnkiWeb 공유 덱 [S20][S21], Quizlet [S22], Memrise 커뮤니티 코스 [S23], Notion 공개 페이지 신고 [S24], Discourse(소규모 커뮤니티 표준) [S25][S26], 소규모 SaaS 관리자 패널 가이드 [S27][S28].

### 2.1 관찰된 공통 패턴

- **신고 사유 enum + 자유 메모**: Notion은 `Phishing/spam · Inappropriate · DMCA · Other` 4종이고 DMCA는 별도 절차로 분기 [S24]. Quizlet도 세트·클래스·사용자·이미지 단위 신고 + DMCA 폼·이메일 별도 [S22]. → Drill Down의 4종 enum은 표준과 일치하나 **저작권이 일반 신고와 같은 큐**에 섞인다.
- **큐 → 담당 팀 검토 → 결과**: Notion "customer experience team's queue" [S24]. Discourse는 사용자·대기 글·신고를 한 Review 큐로 합치고, 신고 3건이면 자동 숨김(`hide post sensitivity`) [S25]. → Drill Down은 수동 2택만. 자동 숨김 임계치 없음.
- **저작권 보류 상태와 작성자 연락**: AnkiWeb은 "copyright status needing to be confirmed" 동안 덱을 숨기고 **작성자 회신이 올 때까지 복구 불가** [S20]. Quizlet은 반론(counter-notice)을 권리자에 전달하고 14일 대기, 반복 침해자 계정 종료 정책 [S22]. → "숨김(보류)"과 "숨김(확정)" 구분, 소유자 소명 경로가 표준.
- **감사 로그(staff action log)**: Discourse는 사이트 설정 변경·테마·정지·활성화/비활성화·신뢰 등급 잠금까지 기록하고 사용자 프로필에서 그 사용자 대상 이력만 필터 [S26]. 익명화 후에도 옛 이름이 로그에 남는 문제가 보고됨 [S26]. → Drill Down 감사 로그는 대상별 필터·검색이 없고(`AdminPage.tsx:283-295` 단순 최신순), 사용자 상세에서 이력 연결도 없다. 반면 "UUID만 남김" 설계는 Discourse의 익명화 문제를 피한다(`docs/specs/03_account_admin.md:187`).
- **소규모 SaaS 공통 세트** [S27][S28]: RBAC, 시간 제한·전부 기록되는 impersonation, **불변(immutable)·조회 가능한 감사 로그**, 테넌트별 feature flag·kill switch, 지원 도구(사용자 조회·구독·활동 로그). → 이 서비스는 결제·테넌트가 없으므로 impersonation·feature flag는 YAGNI. 감사 로그 불변성만 미달.
- **정지(suspend)의 메타데이터**: Discourse는 기간·사유·사용자 공개 메시지가 있고 이력에서 조회 [S26]. → Drill Down 정지는 무기한·사유 선택·사용자에게 사유 미전달.

### 2.2 요소표 (외부 기준)

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 상태 | 우선 | 공수 |
|---|---|---|---|---|---|
| 신고 큐(사유·메모·숨김/기각) | 모든 비교 대상의 최소 공통분모 | `reports` 테이블, `admin.ts:226-253` | **있음** | — | — |
| 저작권 신고의 **별도 흐름**(권리자 연락처·소명·중단 통보·재개) | Notion·Quizlet·Anki 모두 DMCA/저작권을 일반 신고와 분리 [S20][S22][S24]; 국내는 저작권법 §103 절차와 직결(§3.3) | `reports.reason='copyright'`만 있음. 새 테이블 `takedowns` 또는 `reports`에 `claimant_contact·evidence·state` 열 추가(마이그레이션 004) | 없음 | 높 | M |
| 숨김·정지 **사유를 당사자 화면에 표시** + 소명 입력 | Anki "작성자 회신까지 복구 불가" 모델 [S20]; 정보통신망법 §44조의2 ②·저작권법 §103 ② 통보 의무(§3) | 서버가 403 `hidden`만 반환(`share.ts:80`). `trees.hidden_reason` 또는 최신 `audit_log(tree.hide).meta.reason`을 소유자에게 `GET /api/trees`·`/api/me`로 노출, 편집기 배너 + "소명 보내기" 폼 | 없음 | 높 | M |
| 신고자에게 처리 결과 알림 | Quizlet·Notion은 큐 접수 사실만 알림; 저작권법 §103 ②는 권리주장자 통보 **의무** | 익명 신고는 연락처가 없음(`reporter_id NULL`). 로그인 신고자만 `/api/me` 응답에 `report_results[]`로 전달하거나, 접수 번호(`report.id`)로 상태 조회 페이지 `#/report/<id>` 제공(연락처 저장 없이 가능) | 없음 | 중 | S~M |
| 숨김 상태 2종(보류 / 확정) | Anki의 "copyright check" 보류 상태 [S20]; 임시조치 30일 상한(§3.2) | `hidden_by_admin_at` 1개뿐. `hidden_until`(30일) 열 또는 `meta.kind='temporary'` + 대시보드 "30일 임박" 표시 | 없음 | 중 | S |
| 자동 숨김 임계치(열린 신고 N건) | Discourse 기본 3건 자동 숨김 [S25]; 운영자 1~2인 부재 시 방어 | `open_reports`는 이미 계산(`admin.ts:192-193`). `registerReport`에서 `COUNT≥N`이면 `setHidden(..., 'auto')` + audit `actor NULL` | 없음 | 중 | S |
| 감사 로그 필터(동작·대상·기간) + 사용자 상세에서 이력 링크 | Discourse staff log 필터 [S26]; 유출·분쟁 조사 시 필수 | `audit_target` 인덱스 이미 존재(`001_account.sql:36`). `GET /api/admin/audit?target_type=&target_id=&action=` 파라미터 추가 | 부분 | 중 | S |
| 정지 기간·사용자 공개 메시지 | Discourse 정지 모델 [S26] | `users.suspended_until`, 로그인 거절 응답(`oauth.ts` suspended 분기)에 메시지 포함 | 부분(무기한·사유만) | 낮 | S |
| 사용자별 데이터 묶음 보기(트리 목록·세션 수) | SaaS 지원 도구 공통 [S27] | `GET /api/admin/users/:id` 이미 반환(`admin.ts:150-155`) — **화면에 상세 패널 없음**(`AdminPage.tsx:136-173`는 행만) | 부분 | 낮 | S |
| impersonation / feature flag / 과금 뷰 | SaaS 표준이지만 비영리·단일 역할·개인정보 최소화 원칙에 역행 | — | 없음(의도적) | 낮(불필요) | — |
| 서버 로그·오류 뷰어 | 소규모 SaaS 체크리스트 항목 [S28] | 운영은 `journalctl`로 충분 [가정]. 요청 로그는 `ts method path status ms`만(03 §3.7) | 없음 | 낮 | — |

---

## 3. 한국 법규 의무 → 적용 판정 → 관리자 요소

### 3.0 전제: 이 서비스의 법적 지위 [확인 필요]

| 지위 | 판정 | 근거 |
|---|---|---|
| **개인정보처리자** | **해당**. 정의는 "업무를 목적으로 개인정보파일을 운용… 공공기관, 법인, 단체 및 **개인**" [S1] — 영리 요건 없음. 닉네임·provider_sub·학습 트리는 개인정보(가·나목) | 법 §2 1호·5호 [S1] |
| **정보통신서비스 제공자**(정보통신망법) | **[확인 필요]**. 정의(망법 §2 ①3호)는 "**영리를 목적으로** … 정보를 제공하거나 매개하는 자"라서 비영리 운영자는 문언상 벗어날 수 있음 [가정: 조문 기억에 의함, 1차 출처 미확인]. 다만 §44조의2 절차를 따르면 ⑥ 면책 효과가 있으므로 **자발적 준수가 유리** | 망법 §2, §44조의2 ⑥ [S13] |
| **온라인서비스제공자(OSP)**(저작권법) | **해당**. 저작권법 OSP 정의(§2 30호)에 영리 요건 없음 [가정: 조문 기억]. 트리를 사용자 요청으로 저장·공개하므로 §102 ①3호(저장형) 유형 | 저작권법 §102·§103 [S14] |
| **부가통신사업자 신고** | 자본금 1억 원 이하 소규모 부가통신사업자는 신고 **면제**(법 §22 ④, 영 §30 ①) [S18, 2차 출처]. 개인·비영리 → 면제 [확인 필요] | [S18] |
| **매출·이용자 규모 기준** | 매출 0원, 일평균 이용자 10만 미만 [가정] → 불법촬영물 조치(§3.4), 청소년보호책임자(§3.5), 허위조작정보 신고 절차(§3.4) 모두 **비적용** | [S11][S12][S16] |

### 3.1 개인정보보호법

| 의무 | 내용(1차 출처) | 이 서비스 적용 | 관리자 요소 |
|---|---|---|---|
| **열람 요구 10일** | 영 §41 ④ "대통령령으로 정하는 기간이란 10일", ⑤ 10일 이내 열람 허용 또는 열람통지서 [S2] | **적용**. 단 계정 화면에서 즉시 열람·내보내기 가능(`AccountPage.tsx`, 처리방침 ⑥) → 로그인 가능한 본인은 사실상 즉시 처리. **비로그인 요청자**(예: 타인 트리에 자기 이름이 적힌 제3자)는 이메일로 들어옴 | 요청 큐(§3.1 하단 표 A) |
| **정정·삭제 10일** | 영 §43이 §41 ②를 준용, ISMS-P 해설상 10일 내 결과 회신 [S2][S3] | **적용**. 본인 닉네임·탈퇴는 즉시 셀프서비스. 제3자 개인정보가 **공개 트리 본문에** 있는 경우가 실무상 핵심 → 관리자가 노드를 직접 편집할 권한은 없음(권한 매트릭스 `03_account_admin.md:189-205`) → "숨김 + 소유자 통보"로 처리 | 요청 큐 + 숨김 사유 전달 |
| **처리정지 10일** | 영 §44 ② 10일 이내 조치 사실 또는 거절 사유·이의제기 방법을 결과 통지서로 [S4] | **적용**. 현재 처리정지 = 탈퇴 외 수단 없음. 정지(`suspend`)를 "처리정지" 용도로 쓰려면 사유 구분 필요 | 요청 큐에 유형 `처리정지`, 정지 사유 enum에 `data_subject_request` |
| **처리 기록** | 열람·정정·삭제·처리정지 **요구와 조치 내용 기록** 자체를 명시한 조문은 확인 못 함 [확인 필요]. 다만 ISMS-P 3.5.2는 기록·보관 요구 [S3] | 권고 수준 | 요청 큐 자체가 기록. `audit_log` action `dsr.*` |
| **유출 통지·신고 72시간** | 영 §40 ①: ①1천 명 이상 ②민감·고유식별정보 ③**외부 불법 접근** → 72시간 내 보호위/KISA 신고; 경로 확인·회수로 위험이 현저히 낮아지면 생략 가능; ② 미확정 사항은 우선 신고 후 추가 [S5]. **2026-09-11 시행 개정**: 유출 **가능성**을 안 때부터 72시간 내 정보주체 통지, 위조·변조·훼손 포함(랜섬웨어) [S6][S7] | **적용**. 해킹이면 1명이라도 신고(런북 §5 일치). 개정으로 "의심 단계"에서도 통지 → 공지 수단이 필요 | 런북이 있으므로 UI는 최소: ① `settings.notice`에 **링크·기간** 지원(현재 80자 텍스트만, `admin.ts:263`) ② 감사 action `system.incident` 입력 버튼(현재 코드로만 기록 가능) ③ 영향 범위 숫자(`users.total`)는 대시보드에 이미 있음 |
| **만 14세 미만 법정대리인 동의** | 법 §22조의2 ①, 확인 방법 영 §17조의2 ① 7종(문자·카드·휴대전화 인증·서면·이메일·전화·준하는 방법) [S8] | **조건부 적용**. OAuth 스코프에 생년월일·연령이 없어(`oauth.ts:16-17`) 연령을 **알 수 없음**. 7종 확인 방법은 모두 법정대리인 연락처 수집을 전제 → 수집 최소화 원칙과 충돌. 실무 선택지: (a) 약관·로그인 화면에 "만 14세 이상만 이용" 고지 + 첫 로그인 체크박스 [가정: 통용되는 방식, 법적 충분성은 확인 필요] (b) 14세 미만으로 **알게 된 경우**(신고·문의) 즉시 삭제 | 관리자 요소는 **삭제 사유 `under14`**(즉시 purge 경로 재사용, `admin.ts:171-182`) + 요청 큐 유형 `미성년 신고`. 가입 차단 로직은 불가(연령 미수집) |
| **처리방침 공개** | 법 §30, 영 §31. 작성지침 2025-04 개정: 공개 위치 첫 화면 외 설정·회원가입·로그인 영역도 허용 [S9]; 변경 시 **변경 전·후 비교 공개**(표준지침 §21, 2차 출처) [S10]; 2026-04 개정 지침은 AI 학습 활용 여부 기재 [S9] | **적용**. 처리방침 페이지 있음, "⑨ AI 학습 없음" 이미 기재(`PrivacyPage.tsx:55-56`). **버전·이력·비교 없음** | 처리방침 **버전 관리**: 최소 구현은 저장소 `docs/privacy/` 에 `vYYYYMMDD.md` + 페이지 하단 "이전 버전·변경 요약" 링크(관리자 UI 불필요, 정적). 관리자 UI에 넣을 경우 `settings.privacy_version` + 변경 공지 자동 생성 |
| **1년 미이용자 분리보관(유효기간제)** | 법 §39조의6 **삭제, 2023-09-15 시행** → 사업자 자율 휴면 정책 [S19]. ISMS-P 3.4.3도 삭제 | **비적용(폐지)**. 자율 선택 | 선택: 대시보드에 "1년 미접속 N명" 카드(`last_seen_at < now-365d` 1줄 쿼리) + 처리방침에 휴면 정책 명시. 분리보관 테이블은 YAGNI |
| **접속기록 1년 보관·점검** | 안전성 확보조치 기준 §8: 개인정보처리시스템 접속자(정보주체 제외)의 접속기록 **1년 이상** 보관, 점검 주기는 내부 관리계획으로(2025-10-31 개정 전 월 1회) [S17, 2차 출처] | **적용**(모든 개인정보처리자). 현재 `audit_log`는 **변경만** 기록 → 관리자가 `GET /api/admin/users?q=` 로 개인정보를 **조회**한 기록이 없음 | `admin.ts:131-155` GET에 `audit(db, me, 'user.view'/'user.search', ...)` 추가(검색어는 저장하지 않고 건수만). 보존 1년은 `daily.ts:31`과 이미 일치 |
| **개인정보 보호책임자(CPO)** | 직원 5명 미만은 대표자가 CPO [S15]. 2026-09-11 개정 CPO 신고 의무는 "일정 규모 이상" [S7] | 운영자 = CPO, 신고 **비적용** [확인 필요: 규모 기준 원문] | 없음. 처리방침 ⑦에 연락처(이미 `PRIVACY_CONTACT`) |

**표 A — 정보주체 요청 큐(DSR queue) 제안 사양** (높 · M)

- 테이블 `requests(id, kind ENUM('access','rectify','erase','restrict','under14','other'), channel, received_at, due_at = received_at+10d, target_type, target_id, state ENUM('open','done','rejected'), note, resolved_at)`. 연락처는 저장하지 않거나 `note`에 최소 기재(처리 후 90일 삭제, `reports`와 동일 규칙).
- 화면: 시스템 탭 또는 새 "요청" 탭. 열: 유형·접수일·**D-N**(10일 기한, 지나면 빨강)·대상·상태·[완료][거절(사유)]. 완료 시 `audit_log action='dsr.<kind>'`.
- 이메일 발송 기능은 없으므로 통지서는 운영자가 수동 발송, 큐에는 "통지함" 체크만. [가정: 요청 빈도 월 0~2건 → 자동화 불필요]

### 3.2 정보통신망법 §44조의2 (권리침해 정보 삭제 요청·임시조치)

- 조문: ① 사생활 침해·명예훼손 피해자가 소명하여 삭제·반박 게재 요청 ② 제공자는 **지체 없이** 삭제·임시조치 후 **즉시 신청인·게재자에게 통지**, 조치 사실을 게시판 공시 등으로 알림 ④ 판단 곤란·다툼 예상 시 임시 차단, **30일 이내** ⑤ 조치 내용·절차를 **약관에 미리 기재** ⑥ 조치하면 손해배상 책임 감면 [S13]. 헌재 2016헌마275 합헌 [S13b].
- 적용: 비영리라 문언상 "정보통신서비스 제공자"가 아닐 수 있음 [확인 필요]. 그러나 ⑥ 면책을 받기 위해 **동일 절차를 자발적으로 운용**할 가치가 크다. 트리에 타인 명예훼손·사생활 내용이 들어갈 수 있음(텍스트 UGC).
- 2026-07-07 시행 불법·허위조작정보 신고 절차 의무(§44조의7·의12 등)는 **일평균 이용자 100만 이상** 대상 → 비적용 [S16].

| 요소 | 왜 | 단서 | 상태 | 우선 | 공수 |
|---|---|---|---|---|---|
| 임시조치 **30일 타이머** | ④ 30일 상한. 지나면 재게시 또는 확정 숨김 결정 필요 | `trees.hidden_until` 또는 `hidden_by_admin_at + 30d` 계산 → 공개 트리 탭에 "D-N" 표시, 대시보드 카드 "임시조치 만료 임박" | 없음 | 중 | S |
| 신청인·게재자 **통지** | ② 즉시 통지 | 게재자 = 소유자 → 앱 내 배너(§2.2 "사유 전달"). 신청인 = 신고자 → 접수번호 조회 페이지 | 없음 | 높 | M |
| 조치 절차 **약관 기재** | ⑤ | 이용약관 자체가 없음 → 약관 1페이지 신설(정적) + "신고·게시중단 처리 절차" 절 | 없음 | 높 | S(문서) |
| 반박문 게재 | ① 반박 내용 게재 요청 가능 | 트리 구조상 "반박 노드"는 부적합 → 공유 보기 상단에 운영자 고지 1줄(`trees.notice`)로 대체 [가정] | 없음 | 낮 | S |

### 3.3 저작권법 §103 (복제·전송 중단)

- 조문 [S14]: ① 권리주장자가 **소명**하여 중단 요구 ② OSP는 **즉시** 중단 + 권리주장자에게 통보, 저장형(§102 ①3호) OSP는 **복제·전송자에게도 통보** ③ 복제·전송자가 소명하여 재개 요구 → 재개 요구 사실·**재개 예정일**을 권리주장자에게 지체 없이 통보, 예정일에 재개(소 제기 통보 시 재개 안 함) ④ **수령인 지정·공지** ⑤ ④·②·③ 이행 시 면책 ⑥ 부당 요구자 손해배상. 영 §40 소명자료(등록증 사본 등, 불가 시 진술서), §41 중단 통보서에 재개 절차 안내, §42 재개 요구는 **통보 받은 날부터 30일 이내** [S14b].
- 적용: **해당**(OSP 정의에 영리 요건 없음 [가정]). 학습 트리는 교재·문제집 전사 가능성이 높아(Quizlet 소송 사례 [S22]) 실제 발생 확률이 가장 높은 법적 요청이다.
- 현재: `reason='copyright'` 신고만 있고 권리자 연락처·소명·통보·재개 상태가 없다. 수령인 공지도 없다.

| 요소 | 왜 | 단서 | 상태 | 우선 | 공수 |
|---|---|---|---|---|---|
| **게시중단 요청 접수 폼**(`/t/<slug>` 또는 `#/takedown`) | ① 소명 요구. 일반 신고와 분리 | 필드: 권리자 성명·연락처(이메일), 권리 소명(등록 번호·원본 URL·진술서 체크), 대상 slug, 서명 체크. 저장 테이블 `takedowns`. 연락처는 **이 목적에 한해** 보관(처리방침 ②에 항목 추가) | 없음 | 높 | M |
| **상태 큐** 접수→중단(즉시)→소유자 통보→(30일 내 재개 요구)→재개 예정일 통보→재개/소제기 | ②③ 절차와 기한 | `takedowns.state`, `hidden_at`, `owner_notified_at`, `counter_at`, `resume_due`(= counter_at + n일, 법정 기한 없음 → 운영 규칙 7일 [가정]). 공개 트리 탭에 섹션 "게시중단 요청" | 없음 | 높 | M |
| 소유자(복제·전송자) **통보 + 재개 요구 폼** | ② 통보, ③ 소명 | 소유자 로그인 시 배너 "저작권 신고로 비공개됨 · 30일 내 소명" + 폼(`/api/trees/:id/counter`). 이메일 없음 → 앱 내 통보가 유일 → 처리방침·약관에 "통지는 앱 내로 한다" 명시 | 없음 | 높 | M |
| **수령인 지정·공지** | ④ 면책 전제 | 처리방침 ⑦ 연락처 재사용 + 약관/푸터에 "저작권 침해 신고 수령인: `PRIVACY_CONTACT`" 1줄. 관리자 UI 불필요 | 없음 | 높 | S(문서) |
| 권리주장자 통보 기록 | ②③ "알려야" 이행 증거 | `audit_log action='takedown.notify'` meta `{to:'claimant'|'owner', at}` | 없음 | 중 | S |
| 반복 침해자 처리 | Quizlet 정책 [S22]; 국내 §103에는 없음 | 사용자 상세에 "저작권 중단 N회" 카운트(`takedowns` COUNT) → 정지 판단 보조 | 없음 | 낮 | S |

### 3.4 전기통신사업법 §22조의5 (불법촬영물 등 유통방지)

- 대상: 웹하드사업자 또는 **전년도 매출 10억 원 이상 + 일평균 이용자 10만 명 이상**, 또는 2년 내 방심위 시정요구를 받은 부가통신사업자(영 §30조의6) [S11][S11b]. 2026-07-01부터 이미지까지 확대, 고시 2026-05-18 개정 [S11].
- 판정: **비적용**(규모 미달, 매출 0). 또한 트리는 텍스트만이라 촬영물 자체가 올라올 수 없다 [코드: 이미지 컬럼·업로드 없음]. 외부 이미지 URL 링크를 노드 텍스트에 적는 경우는 "유통"이 아닌 링크 [가정].
- 관리자 요소: **없음**. 신고 사유 `abuse`로 흡수. 투명성 보고서(§22조의7가 아님, 별도 고시 기준)도 대상 아님 [S11].

### 3.5 청소년보호법·정보통신망법 §42조의3

- 청소년보호책임자 지정은 **정보통신망법 §42조의3**(청소년보호법 아님), 기준은 망법 시행령 §25 "전년도 말 기준 직전 3개월 일일평균 이용자 10만 명 이상" [S12]. 매출액 기준 금액은 1차 출처로 확인 못 함 [확인 필요].
- 청소년유해매체물 표시(청소년보호법 §13, 망법 §42)는 유해매체물을 **제공하는 경우**에만 → 학습 콘텐츠 서비스에는 발생하지 않음 [가정].
- 판정: **비적용**. 관리자 요소 없음. 단 §44조의2 ③(표시 위반 유해매체물 즉시 삭제)은 신고 사유 `abuse`로 처리 가능.

### 3.6 공지 의무 (서비스 중단·약관 변경)

| 의무 | 출처·상태 | 판정 | 요소 |
|---|---|---|---|
| 약관 변경 사전 공지 7일 / 불리한 변경 30일 | 공정위 「전자상거래등에서의 소비자보호지침」(2003-7호)이 **권고**, 전자상거래 사업자 대상 [S29]. 약관규제법은 기간을 정하지 않음 [가정]. 민간 약관 관행도 7일/30일 [S29b] | 전자상거래법은 **비적용**(결제 없음). 관행 준수 권고 | 공지에 **시작·종료 시각 + 링크** 필드(현재 80자 텍스트, `admin.ts:263`). 약관 페이지 신설 시 "시행일·이전 버전" |
| 서비스 휴지·폐지 통지 | 전기통신사업법 §26(사업의 휴지·폐지 등) 조문 제목만 확인, "30일 전 이용자 통지"는 1차 출처 미확인 [S18b] [확인 필요]. 신고 면제 사업자에게 적용되는지도 불명 | [확인 필요] | 점검 모드에 **예약(시작·종료)**과 사전 배너: `settings.maintenance = {enabled, from, until, text}` → 클라이언트 배너가 사전 고지. 현재는 즉시 ON/OFF만(`AdminPage.tsx:278-281`) |
| 처리방침 변경 공지 | 변경 전·후 비교 공개(표준지침 §21) [S10] | **적용** | §3.1 "처리방침 버전 관리" |
| 유출 통지 | §3.1 | 적용 | 공지 링크·기간 필드 |

---

## 4. 관리자 UI 자체의 접근성·보안 기준

### 4.1 접근성 (WCAG 2.2)

| 기준 | 요구 | 현재 [코드] | 판정 | 조치·공수 |
|---|---|---|---|---|
| 1.3.1 표 헤더 | 단순 표는 `<th>`만으로 충분, `scope`는 복합 표에만(H63) [S30] | 모든 표가 단일 헤더 행 `<th>`(`AdminPage.tsx:126,194,284`), 모바일 카드는 `data-l`로 라벨 | 양호 | — |
| 1.3.1 표 캡션 | 표 목적 식별 | `<table>`에 `<caption>` 없음, 앞 `<h2>`로 구분(`:198,210,282`) | 부분 | `aria-labelledby`로 h2 연결 · S |
| 3.3.1 오류 식별(A) | 오류 항목을 식별하고 **텍스트로 설명** [S31] | 실패 시 토스트 "실패했어요 · 다시 시도해 주세요"(`AdminPage.tsx:26`), 서버는 `field`를 돌려줌(`admin.ts:37`) | **미달** | `ApiError.field`·`message`를 토스트에 표시 · S |
| 2.5.8 타깃 24×24(AA) | 포인터 타깃 ≥24px 또는 간격 예외 [S32] | 가입 막대 `tabIndex=0` span, 폭 = 컨테이너/14 − 4px gap(`admin.css:22-23`) → 모바일 ≤360px에서 24px 미만 가능 [확인 필요]; 버튼류는 DS 토큰 | 부분 | 막대는 `tabIndex` 제거하고 `<figure>`에 요약 텍스트 제공 · S |
| 4.1.3 상태 메시지 | 비시각 사용자에게 결과 알림 | 토스트 컨테이너 `aria-live="polite"`(`Toast.tsx:70`), TwoStep `sr-only aria-live`(`TwoStep.tsx:54`) | 양호 | — |
| 1.4.1 색 의존 | 2단계 버튼 armed 상태를 색만으로 구분 금지 | 라벨 텍스트가 "정지→정말 정지"로 바뀌므로 색 의존 아님(`TwoStep.tsx:49-52`) | 양호 | — |
| 입력 라벨 | 모든 입력에 접근 가능한 이름 | `aria-label` 부여(`:123,159,240,273`) | 양호 | — |

### 4.2 보안

| 기준 | 요구 | 현재 [코드] | 판정 | 조치·공수 |
|---|---|---|---|---|
| 세션 절대 상한 | NIST 800-63B-4 AAL2: 전체 재인증 **SHOULD ≤24h** [S33] | 관리자 24h(`session.ts:12`) | 양호 | — |
| **비활동 재인증** | 800-63B-4 AAL2: 비활동 **30분** 이상이면 재인증 SHALL [S33b] (Rev.3도 30분) | 없음. 슬라이딩 30일만(`session.ts:9`) | **미달**(관리자) | 관리자 세션은 `last_seen_at + 30~60분` 지나면 만료(세션 미들웨어 `session.ts:49` 분기 1줄) · S |
| 2차 인증 | 관리자 계정 탈취 대응 | Cloudflare Access가 `/api/admin/` 앞(`cloudflared.md:31-42`), JWT 검증은 생략 | 양호(배포 전제) | 운영 체크리스트에 Access 적용 확인 항목 [확인 필요: 실제 배포 상태] |
| 파괴 행동 확인 | 되돌릴 수 없는 동작은 2단계 이상 | TwoStep 3초 재클릭, Esc·포커스 이탈 시 해제(`TwoStep.tsx`) | 양호 | `purge_now`(즉시 삭제, 복구 불가)만 추가로 닉네임 타이핑 확인 [가정: 필요 시] · S |
| **감사 로그 불변성** | OWASP A09:2025 "append-only 테이블 등 무결성 통제", Logging Cheat Sheet "변조·삭제 탐지, 읽기 권한 제한, 로그 접근 기록" [S34][S35] | 일반 테이블, 같은 DB 연결이 UPDATE/DELETE 가능. 1년 경과분만 `daily.ts:31`이 삭제 | **미달** | 마이그레이션 004: `CREATE TRIGGER audit_ro_u BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT,'audit immutable'); END;` + `BEFORE DELETE … WHEN OLD.ts > now-365d` 조건부 차단 · S. 해시 체인·외부 전송은 낮(단일 Pi, 백업으로 대체) |
| 감사 대상 범위 | OWASP: 관리자 **모든 행동**, 인가 실패, 민감 데이터 **접근**도 기록 [S35] | 변경만 기록. 조회(`GET /users`)·관리자 로그인(`admin.login`은 스펙에만, 코드 grep 0건 [확인 필요])·404 인가 실패 미기록 | 부분 | `user.search`(건수만)·`user.view`·`admin.login` 추가 · S |
| 로그에 넣지 않을 것 | 세션 ID·토큰·개인정보 [S35] | `meta` 개인정보·IP 금지 규칙(`admin.ts:13`), 요청 로그 `ts method path status ms`만 | 양호 | 사유 입력 placeholder에 "개인정보를 적지 마세요" · S |
| 관리자 경로 은닉·속도 제한 | — | 404(`http.ts:41`), 120/분(`admin.ts:126`) | 양호 | — |

---

## 5. 통합 우선순위 (W4 관점 전체)

| # | 요소 | 왜 필요한가 | 출처·단서 | 상태 | 우선 | 공수 |
|---|---|---|---|---|---|---|
| 1 | 저작권 **게시중단 요청 폼 + 상태 큐**(접수·중단·통보·30일 재개 요구·재개 예정일) | 저작권법 §103 ②~④ 이행 = 면책 ⑤. 학습 콘텐츠 서비스의 최빈 법적 요청 | `takedowns` 테이블, 공개 트리 탭 섹션 | 없음 | 높 | M |
| 2 | 숨김·정지 **사유를 소유자에게 전달** + 소명(재개 요구) 폼 | §103 ② 복제·전송자 통보, 망법 §44조의2 ② 게재자 통지, Anki 모델 | `share.ts:80` 403 → 사유 포함, 편집기 배너 | 없음 | 높 | M |
| 3 | **수령인 공지 + 약관 1페이지**(신고·게시중단·임시조치 절차, 만 14세 이상, 앱 내 통지 원칙) | §103 ④, §44조의2 ⑤, 법정대리인 동의 대체 고지 | 정적 페이지, `PRIVACY_CONTACT` 재사용 | 없음 | 높 | S |
| 4 | **정보주체 요청 큐**(열람·정정·삭제·처리정지·미성년) + D-10 표시 | 영 §41·43·44 10일 기한, 비로그인 요청자·제3자 개인정보 처리 | `requests` 테이블, 시스템 탭 | 없음 | 높 | M |
| 5 | `audit_log` **UPDATE/DELETE 차단 트리거** | OWASP A09 불변성 | 마이그레이션 004, 1년 경과분만 예외 | 없음 | 높 | S |
| 6 | 관리자 **조회 기록**(`user.search`·`user.view`·`admin.login`) | 안전성 확보조치 기준 §8 접속기록 1년 | `admin.ts:131-155`에 audit 호출 | 부분 | 중 | S |
| 7 | 관리자 **비활동 30~60분 만료** | NIST 800-63B-4 AAL2 | `session.ts:49` 분기 | 없음 | 중 | S |
| 8 | 임시조치 **30일 타이머**·만료 임박 카드 | 망법 §44조의2 ④ 30일 상한 | `hidden_until` 또는 계산 | 없음 | 중 | S |
| 9 | 공지·점검 모드에 **기간·링크·예약** 필드 | 약관 변경 7/30일 관행, 유출 통지, 서비스 중단 사전 고지 | `settings.notice/maintenance` 스키마 확장 | 부분 | 중 | S |
| 10 | 신고자 **처리 결과 조회**(접수번호 페이지) | §103 ② 권리주장자 통보, Notion/Quizlet 관행 | `#/report/<id>` 읽기 전용 | 없음 | 중 | S~M |
| 11 | 처리방침 **버전·변경 전후 비교** | 법 §30·표준지침 §21 | `docs/privacy/` 정적 이력 + 페이지 링크 | 없음 | 중 | S |
| 12 | 오류 메시지에 **필드·사유 표시** | WCAG 3.3.1 | `AdminPage.tsx:26` guard | 미달 | 중 | S |
| 13 | 감사 로그 **필터**(대상·동작·기간) + 사용자 상세 이력 링크 | Discourse staff log, 분쟁·유출 조사 | `audit_target` 인덱스 존재 | 부분 | 중 | S |
| 14 | 열린 신고 N건 **자동 숨김** | Discourse 기본값 3, 운영자 부재 대비 | `registerReport`에 1분기 | 없음 | 중 | S |
| 15 | 사고 기록 버튼(`system.incident`) | 유출 72시간 대응 증적 | 시스템 탭 1폼 | 없음 | 낮 | S |
| 16 | 1년 미접속 카드·휴면 정책 문구 | 유효기간제 폐지 후 자율 | 1 쿼리 | 없음 | 낮 | S |
| 17 | 정지 기간·사용자 메시지, 저작권 중단 횟수 | Discourse·Quizlet 반복 침해 관행 | `users.suspended_until`, COUNT | 부분 | 낮 | S |
| 18 | impersonation·feature flag·로그 뷰어 | SaaS 표준이지만 이 서비스엔 불필요 | — | 없음(의도적) | 낮 | — |

**비적용으로 판정한 의무(관리자 요소 불필요)**: 불법촬영물 조치·투명성 보고서(§22조의5, 매출 10억·DAU 10만 미만, 텍스트 전용), 청소년보호책임자(DAU 10만 미만), 허위조작정보 신고 절차(DAU 100만 미만), 1년 미이용자 분리보관(폐지), CPO 신고(규모 미달), 전자상거래법 약관 공지(결제 없음), 부가통신사업 신고(자본금 1억 이하 면제 [확인 필요]).

**[확인 필요] 목록(법률 자문 또는 law.go.kr 원문 대조 권장)**: ① 비영리 개인 운영자가 정보통신망법상 "정보통신서비스 제공자"(영리 요건)인지 ② 저작권법 OSP 정의에 영리 요건 부재 ③ 전기통신사업법 §22 ④·영 §30 ① 소규모 면제 원문 ④ 전기통신사업법 §26 휴지·폐지 통지 기한과 면제 사업자 적용 여부 ⑤ 망법 시행령 §25 매출액 기준 금액 ⑥ "만 14세 이상만 이용" 고지만으로 §22조의2 의무를 피할 수 있는지 ⑦ 2026-09-11 개정 CPO 신고 규모 기준 ⑧ 안전성 확보조치 기준 §8 현행 점검 주기 문언 ⑨ Cloudflare Access 실제 배포 여부 ⑩ `admin.login` 감사 기록 구현 여부.

---

## 6. 방법·한계

- 코드는 `docs/CODEBASE.md` 관리자 부분, `docs/specs/03_account_admin.md` §3.4·§3.6·§3.7, `AdminPage.tsx`, `admin.ts`, `daily.ts`, `session.ts`, `share.ts`, `PrivacyPage.tsx`, `TwoStep.tsx`, `deploy/cloudflared.md`, `docs/ops/runbook.md`를 읽었다(수정·커밋·e2e 없음).
- 법령 원문은 law.go.kr가 스크립트 렌더링이라 직접 열지 못했고, itwiki·korea.legal 조문 전사와 법률신문·정부 보도자료로 대조했다. 2차 출처에만 의존한 항목은 본문에 [확인 필요]로 표시했다.
- Quizlet 도움말 신고 페이지(403)와 Memrise 커뮤니티 코스 신고 절차는 직접 열람하지 못해 검색 요약에 의존했다.

## 7. 출처 (확인일 전부 2026-11-14)

법령·정부·판례
- [S1] 개인정보 보호법 §2 정의 — https://korea.legal/wiki/개인정보-보호법-제2조/
- [S2] 시행령 §41 열람(10일) — https://itwiki.kr/w/개인정보_보호법_시행령_제41조
- [S3] ISMS-P 3.5.2 정보주체 권리보장(정정·삭제 10일 해설) — https://itwiki.kr/w/ISMS-P_인증_기준_3.5.2.정보주체_권리보장 ; 열람 10일 실무 — https://thecheck.co.kr/customer-personal-data-access-response-ten-days/
- [S4] 시행령 §44 처리정지(10일) — https://korea.legal/wiki/개인정보-보호법-시행령-제44조/
- [S5] 시행령 §40 유출 신고(1천 명·민감·불법 접근, 72시간, KISA) — https://itwiki.kr/w/개인정보_보호법_시행령_제40조 ; 개보위 안내 — https://pipc.go.kr/np/default/page.do?mCode=D030040000
- [S6] 2026-09-11 개정법 시행(유출 가능성 72시간 통지, 과징금 10%) — https://www.newsis.com/view/NISX20260309_0003540588 ; https://www.ddaily.co.kr/page/view/2026091014535302913
- [S7] 법률신문 2026-09-11 개정 해설(위조·변조·훼손 포함, CPO 신고 "일정 규모 이상") — https://www.lawtimes.co.kr/news/articleView.html?idxno=226491
- [S8] 시행령 §17조의2 법정대리인 동의 확인 7종 — https://itwiki.kr/w/개인정보_보호법_시행령_제17조의2 ; 법 §22조의2 — https://korea.legal/wiki/개인정보-보호법-제22조의2/
- [S9] 처리방침 작성지침 2025-04 개정(공개 위치 확대), 2026-04 개정(AI 학습) — https://www.daeryunlaw.com/newsletter/news/151 ; https://byline.network/2026/04/24-580/ ; 평가 결과 — https://www.ajunews.com/view/20260116092405848
- [S10] 처리방침 변경 전후 비교 공개(표준지침 §21), 시행령 §31 — https://itwiki.kr/w/개인정보_처리방침 ; https://itwiki.kr/w/개인정보_보호법_시행령_제31조
- [S11] 전기통신사업법 §22조의5·영 §30조의6, 이미지 확대 2026-07-01, 고시 2026-05-18 — https://m.korea.kr/news/actuallyView.do?newsId=148896809 ; https://wikidocs.net/blog/@infoplant/21340/ ; 헌재 합헌 — https://www.lawtimes.co.kr/news/212537
- [S11b] 대상 기준 매출 10억·DAU 10만·시정요구(방통위 2020-07-22 의결) — https://newstomato.com/ReadNews.aspx?no=985589
- [S12] 망법 §42조의3·시행령 §25 청소년보호책임자(DAU 10만) — https://mobile.newsis.com/view/NISX20241107_0002950324
- [S13] 망법 §44조의2 조문 요약 — https://itwiki.kr/w/정보통신망법_제44조의2
- [S13b] 헌재 2016헌마275(임시조치 합헌) — https://www.lawtimes.co.kr/news/166260
- [S14] 저작권법 §103 — https://korea.legal/wiki/저작권법-제103조/
- [S14b] 저작권법 시행령 §40~42(소명자료, 중단 통보서, 재개 요구 30일) — https://itwiki.kr/w/저작권법_시행령_제42조 ; 법제처 서식 — https://www.law.go.kr/LSW/flDownload.do?flSeq=170966619
- [S15] CPO 지정: 5인 미만 소상공인은 대표자 — https://www.catchsecu.com/기업의-규모별-개인정보보호-책임자-지정 ; https://itwiki.kr/w/개인정보_보호책임자
- [S16] 2026-07-07 시행 망법 개정(허위조작정보, DAU 100만 이상 대상) — https://www.newsis.com/view/NISX20260706_0003697941 ; https://ceoscoredaily.com/page/view/2026070613364525986
- [S17] 안전성 확보조치 기준 §8 접속기록 1년, 점검 주기 — https://itwiki.kr/w/개인정보의_안전성_확보조치_기준_제8조
- [S18] 부가통신사업 신고 면제(자본금 1억 이하, 법 §22 ④·영 §30 ①, 2차 출처) — https://www.findsemusa.com/service/consult/consultView.do?qidx=22572 ; https://www.inews24.com/view/1313798
- [S18b] 전기통신사업법 §26 조문 제목(휴지·폐지) — https://elaw.klri.re.kr/kor_service/lawViewTitle.do?hseq=68080
- [S19] 유효기간제(1년 미이용자) 폐지 2023-09-15, ISMS-P 3.4.3 삭제 — https://www.nepla.ai/wiki/it-정보-방송통신/개인정보-위치정보-신용정보/개인정보-유효기간제의-내용과-폐지-zr592wrov96k ; https://itwiki.kr/w/ISMS-P_인증_기준_3.4.3.휴면_이용자_관리
- [S29] 공정위 전자상거래 소비자보호지침(약관 개정 7일, 불리한 변경 30일 권고) — https://eiec.kdi.re.kr/epic_txt/2003/R0310220.HWP ; https://www.khan.co.kr/article/200310132229471
- [S29b] 민간 약관 관행(7일/30일) — https://lawinsider.com/ko/contracts/aAzOmW2xxSb

플랫폼·업계
- [S20] AnkiWeb FAQ: 덱 숨김·저작권 확인·작성자 회신까지 복구 불가 — https://docs.ankiweb.net/faqs/a-deck-i-want-has-disappeared-from-ankiweb.md
- [S21] Anki 포럼: 저작권자 알림 시스템, 신고 버튼 부재 — https://forums.ankiweb.net/t/how-is-my-shared-deck-checked-by-copyright-holders/66227 ; https://forums.ankiweb.net/t/how-to-report-or-flag-offensive-inappropriate-comments-on-shared-decks/33461
- [S22] Quizlet: 신고 메뉴·DMCA·counter-notice 14일·반복 침해자 — https://help.quizlet.com/hc/en-us/articles/360030632972 ; https://help.quizlet.com/hc/en-us/articles/360029925172 (신고 페이지 본문은 403으로 직접 열람 실패, 검색 요약에 의존)
- [S23] Memrise 커뮤니티 코스 현황(전용 신고 절차 없음) — https://memrise.zendesk.com/hc/en-us/articles/29804562432913-Will-Memrise-delete-Community-Courses
- [S24] Notion 공개 페이지 신고(4 사유, CX 큐, DMCA 분리) — https://www.notion.com/help/report-inappropriate-content
- [S25] Discourse 모더레이션 가이드(Review 큐, 3건 자동 숨김, 사유 커스터마이즈) — https://meta.discourse.org/t/discourse-moderation-guide-part-3-managing-content/406266
- [S26] Discourse staff action log(기록 범위·필터·익명화 문제) — https://meta.discourse.org/t/staff-actions-logs-are-awesome/233331 ; https://meta.discourse.org/t/user-anonymization-and-staff-action-logs/199582 ; https://meta.discourse.org/t/log-more-admin-actions/55390
- [S27] 소규모 SaaS 관리자 패널(impersonation·불변 감사 로그·feature flag) — https://dev.to/aikidosecurity/how-to-build-a-secure-admin-panel-for-your-saas-app-5874 ; https://makerkit.dev/docs/nextjs-drizzle/admin/overview
- [S28] 관리자 패널 체크리스트 — https://www.jetadmin.io/blog/admin-dashboard-how-to-choose-build-and-ship-a-production-ready-admin-panel/ ; https://lastweekasavciso.beehiiv.com/p/securing-saas-app-internal-admin-tools

접근성·보안 표준
- [S30] WCAG H63 scope / 1.3.1 — https://www.w3.org/WAI/WCAG22/Techniques/html/H63.html
- [S31] WCAG 3.3.1 Error Identification(A) — https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html
- [S32] WCAG 2.5.8 Target Size Minimum(AA, 24×24) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- [S33] NIST SP 800-63B-4(2025-07) AAL2 전체 재인증 SHOULD ≤24h — https://pages.nist.gov/800-63-4/sp800-63b/aal ; PDF https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf
- [S33b] AAL2 비활동 30분 재인증(63B-4 미러) — https://openid-foundation-japan.github.io/800-63-4/sp800-63b/aal
- [S34] OWASP Top 10 2025 A09(append-only 감사 트레일) — https://owasp.org/Top10/2025/A09_2025-Security_Logging_and_Alerting_Failures/
- [S35] OWASP Logging Cheat Sheet(무결성·접근 기록·미기록 항목) — https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
