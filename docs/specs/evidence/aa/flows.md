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

## 4. 계정 삭제 (7일 유예)

```
사용자: [계정 화면] 계정 삭제 → 확인 모달("7일 안에 다시 로그인하면 취소됩니다") → POST /api/me/delete
서버 즉시:
  users.deleted_at = now
  sessions DELETE WHERE user_id
  Kakao면 POST kapi.kakao.com/v1/user/unlink (어드민 키, target_id) / Google이면 POST oauth2.googleapis.com/revoke(access_token 있을 때만)
  SH 요청: trees.visibility → 외부 노출 차단(공유 링크 404). 실제 삭제는 7일 뒤 (SH 소유)
  audit_log: action='user.delete_requested', actor=본인
클라이언트 즉시:
  로컬 Dexie 데이터는 유지한다(로컬 우선 원칙 A10) + "로컬 데이터도 지울까요?" 선택 (기본 아니오)
7일 내 재로그인:
  같은 (provider, provider_sub)로 로그인 → deleted_at IS NOT NULL AND now - deleted_at < 7d → deleted_at = NULL, 복구 토스트
7일 경과 (일일 정리 작업):
  users 행 DELETE (provider_sub 포함 완전 삭제), audit_log의 actor_id/target_id는 그대로 둔다(UUID만 남고 식별자 없음)
  SH: trees/nodes/srs 삭제 (SH 소유. "요청" 표)
  B2 백업 안의 사본은 14일 보관 주기로 자연 소멸 → 처리방침에 "백업은 최대 14일 후 삭제" 명시
```

## 5. 로그인 전 로컬 트리 → 로그인 후 (UX만. 병합 규칙은 SH)

```
로그인 완료 → GET /api/me → 서버가 { user, server_tree_count } 반환
로컬 Dexie trees 개수 L, 서버 트리 개수 S (SH API로 조회)

 L=0, S=0 → 아무 안내 없음. 이후 생성 트리는 자동 동기화(SH)
 L>0, S=0 → 토스트 "이 기기의 트리 L개를 계정에 저장했어요" (자동 업로드, 사용자 선택 없음) [제안]
 L=0, S>0 → 토스트 "계정의 트리 S개를 가져왔어요" (자동 다운로드)
 L>0, S>0 → 바텀시트 1회:
            ┌──────────────────────────────┐
            │ 이 기기에 트리 L개, 계정에 S개   │
            │ [합치기]  [이 기기 것만 유지]    │  ← 기본 포커스: 합치기
            │ 자세히 ▸ (같은 id 충돌 N개: 최신 유지) │
            └──────────────────────────────┘
            "합치기"의 충돌 규칙·id 동일성 판단·SRS 처리 = SH §(동기화 모델)
            "이 기기 것만 유지"는 서버 트리를 삭제하지 않고 로컬에 내려받지 않는 것 [제안; 서버 삭제는 위험]
로그아웃 후: 로컬 Dexie는 그대로(다음 로그인 때 L>0 경로). 다른 계정으로 로그인 시 같은 흐름.
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
