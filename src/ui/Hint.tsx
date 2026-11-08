// 1회성 힌트 — 로직은 토스트 큐와 같은 파일(features/Toast.tsx)에 있다(힌트가 떠 있는 동안 일반 토스트가 대기하려면 큐가 하나여야 함).
// 계약 §3.2 U3 의 이름 `Hint` 를 ui/ 에서 찾는 쪽을 위한 재수출.
export { hint } from '../features/Toast'
