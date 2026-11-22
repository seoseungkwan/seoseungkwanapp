import { describe, expect, it } from 'vitest'
import { SOURCES } from '@/lib/location/sources'
import type { Why } from '@/types/location'
import { asOfText, cappedText, prevText, sourceHref, sourceText, whyText } from './text'

// 공용 화면 글(design.md 14·15절): 출처 줄 `{기관} {자료} · 기준 {날짜}` · 칸 글(WhyLine) 여섯

describe('AC-7906.2: 출처 줄 글', () => {
  it('AC-7906.2: `{기관} {자료} · 기준 {날짜}` 모양이다(행정안전부 나이대 인구)', () => {
    expect(sourceText('pop-age', '2026-10-31')).toBe('행정안전부 행정동별(통반단위) 성/연령별 주민등록 인구수 · 기준 2026년 10월 31일')
  })

  it('AC-7906.2: SOURCES의 출처마다 같은 모양이다', () => {
    for (const s of SOURCES) {
      expect(sourceText(s.id, '2026-11-15')).toBe(`${s.org} ${s.name} · 기준 2026년 11월 15일`)
    }
  })

  it('AC-7906.2: 기준 날짜는 한국 글자로 — 날은 `2026년 11월 5일`, 달은 `2026년 10월`, 그 밖은 받은 글자 그대로', () => {
    expect(asOfText('2026-11-05')).toBe('2026년 11월 5일')
    expect(asOfText('2026-01-31')).toBe('2026년 1월 31일')
    expect(asOfText('2026-10')).toBe('2026년 10월')
    expect(asOfText('2026년 상반기')).toBe('2026년 상반기')
    expect(asOfText('2026-02-30')).toBe('2026-02-30')
  })

  it('AC-7906.2: 기준 날짜가 없으면 `{기관} {자료}`만, 덧붙임은 끝에 ` · {덧붙임}`', () => {
    expect(sourceText('hosp-list')).toBe('건강보험심사평가원 병원정보서비스')
    expect(sourceText('hosp-list', null)).toBe('건강보험심사평가원 병원정보서비스')
    expect(sourceText('hosp-list', '2026-11-15', '의원·과목·의사 수')).toBe(
      '건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일 · 의원·과목·의사 수',
    )
    expect(sourceText('hosp-list', null, '진료 시간')).toBe('건강보험심사평가원 병원정보서비스 · 진료 시간')
  })

  it('AC-7906.2: SOURCES에 없는 출처 id는 글을 만들지 않는다(null)', () => {
    expect(sourceText('no-such-source', '2026-11-15')).toBeNull()
    expect(sourceText('', '2026-11-15')).toBeNull()
  })

  it("AC-7906.2: 누르면 가는 곳은 '근거와 출처'의 그 출처 줄(`/location?tab=sources#src-<id>`)", () => {
    expect(sourceHref('pop-age')).toBe('/location?tab=sources#src-pop-age')
    expect(sourceHref('kakao-local')).toBe('/location?tab=sources#src-kakao-local')
  })
})

describe('AC-7917.2: 자료 없음 칸 글 여섯(design.md 15절)', () => {
  it('AC-7917.2: no-key — 공공 자료는 `{자료 이름}: 열쇠를 넣으면 보여요.`', () => {
    expect(whyText('no-key', 'hosp-list')).toBe('병원정보서비스: 열쇠를 넣으면 보여요.')
    expect(whyText('no-key', 'welfare')).toBe('복지사업 시군구별 수급권자 현황: 열쇠를 넣으면 보여요.')
  })

  it("AC-7917.2: no-key — 카카오는 그 열쇠 이름('화면 글 기본값' 열쇠 상태 줄)", () => {
    expect(whyText('no-key', 'kakao-local')).toBe('카카오 장소 찾기 열쇠: 열쇠를 넣으면 보여요.')
    expect(whyText('no-key', 'kakao-map')).toBe('카카오 지도 열쇠: 열쇠를 넣으면 보여요.')
  })

  it("AC-7917.2: not-applied — `공공데이터포털에서 '{자료 이름}' 활용신청을 하면 보여요.`", () => {
    expect(whyText('not-applied', 'hosp-list')).toBe("공공데이터포털에서 '병원정보서비스' 활용신청을 하면 보여요.")
    expect(whyText('not-applied', 'flow-volume')).toBe("공공데이터포털에서 '정류장별 이용량' 활용신청을 하면 보여요.")
  })

  it('AC-7917.2: failed — `지금 받지 못했어요.`, 지난 값은 `지난 값 · 기준 {날짜}`', () => {
    expect(whyText('failed', 'hosp-list')).toBe('지금 받지 못했어요.')
    expect(prevText('2026-11-15')).toBe('지난 값 · 기준 2026년 11월 15일')
  })

  it('AC-7917.2: none — 그 출처의 SOURCES.noneText', () => {
    expect(whyText('none', 'accident')).toBe('범위 안에 교통사고 다발 지점이 없어요.')
    for (const s of SOURCES) expect(whyText('none', s.id)).toBe(s.noneText)
  })

  it('AC-7917.2: outside — `이 지역은 자료 없음`', () => {
    expect(whyText('outside', 'flow-volume')).toBe('이 지역은 자료 없음')
    expect(whyText('outside', 'bus-stops')).toBe('이 지역은 자료 없음')
  })

  it('AC-7917.2: capped — `{n}곳 넘게 있어요. 가까운 {n}곳만 셌어요.`(수는 쉼표)', () => {
    expect(cappedText(45)).toBe('45곳 넘게 있어요. 가까운 45곳만 셌어요.')
    expect(cappedText(1000)).toBe('1,000곳 넘게 있어요. 가까운 1,000곳만 셌어요.')
  })

  it('AC-7917.2: SOURCES에 없는 출처 id는 글을 만들지 않는다(null)', () => {
    const whys: Why[] = ['no-key', 'not-applied', 'failed', 'none', 'outside']
    for (const why of whys) expect(whyText(why, 'no-such-source')).toBeNull()
  })

  it('AC-7917.2: 정해 둔 글에 영어 낱말이 없다', () => {
    const fixed = [
      whyText('no-key', 'kakao-local'),
      whyText('no-key', 'kakao-map'),
      whyText('failed', 'hosp-list'),
      whyText('outside', 'flow-volume'),
      cappedText(45),
      prevText('2026-11-15'),
    ]
    for (const t of fixed) expect(t).not.toMatch(/[A-Za-z]/)
  })
})
