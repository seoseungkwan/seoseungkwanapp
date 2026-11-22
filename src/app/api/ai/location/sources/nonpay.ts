import 'server-only'
import type { Adapter, Parsed } from '@/types/location'
import { isNotRegistered } from '../fetchSource'

// 입지 분석 바깥 자료 — 비급여 진료비(specs/location TASK-18, REQ-7904, design.md 4절 `nonpay`).
// 심평원 비급여진료비정보조회서비스(data.go.kr 15001700, 공공누리 1유형)의 병원별 상세를 기관 기호 하나로 한 번(1쪽) 부르고,
// 물은 항목 코드의 줄(이름·값)과 도수치료 줄을 돌려준다. 도수치료는 2026-07부터 관리급여라 답에 없을 수 있다 → 없으면 manual = null
// (화면 글은 design.md 4절 `도수치료는 2026년 7월부터 관리급여라 견주지 않아요`, 화면이 그린다).
// 항목 코드로 거르지 않고 부른다 — 거르면 같은 답에서 도수치료 줄이 있는지 볼 수 없다.
// 주소·칸 이름·코드는 확인 전이다(확인할 것 2: 진짜 응답과 코드 목록으로 확인하고 가짜 응답과 함께 고친다). 순수 함수, 열쇠는 fetchSource가 넣는다

/** 체외충격파 비급여 항목 코드 — 한 곳 상수(확인할 것 2, 확인 전 값). 모으기가 `nonpay` 몸통의 item으로 보낸다 */
export const ESWT_ITEM = 'MM045'
/** 도수치료 비급여 항목 코드 — 한 곳 상수(확인할 것 2, 확인 전 값). 이 코드 줄이 답에 있는지 본다 */
export const MANUAL_ITEM = 'MX122'

const URL_DETAIL = 'https://apis.data.go.kr/B551182/nonPaymentDamtInfoService/getNonPaymentItemHospDtlList'
// 의원 하나의 비급여 줄은 이 안에 든다(쪽 하나)
const ROWS = 1000

/** 비급여 줄 하나: 의원이 붙인 이름(비면 심평원 항목 이름)·값(원 정수, 원 미만 버림) */
export type NonpayRow = { name: string; won: number }
/** rows = 물은 항목 코드의 줄(없으면 빈 목록) · manual = 도수치료 줄(답에 없으면 null) */
export type NonpayValue = { rows: NonpayRow[]; manual: NonpayRow[] | null }

type Item = Record<string, unknown>

const FAILED = { ok: false, code: 'failed' } as const
// 공공데이터포털 결과 코드: 00 = 정상 · 03 = 자료 없음(빈 답, 실패가 아니다)
const OK_CODES = new Set(['00', '03'])

const isItem = (v: unknown): v is Item => typeof v === 'object' && v !== null && !Array.isArray(v)
const textOf = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

// 답 글자 → 줄 목록. 모양이 틀리면 null. 줄이 하나면 item이 배열이 아닌 줄 하나이고, 비면 items가 ''이거나 없다
function itemsOf(text: string): Item[] | null {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const response = isItem(json) ? json.response : undefined
  if (!isItem(response) || !isItem(response.header)) return null
  if (!OK_CODES.has(String(response.header.resultCode))) return null
  const items = isItem(response.body) ? response.body.items : undefined
  if (items === undefined || items === null || items === '') return []
  if (!isItem(items)) return null
  const item = items.item
  if (item === undefined || item === null) return []
  const list: unknown[] = Array.isArray(item) ? item : [item]
  return list.every(isItem) ? list : null
}

// 값 칸: 숫자 또는 숫자 글자(쉼표 허용) → 원 정수(버림). 비었거나 읽을 수 없으면 null
function wonOf(v: unknown): number | null {
  let n = NaN
  if (typeof v === 'number') n = v
  else if (typeof v === 'string') {
    const digits = v.replace(/[,\s]/g, '')
    if (/^\d+(?:\.\d+)?$/.test(digits)) n = Number(digits)
  }
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

// 그 코드의 줄들(값이 빈 줄은 뺀다)
function rowsFor(items: Item[], code: string): NonpayRow[] {
  return items.flatMap((item) => {
    if (textOf(item.npayCd) !== code) return []
    const won = wonOf(item.curAmt)
    if (won === null) return []
    return [{ name: textOf(item.yadmNpayCdNm) || textOf(item.npayKorNm), won }]
  })
}

export const nonpay: Adapter<'nonpay', NonpayValue> = {
  kind: 'nonpay',
  src: 'nonpay',
  key: 'data',
  requests(q) {
    const params = new URLSearchParams({ ykiho: q.ykiho, pageNo: '1', numOfRows: String(ROWS), _type: 'json' })
    return [{ url: `${URL_DETAIL}?${params.toString()}` }]
  },
  parse(texts, q, today): Parsed<NonpayValue> {
    if (texts.length !== 1) return FAILED
    if (isNotRegistered(texts[0])) return { ok: false, code: 'not-applied' }
    const items = itemsOf(texts[0])
    if (items === null) return FAILED
    const manual = rowsFor(items, MANUAL_ITEM)
    // 기준 날짜: 이 자료는 지금 값을 주고 자료 기준일 칸이 없다(적용일은 값이 바뀐 날이라 기준 날짜가 아니다) → 받은 한국 날짜
    return { ok: true, value: { rows: rowsFor(items, q.item), manual: manual.length > 0 ? manual : null }, asOf: today }
  },
}
