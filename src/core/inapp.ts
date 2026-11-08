// 인앱 브라우저 감지 — 03_account_admin.md §3.2 "인앱 브라우저·PWA standalone". UA 정규식 1개(카카오톡·네이버·인스타·페이스북·라인·Android WebView).
// Google 은 임베디드 UA 의 OAuth 를 막으므로(disallowed_useragent) 로그인 화면이 Google 버튼을 끄고 외부 브라우저 안내를 띄운다.
export const INAPP_RE = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|; wv\)/

export const isInApp = (ua: string = navigator.userAgent) => INAPP_RE.test(ua)
export const isIOS = (ua: string = navigator.userAgent) => /iPhone|iPad|iPod/.test(ua)

/** Android: 같은 로그인 화면을 Chrome 에서 여는 intent 링크 (03 §3.2 ①) */
export const chromeIntentHref = () => `intent://${location.host}/#/login#Intent;scheme=https;package=com.android.chrome;end`
