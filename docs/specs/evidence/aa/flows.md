# AA 흐름도 — 로그인·로그아웃·탈퇴·재로그인·관리자 조치

작성 2026-11-08. 본문은 `../../03_account_admin.md` §3.2~§3.4.

## 1. OAuth 로그인 (Google·Kakao 공통, Authorization Code + PKCE S256 + state)

```mermaid
sequenceDiagram
  participant B as 브라우저(PWA)
  participant S as Pi 서버 (/api)
  participant P as 제공자(Google|Kakao)
  B->>S: GET /api/auth/{provider}/start?return_to=#/account
  S->>S: state=rand(32B), verifier=rand(32B), challenge=S256(verifier)
  S-->>B: Set-Cookie oauth=(state,verifier,return_to,provider) HttpOnly Secure SameSite=Lax Max-Age=600
  S-->>B: 302 → P/authorize?client_id&redirect_uri&response_type=code&scope&state&code_challenge&code_challenge_method=S256
  B->>P: 로그인·동의 (닉네임·프로필 사진만)
  P-->>B: 302 → /api/auth/{provider}/callback?code&state
  B->>S: GET callback (oauth 쿠키 동반: 같은 사이트 top-level GET → Lax 허용)
  S->>S: state == 쿠키.state ? 아니면 400 oauth_state_mismatch
  S->>P: POST /token (code, code_verifier, client_id, client_secret, redirect_uri)
  P-->>S: access_token (+ id_token)
  S->>P: GET userinfo (OIDC) → sub, name|nickname, picture
  S->>S: users UPSERT (provider, provider_sub) → nickname 초기값, avatar_url=NULL
  S->>S: suspended_at? → 403 페이지 / deleted_at(유예 중)? → 복구(§4)
  S->>S: sessions INSERT (id=rand(32B), 해시 저장), audit 없음(일반 사용자)
  S-->>B: Set-Cookie sid=... HttpOnly Secure SameSite=Lax Path=/ Max-Age=30d; Clear oauth 쿠키; 302 → return_to
  B->>S: GET /api/me → {user, local_merge_hint}
  B->>B: 로컬 트리 처리 UX (§5) → SH 동기화 시작
```

## 2. 세션 수명

```
생성: 로그인 성공 시. 세션 id 32바이트 CSPRNG → base64url. DB에는 SHA-256(id)만 저장.
쿠키: sid; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000(30일)
갱신: 요청 시 expires_at - now < 15일이면 expires_at += 30일, Set-Cookie 재발급 (슬라이딩)
절대 상한: created_at + 180일 → 재로그인 요구 [제안]
만료·폐기: 로그아웃(해당 세션 삭제) / 모든 기기 로그아웃(user_id 전체 삭제) / 정지·탈퇴(전체 삭제) / 만료 행은 일 1회 정리
```

## 3. 로그아웃

```
[계정 화면] 로그아웃 ──POST /api/auth/logout──▶ sessions DELETE (이 세션) ──▶ Set-Cookie sid=; Max-Age=0 ──▶ 302 #/
[계정 화면 > 기기 목록] 이 기기 외 모두 로그아웃 ──POST /api/me/sessions/revoke-others──▶ sessions DELETE WHERE user_id=? AND id<>현재
제공자 세션(Google/Kakao 자체)은 건드리지 않는다. Kakao /v1/user/logout 호출 안 함 [결정: 사용자의 카카오 로그인 상태는 우리 소관 아님]
```

## 4. 계정 삭제 (7일 유예 — 트리 삭제와 공통, 3차 M1·M11)

```
사용자: [계정 화면] 위험 영역 → [탈퇴] 탭 → 같은 자리 [정말 탈퇴](danger, 3초 유지, DS #22) 탭 → POST /api/me/delete
        (모달·홀드·입력 없음. 버튼 위 한 줄 "7일 안에 다시 로그인하면 취소됩니다")
서버 즉시:
  users.deleted_at = now
  sessions DELETE WHERE user_id
  Kakao면 POST kapi.kakao.com/v1/user/unlink (어드민 키, target_id) / Google이면 POST oauth2.googleapis.com/revoke(access_token 있을 때만)
  SH 함수 softDeleteTreesOfUser(owner_id): UPDATE trees SET deleted_at=now WHERE owner_id=? AND deleted_at IS NULL
    → 공유 링크 /t/<slug> 는 410 "삭제된 트리"(SH §3.3 deleted 행과 동일), 갤러리 제외
  audit_log: action='user.delete_requested', actor=본인
클라이언트 즉시:
  로컬 Dexie 데이터는 유지한다(A10, SH M6·M7) + 선택 "이 기기의 트리도 지우기"(기본 꺼짐) → #/
7일 내 재로그인(취소):
  같은 (provider, provider_sub)로 로그인 → deleted_at IS NOT NULL AND now - deleted_at < 7d
  → users.deleted_at = NULL
  → SH 함수 restoreTreesOfUser(owner_id, since=옛 deleted_at): UPDATE trees SET deleted_at=NULL WHERE owner_id=? AND deleted_at >= ?
    (탈퇴 전에 사용자가 직접 지운 트리는 되살리지 않음)
  → 복구 토스트 "탈퇴가 취소되었어요"
7일 경과 (일일 작업 04:00, 스케줄러 AA):
  SH 함수 purgeUser(owner_id): trees/nodes/srs/attempts + user_seq 물리 삭제 (events 는 서버 미저장 → 해당 없음)
  users 행 DELETE (provider_sub 포함 완전 삭제), audit_log의 actor_id/target_id는 UUID만 남는다
  audit_log: action='user.purge', actor=NULL
  B2 백업 안의 사본은 14일 보관 주기로 자연 소멸 → 처리방침에 "백업은 최대 14일 후 삭제" 명시
Kakao 연결 끊기 웹훅(사용자가 카카오 쪽에서 끊음):
  referrer_type != 'INCOMPLETE_SIGN_UP' → 위 "서버 즉시"와 동일(7일 유예; 7일 내 카카오 재연결 로그인 = 취소)
  referrer_type == 'INCOMPLETE_SIGN_UP' → 즉시 purgeUser + users DELETE (카카오 정책: 24시간 내 미가입 시 모든 개인정보 파기)
```

## 5. 로그인 전 로컬 트리 → 로그인 후 (UX만. 데이터 규칙은 SH §3.8 M1~M7 — 3차 M2로 맞춤)

```
로그인 완료 → useMe(): GET /api/me 200 → sync.onLogin(user.id) 1회 (SH)
SH 핸드셰이크가 로컬 L개(Dexie trees), 서버 S개, meta.userId 를 돌려준다. AA는 대화 컴포넌트 MergeDialog 1개만 제공한다.

 0) meta.userId 가 있고 ≠ user.id (다른 계정 데이터가 남은 기기, SH M3)
    ┌──────────────────────────────────────┐
    │ 이 기기에 다른 계정의 트리 n개가 있어요   │
    │ [지우고 시작]  [이 계정으로 복제]         │  ← 기본 포커스: 지우고 시작 (SH 규칙: u1 데이터는 u2에 올리지 않음)
    └──────────────────────────────────────┘
    → 처리 후 아래 1)~4)로 계속 (L은 복제 선택 시 n, 아니면 0)

 1) L=0, S=0 → 아무 안내 없음. 이후 생성 트리는 자동 동기화
 2) L>0, S=0 → MergeDialog (SH M1 "모두 올린다, 확인 1회". 선택해서 올리기 없음)
    ┌──────────────────────────────────────┐
    │ 이 기기의 트리 L개를 계정에 저장합니다    │
    │                            [저장]     │
    └──────────────────────────────────────┘
    tree_limit(200) 초과 시 완료 토스트 "가장 오래된 n개는 올리지 못했습니다"(SH 문구)
 3) L=0, S>0 → 대화 없음. 내려받기 완료 토스트 "계정의 트리 S개를 가져왔어요" (SH M2의 내려받기만)
 4) L>0, S>0 → 같은 MergeDialog 에 한 줄 추가 (SH M2 합집합, 같은 id 는 LWW)
    ┌──────────────────────────────────────┐
    │ 이 기기의 트리 L개를 계정에 저장합니다    │
    │ + 계정의 트리 S개를 가져옵니다           │
    │                            [저장]     │
    └──────────────────────────────────────┘
 5) 커서 만료·서버에 없는 로컬 트리 발견 (SH M4) → 같은 MergeDialog 재사용
    "이 기기에만 있는 트리 n개" [올리기](기본) [지우기]

삭제된 선택지: "이 기기 것만 유지" (SH §3.8 끝 — 올린 뒤 지우는 것이 선택 UI보다 쉽다)
대화는 닫기(X) 없음 — 기본 동작이 안전(올리기)하므로 [저장] 하나. 뒤로 가기로 미루면 다음 포커스 pull 때 다시 뜬다 [제안]
로그아웃 후: 로컬 Dexie·outbox·meta.userId 유지(SH M6). 계정 화면 "이 기기 데이터 지우기"는 별도 선택(공용 기기).
```

## 6. 관리자 조치 (정지)

```
관리자 → Cloudflare Access(이메일 OTP 또는 Google) 통과 → #/admin (sid 쿠키 role=admin 확인)
사용자 검색 → 보기 → [정지] → 사유 입력(선택) → POST /api/admin/users/:id/suspend
서버: users.suspended_at=now; sessions DELETE WHERE user_id; audit_log(action='user.suspend', meta={reason})
정지된 사용자: 다음 요청 401 → 로그인 시도 → 콜백에서 suspended_at → 403 페이지 "계정이 정지되었습니다 · 문의: (연락처)"
해제: POST /api/admin/users/:id/unsuspend → suspended_at=NULL, audit
```

## 7. 상태 기계 — users 행

```
          OAuth 최초 로그인
   (없음) ───────────────▶ active ──suspend──▶ suspended
                            │ ▲                 │
               delete 요청  │ │ 7일 내 재로그인   │ unsuspend
                            ▼ │                 ▼
                       pending_delete ◀──── (정지 중 삭제 요청도 허용: 관리자 delete)
                            │ 7일 경과(일일 작업) 또는 admin purge
                            ▼
                         (행 삭제)
```
