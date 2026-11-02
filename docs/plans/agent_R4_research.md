# agent R4 plan — 지속 사용·플랫폼 조사

소유 파일: `docs/research/R4_platform.md` (+ 이 plan). 코드 수정 없음.

## 조사 대상
- [x] 참고 문서 읽기: brief/idea.md, reports 05_monetization, 09_synthesis(§6), 11_cost_recovery, 02_customer, 03 관련 절
- [x] src/ 에서 기존 내보내기·PWA·계측 범위 확인 (§3 중복 제거)
- [x] 동기부여: 스트릭·일일 목표·히트맵·숙련도 대시보드·알림 (Duolingo, Anki, RemNote, Quizlet 근거)
- [x] 동기화·백업: 파일 백업/복원, 클라우드 동기화, 멀티 디바이스, 계정
- [x] 공유·협업: 공유 링크, 스터디 그룹, 공동 편집, 교사→학생 배포
- [x] 수익화 경계: 05·09 §6 프리미엄 기능
- [x] 앱 배포: 설치형 PWA, 앱스토어 래핑(TWA/Capacitor), iOS 웹 푸시
- [x] 개인정보·데이터 내보내기
- [x] R4_platform.md 작성 (형식 고정, 8~15개, Top 3) 후 커밋

## 검증 방법
- 첫 줄 `# R4 — ...`, 표 열 7개 고정, 모든 근거에 URL 또는 [미확인], §3 기능과 중복 없음, `## 분야 Top 3` 존재.

## 변경 사항
- 11_cost_recovery가 수익화를 폐기(후원 링크·Pi 자체 호스팅)했으므로, 수익화 항목은 "05·09 프리미엄 경계"와 "11 무료·후원" 양쪽 전제로 표기한다.
