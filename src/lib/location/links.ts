// 바깥 링크(design.md 13절, 조사 1·2). 주소 글자만 만든다 — 앱은 네이버·토지이음·등기소·법령 사이트를 부르지 않고,
// 화면은 새 창(NEW_TAB)으로 연다. 점은 { lat: 33~39, lng: 124~132 }(소수 6자리)

export type LinkPoint = { lat: number; lng: number }

/** 바깥 링크는 모두 새 창, 여는 쪽 정보를 넘기지 않는다(<a {...NEW_TAB}>) */
export const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' } as const

function coords(p: LinkPoint): { lat: string; lng: string } {
  const ok = Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 33 && p.lat <= 39 && p.lng >= 124 && p.lng <= 132
  if (!ok) throw new RangeError(`점이 한국 범위(위도 33~39·경도 124~132) 밖이에요: ${p.lat}, ${p.lng}`)
  return { lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }
}

// 네이버 부동산은 fin 모양 하나(AC-7918.4 — 사용자가 두 모양을 눌러 보고 fin을 고름, 2026-11-22. 다른 모양은 지움)
export type NaverForm = 'fin'
export const NAVER_FORM: NaverForm = 'fin'

/** 네이버 부동산 지도: center=경도-위도, zoom=16 */
export function naverLandUrl(p: LinkPoint): string {
  const c = coords(p)
  return `https://fin.land.naver.com/map?center=${c.lng}-${c.lat}&zoom=16`
}

// PNU = 법정동 코드 10 + 산 구분(아님 1 · 산 2) + 본번 4 + 부번 4(design.md 5절)
const PNU = /^\d{10}[12]\d{8}$/

/** 토지이음 땅 쓰임·계획 */
export function eumUrl(pnu: string): string {
  if (!PNU.test(pnu)) throw new RangeError(`PNU는 19자리 숫자(11째 자리 1·2)로 주세요: ${pnu}`)
  return encodeURI(`https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?selGbn=umd&isNoScr=script&mode=search&pnu=${pnu}`)
}

/** 대법원 인터넷등기소 첫 화면(특정 부동산으로 바로 가는 주소는 없다) */
export const IROS_URL = encodeURI('https://www.iros.go.kr/index.jsp')

const LAW_ORIGIN = 'https://www.law.go.kr/'

/** 국가법령정보센터 주소(LAW_BASIS.url, `https://www.law.go.kr/법령/<법 이름>/<조>`)의 한글·빈칸을 바꾼다 */
export function lawUrl(url: string): string {
  if (!url.startsWith(LAW_ORIGIN)) throw new RangeError(`법령 링크는 ${LAW_ORIGIN} 주소만 받아요: ${url}`)
  return encodeURI(url)
}
