import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { monthRange } from '@/lib/analytics/dates'
import { isSourceId, sourceOf } from '@/lib/location/sources'
import { createFetchSource, type SourceFetch } from '../fetchSource'
import { WELFARE_EDITION, WELFARE_URL, parseWelfare, welfare, type WelfareAsk } from './welfare'

// 입지 분석 바깥 자료 — 의료급여·기초생활·차상위 인원(specs/location TASK-50, design.md 4절, 조사 5).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/welfare/의 지어낸 응답(api.odcloud.kr 한 쪽 모양)이고, 지역 이름도 지어낸 것이다
// (전라북도·전북특별자치도는 두 이름을 함께 받는지 보려고 시도 이름만 그대로 쓰고, 그 아래 시군구는 지어냈다). 열쇠도 지어낸 글자다

const DIR = join(process.cwd(), 'fixtures/location/api/welfare')
const fixture = (name: string) => readFileSync(join(DIR, name), 'utf8')
type Page = { totalCount?: number; data: Record<string, unknown>[] }
const pageOf = (name: string) => JSON.parse(fixture(name)) as Page
// 지어낸 응답을 고쳐 다시 글자로(한 시험 안에서만 바꾼다)
const edited = (name: string, edit: (page: Page) => void) => {
  const page = pageOf(name)
  edit(page)
  return JSON.stringify(page)
}

const TODAY = '2026-11-22'
// 기준 날짜 = 판 기준 연월의 말일(자료 안의 날짜)
const AS_OF = monthRange(WELFARE_EDITION.ym).to
const q = (sgg: string) => ({ kind: 'welfare', sgg }) as const
const read = (text: string, sgg: string) => welfare.parse([text], q(sgg), TODAY)
const readAsk = (text: string, ask: WelfareAsk) => parseWelfare([text], ask)

// 지어낸 응답의 값(수급권자 수 칸만, 가구 수 칸은 다른 값)
const row = (sggName: string, medical: number, basic: number, copay: number, selfSupport: number, disabled: number) => ({
  sggName,
  ym: WELFARE_EDITION.ym,
  medical,
  basic,
  nearPoor: copay + selfSupport + disabled,
  nearPoorBy: { copay, selfSupport, disabled },
})
const GARAM = row('가람시', 4321, 7654, 1234, 210, 345)
const HANBIT = row('한빛시', 5000, 9100, 1500, 260, 400)
const NURI = row('한빛시 누리구', 2100, 3900, 640, 110, 170)
const SOLNAE = row('솔내군', 812, 1500, 301, 42, 77)
const ok = (value: unknown) => ({ ok: true, value, asOf: AS_OF })

describe('AC-7904.1 welfare — 요청 만들기', () => {
  it('AC-7904.1: 읽는 곳은 종류 welfare · 출처 welfare(SOURCES에 있음) · 공공데이터포털 열쇠(data)다', () => {
    expect(welfare.kind).toBe('welfare')
    expect(welfare.src).toBe('welfare')
    expect(isSourceId(welfare.src)).toBe(true)
    expect(welfare.key).toBe('data')
    expect(sourceOf(welfare.src)?.key).toBe(welfare.key)
  })

  it('AC-7904.1: 판 주소는 상수 하나(api.odcloud.kr/api/15062448/v1/<해마다 판>)이고 판 기준 연월은 최신 2025-12다', () => {
    expect(WELFARE_URL).toBe(`https://api.odcloud.kr/api/15062448/v1/${WELFARE_EDITION.uddi}`)
    expect(WELFARE_EDITION.uddi).toMatch(/^uddi:[0-9a-f-]+$/)
    expect(WELFARE_EDITION.ym).toBe('2025-12')
  })

  it('AC-7904.1: 요청은 GET 한 번(한 쪽에 전국 줄) · page=1 · perPage=1000 · JSON이고, 주소에 열쇠가 없다', () => {
    const requests = welfare.requests(q('99110'))
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0].url)
    expect(`${url.origin}${url.pathname}`).toBe(WELFARE_URL)
    expect([...url.searchParams]).toEqual([
      ['page', '1'],
      ['perPage', '1000'],
      ['returnType', 'JSON'],
    ])
    expect(requests[0].url.toLowerCase()).not.toContain('servicekey')
    // 시군구가 달라도 같은 전국 한 쪽을 받는다(고르기는 답 읽기에서)
    expect(welfare.requests(q('98110'))).toEqual(requests)
  })

  it('AC-7904.1: 정해 둔 부르기 규칙(fetchSource)으로 보내면 막히지 않고 serviceKey가 하나 붙으며, 받은 답을 그대로 읽는다', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn<SourceFetch>(async (url) => {
      seen.push(url)
      return new Response(fixture('page-code.json'))
    })
    const fetchSource = createFetchSource({ fetchImpl })
    const got = await fetchSource(welfare.requests(q('99110'))[0], { kind: welfare.key, value: 'DATA+FAKE/key==0050' })
    expect(got.ok).toBe(true)
    expect(seen).toHaveLength(1)
    const sent = new URL(seen[0])
    expect(sent.hostname).toBe('api.odcloud.kr')
    expect(sent.searchParams.getAll('serviceKey')).toEqual(['DATA+FAKE/key==0050'])
    if (got.ok) expect(read(got.text, '99110')).toEqual(ok(GARAM))
  })
})

describe('AC-7904.1 welfare — 시군구 코드로 한 줄 고르기', () => {
  it('AC-7904.1: 시군구 코드 칸으로 한 줄을 골라 기초 의료급여·기초생활보장 합계·차상위 3종 합(+셋 각각)·기준 연월을 돌려준다(가구 수 칸은 읽지 않음)', () => {
    expect(read(fixture('page-code.json'), '99110')).toEqual(ok(GARAM))
  })

  it('AC-7904.1: 일반구까지 — 일반구 코드는 그 구 줄을, 시 코드는 시 합계 줄을 고른다', () => {
    const text = fixture('page-code.json')
    expect(read(text, '99121')).toEqual(ok(NURI))
    expect(read(text, '99122')).toEqual(ok(row('한빛시 별빛구', 2900, 5200, 860, 150, 230)))
    expect(read(text, '99120')).toEqual(ok(HANBIT))
  })

  it("AC-7904.1: 숫자가 쉼표 든 글자여도 정수로 읽고, '-'는 0이다", () => {
    expect(read(fixture('page-code.json'), '98110')).toEqual(ok(row('마루군', 1017, 1204, 356, 0, 1002)))
  })

  it('AC-7904.1: 전북특별자치도(52)·강원특별자치도(51) 시군구는 옛 코드(45·42) 줄로도 찾고, 새 코드 줄이 있으면 그것이 먼저다', () => {
    // 지어낸 응답의 솔내군은 옛 코드 45990으로 적혀 있다
    expect(read(fixture('page-code.json'), '52990')).toEqual(ok(SOLNAE))
    expect(read(fixture('page-code.json'), '45990')).toEqual(ok(SOLNAE))
    const both = edited('page-code.json', (page) => {
      page.data.push({ ...page.data[5], 시도: '전북특별자치도', 시군구코드: '52990', 기초생활보장_의료_수급권자수: 900 })
      page.data.push({ ...page.data[1], 시도: '강원도', 시군구: '바람군', 시군구코드: '42970' })
    })
    expect(read(both, '52990')).toEqual(ok({ ...SOLNAE, medical: 900 }))
    expect(read(both, '45990')).toEqual(ok(SOLNAE))
    expect(read(both, '51970')).toEqual(ok({ ...GARAM, sggName: '바람군' }))
  })

  it('AC-7904.1: 코드 칸이 10자리(행정구역 코드)면 앞 5자리로 잇는다', () => {
    const long = edited('page-code.json', (page) => {
      for (const r of page.data) if (r.시군구코드 !== '') r.시군구코드 = `${String(r.시군구코드)}00000`
    })
    expect(read(long, '99110')).toEqual(ok(GARAM))
    expect(read(long, '99121')).toEqual(ok(NURI))
  })

  it('AC-7904.1: 코드 칸이 있는데 코드로 못 찾으면 시도+시군구 이름으로 한 번 더 찾는다(이름을 받았을 때)', () => {
    const text = fixture('page-code.json')
    expect(readAsk(text, { sgg: '99130', sidoName: '가상도', sggName: '가람시' })).toEqual(ok(GARAM))
  })
})

describe('AC-7904.1 welfare — 코드 칸이 없으면 시도+시군구 이름으로', () => {
  it('AC-7904.1: 시도+시군구 이름(빈칸 무시)으로 한 줄을 고른다', () => {
    const text = fixture('page-names.json')
    expect(readAsk(text, { sgg: '99110', sidoName: '가상도', sggName: '가람시' })).toEqual(ok(GARAM))
    expect(readAsk(text, { sgg: '99110', sidoName: '가상 도', sggName: ' 가람시' })).toEqual(ok(GARAM))
  })

  it('AC-7904.1: 전라북도·전북특별자치도(강원도·강원특별자치도도)는 같은 시도로 본다(받은 이름이 어느 쪽이든)', () => {
    const text = fixture('page-names.json')
    const BEODEUL = row('버들군', 1300, 2400, 450, 61, 98)
    expect(readAsk(text, { sgg: '52990', sidoName: '전북특별자치도', sggName: '솔내군' })).toEqual(ok(SOLNAE))
    expect(readAsk(text, { sgg: '52980', sidoName: '전라북도', sggName: '버들군' })).toEqual(ok(BEODEUL))
    const gangwon = edited('page-names.json', (page) => {
      page.data[1].시도명 = '강원도'
    })
    expect(readAsk(gangwon, { sgg: '51110', sidoName: '강원특별자치도', sggName: '가람시' })).toEqual(ok(GARAM))
  })

  it('AC-7904.1: 시도 이름을 받지 않으면 시군구 이름만으로 고른다(하나뿐일 때)', () => {
    expect(readAsk(fixture('page-names.json'), { sgg: '52990', sggName: '솔내군' })).toEqual(ok(SOLNAE))
  })

  it("AC-7904.1: 일반구까지 — '한빛시 누리구'는 그 구 줄(빈칸 없이 적은 줄·구 이름만 적은 줄도)이고, 시 합계 줄·다른 시도의 같은 구 이름 줄은 고르지 않는다", () => {
    const text = fixture('page-names.json')
    expect(readAsk(text, { sgg: '99121', sidoName: '가상도', sggName: '한빛시 누리구' })).toEqual(ok(NURI))
    expect(readAsk(text, { sgg: '99122', sidoName: '가상도', sggName: '한빛시 별빛구' })).toEqual(
      ok(row('한빛시별빛구', 2900, 5200, 860, 150, 230)),
    )
    expect(readAsk(text, { sgg: '99120', sidoName: '가상도', sggName: '한빛시' })).toEqual(ok(HANBIT))
    const short = edited('page-names.json', (page) => {
      page.data[3].시군구명 = '누리구'
    })
    expect(readAsk(short, { sgg: '99121', sidoName: '가상도', sggName: '한빛시 누리구' })).toEqual(ok({ ...NURI, sggName: '누리구' }))
  })

  it('AC-7904.1: 코드 칸 값이 시군구 코드 모양(5·10자리)이 아니면(행정기관 코드 7자리 등) 코드 칸이 없는 것으로 보고 이름으로 찾는다', () => {
    const agency = edited('page-code.json', (page) => {
      page.data.forEach((r, i) => (r.시군구코드 = String(3700000 + i * 10000)))
    })
    expect(readAsk(agency, { sgg: '99110', sidoName: '가상도', sggName: '가람시' })).toEqual(ok(GARAM))
  })
})

describe('AC-7904.2 welfare — 없는 시군구 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 자료에 없는 시군구는 실패가 아니라 빈 값(null)이다', () => {
    expect(read(fixture('page-code.json'), '99990')).toEqual(ok(null))
    expect(readAsk(fixture('page-names.json'), { sgg: '99990', sidoName: '가상도', sggName: '없는시' })).toEqual(ok(null))
    // 같은 구 이름이 다른 시도에만 있으면 없는 것이다
    expect(readAsk(fixture('page-names.json'), { sgg: '99190', sidoName: '가상도', sggName: '버들군' })).toEqual(ok(null))
  })

  it('AC-7904.2: 빈 답(줄 0개)은 빈 값(null)이다', () => {
    expect(read(fixture('empty.json'), '99110')).toEqual(ok(null))
  })

  it('AC-7904.2: 미등록 열쇠 답(활용신청 안 됨)은 not-applied다', () => {
    expect(read(fixture('not-registered.json'), '99110')).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 전국 줄이 한 쪽에 다 오지 않았으면(totalCount > 받은 줄) 찾은 줄은 읽고, 못 찾으면 없다고 하지 않고 failed다', () => {
    const partial = edited('page-code.json', (page) => {
      page.totalCount = 300
    })
    expect(read(partial, '99110')).toEqual(ok(GARAM))
    expect(read(partial, '99990')).toEqual({ ok: false, code: 'failed' })
  })

  const FAILED: [string, string[], WelfareAsk][] = [
    ['답이 JSON이 아님', ['<html>잠시 뒤 다시</html>'], { sgg: '99110' }],
    ['data 칸이 없음', ['{"page":1,"perPage":1000}'], { sgg: '99110' }],
    ['data가 목록이 아님', ['{"data":{"시군구":"가람시"}}'], { sgg: '99110' }],
    ['유효하지 않은 열쇠(-401) — 열쇠 거절은 failed', [fixture('invalid-key.json')], { sgg: '99110' }],
    ['답이 없음', [], { sgg: '99110' }],
    ['답이 둘', [fixture('page-code.json'), fixture('page-code.json')], { sgg: '99110' }],
    [
      '읽을 숫자 칸(차상위 자활)이 없음',
      [
        edited('page-code.json', (page) => {
          for (const r of page.data) delete r.차상위자활_수급권자수
        }),
      ],
      { sgg: '99110' },
    ],
    [
      '같은 칸을 가리키는 칸이 둘(의료급여 수급권자 칸 둘)',
      [
        edited('page-code.json', (page) => {
          for (const r of page.data) r['의료급여 수급권자수'] = 1
        }),
      ],
      { sgg: '99110' },
    ],
    [
      '고른 줄의 숫자가 숫자 모양이 아님',
      [
        edited('page-code.json', (page) => {
          page.data[1].기초생활보장_의료_수급권자수 = '약 4천'
        }),
      ],
      { sgg: '99110' },
    ],
    [
      '고른 줄의 숫자가 음수',
      [
        edited('page-code.json', (page) => {
          page.data[1].차상위장애인_수급권자수 = -3
        }),
      ],
      { sgg: '99110' },
    ],
    [
      '고른 줄의 숫자가 소수',
      [
        edited('page-code.json', (page) => {
          page.data[1].기초생활보장_합계_수급권자수 = 7654.5
        }),
      ],
      { sgg: '99110' },
    ],
    [
      '같은 시군구 코드 줄이 둘',
      [
        edited('page-code.json', (page) => {
          page.data.push({ ...page.data[1] })
        }),
      ],
      { sgg: '99110' },
    ],
    [
      '같은 시도+시군구 이름 줄이 둘',
      [
        edited('page-names.json', (page) => {
          page.data.push({ ...page.data[1] })
        }),
      ],
      { sgg: '99110', sidoName: '가상도', sggName: '가람시' },
    ],
    ['코드 칸이 없는데 시군구 이름을 받지 않음', [fixture('page-names.json')], { sgg: '99110' }],
    // 가상도 '한빛시 누리구'와 먼바다도 '누리구' — 시도 이름 없이는 어느 쪽인지 모른다
    ['시도 이름 없이 받은 시군구 이름이 두 시도에 있음', [fixture('page-names.json')], { sgg: '99121', sggName: '한빛시 누리구' }],
  ]

  it.each(FAILED)('AC-7904.2: %s → failed', (_name, texts, ask) => {
    expect(parseWelfare(texts, ask)).toEqual({ ok: false, code: 'failed' })
  })
})
