// 날짜·시각 표기 1벌 — 관리자·접수 상태·공지 배너가 같이 쓴다(로컬 시각)
export const p2 = (n: number) => String(n).padStart(2, '0')
/** YYYY-MM-DD */
export const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` }
/** MM/DD */
export const date = (t: number) => { const d = new Date(t); return `${p2(d.getMonth() + 1)}/${p2(d.getDate())}` }
/** HH:mm */
export const hm = (t: number) => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}` }
/** MM/DD HH:mm */
export const when = (t: number) => `${date(t)} ${hm(t)}`
