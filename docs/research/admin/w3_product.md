# W3 — 제품·사업 관점에서 관리자 페이지(#/admin)에 필요한 요소

작성 2026-11-14 · 조사 워커 W3 · 읽기 전용 조사(코드·문서 수정 없음)
입력: `app/docs/CODEBASE.md`, `app/docs/specs/03_account_admin.md` §3.4·§3.6·§3.8, `app/src/features/admin/AdminPage.tsx`, `app/server/account/admin.ts`, `app/server/migrations/*.sql`, `drilldown-biz/brief/{decisions,idea}.md`, `drilldown-biz/reports/01~11`, `app/docs/plans/orchestration_feature_research.md`, `app/docs/research/*`(R1~R5, many_trees/R7·SUMMARY).
표기: 코드에서 확인한 사실은 `파일:줄`, 문서 인용은 `[문서 §절]`, 근거 없는 추정은 **[가정]**.
표 열: 요소 / 왜 필요한가 / 데이터 출처·구현 단서 / 현재(있음·부분·없음) / 우선순위(높·중·낮) / 공수(S·M·L). 지표 행에는 추가로 **계산 가능성 판정**(① 현재 스키마로 가능 / ② 새 테이블·이벤트 필요 / ③ 개인정보 원칙 충돌)을 "판정" 열에 적었다.

---

## 0. 핵심 5줄

1. **현재 관리자 페이지는 "운영 안전장치"(계정 정지·신고 처리·공지·점검·백업 상태)는 갖췄지만, biz 보고서가 정한 성공·킬 기준(K2·K4·활성화·자기채점 비율·과신 격차·회독별 재현율)을 볼 수 있는 화면은 하나도 없다.** 대시보드는 가입·활성(7/30일)·트리 수·디스크·백업뿐이다(`AdminPage.tsx:89-107`, `admin.ts:65-88`).
2. **킬·성공 기준 중 절반은 지금 스키마(`attempts`·`srs`·`users`)로 SQL 한 번에 계산된다.** K2(14일 내 같은 트리 백지 2회), 회독별 노드 재현율, 자기채점 비율, FSRS 예측 유지율, 제공자별 가입은 ① 가능. 반면 DAU/WAU/MAU 시계열·W1/W4 코호트 리텐션·과신 격차·플래시/빈칸 모드 사용량은 ② 서버 측 일별 스냅샷 또는 활동 기록 테이블이 필요하다(클라이언트 계측 이벤트는 IndexedDB에만 남고 서버로 오지 않는다, `src/core/events.ts:4-6`).
3. **"수익화 폐기" 전제는 충돌하지 않는다.** `docs/specs/03` 9행의 전제는 `decisions.md` 6~9와 `11_cost_recovery`의 결론(결제·플랜·서포터 플랜 비채택, 토스 송금 링크만)과 일치한다. 충돌은 **구 보고서 05·07·09(구독·창립 멤버·K1)** 와의 사이에만 있고, decisions 8이 그 셋을 "재검토 대상"으로 명시해 폐기 상태다. 따라서 결제·플랜·쿠폰·환불·영수증 요소는 **불필요**. 남는 것은 "이번 달 서버비/후원 금액" 수동 입력 → 공개 막대, 후원 링크 on/off 정도(S)이며 창업자 미결 질문(11 §"넘길 질문" ④)에 걸려 있다.
4. **공개 트리 큐레이션은 "추천·고정·카테고리·태그" 보다 먼저 ① 신고 처리 SLA 표시(reports 테이블로 즉시 계산), ② 운영자(시드) 트리 표식, ③ 허용 표현 후보 승인 큐가 필요하다.** ③은 LLM 없는 채점 품질을 올리는 유일한 운영 수단으로 11 §4.1이 지정했으나 테이블·API·화면이 전부 없다(M). 태그·카테고리는 04 §3.5와 R7 S7이 의도적으로 보류했으므로 낮음.
5. **이메일이 없는 서비스라 "사용자에게 닿는 수단"이 공지 한 줄(80자, 1건)뿐이다.** 피드백·버그 수집함(없음, M), 정지·숨김 사유를 당사자에게 보여주는 통지(없음, S), 공지 복수·기간·링크(부분, S), 기능 스위치(갤러리·후원 링크 노출 등, settings 테이블 재사용, S)가 관리자 페이지에 들어와야 운영자 1~2인이 사용자와 대화할 수 있다.

---

## 1. 현재 관리자 페이지가 무엇인지 (코드 확인)

| 탭 | 화면 | 서버 | 데이터 |
|---|---|---|---|
| 대시보드 | 카드 8개(가입자 총/오늘/7일, 활성 7일/30일, 트리 총/공개/숨김, 디스크, 백업, 일일 작업, 가동·RSS, 정지·탈퇴 대기) + 14일 가입 막대 `AdminPage.tsx:81-110` | `GET /api/admin/stats` `admin.ts:65-88` | `users`, `trees`(`owner.ts:71-77`), `data/backup.json`, `data/daily.json`, `statfs`, `process` |
| 사용자 | 검색(닉네임·UUID·provider:sub), 정지/해제(사유), 삭제(7일 유예 또는 즉시) `AdminPage.tsx:114-173` | `admin.ts:131-182` | `users`, `sessions`, `trees` COUNT |
| 공개 트리 | 공개 트리 표(제목·소유자·노드·갱신·열린 신고), 숨김/해제(사유), 열린 신고 목록(숨김·기각), 삭제 7일 트리 복구 `AdminPage.tsx:176-249` | `admin.ts:184-253` | `trees`, `reports` |
| 시스템 | 공지 1줄(≤80자, 켜기), 점검 모드, 감사 로그 50건 더 보기 `AdminPage.tsx:252-300` | `admin.ts:255-288` | `settings`(key `notice`·`maintenance`만 읽음 `admin.ts:19-26`), `audit_log` |

**서버 스키마**(`server/migrations/001_account.sql`, `002_trees.sql`, `003_ratings.sql`): `users(provider, created_at, last_seen_at, suspended_at, deleted_at, role)`, `sessions(ua 축약)`, `audit_log`, `settings(key,value)`, `reports(reason, created_at, resolved_at, resolution)`, `trees(visibility, slug, source_tree_id, node_count, copy_count, created_at, updated_at, hidden_by_admin_at)`, `nodes`, `srs(card JSON, due, last_grade_source, auto_correct_days, pending_recheck, miss, updated_at)`, `attempts(tree_id, root_id, started_at, completed_at, node_recall, edge_accuracy, auto_graded_count, self_graded_count, overridden_count)`, `ratings(stars)`.

**지표 계산에 결정적인 사실 4가지**
- `users.last_seen_at`은 로그인 사용자의 **모든 API 요청**에서 60초 간격으로 갱신된다(`server/account/session.ts:63-66`). 백그라운드 동기화 pull도 포함되므로 "앱을 열기만 한 사용자"까지 활성으로 센다. 06 §6.2는 "앱을 열기만 한 것은 제외"하라고 했으므로 북극성 지표에는 쓸 수 없다.
- 클라이언트 계측 이벤트(`tree_created`, `outline_imported`, `flash_rated`, `dnd_attempt_completed`)는 Dexie `events`에만 쌓이고 서버로 올라가지 않는다(`src/core/events.ts:4-6`, `owner.ts:17` 주석 "events 는 서버 미저장"). `blank_node_graded`·`blank_attempt_completed`·`drilldown_retrieval_submitted`는 타입에 선언만 있고(`src/core/types.ts:66-74`) 호출하는 곳이 없다(grep 0건). 백지 퀴즈 결과는 이벤트가 아니라 `attempts` 행으로 동기화된다(`server/sync/push.ts:141-146`).
- `attempts`는 **백지 퀴즈만** 담는다(`BlankAttempt` `src/core/types.ts:84-95`). 플래시·빈칸(D&D) 세션은 서버에 세션 단위 기록이 없고, `srs.last_grade_source`가 노드별 "마지막" 판정만 남긴다(덮어쓰기, 이력 없음).
- 비로그인 사용자는 서버에 아무 흔적도 남기지 않는다(동기화는 로그인 후에만, CODEBASE §7). 모든 서버 측 지표의 분모는 "가입자"다. 비로그인 비중은 **[가정] 알 수 없음**.

---

## 2. 전제 충돌 점검: "수익화 폐기"(03 스펙) vs biz 보고서

| 항목 | `docs/specs/03` 쪽 근거 | biz 보고서 쪽 근거 | 판정 |
|---|---|---|---|
| 수익화 목표 | 9행: "전제: 수익화 목표 폐기, Pi 자체 호스팅, LLM 없음(decisions 6~9)". §3.7 수집하지 않음 항목에 "결제" 명시(318행) | `decisions.md` 6: "수익화를 목적으로 하지 않는다. 돈을 받게 되더라도 목표는 개인 서버 유지 비용 회수까지". 8: 결정 2(구독 가격)·5 대체, "09의 수익·재무 결론은 재검토 대상" | **충돌 없음.** 03이 decisions 6~9를 그대로 따랐다 |
| 비용 회수 수단 | 언급 없음(관리자 화면에 후원 요소 없음) | `11 §3.3`: 토스 송금 링크 **채택**, 결제 기능 있는 서포터 플랜 **비채택**(사업자·부가세·전자상거래 의무 재발생, 결정 6 취지 충돌). 운영 규칙(추론·가정): "이번 달 서버비 ○○원 / 후원 ○○원" 막대 공개, 후원자 닉네임 명단(선택), 6개월치 초과 시 링크 닫기. `R4_platform.md:59`: "설정 화면의 토스 송금 링크 하나로 끝난다. 별도 기능 개발이 필요 없어 표에 넣지 않았다" | **경미한 공백.** 03은 "회수 수단"을 다루지 않아 후원 막대·링크 on/off 같은 최소 요소가 스펙에 없다. 단 11은 "창업자: ④ 후원을 공개 막대 방식으로 받을지, 아예 받지 않을지"를 **미결**로 남겼다 → 결정 전까지 공수 투입 보류 |
| 구독·플랜·창립 멤버·K1(실결제) | 없음 | `05`(월 5,900/연 39,000/시즌패스), `07`(손익분기 20개월차), `09` 결정 ①(창립 1년권 19,900원)·K1 | **구 보고서와만 충돌.** `decisions.md` 8과 `11 §1·§5`가 K1·C4·C5·창립 멤버·요금제 로직을 전부 삭제했다. 관리자 요소로서 결제·플랜·쿠폰·환불·영수증은 **불필요**(아래 §3-E) |
| 공개 갤러리 운영 | §6 Q4 "공개 갤러리 운영 여부(plan §2 미결) — 운영하면 신고 처리가 관리자 업무" | `00_overview.md:85` D3 "켬(P6)"; `04 §3.5`·`R7 S6` "갤러리를 켠다면 링크·검색 필수" | 켬으로 확정됨(00 D3). 신고 처리는 이미 구현. 큐레이션 요소는 §3-C |
| LLM 채점 | 9행 "LLM 없음" | `decisions.md` 9, `11 §4` 5단계 채점 + 허용 표현 사전 운영 | 일치. **운영자가 사전을 승인하는 큐**(11 §4.1)가 관리자 요구로 파생된다(§3-C) |

결론: 관리자 페이지 설계에서 "수익화 폐기"는 그대로 유효하다. 결제 관련 요소는 넣지 않고, 후원은 창업자 결정(11 ④) 후 settings 기반 S 공수로 붙인다.

---

## 3. 요소 표

### A. 사용 지표

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| DAU/WAU/MAU **시계열**(일별 30~90일) | 11 §5 "새 성공 기준"의 분모. 현재는 "지금 시점 기준 최근 7/30일 활성" 두 숫자만(`admin.ts:75-76`) | `users.last_seen_at`은 마지막 값만 남아 과거 복원 불가. 일일 작업(`daily.ts`, 04:00)에서 `daily_stats(day, dau, wau, mau, new_users, new_trees, attempts, …)` 1행 스냅샷 → 대시보드 선그래프 | 부분 | 높 | S | ② 새 테이블(집계값만, 개인 식별 없음). ③ 충돌 없음 |
| **주간 인출 활성**(북극성, 06 §6.2: 앱 열기 제외) | K4 판정(08 K4: W4 < 10% 킬), 11 §5 표 | 백지: `attempts.completed_at` 주별 DISTINCT user → **소급 계산 가능**. 플래시·빈칸: `srs.updated_at`은 덮어쓰기라 "이번 주" 스냅샷만 가능 → `daily_stats`에 `retrieval_active_users` 포함 | 없음 | 높 | S | 백지 ①, 전 모드 ② 스냅샷 |
| W1/W4 **코호트 리텐션** | 06 §6.2 목표 W1≥35%, W4≥20%; K4 | 가입주 코호트 × 주별 인출 활성 이력 필요. 안: push 처리 시 `srs`/`attempts`가 포함된 요청이면 `user_activity(user_id, day)` upsert(`push.ts` 1줄) → 코호트 표(가입주 × +1~+8주) | 없음 | 높 | M | ② 새 테이블(user_id+날짜). ③ IP·이메일 없음이라 원칙 자체와는 충돌 없으나 "학습 행태 기록"이므로 처리방침 ①·② 항목(03 §3.7) 문구 보강 필요 **[가정]** |
| **활성화율**(가입 72h 내 인출 입력 + 퀴즈 완료 ≥ 40%, 06 §6.1) | 11 §5 성공 기준 1번 | 퀴즈 완료 = `attempts.completed_at − users.created_at ≤ 72h`(①). "공개 전 인출 입력"은 `drilldown_retrieval_submitted` 이벤트가 **선언만** 있고 미호출(`types.ts:69`) → 드릴다운 입력은 서버에 없음. `srs.last_grade_source` 가 exact/alias/fuzzy면 백지 인출로 간주 가능 | 없음 | 높 | S | 퀴즈 완료 기준 ①, 원 정의 그대로는 ② |
| 신규 트리 수(일별), 사용자당 트리 분포 | 콘텐츠 축적 속도(04 "데이터 해자" 가정), `treesPerUser` 상한 200(`types.ts:98`) 근접 사용자 | `trees.created_at` GROUP BY day; `trees GROUP BY owner_id` | 없음(총계만) | 중 | S | ① |
| 학습 세션 수(일별), 사용자당 주간 세션 | K2·K4 보조, 시험 시즌(2027-03~08, 02 §2.3) 수요 곡선 확인 | 백지: `attempts` ①. 플래시·빈칸 세션: 서버 기록 없음 → `attempts`에 `mode` 열을 두고 플래시/빈칸 세션 요약도 append 하도록 클라이언트 push 확장(개인 식별 추가 없음) | 부분 | 중 | M | 백지 ①, 타 모드 ② |
| **모드별 사용 비율**(플래시/빈칸/백지) | 03 결론 "효과는 인출(백지)에서 나온다" 가설 검증. 09 §5 금지 지표("초록 가지 수") 대신 쓸 행동 지표 | 위와 동일. 임시 대용: `srs.last_grade_source` 분포(exact·alias·fuzzy·self_*·auto_reject는 백지 경로, `types.ts:41-48`) vs `miss` 변화 | 없음 | 중 | M | ② |
| **FSRS 평균 예측 유지율**(R 평균, 90% 미만 사용자 수) | 03 §3.1 "시간 경과 바램", 복습 부담 모니터링, R1 #10 목표 기억률 설정 전제 | `srs.card`는 ts-fsrs Card JSON 그대로(`types.ts:52` 주석). `json_extract(card,'$.stability')`·`$.last_review`로 서버에서 R 계산(`src/core/srs/index.ts:59` `retrievability` 공식 재사용). 수천~수만 행이면 Pi에서 ms~수십 ms **[가정]** | 없음 | 중 | S | ① |
| 복습 연체(due 지난 카드) 사용자 비율 | 이탈 선행 지표 **[가정]** | `srs.due < now AND deleted_at IS NULL` GROUP BY user | 없음 | 낮 | S | ① |
| 비로그인 사용 규모 | 모든 분모가 가입자라 실제 사용자 수를 과소 추정 | 식별자 없는 일별 핑(`POST /api/ping` 바디 없음, 카운터만) → `daily_stats.anon_pings`. IP 저장 금지라 유니크 집계는 불가, 요청 수만 | 없음 | 낮 | S | ② 집계값만. ③ 유니크를 위해 IP 해시를 쓰면 **충돌** → 요청 수로 제한 |

### B. 학습·채점 품질 지표 (biz 킬·신호 기준)

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| **K2: 활성 사용자 중 14일 내 같은 트리 백지 2회 이상 비율** | 08 K2 킬 기준(< 20%), 11 §5 "미달하면 신규 개발 중단". 측정 창 2027-03~08만(02 §2.3) → 코호트 기간 선택 UI 필요 | `attempts` self-join: 같은 `user_id, tree_id`에서 `completed_at` 차이 ≤ 14일인 쌍 존재 여부 | 없음 | 높 | S | ① |
| **회독별 자동 인정 재현율 향상**(1회차 → 3회차 `node_recall` 중앙값 +15%p) | 11 §5 성공 기준(가정 기준값, 첫 코호트 분포 보고 고정) | `attempts` ROW_NUMBER() OVER (PARTITION BY user_id, tree_id ORDER BY completed_at) → 1차·3차 `node_recall` 분포 | 없음 | 높 | S | ① |
| **자기채점 비율**(K3 신호: 누적 200회 시점 > 30%) | 11 §4.3: 사전 보강 → 노드 쟁점어화 → 기능 설명 하향의 트리거. 킬 아님 | `SUM(self_graded_count) / SUM(auto_graded_count + self_graded_count)` from `attempts`; 트리별 상위 목록(어느 시드 트리가 사전 보강 대상인지) | 없음 | 높 | S | ① |
| 뒤집기 비율(`overridden_count`) | 04 5장 ③ 지표, 퍼지 임계값 조정 근거 | `attempts.overridden_count` | 없음 | 중 | S | ① |
| **자기채점 과신 격차**(self_accept 노드의 다음 회차 자동 정답률 − 자동 정답 노드의 같은 비율, < 15%p) | 11 §5 성공 기준, 03 §3.5 ②, 04 `self_graded_node_rechecked` | 현재 `srs.pending_recheck`(self_accept 후 미확인) 건수만 스냅샷 가능. 전이 이력이 없음 → push 처리에서 old.last_grade_source → new 전이를 `grade_transitions(user_id?, tree_id, prev, next, day)` 로 집계(사용자 식별 없이 카운트만 두면 ③ 부담 0) | 없음 | 높 | M | ② |
| 구조 오답 비율(`edge_accuracy`) | 11 §4.1 ④ "목차 학습에서 가장 정보가 많은 오류" | `attempts.edge_accuracy` 분포 | 없음 | 중 | S | ① |
| 노드 상태 분포(초록/연두/빨강/미학습) 전체 | 09 §5 금지 지표라 **성과 지표로는 쓰지 않음**. 색 규칙(초록 금지 등)이 실제로 적용되는지 확인용만 | `srs.auto_correct_days` 길이·`last_grade_source` | 없음 | 낮 | S | ① |

### C. 공개 트리 큐레이션

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| **신고 처리 SLA**(열린 신고 최장 대기, 7일 내 처리율, 사유별 건수) | 00 D3 갤러리 켬 → 신고 응대가 운영자 업무. 11 §6 저작권(01·02 리스크 "강사 목차 저작권") 신고는 지연이 곧 법적 리스크 **[가정]** | `reports.created_at`, `resolved_at`, `reason` → 대시보드 카드 1개 + 공개 트리 탭 상단 요약. 처리 완료 신고는 90일 후 삭제(`daily.ts:32`)라 장기 통계는 `daily_stats`에 적재 | 부분(열린 목록만) | 높 | S | ① |
| 소유자 단위 신고 집계(같은 사용자 여러 트리 신고, 반복 신고자) | 스팸·저작권 반복 위반자 식별 → 정지 판단 근거. 신고자 보호(R7 S10: 신고 수를 소유자에게 노출 금지)는 유지 | `reports JOIN trees ON tree_id GROUP BY owner_id`; `reports.reporter_id` GROUP BY(탈퇴 시 NULL 처리 `owner.ts:20`) | 없음 | 중 | S | ① |
| **운영자(시드) 트리 표식·필터** | decisions 3 "시드 트리 40개", 06 앰배서더 검수 트리. 관리자가 시드 트리를 모아 보고 품질(자기채점 비율·복제 수·별점)을 봐야 11 §4.1 콘텐츠 규칙을 돌릴 수 있다 | 1차: `trees JOIN users WHERE role='admin'`(소유자가 관리자면 시드). 2차: `trees.is_seed` 또는 `settings.seed_tree_ids` | 없음 | 중 | S | ① |
| **허용 표현 후보 승인 큐** | 11 §4.1: "서로 다른 사용자 3명 이상이 자기채점에서 인정한 표현 → 소유자(시드는 운영자)가 승인해 사전에 넣음". LLM 없는 채점 품질을 올리는 핵심 운영 루프 | 서버에 자기채점 "맞음" 표현이 전혀 없음(노드 `aliases`만 동기화). 새 테이블 `alias_candidates(node_id, text, distinct_users, status)` + 클라이언트가 self_accept 시 입력 텍스트를 push + 관리자 승인 → `nodes.aliases` 갱신 | 없음 | 중 | M | ② 새 테이블·이벤트. ③ 사용자 입력 텍스트가 모이므로 노드 제목 수준의 짧은 텍스트로 제한·사용자 id 비저장(카운트만) 권고 |
| 추천·고정(featured) 트리 | 갤러리 첫 화면 품질. 시드 트리 노출 보장 | `settings.featured_slugs` JSON + `/api/gallery` 응답 상단 고정. 갤러리 캐시 60초(`share.ts:120-128`) 그대로 | 없음 | 중 | S | ① |
| 카테고리·태그·과목 분류 | 트리가 수백 개를 넘을 때 탐색(R7 S7) | 04 §3.5·R7 S7 **의도적 보류**("작성자 입력 부담, 분류 체계 운영"). 시드 40개 + 사용자 규모 확인 후 | 없음 | 낮 | M | ② |
| 갤러리 검색 품질(검색어 상위·0건 검색어) | 시드 트리 공백 과목 발견(05 §4 "시드 트리가 없는 과목") | `/api/gallery?q=` 있음(`share.ts:119-128`). 검색어 로그 없음 → 일별 `(q, count, zero_hit)` 집계 테이블, 사용자 id·IP 없음, 보유 30일 | 없음 | 낮 | S | ② 집계값. ③ 검색어는 자유 텍스트라 개인정보가 섞일 수 있음 → 길이 50자 제한(이미 `share.ts:119`)·단기 보유 |
| 복제 계보·원본 표기 | R7 S9 "복제본이 원작자 이름 없이 갤러리에" → 관리자가 중복·도용 신고를 판단할 때 원본 확인 | `trees.source_tree_id` 있음(`002_trees.sql`). 관리자 트리 표에 "원본: 제목·닉네임" 열 | 없음 | 낮 | S | ① |
| 별점·복제 수 상위/하위 트리 | 큐레이션·시드 트리 품질 | `ratings` AVG, `trees.copy_count` | 없음(갤러리 화면에만) | 낮 | S | ① |

### D. 성장 지표

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| **공유 링크 조회 수**(트리별·일별) | 06 §6.2 `share_link_view`, 06 A7(k≥0.2) 검증. 갤러리·공유가 유일한 무료 유입 채널(decisions 5, 11 §5) | `GET /t/:slug`(`server/sync/index.ts:123-134`)·`GET /api/t/:slug` 어느 쪽도 카운트 없음. `trees.view_count` +1 또는 `daily_stats.share_views`. Cloudflare 캐시 60초(`index.ts:132`)와 크롤러 UA(`index.ts:124`) 때문에 과소 집계 **[가정]** | 없음 | 높 | S | ② 새 열(집계값). ③ IP 비저장이라 유니크 방문자는 불가 → 요청 수로 정의 |
| 복제 수(일별 합계, 상위 트리) | `tree_clone` 지표, 갤러리 효용 | `trees.copy_count`는 트리별 누계 ①(`index.ts:92-99`). 일별 합계는 `daily_stats` 스냅샷 차분 | 부분 | 중 | S | ①/② |
| 갤러리 전환율(갤러리 열람 → 공유 보기 → 복제 → 로그인) | 갤러리 운영(00 D3)의 가치 검증 | 갤러리 API 호출 수(카운터) → 공유 보기 조회 → copy → 가입(같은 날 `users.created_at`). 개인 연결 없이 일별 퍼널 비율만 | 없음 | 중 | M | ② 집계값 |
| **OAuth 제공자별 가입·활성** | Naver 추가 여부(03 §6 Q3) 판단, 카카오 인앱 브라우저 문제(CODEBASE §6.10) 영향 | `users.provider` GROUP BY ① | 없음(사용자 표에 제공자 열만) | 중 | S | ① |
| 유입 출처(UTM·초대 코드) | 06 §6.2 "출처 구분은 UTM과 초대 코드" | 저장 안 함. OAuth start의 `return_to` 외 `src` 파라미터를 `users.signup_source`(enum 수준: cafe/blog/share/direct) | 없음 | 낮 | S | ② 새 열. ③ 비식별 코드만이면 충돌 없음 |
| 공개 트리 수 추이·공개 전환율(private→public) | 콘텐츠 공급 측 | `trees.visibility` 스냅샷 → `daily_stats` | 부분(현재 값만) | 낮 | S | ② |

### E. 비용 회수·후원 (결제·플랜은 불필요)

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| **서버비/후원 금액 수동 입력 → 공개 막대** | 11 §3.3 운영 규칙 "이번 달 서버비 ○○원 / 후원 ○○원 막대 공개"(추론). 결제 연동이 없으므로 운영자가 토스 입금을 보고 **손으로** 입력 | `settings` key `funding: {month, cost_krw, donated_krw, link, enabled}` → `/api/me`(이미 notice·maintenance 전달) 또는 공개 `/api/auth/providers`에 포함 → 푸터 막대 | 없음 | 중(창업자 결정 11 ④ 전까지 보류) | S | ① settings 재사용. ③ 금액 집계만, 후원자 개인정보 없음 |
| 후원 링크 on/off, 6개월치 초과 시 자동 닫기 | 11 §3.3 "목표를 넘은 금액은 이월, 6개월치 넘으면 링크 잠시 닫기"(가정) | 같은 settings. 닫기는 수동 토글로 충분(월 1회 운영) | 없음 | 낮 | S | ① |
| 후원자 명단(닉네임 표시, 선택) | 11 §3.3 "서포터 표시는 닉네임 명단까지만"(대가성 방지) | 서버에 후원자-계정 연결 정보가 없음(익명 송금). 운영자가 닉네임을 수동 등록하는 `settings.supporters: string[]` | 없음 | 낮 | S | ① ③ 닉네임만, 금액 비공개 |
| 결제·플랜·쿠폰·환불·영수증 관리 | — | **불필요.** decisions 6·8, 11 §3.3 "서포터 플랜 비채택(사업자·부가세·전자상거래 의무 재발생)", 03 §3.7 "결제 수집하지 않음" | 없음 | 낮(하지 않음) | — | — |
| 월 운영비 실측 입력(전력·도메인) | 11 §3.1 산식 검증(Z2), 후원 막대의 분모 | `settings.funding.cost_krw`에 포함 | 없음 | 낮 | S | ① |

### F. 사용자 피드백·버그 신고

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| **피드백·버그 수집함**(카테고리: 버그/제안/콘텐츠 오류/기타, 본문 ≤500자, 선택적 트리 id) | 이메일을 저장하지 않아(03 §3.7) 사용자가 운영자에게 닿을 길이 **없다**. 현재 접점은 처리방침의 `PRIVACY_CONTACT` 1개(`PrivacyPage.tsx:21,50`)와 트리 신고(`admin.ts:104-120`)뿐. 06 G0 설문·03 §5 실험·채점 오판 보고(04 리스크 2)를 받을 통로 | `POST /api/feedback`(anon 5/시·user 20/시, 신고와 동일 패턴 `admin.ts:106`) → `feedback(id, user_id NULL 허용, category, text, tree_id, client, created_at, resolved_at, note)` → 관리자 탭 "피드백"(목록·처리·메모) → `daily.ts`에 90일 삭제 추가 | 없음 | 높 | M | ② 새 테이블. ③ 본문에 사용자가 이메일을 적을 수 있음 → 입력란 안내 "연락처를 적지 마세요", 보유 90일, `client`는 `sessions.ua` 수준 축약(`session.ts:35`)만 |
| 운영자 답변 전달(이메일 없음) | 보낸 사람이 결과를 볼 수단 | 로그인 사용자: 계정 화면에 "내 피드백·상태·운영자 메모" 목록(`GET /api/me/feedback`). 비로그인: 접수 id 표시 후 공지로만 | 없음 | 중 | S | ① (위 테이블 전제) |
| 클라이언트 오류 수집(미처리 예외 카운트) | PWA autoUpdate(`vite.config.ts:9`)라 배포 즉시 전 사용자에 퍼짐. 깨진 배포를 알 수단이 `console.error`(서버)뿐(`server/index.ts:29-33`) | `window.onerror` → `POST /api/client-error {message(≤200), stack 상위 3줄, version}` 분당 제한 → 메모리 카운터 또는 `daily_stats.client_errors` + 대시보드 카드 | 없음 | 중 | S | ② 집계. ③ 스택에 URL·입력값이 섞일 수 있음 → 메시지 길이 제한, 사용자 id 비저장 |
| 서버 요청 수·에러율(5xx/429) 카드 | 가용성 월 99%(11 O1·2.4) 판단, 레이트 리밋 429 폭주(R7 S16) 감지. 현재 stdout 로그만(`server/index.ts:27`) | `hit()`과 같은 메모리 카운터(`http.ts`) → `/api/admin/stats`에 `req_1h, err_1h, rl_1h`. 재시작 시 초기화 허용 | 없음 | 중 | S | ① 메모리. ③ 충돌 없음(IP·경로 미저장) |

### G. 기능 플래그·점진 배포

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| **운영 스위치**(갤러리 노출, 신고 버튼, 후원 막대, 별점, 공개 전환 허용) | 00 D3·04 Q1 "갤러리 켬/끔은 운영 시작"(R7 S6), 시험 시즌 동결(11 §6 "8월 4주 배포 중단") 중 코드 배포 없이 기능을 내릴 수단 | `settings` key `flags: {gallery, report, funding, rating}` → `/api/me` 응답에 포함(이미 notice·maintenance 전달, `me.ts`) → 클라이언트 `useMe().flags`. 서버 라우트도 같은 값 확인 | 없음(점검 모드만) | 중 | S | ① settings 재사용 |
| 사용자 비율 점진 배포(n%) | 1~2인·Pi 1대·PWA autoUpdate 환경에서 코드 롤아웃 단계는 없음. 플래그를 `hash(user_id) % 100 < pct`로 켜면 서버·클라이언트 모두 추가 저장 없이 가능 | `flags.{name}.pct` | 없음 | 낮 | S | ① ③ user_id 해시만, 저장 없음 |
| 배포 버전 표시(서버 커밋·클라이언트 빌드) | 장애 대응 때 "어느 버전이 떠 있나" 확인. `package.json` version 0.0.0, 빌드 id 없음 | `GET /api/health`는 "버전 없음"이 결정(03 §3.6) → 관리자 전용 `/api/admin/stats.version`(git short SHA, 빌드 시각) | 없음 | 중 | S | ① |
| 시험 시즌 동결 플래그·배포 금지 알림 | 11 §6 운영 규칙. 운영자 실수 방지 | `settings.freeze_until` → 관리자 상단 배너 | 없음 | 낮 | S | ① |

### H. 사용자 알림(이메일·푸시 없는 환경)

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| 공지 **복수·기간 예약·링크·대상**(전체/로그인만) | 현재 공지는 1건·80자·링크 없음·닫기는 세션 동안만(`Banners.tsx:1,8-25`, `admin.ts:263`). 복원 런북 10단계(03 §3.8) "24시간 뒤 끈다"를 자동화하고, 점검 예고("내일 03:00 10분 중단")를 미리 띄울 수 있어야 함 | `settings.notice`를 배열 `{id, text≤160, url?, from, until, audience}`로 확장 또는 `notices` 테이블. 서버가 `from≤now<until`만 내려줌 | 부분 | 중 | S | ① |
| **정지·숨김 사유 당사자 통지** | 정지 사용자는 로그인 시 `#/login?e=suspended`만 본다(03 §3.6). 숨김은 공유 시트를 열어야 배너가 보임(R7 S12, `ShareSheet.tsx`). 사유는 이미 `audit_log.meta.reason`에 있음(`admin.ts:166,203`) | `/api/me`에 `hidden_trees: [{id, reason, at}]`, 로그인 거절 응답에 `reason` 포함(사유는 운영자가 쓴 ≤200자, 개인정보 금지 규칙 유지) | 없음 | 중 | S | ① |
| 점검 예고(시작 시각·예상 시간) | 점검 모드는 즉시 ON/OFF만(`admin.ts:265-267`). 11 §2.4 "99% 약속하지 않음을 명시" | `settings.maintenance: {enabled, scheduled_at?, minutes?}` → 배너 문구 | 부분 | 낮 | S | ① |
| 웹 푸시(복습 알림·공지) | R4 #11(P2). 서버 VAPID 발송, 설치형 PWA 전제(R4 #3) | 구독 엔드포인트 저장 테이블(`push_subs(user_id, endpoint, keys)`) — endpoint는 브라우저가 발급한 URL이라 개인정보 성격 **[가정: 처리방침 추가 필요]** | 없음 | 낮 | M | ② ③ 처리방침 항목 추가 |
| 인앱 메시지(개인 대상, 피드백 답변 등) | F 행 "운영자 답변 전달" | `GET /api/me/inbox` 또는 피드백 상태로 대체 | 없음 | 낮 | S | ① |

### I. 운영 기준(11 O1~O3·C6) 추적

| 요소 | 왜 필요한가 | 데이터 출처·구현 단서 | 현재 | 우선 | 공수 | 판정 |
|---|---|---|---|---|---|---|
| 복구 리허설 기록(마지막 실행일·소요·결과) | C6(출시 전 2시간 내 복원), 03 §3.8 월 1회 리허설. `audit_log action='system.restore'`는 런북 10단계에만 명시(`docs/ops/runbook.md:80-92`) | 관리자 시스템 탭 "리허설 완료" 버튼 → `audit_log(system.restore_drill, meta{minutes})` + 대시보드 "마지막 리허설 N일 전" | 없음 | 중 | S | ① audit_log 재사용 |
| 운영 시간 로그(월 8h 초과 2개월 → O1) | 11 O1 킬 기준, Z8 가정 검증 | 수동 입력 `audit_log(system.ops_time, meta{minutes, what})` 월 합계 | 없음 | 낮 | S | ① |
| 가용성(월 다운타임) | 11 §2.4 목표 99%. `uptime_s`는 재시작 이후만(`admin.ts:85`) | 외부 업타임 핑 결과는 서버에 없음 → 대시보드에 외부 모니터 링크 + `daily_stats.restarts`(기동 시 +1) | 부분 | 낮 | S | ②(집계) |
| DB 파일 크기·사용자당 평균 용량 | 11 §2.1 "사용자당 약 1MB" 가정(04 7장) 검증, NVMe 256GB 계획 | `statSync(app.db).size`, `/ users.total` | 없음(디스크 %만) | 중 | S | ① |
| 사고 기록(O2 데이터 손실·O3 유출) | 11 O2·O3 "1회면 재판정", 72시간 신고 의무(11 §6) | 런북 92행 `audit_log system.incident` → 시스템 탭에 사고 목록·발생 시각·72h 카운트다운 | 없음 | 중 | S | ① |
| 백업 검증(복원 가능 여부) | `backup.json ok`는 "파일을 만들었다"만 뜻함 **[가정: backup.ts 미확인]** | 백업 스크립트가 `PRAGMA integrity_check` 결과를 `backup.json`에 추가 | 부분 | 낮 | S | ① |

---

## 4. 근거 메모

### 4.1 왜 "지표 대시보드"가 최우선인가
- 11 §1은 Go 판정의 질문을 "돈을 낼 사람이 있는가"에서 **"실제로 반복 인출에 쓰는 사람이 있는가 + 1인이 Pi를 지속 운영할 수 있는가"**로 바꿨다. 그 답은 K2·K4·활성화·회독별 재현율·자기채점 비율·과신 격차(11 §5 표)이고, 측정 창은 2027-03~08(02 §2.3)이다. 09 §2 ④와 08 §4는 "임계값을 측정 전에 고정하고 결과를 본 뒤 바꾸지 않는다"고 했으므로, 판정 창이 열리기 전에 화면이 있어야 한다.
- 06 §6.2 금지 지표: "초록 가지 수"를 성과로 쓰지 않는다(자기평가 과신, 03 5a·5b). 따라서 A·B 표에서 색 분포는 규칙 점검용으로만 두었다.
- 지금 서버에 있는 것으로 가장 많이 계산되는 테이블은 `attempts`다(append-only, 사용자·트리·시각·재현율·채점 출처 카운트). 백지 퀴즈가 03이 "근거가 가장 강한" 기능이라 결과적으로 핵심 지표가 백지 중심인 것과 맞아떨어진다. 플래시·빈칸은 `srs` 덮어쓰기만 남아 세션·이력 지표가 없다.

### 4.2 새 테이블 제안 최소 집합(개인정보 원칙 유지)
| 테이블 | 열 | 개인 식별 | 용도 |
|---|---|---|---|
| `daily_stats` | day PK, dau, wau, mau, retrieval_active, new_users, new_trees, attempts, share_views, copies, gallery_hits, client_errors, restarts, open_reports, … | 없음(집계) | A·D·F·I 전부. `daily.ts`(04:00) 1 INSERT |
| `user_activity` | user_id, day, kind(blank/flash/dnd) PK | user_id | W1/W4 코호트, 전 모드 주간 인출 활성. push 시 upsert. 보유 1년 → `daily.ts` 삭제. 처리방침 ② "학습 기록" 보유 기간에 포함 **[가정]** |
| `feedback` | id, user_id NULL, category, text≤500, tree_id, client, created_at, resolved_at, note | user_id(선택) | F. 90일 삭제 |
| `alias_candidates` | node_id, text, users_count, status | 없음(카운트만) | C 허용 표현 승인 |
| (열 추가) `trees.view_count`, `attempts.mode`, `users.signup_source` | — | 없음 | D·A |

IP·이메일·원문 UA는 어디에도 넣지 않는다(03 §3.7 "수집하지 않음", `server/index.ts:27` 요청 로그도 경로·상태·시간만). 유니크 방문자·검색어 개인 추적처럼 IP가 필요한 지표는 **정의 자체를 요청 수·집계값으로 바꿔** 충돌을 피했다.

### 4.3 큐레이션 우선순위를 "추천·태그"보다 "신고 SLA·시드 표식·사전 승인"에 둔 이유
- 00 D3가 갤러리를 켰고(신고·저작권 응대 월 수 건 [가정]), 01 §3·02 §2 "안 될 이유 ③"이 강사 목차 저작권을 리스크로 꼽았다. 신고의 `reason='copyright'`는 이미 스키마에 있다(`001_account.sql`). 대기 시간 표시가 가장 싸고 효과가 크다.
- 결정 3·06 §2는 시드 트리 40개를 초기 유입 콘텐츠로 삼았고 11 §4.1은 "콘텐츠 규칙이 코드보다 효과가 크다"고 했다. 운영자가 자기 트리를 모아 보고 자기채점 비율이 높은 트리를 고치는 루프가 필요하다. 반면 태그·카테고리는 04 §3.5(미결 포함)와 R7 S7에서 "작성자 입력 부담·분류 체계 운영"을 이유로 보류됐다.

### 4.4 R7·백로그와의 접점
- `feature_backlog.md` Top 10 #8 "숙련도 대시보드(attempts·srs 활용)"는 **사용자용** 화면이다. B 표의 집계는 같은 테이블의 **운영자용** 합계라 쿼리 함수를 공유할 수 있다 **[가정: 구현 시 `server/sync/owner.ts` 류에 집계 함수를 두면 양쪽 재사용]**.
- R7 S10 "소유자에게 복제 수 표시, 신고 수는 노출 금지"는 그대로 유지하고, 신고 집계는 관리자에게만 둔다.
- R7 S12 "숨김 트리가 목록에서 공개 아이콘으로 보임"은 H 표 "정지·숨김 사유 통지"의 클라이언트 측 짝이다.

### 4.5 구 보고서 05·07·09가 요구했지만 **넣지 않은** 요소
창립 멤버 판매 현황·K1 실결제·구독 전환율(06 §6.2 "유료 전환 ≥ 6%")·LTV/CAC(07 §1-4)·시즌패스 비중(07 §4)·T1 결제 트리거(05 §5)·무료 한도(내 트리 3개, 05 §4). 모두 decisions 8과 11 §5 "빠지는 것" 표에 따라 폐기 상태라 관리자 요소에서 제외했다. 창업자가 결정 6을 되돌리면 이 절이 다시 열린다.

---

## 5. 추천 구현 순서(우선 높 → 중, 공수 합계 추정)

| 단계 | 요소 | 공수 |
|---|---|---|
| 1 | 대시보드 "학습 지표" 카드 묶음: K2 비율, 회독별 재현율(1→3회차), 자기채점 비율·뒤집기 비율, 활성화율(퀴즈 완료 기준), 제공자별 가입, 신고 SLA — 전부 현재 스키마 SQL | S×6 ≈ M |
| 2 | `daily_stats` 스냅샷 + 30일 선그래프(DAU/WAU/MAU·인출 활성·신규 트리·세션) + `trees.view_count` | M |
| 3 | `feedback` 테이블·API·탭 + 계정 화면 상태 보기 | M |
| 4 | `settings.flags`(갤러리·신고·후원 노출) + 공지 복수·기간 + 정지·숨김 사유 통지 | S×3 ≈ M |
| 5 | `user_activity` 코호트 표(W1/W4), 과신 격차 전이 집계 | M |
| 6 | 시드 트리 표식·고정, 허용 표현 승인 큐 | S + M |
| 보류 | 후원 막대(창업자 11 ④ 결정 후, S), 태그·카테고리, 웹 푸시, UTM |

---

## 6. 미결·확인 필요(코디네이터·창업자)
1. 후원을 "공개 막대"로 받을지, 아예 받지 않을지(11 §"넘길 질문" ④) — E 표 전체의 전제.
2. `user_activity`(사용자별 활동 일자) 저장을 처리방침 "학습 기록"에 포함해도 되는지, 보유 기간(1년 제안) — 03 §3.7 ② 항목 수정 여부.
3. 플래시·빈칸 세션 요약을 `attempts`에 함께 올리도록 클라이언트 push를 바꿀지(모드별 지표의 전제), 아니면 백지 중심 지표만으로 2027 판정 창을 볼지.
4. 비로그인 사용 규모를 익명 요청 수로라도 셀지(개인정보 영향 0이지만 "최소 수집" 원칙상 운영자 판단).
