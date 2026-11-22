import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { checkQuery } from '@/lib/location/query'
import { SOURCES } from '@/lib/location/sources'
import type { QueryOf } from '@/types/location'
import { createFetchSource, type SourceFetch } from '../fetchSource'
import { ESWT_ITEM, MANUAL_ITEM, nonpay } from './nonpay'

// 입지 분석 바깥 자료 — 비급여 진료비(specs/location TASK-18, REQ-7904, design.md 4절).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/nonpay의 지어낸 가짜 응답(의원 이름·기관 기호 모두 지어냄)이다

const TODAY = '2026-11-22'
const fixture = (name: string) =>
  readFileSync(new URL(`../../../../../../fixtures/location/api/nonpay/${name}`, import.meta.url), 'utf8')

// 공공데이터포털 기관 기호 모양(+ · / · = 가 섞임). 지어낸 글자다
const YKIHO = 'FAKE+ykiho/0001=='
const ask = (item: string = ESWT_ITEM): QueryOf<'nonpay'> => ({ kind: 'nonpay', ykiho: YKIHO, item })
const read = (texts: string[], item?: string) => nonpay.parse(texts, ask(item), TODAY)

describe('nonpay 읽는 곳 (TASK-18)', () => {
  it('AC-7904.1: 종류·열쇠·출처 id가 정해 둔 값이고 출처는 SOURCES에 있다', () => {
    expect(nonpay.kind).toBe('nonpay')
    expect(nonpay.key).toBe('data')
    expect(nonpay.src).toBe('nonpay')
    const source = SOURCES.find((s) => s.id === nonpay.src)
    expect(source).toBeDefined()
    expect(source?.key).toBe(nonpay.key)
  })

  it('AC-7904.1: 심평원 비급여 병원별 상세를 기관 기호 하나로 한 번 부른다(열쇠는 주소에 넣지 않는다)', () => {
    const requests = nonpay.requests(ask())
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0].url)
    expect(url.origin + url.pathname).toBe(
      'https://apis.data.go.kr/B551182/nonPaymentDamtInfoService/getNonPaymentItemHospDtlList',
    )
    // 항목 코드로 거르지 않는다 — 같은 답에서 도수치료 줄이 있는지도 봐야 한다
    expect(Object.fromEntries(url.searchParams)).toEqual({ ykiho: YKIHO, pageNo: '1', numOfRows: '1000', _type: 'json' })
  })

  it('AC-7904.1: 만든 요청은 바깥 부르기 규칙(정해 둔 host)을 지나고 열쇠는 거기서만 붙는다', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn<SourceFetch>(async (url) => {
      seen.push(url)
      return new Response(fixture('empty.json'))
    })
    const got = await createFetchSource({ fetchImpl })(nonpay.requests(ask())[0], { kind: 'data', value: 'DATA+FAKE/key==0002' })
    expect(got.ok).toBe(true)
    expect(seen).toHaveLength(1)
    const url = new URL(seen[0])
    expect(url.hostname).toBe('apis.data.go.kr')
    expect(url.searchParams.get('serviceKey')).toBe('DATA+FAKE/key==0002')
    expect(url.searchParams.get('ykiho')).toBe(YKIHO)
  })

  it('AC-7904.1: 체외충격파 코드는 한 곳 상수이고 몸통 검사를 지나는 항목 코드다', () => {
    expect(ESWT_ITEM).toMatch(/^[A-Za-z0-9]{1,20}$/)
    expect(MANUAL_ITEM).toMatch(/^[A-Za-z0-9]{1,20}$/)
    expect(ESWT_ITEM).not.toBe(MANUAL_ITEM)
    expect(checkQuery({ kind: 'nonpay', ykiho: YKIHO, item: ESWT_ITEM })).toEqual(ask())
  })

  it('AC-7904.1: 물은 항목 줄의 이름·값(원 정수, 원 미만 버림, 쉼표 글자도)과 도수치료 줄을 돌려주고 기준 날짜는 받은 날이다', () => {
    expect(read([fixture('detail.json')])).toEqual({
      ok: true,
      value: {
        rows: [
          { name: '체외충격파(1회)', won: 50_000 },
          // 의원이 붙인 이름이 비면 심평원 항목 이름
          { name: '체외충격파치료', won: 80_000 },
          // 값이 빈 줄은 뺀다
        ],
        manual: [{ name: '도수치료(30분)', won: 120_000 }],
      },
      asOf: TODAY,
    })
  })

  it('AC-7904.1: 다른 항목 코드를 물으면 그 코드 줄만 고른다', () => {
    const got = read([fixture('detail.json')], 'QZ001')
    expect(got.ok && got.value.rows).toEqual([{ name: '지어낸 다른 항목', won: 30_000 }])
  })

  it('AC-7904.1: 도수치료 줄이 없으면 manual = null로 그 사실을 돌려준다(줄 하나짜리 답도 읽는다)', () => {
    expect(read([fixture('no-manual.json')])).toEqual({
      ok: true,
      value: { rows: [{ name: '충격파 치료', won: 45_000 }], manual: null },
      asOf: TODAY,
    })
  })

  it('AC-7904.2: 빈 답(줄 0개 · 자료 없음 03)은 실패가 아니라 빈 목록이다', () => {
    const empty = { ok: true, value: { rows: [], manual: null }, asOf: TODAY }
    expect(read([fixture('empty.json')])).toEqual(empty)
    expect(read([fixture('nodata.json')])).toEqual(empty)
  })

  it('AC-7904.2: 활용신청 안 된 열쇠 답은 not-applied다', () => {
    expect(read([fixture('not-applied.xml')])).toEqual({ ok: false, code: 'not-applied' })
    expect(read(['{"response":{"header":{"resultCode":"30","resultMsg":"SERVICE_KEY_IS_NOT_REGISTERED_ERROR"}}}'])).toEqual({
      ok: false,
      code: 'not-applied',
    })
  })

  it('AC-7904.2: 모양이 틀린 답은 failed다', () => {
    const failed = { ok: false, code: 'failed' }
    expect(read([fixture('broken.json')])).toEqual(failed)
    expect(read(['<html>점검 중</html>'])).toEqual(failed)
    expect(read(['{"response":{}}'])).toEqual(failed)
    expect(read(['{"response":{"header":{"resultCode":"99","resultMsg":"UNKNOWN_ERROR"}}}'])).toEqual(failed)
    expect(read(['{"response":{"header":{"resultCode":"00"},"body":{"items":{"item":5}}}}'])).toEqual(failed)
    // 요청은 하나라 답도 하나여야 한다
    expect(read([])).toEqual(failed)
    expect(read([fixture('empty.json'), fixture('empty.json')])).toEqual(failed)
  })
})
