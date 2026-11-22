import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as links from './links'
import { IROS_URL, NAVER_FORM, NEW_TAB, eumUrl, lawUrl, naverLandUrl } from './links'

// 바깥 링크(design.md 13절). 앱은 글자로 주소만 만들고 바깥 사이트를 부르지 않는다
const POINT = { lat: 37.566535, lng: 126.977969 }

describe('AC-7918.4 네이버 부동산 링크 — fin 모양 하나', () => {
  it('AC-7918.4: 사용자가 fin 모양을 골랐다(2026-11-22) — NAVER_FORM은 fin이다', () => {
    expect(NAVER_FORM).toBe('fin')
  })

  it('AC-7918.4: 주소는 fin.land 지도 center=경도-위도, zoom=16이다', () => {
    expect(naverLandUrl(POINT)).toBe('https://fin.land.naver.com/map?center=126.977969-37.566535&zoom=16')
  })

  it('AC-7918.4: m 모양은 지웠다 — 고르는 판(NAVER_FORMS)·m.land 주소가 없다', () => {
    expect('NAVER_FORMS' in links).toBe(false)
    const code = readFileSync(new URL('./links.ts', import.meta.url), 'utf8')
    expect(code).not.toContain('m.land.naver.com')
    expect(naverLandUrl(POINT)).not.toContain('m.land')
  })

  it('AC-7918.4: 좌표는 소수 6자리로 적는다(0도 채움)', () => {
    expect(naverLandUrl({ lat: 37.5, lng: 127 })).toBe('https://fin.land.naver.com/map?center=127.000000-37.500000&zoom=16')
    expect(naverLandUrl({ lat: 35.1234567, lng: 129.0000004 })).toBe('https://fin.land.naver.com/map?center=129.000000-35.123457&zoom=16')
  })

  it('AC-7918.4: 한국 밖·숫자가 아닌 점은 RangeError다(위도 33~39·경도 124~132)', () => {
    expect(() => naverLandUrl({ lat: 32.9, lng: 127 })).toThrow(RangeError)
    expect(() => naverLandUrl({ lat: 39.1, lng: 127 })).toThrow(RangeError)
    expect(() => naverLandUrl({ lat: 37, lng: 123.9 })).toThrow(RangeError)
    expect(() => naverLandUrl({ lat: 37, lng: 132.1 })).toThrow(RangeError)
    expect(() => naverLandUrl({ lat: Number.NaN, lng: 127 })).toThrow(RangeError)
    expect(() => naverLandUrl({ lat: 33, lng: 124 })).not.toThrow()
    expect(() => naverLandUrl({ lat: 39, lng: 132 })).not.toThrow()
  })

  it('AC-7918.4: 바깥 링크는 모두 새 창 noopener noreferrer로 연다', () => {
    expect(NEW_TAB).toEqual({ target: '_blank', rel: 'noopener noreferrer' })
  })
})

describe('AC-7918.4 links.ts 토지이음·인터넷 등기소·법령', () => {
  it('AC-7918.4: 토지이음은 PNU 19자리를 그대로 넣은 땅 쓰임 주소다(조사 1)', () => {
    expect(eumUrl('1111010100100010000')).toBe(
      'https://www.eum.go.kr/web/ar/lu/luLandDet.jsp?selGbn=umd&isNoScr=script&mode=search&pnu=1111010100100010000',
    )
    expect(eumUrl('4113510900200120003')).toContain('pnu=4113510900200120003')
  })

  it('AC-7918.4: PNU가 19자리 숫자가 아니거나 11째 자리(산 구분)가 1·2가 아니면 RangeError다', () => {
    expect(() => eumUrl('111101010010001000')).toThrow(RangeError)
    expect(() => eumUrl('11110101001000100000')).toThrow(RangeError)
    expect(() => eumUrl('1111010100300010000')).toThrow(RangeError)
    expect(() => eumUrl('11110101001000a0000')).toThrow(RangeError)
    expect(() => eumUrl('1111010100100010000&x=1')).toThrow(RangeError)
  })

  it('AC-7918.4: 인터넷 등기소는 첫 화면 주소 하나다(특정 부동산으로 바로 가는 주소는 없음)', () => {
    expect(IROS_URL).toBe('https://www.iros.go.kr/index.jsp')
  })

  it('AC-7918.4: 법령 주소는 encodeURI로 한글·빈칸만 바꾸고 나머지는 그대로다', () => {
    expect(lawUrl('https://www.law.go.kr/법령/의료법/제33조')).toBe(
      'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%9D%98%EB%A3%8C%EB%B2%95/%EC%A0%9C33%EC%A1%B0',
    )
    expect(lawUrl('https://www.law.go.kr/법령/건축법 시행령/별표1')).toBe(
      'https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EA%B1%B4%EC%B6%95%EB%B2%95%20%EC%8B%9C%ED%96%89%EB%A0%B9/%EB%B3%84%ED%91%9C1',
    )
    expect(lawUrl('https://www.law.go.kr/LSW/main.html')).toBe('https://www.law.go.kr/LSW/main.html')
    expect(decodeURI(lawUrl('https://www.law.go.kr/법령/소득세법/제168조'))).toBe('https://www.law.go.kr/법령/소득세법/제168조')
  })

  it('AC-7918.4: 국가법령정보센터(https://www.law.go.kr/) 밖 주소는 RangeError다', () => {
    expect(() => lawUrl('http://www.law.go.kr/법령/의료법/제33조')).toThrow(RangeError)
    expect(() => lawUrl('https://law.go.kr.example.com/법령/의료법')).toThrow(RangeError)
    expect(() => lawUrl('https://www.law.go.kr.example.com/')).toThrow(RangeError)
    expect(() => lawUrl('javascript:alert(1)')).toThrow(RangeError)
  })
})
