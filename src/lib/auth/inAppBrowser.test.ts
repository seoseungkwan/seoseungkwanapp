import { describe, expect, it } from 'vitest'
import { isInAppBrowser } from './inAppBrowser'

// 실제 브라우저가 보내는 모양(버전 숫자는 예시). 파일럿 inAppBrowser.test.ts 이식
const IN_APP = {
  '카카오톡(안드로이드)':
    'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36;KAKAOTALK 2410420',
  '카카오톡(아이폰)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5',
  '네이버 앱(안드로이드)':
    'Mozilla/5.0 (Linux; Android 13; SM-G991N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.193 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.1.4)',
  '네이버 앱(아이폰)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 1300; 12.1.5; 15PRO)',
  인스타그램:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 311.0.2.16.111 (iPhone15,3; iOS 17_1_2; ko_KR; ko; scale=3.00; 1290x2796; 545996285)',
  페이스북:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/443.0.0.32.110;FBBV/540000000;FBDV/iPhone15,3;FBMD/iPhone;FBSN/iOS;FBSV/17.2;FBSS/3;FBCR/;FBID/phone;FBLC/ko_KR;FBOP/5]',
  라인: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/13.20.0',
  '다음 앱':
    'Mozilla/5.0 (Linux; Android 12; SM-N976N Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.193 Mobile Safari/537.36 DaumApps/8.10.0 DaumDevice/mobile',
  // 이름을 모르는 앱도 안드로이드 WebView 표시(; wv)가 있으면 구글이 막는다
  '그 밖의 안드로이드 앱 WebView':
    'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.6099.230 Mobile Safari/537.36',
}

const BROWSERS = {
  'Chrome(윈도)':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Edge(윈도)':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56',
  'Safari(맥)':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  'Firefox(윈도)': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  'Chrome(안드로이드)':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  'Safari(아이폰)':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  // 네이버가 만든 '브라우저'라 앱 안 브라우저가 아니다(NAVER 글자가 없다)
  '웨일(윈도)':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Whale/3.27.254.15 Safari/537.36',
}

describe('isInAppBrowser(): 구글이 로그인을 막는 앱 안 브라우저', () => {
  it.each(Object.entries(IN_APP))('AC-003.2: %s → true', (_name, userAgent) => {
    expect(isInAppBrowser(userAgent)).toBe(true)
  })

  it.each(Object.entries(BROWSERS))('AC-003.2: %s → false', (_name, userAgent) => {
    expect(isInAppBrowser(userAgent)).toBe(false)
  })

  it('AC-003.2: 빈 글자 → false', () => {
    expect(isInAppBrowser('')).toBe(false)
  })
})
