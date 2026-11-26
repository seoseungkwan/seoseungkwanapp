import { supabaseOrigin } from './supabase/env'

// 입지 분석(/location)만 더하는 카카오 지도 origin(specs/location design.md 13절 처음 목록, ADR-044). 와일드카드 없이 하나씩 적는다.
// 지도·하늘 사진·로드뷰가 실제로 부르는 곳은 브라우저 CSP 위반 기록으로 확인해 맞춘다(requirements '확인할 것' 7, TASK-47·48).
// TASK-48 진짜 브라우저 확인: 지금 지도 본체는 daumcdn.net이 아니라 kakaocdn.net에서 오고, 로드뷰는 rv.map.kakao.com을 부른다 → 하나씩 더함(옛 daumcdn 줄은 그대로)
const KAKAO: Record<'script-src' | 'img-src' | 'connect-src', string[]> = {
  // SDK 입구(dapi)와 SDK가 불러오는 지도 본체(옛 t1.daumcdn · 지금 t1.kakaocdn)
  'script-src': ['https://dapi.kakao.com', 'https://t1.daumcdn.net', 'https://t1.kakaocdn.net'],
  // 지도 조각 그림 map0~map3은 넷 따로 · 지금 조각·하늘 사진·표시 그림은 kakaocdn 넷
  'img-src': [
    'https://t1.daumcdn.net',
    'https://map0.daumcdn.net',
    'https://map1.daumcdn.net',
    'https://map2.daumcdn.net',
    'https://map3.daumcdn.net',
    'https://mts.daumcdn.net',
    'https://s1.daumcdn.net',
    'https://mts.kakaocdn.net',
    'https://map.kakaocdn.net',
    'https://t1.kakaocdn.net',
    'https://ssl.kakaocdn.net',
  ],
  // SDK 입구 · 로드뷰 자료(rv.map.kakao.com) · kakaocdn 자료 읽기(로드뷰 설정은 ssl·t1 둘 다)
  'connect-src': ['https://dapi.kakao.com', 'https://rv.map.kakao.com', 'https://ssl.kakaocdn.net', 'https://t1.kakaocdn.net'],
}

// 구글 코드(수납일지 구글 시트·예약 구글 캘린더)를 부르는 곳 — 모든 경로 connect-src(specs/google-link design.md 6절, ADR-054).
// 구글 웹 앱은 script.google.com에서 받고 302로 script.googleusercontent.com(/macros/echo)에서 답한다. 와일드카드 없이 둘만
const GOOGLE_CONNECT = ['https://script.google.com', 'https://script.googleusercontent.com']
// 수납일지 구글 시트 틀(/sunap 머리만, { sheetFrame: true }). 다른 경로는 frame-src가 없어 default-src 'self'를 따른다(바깥 틀 금지)
const SHEET_FRAME = ['https://docs.google.com']

// 브라우저가 쓸 수 있는 주소 목록(파일럿 그대로 + media-src). next.config.ts가 불러 쓴다
// 연결 주소는 자기 자신('self')과 Supabase(로그인·병원) origin, 구글 코드 두 origin뿐이다. Supabase 주소가 없거나 잘못되면 Supabase만 빠진다(빌드는 된다)
// 구글 로그인은 페이지 이동이라 connect-src가 필요 없다. 글꼴은 next/font가 우리 쪽에서 낸다
// 셋째 인자 { kakao: true }는 /location 경로 머리만 쓴다 — 위 카카오 origin을 그 지시어 끝에 더한다. 없거나 false면 옛 결과 그대로
// 셋째 인자 { sheetFrame: true }는 /sunap 경로 머리만 쓴다 — 끝에 frame-src https://docs.google.com 한 줄을 더한다
export function buildCsp(isDev: boolean, supabaseUrl: string, opts: { kakao?: boolean; sheetFrame?: boolean } = {}): string {
  const supabase = supabaseOrigin(supabaseUrl)
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Next 개발 서버만 eval이 필요하다
    'script-src': ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'"],
    // 랜딩 영상·이미지는 public/에 둔다(plan.md §6-1)
    'media-src': ["'self'"],
    // 개발 서버의 새로 고침(HMR) 연결
    'connect-src': ["'self'", ...(supabase ? [supabase] : []), ...GOOGLE_CONNECT, ...(isDev ? ['ws:'] : [])],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  if (opts.kakao) {
    for (const [name, origins] of Object.entries(KAKAO)) directives[name] = [...directives[name]!, ...origins]
  }
  if (opts.sheetFrame) directives['frame-src'] = [...SHEET_FRAME]
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}
