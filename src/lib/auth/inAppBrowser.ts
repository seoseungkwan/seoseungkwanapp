// 구글은 앱 안 브라우저(WebView)의 로그인을 막는다(403 disallowed_useragent) → 로그인 화면이 크롬·엣지로 열라고 안내한다(AC-003.2).
// 카카오톡·네이버 앱·인스타그램·페이스북·라인·다음 앱, 그리고 이름을 모르는 안드로이드 앱 WebView(; wv). 파일럿 이식
const IN_APP = [/KAKAOTALK/i, /NAVER\(inapp/, /\bInstagram\b/, /FBAN\/|FBAV\/|FB_IAB\//, /\bLine\//, /DaumApps\//, /; wv\)/]

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP.some((pattern) => pattern.test(userAgent))
}
