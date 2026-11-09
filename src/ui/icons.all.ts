// Lucide 1.70.0 아이콘 — ISC License, (c) 2026 Lucide Icons and Contributors (https://github.com/lucide-icons/lucide/blob/main/LICENSE)
// 값은 <svg> 안쪽 자식 요소 문자열(여러 path/circle/rect). 그리는 법은 ./Icon.tsx. 규격: docs/specs/01_design_system.md §3.5
// 생성: node icons.mjs (scratch). 손으로 고치지 말고 다시 생성한다.
/** 그 외 화면용. 각 화면이 필요한 것만 import 해 트리셰이킹되게 named export 로 둔다 */
// undo2·x·megaphone 은 첫 화면이 써서 ./icons.ts 로 옮겼다(H12, 손으로 수정). 기존 import 가 깨지지 않게 같은 이름으로 재수출
import { I } from './icons'
export const undo2 = I.undo2
export const x = I.x
export const megaphone = I.megaphone
export const logOut = "<path d=\"m16 17 5-5-5-5\" /><path d=\"M21 12H9\" /><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\" />"
export const shield = "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />"
export const zoomIn = "<circle cx=\"11\" cy=\"11\" r=\"8\" /><line x1=\"21\" x2=\"16.65\" y1=\"21\" y2=\"16.65\" /><line x1=\"11\" x2=\"11\" y1=\"8\" y2=\"14\" /><line x1=\"8\" x2=\"14\" y1=\"11\" y2=\"11\" />"
export const zoomOut = "<circle cx=\"11\" cy=\"11\" r=\"8\" /><line x1=\"21\" x2=\"16.65\" y1=\"21\" y2=\"16.65\" /><line x1=\"8\" x2=\"14\" y1=\"11\" y2=\"11\" />"
export const maximize = "<path d=\"M8 3H5a2 2 0 0 0-2 2v3\" /><path d=\"M21 8V5a2 2 0 0 0-2-2h-3\" /><path d=\"M3 16v3a2 2 0 0 0 2 2h3\" /><path d=\"M16 21h3a2 2 0 0 0 2-2v-3\" />"
export const network = "<rect x=\"16\" y=\"16\" width=\"6\" height=\"6\" rx=\"1\" /><rect x=\"2\" y=\"16\" width=\"6\" height=\"6\" rx=\"1\" /><rect x=\"9\" y=\"2\" width=\"6\" height=\"6\" rx=\"1\" /><path d=\"M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3\" /><path d=\"M12 12V8\" />"
export const keyboard = "<path d=\"M10 8h.01\" /><path d=\"M12 12h.01\" /><path d=\"M14 8h.01\" /><path d=\"M16 12h.01\" /><path d=\"M18 8h.01\" /><path d=\"M6 8h.01\" /><path d=\"M7 16h10\" /><path d=\"M8 12h.01\" /><rect width=\"20\" height=\"16\" x=\"2\" y=\"4\" rx=\"2\" />"
export const chevronDown = "<path d=\"m6 9 6 6 6-6\" />"
export const chevronUp = "<path d=\"m18 15-6-6-6 6\" />"
export const list = "<path d=\"M3 5h.01\" /><path d=\"M3 12h.01\" /><path d=\"M3 19h.01\" /><path d=\"M8 5h13\" /><path d=\"M8 12h13\" /><path d=\"M8 19h13\" />"
export const highlighter = "<path d=\"m9 11-6 6v3h9l3-3\" /><path d=\"m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4\" />"
export const eraser = "<path d=\"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21\" /><path d=\"m5.082 11.09 8.828 8.828\" />"
export const clipboardPaste = "<path d=\"M11 14h10\" /><path d=\"M16 4h2a2 2 0 0 1 2 2v1.344\" /><path d=\"m17 18 4-4-4-4\" /><path d=\"M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113\" /><rect x=\"8\" y=\"2\" width=\"8\" height=\"4\" rx=\"1\" />"
export const arrowRight = "<path d=\"M5 12h14\" /><path d=\"m12 5 7 7-7 7\" />"
export const arrowLeft = "<path d=\"m12 19-7-7 7-7\" /><path d=\"M19 12H5\" />"
export const cornerDownRight = "<path d=\"m15 10 5 5-5 5\" /><path d=\"M4 4v7a4 4 0 0 0 4 4h12\" />"
export const rotateCcw = "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\" /><path d=\"M3 3v5h5\" />"
export const listChecks = "<path d=\"M13 5h8\" /><path d=\"M13 12h8\" /><path d=\"M13 19h8\" /><path d=\"m3 17 2 2 4-4\" /><path d=\"m3 7 2 2 4-4\" />"
export const checkCheck = "<path d=\"M18 6 7 17l-5-5\" /><path d=\"m22 10-7.5 7.5L13 16\" />"
export const eye = "<path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />"
export const eyeOff = "<path d=\"M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49\" /><path d=\"M14.084 14.158a3 3 0 0 1-4.242-4.242\" /><path d=\"M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143\" /><path d=\"m2 2 20 20\" />"
export const crosshair = "<circle cx=\"12\" cy=\"12\" r=\"10\" /><line x1=\"22\" x2=\"18\" y1=\"12\" y2=\"12\" /><line x1=\"6\" x2=\"2\" y1=\"12\" y2=\"12\" /><line x1=\"12\" x2=\"12\" y1=\"6\" y2=\"2\" /><line x1=\"12\" x2=\"12\" y1=\"22\" y2=\"18\" />"
export const image = "<rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" ry=\"2\" /><circle cx=\"9\" cy=\"9\" r=\"2\" /><path d=\"m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21\" />"
export const copy = "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\" /><path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\" />"
export const ban = "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M4.929 4.929 19.07 19.071\" />"
export const search = "<path d=\"m21 21-4.34-4.34\" /><circle cx=\"11\" cy=\"11\" r=\"8\" />"
export const userX = "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\" /><circle cx=\"9\" cy=\"7\" r=\"4\" /><line x1=\"17\" x2=\"22\" y1=\"8\" y2=\"13\" /><line x1=\"22\" x2=\"17\" y1=\"8\" y2=\"13\" />"
export const hardDrive = "<path d=\"M10 16h.01\" /><path d=\"M2.212 11.577a2 2 0 0 0-.212.896V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5.527a2 2 0 0 0-.212-.896L18.55 5.11A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z\" /><path d=\"M21.946 12.013H2.054\" /><path d=\"M6 16h.01\" />"
export const database = "<ellipse cx=\"12\" cy=\"5\" rx=\"9\" ry=\"3\" /><path d=\"M3 5V19A9 3 0 0 0 21 19V5\" /><path d=\"M3 12A9 3 0 0 0 21 12\" />"
export const loaderCircle = "<path d=\"M21 12a9 9 0 1 1-6.219-8.56\" />"
export const info = "<circle cx=\"12\" cy=\"12\" r=\"10\" /><path d=\"M12 16v-4\" /><path d=\"M12 8h.01\" />"
export const settings = "<path d=\"M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915\" /><circle cx=\"12\" cy=\"12\" r=\"3\" />"
export const externalLink = "<path d=\"M15 3h6v6\" /><path d=\"M10 14 21 3\" /><path d=\"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6\" />"
export const listTree = "<path d=\"M8 5h13\" /><path d=\"M13 12h8\" /><path d=\"M13 19h8\" /><path d=\"M3 10a2 2 0 0 0 2 2h3\" /><path d=\"M3 5v12a2 2 0 0 0 2 2h3\" />"
