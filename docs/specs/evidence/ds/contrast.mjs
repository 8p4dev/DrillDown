// WCAG 2.x 대비 + 적록 색각 시뮬레이션 계산기. 의존성 없음.  실행: node contrast.mjs > contrast.md
// 토큰 값은 01_design_system.md §3.1 과 같아야 한다(이 파일이 원본).
const L = {
  bg: '#f4f4f4', surface: '#ffffff', surface2: '#f7f7f7', border: '#cfcfcf', borderStrong: '#8a8a8a',
  text: '#111111', text2: '#3d3d3d', muted: '#5f5f5f', ok: '#1a7f37', danger: '#d1242f',
}
const D = {
  bg: '#121212', surface: '#1b1b1b', surface2: '#161616', border: '#333333', borderStrong: '#7a7a7a',
  text: '#ededed', text2: '#c4c4c4', muted: '#a0a0a0', ok: '#3fb950', danger: '#f85149',
}

const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const rgb2hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const delin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)
const lum = (h) => { const [r, g, b] = hex2rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// color-mix(in srgb, A p%, B) 와 같다(sRGB 감마 공간에서 섞음 — CSS 기본 동작)
const mix = (a, b, p) => rgb2hex(hex2rgb(a).map((v, i) => v * p + hex2rgb(b)[i] * (1 - p)))

// ---- 1. 사용 쌍(글자/바탕) ----
function pairs(T, themeName) {
  const onFill = themeName === 'light' ? T.surface : T.bg // 채움 위 글자: 라이트=흰, 다크=검(반전)
  const okTint = mix(T.ok, T.surface, 0.08), noTint = mix(T.danger, T.surface, 0.08)
  const heat50 = mix(T.danger, T.surface, 0.5 * 0.3), heat100 = mix(T.danger, T.surface, 0.3)
  const lgTint = mix(T.ok, T.surface, 0.06)
  const toastBg = T.text, toastFg = T.surface
  const rows = [
    ['본문', T.text, T.surface], ['본문/페이지 바탕', T.text, T.bg], ['본문/surface-2', T.text, T.surface2],
    ['보조(text-2)', T.text2, T.surface], ['보조(text-2)/bg', T.text2, T.bg],
    ['muted', T.muted, T.surface], ['muted/bg', T.muted, T.bg], ['muted/surface-2', T.muted, T.surface2],
    ['초록 글자', T.ok, T.surface], ['초록 글자/bg', T.ok, T.bg], ['빨강 글자', T.danger, T.surface], ['빨강 글자/bg', T.danger, T.bg],
    ['primary 버튼 글자(반전)', T.bg, T.text], ['초록 채움 위 글자', onFill, T.ok], ['빨강 채움 위 글자', onFill, T.danger],
    ['토스트 글자', toastFg, toastBg], ['토스트 muted', T.border, toastBg],
    ['본문/초록 8% 틴트(플래시 green)', T.text, okTint], ['muted/초록 틴트', T.muted, okTint], ['초록 글자/초록 틴트', T.ok, okTint],
    ['본문/연두 6% 틴트(lightgreen)', T.text, lgTint], ['muted/연두 틴트', T.muted, lgTint],
    ['본문/빨강 8% 틴트(플래시 red)', T.text, noTint], ['muted/빨강 틴트', T.muted, noTint], ['빨강 글자/빨강 틴트', T.danger, noTint],
    ['본문/heat .5 카드', T.text, heat50], ['text-2/heat .5 카드', T.text2, heat50], ['본문/heat 1 카드', T.text, heat100], ['text-2/heat 1 카드', T.text2, heat100],
    ['배지 글자(muted)/surface', T.muted, T.surface], ['탭 비활성(muted)/surface-2', T.muted, T.surface2],
    ['플레이스홀더(muted)', T.muted, T.surface], ['비활성 버튼 글자(muted)/bg', T.muted, T.bg],
  ]
  const nonText = [
    ['입력 테두리(border-strong)/surface', T.borderStrong, T.surface], ['입력 테두리/bg', T.borderStrong, T.bg],
    ['포커스 링(text, offset 2px → 바탕 위에 그려짐)/surface', T.text, T.surface], ['포커스 링/bg', T.text, T.bg], ['포커스 링/surface-2', T.text, T.surface2],
    ['초록 띠·테두리/surface', T.ok, T.surface], ['빨강 띠·테두리/surface', T.danger, T.surface],
    ['카드 테두리(border, 장식)/surface', T.border, T.surface],
  ]
  return { rows, nonText, derived: { okTint, noTint, heat50, heat100, lgTint } }
}

let out = `# 대비 계산 결과 (contrast.mjs 출력, ${new Date().toISOString().slice(0, 10)})\n\n`
out += `기준: WCAG 2.2 1.4.3 — 글자 4.5:1(큰 글자 ≥ 18.66px 굵게 또는 24px: 3:1), 1.4.11 — 비텍스트(테두리·포커스 링·아이콘) 3:1. 장식 테두리(\`--border\`)는 1.4.11 대상이 아니라 참고값.\n\n`
let fails = 0
for (const [name, T] of [['light', L], ['dark', D]]) {
  const { rows, nonText, derived } = pairs(T, name)
  out += `## ${name}\n\n파생색: 초록 틴트 ${derived.okTint}, 연두 틴트 ${derived.lgTint}, 빨강 틴트 ${derived.noTint}, heat .5 ${derived.heat50}, heat 1 ${derived.heat100}\n\n`
  out += `| 용도 | 글자 | 바탕 | 대비 | 판정(4.5) |\n|---|---|---|---|---|\n`
  for (const [n, f, b] of rows) { const r = ratio(f, b); const ok = r >= 4.5; if (!ok) fails++; out += `| ${n} | ${f} | ${b} | ${r.toFixed(2)} | ${ok ? 'PASS' : 'FAIL'} |\n` }
  out += `\n비텍스트(3:1)\n\n| 용도 | 전경 | 바탕 | 대비 | 판정(3.0) |\n|---|---|---|---|---|\n`
  for (const [n, f, b] of nonText) { const r = ratio(f, b); const deco = n.includes('장식'); const ok = deco || r >= 3; if (!ok) fails++; out += `| ${n} | ${f} | ${b} | ${r.toFixed(2)} | ${deco ? '참고' : ok ? 'PASS' : 'FAIL'} |\n` }
  out += '\n'
}

// ---- 2. 전수 행렬(참고): 모든 전경 토큰 × 모든 바탕 토큰 ----
for (const [name, T] of [['light', L], ['dark', D]]) {
  const fg = ['text', 'text2', 'muted', 'ok', 'danger'], bgs = ['bg', 'surface', 'surface2']
  out += `## ${name} 전수 행렬 (전경 × 바탕)\n\n| | ${bgs.map((b) => `${b} ${T[b]}`).join(' | ')} |\n|---|${bgs.map(() => '---').join('|')}|\n`
  for (const f of fg) out += `| ${f} ${T[f]} | ${bgs.map((b) => ratio(T[f], T[b]).toFixed(2)).join(' | ')} |\n`
  out += '\n'
}

// ---- 3. 색각 시뮬레이션 (Machado, Oliveira & Fernandes 2009, severity 1.0, 선형 RGB) ----
const MAT = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
}
const sim = (h, M) => { const c = hex2rgb(h).map(lin); return rgb2hex(M.map((row) => delin(Math.max(0, Math.min(1, row[0] * c[0] + row[1] * c[1] + row[2] * c[2]))))) }
// CIE76 ΔE (sRGB → XYZ(D65) → Lab)
const lab = (h) => {
  const [r, g, b] = hex2rgb(h).map(lin)
  let x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * b, z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  ;[x, y, z] = [x, y, z].map(f)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const dE = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]))
out += `## 적록 색각 시뮬레이션 (숙련도 4단계 + heat)\n\n방법: Machado et al. 2009 행렬(심도 1.0)을 선형 RGB 에 적용해 변환색을 얻고, 변환색 사이 CIE76 ΔE 를 계산. 경험적 기준 ΔE ≥ 20 이면 "나란히 두면 구분됨", 10 미만이면 "같은 색으로 보임". 구분이 ΔE 에만 의존하지 않도록 비색 단서(테두리 패턴·마크)를 함께 둔다.\n\n`
for (const [name, T] of [['light', L], ['dark', D]]) {
  const steps = { 'green 띠': T.ok, 'lightgreen 띠(ok 45%)': mix(T.ok, T.surface, 0.45), 'red 띠': T.danger, 'none(surface)': T.surface, 'heat 1 테두리': T.danger, 'heat .5 테두리': mix(T.danger, T.border, 0.5) }
  out += `### ${name}\n\n| 단계 | 원색 | protanopia | deuteranopia |\n|---|---|---|---|\n`
  for (const [k, v] of Object.entries(steps)) out += `| ${k} | ${v} | ${sim(v, MAT.protanopia)} | ${sim(v, MAT.deuteranopia)} |\n`
  out += `\n| 쌍 | ΔE 원색 | ΔE protanopia | ΔE deuteranopia | 비색 단서 |\n|---|---|---|---|---|\n`
  const cues = { 'green|red': '실선 4px 띠+✓ vs 실선 4px 띠+✕', 'green|lightgreen': '실선 띠 vs 점선 띠(2px dashed)', 'lightgreen|red': '점선 띠 vs 실선 띠+✕', 'green|none': '띠 있음 vs 없음', 'red|none': '띠+✕ vs 없음' }
  const ks = Object.keys(steps).slice(0, 4)
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = steps[ks[i]], b = steps[ks[j]]
    const key = `${ks[i].split(' ')[0]}|${ks[j].split(' ')[0]}`.replace('none(surface)', 'none')
    out += `| ${ks[i]} ↔ ${ks[j]} | ${dE(a, b).toFixed(0)} | ${dE(sim(a, MAT.protanopia), sim(b, MAT.protanopia)).toFixed(0)} | ${dE(sim(a, MAT.deuteranopia), sim(b, MAT.deuteranopia)).toFixed(0)} | ${cues[key] ?? ''} |\n`
  }
  out += '\n'
}
out += `\n**합계: 글자·비텍스트 FAIL ${fails}건**\n`
process.stdout.write(out)
if (fails) process.exitCode = 1
