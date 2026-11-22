import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { monthRange } from '@/lib/analytics/dates'
import { OLD_SGG_GROUPS, oldGroupOf, sidoNamesOf } from '@/lib/location/regions'
import { isSourceId, sourceOf } from '@/lib/location/sources'
import type { QueryOf } from '@/types/location'
import { createFetchSource, type SourceFetch } from '../fetchSource'
import { WELFARE_EDITION, WELFARE_URL, parseWelfare, welfare, type OldWelfareAsk, type WelfareAsk } from './welfare'

// 입지 분석 바깥 자료 — 의료급여·기초생활·차상위 인원(specs/location TASK-50·56, design.md 4·5절, 조사 5).
// 진짜 사이트는 부르지 않는다. 답은 fixtures/location/api/welfare/의 응답(api.odcloud.kr 한 쪽 모양)이고, 숫자와 시군구 이름은 지어낸 것이다
// (전라북도·광주광역시·전라남도는 옛 이름·새 이름을 함께 받는지 보려고 시도 이름만 그대로 쓴다). 열쇠도 지어낸 글자다.
// 옛 구 묶음 견본(인천광역시 중구·동구·서구 · 경기도 화성시)은 판에서 찾는 옛 이름이라 이름은 그대로이고 숫자만 지어낸 것이다.
// TASK-47(2026-11-22 진짜 열쇠): 진짜 판(uddi:b4960581-…, 2025-12)은 '긴 모양'이다 — 줄 하나 = 시도·시군구·사업명 하나,
// 칸은 기준년월·사업명·수급가구수·수급권자수·시군구·시도뿐이고 시군구 코드 칸이 없다 → 시도+시군구 이름으로 고른다.
// 일반구는 '수원시장안구'·'부천시 소사구'처럼 빈칸이 있기도 없기도 하다. 판은 2026 행정 개편 전 이름(광주광역시·전라남도·인천 중구 등)이다.
// TASK-56: 몸통은 sidoNames(1~2)·sggNames(1~4) — 옛 구 묶음이면 옛 이름들의 줄을 더하고, 하나라도 못 찾으면 빈 값이다

const DIR = join(process.cwd(), 'fixtures/location/api/welfare')
const fixture = (name: string) => readFileSync(join(DIR, name), 'utf8')
type Page = { totalCount?: number; data: Record<string, unknown>[] }
const pageOf = (name: string) => JSON.parse(fixture(name)) as Page
// 응답을 고쳐 다시 글자로(한 시험 안에서만 바꾼다)
const edited = (edit: (page: Page) => void) => {
  const page = pageOf('page.json')
  edit(page)
  return JSON.stringify(page)
}
// 한 지역·사업 줄 찾기(고쳐 보려고)
const rowOf = (page: Page, sido: string, sgg: string, project: string) =>
  page.data.find((r) => r.시도 === sido && r.시군구 === sgg && r.사업명 === project)!

const TODAY = '2026-11-22'
// 기준 날짜 = 판 기준 연월(자료 안 기준년월)의 말일
const AS_OF = monthRange('2025-12').to
// 몸통(시도 이름 목록 · 시군구 이름 목록)과 옛 몸통(이름 하나씩)
const ask = (sidoNames: string[], sggNames: string[]): WelfareAsk => ({ sgg: '99110', sidoNames, sggNames })
const oldAsk = (sidoName: string | undefined, sggName: string | undefined): OldWelfareAsk => ({ sgg: '99110', sidoName, sggName })
const read = (text: string, a: WelfareAsk | OldWelfareAsk) => parseWelfare([text], a)
const PAGE = fixture('page.json')
const BODY: QueryOf<'welfare'> = { kind: 'welfare', sgg: '99110', sidoNames: ['가상도'], sggNames: ['가람시'] }

// 모으기(TASK-58)가 만들 몸통: 옛 구 묶음의 옛 이름들 · 시도 이름은 sidoNamesOf로
const groupAsk = (code5: string): WelfareAsk => {
  const g = oldGroupOf(code5)
  if (g === null) throw new Error(`옛 구 묶음 아님: ${code5}`)
  return { sgg: code5, sidoNames: [...new Set(g.names.flatMap((n) => sidoNamesOf(n.sido)))], sggNames: g.names.map((n) => n.sgg) }
}

// 응답의 값(수급권자 수 칸만 읽는다. 가구 수 칸은 다른 값)
const row = (sggName: string, medical: number, basic: number, copay: number, selfSupport: number, disabled: number) => ({
  sggName,
  ym: '2025-12',
  medical,
  basic,
  nearPoor: copay + selfSupport + disabled,
  nearPoorBy: { copay, selfSupport, disabled },
})
const GARAM = row('가람시', 4321, 7654, 1234, 210, 345)
const NURI = row('한빛시누리구', 2100, 3900, 640, 110, 170)
const BYEOLNAE = row('한빛시 별내구', 1500, 2800, 420, 60, 90)
const SOLNAE = row('솔내군', 812, 1500, 301, 42, 77)
const GWANGJU_SEO = row('서구', 4700, 8800, 1500, 230, 310)
// 옛 구 묶음 값 = 옛 구 줄의 합(인천 중구 3,400·6,200·610·15·220 + 동구 1,650·2,600·230·9·150)
const OLD_JUNG_DONG = row('중구·동구', 5050, 8800, 840, 24, 370)
const OLD_SEO = row('서구', 11500, 21000, 2300, 7, 840)
const OLD_HWASEONG = row('화성시', 6250, 14300, 1850, 45, 950)
const ok = (value: unknown) => ({ ok: true, value, asOf: AS_OF })
const FAIL = { ok: false, code: 'failed' }

describe('AC-7904.1 welfare — 요청 만들기', () => {
  it('AC-7904.1: 읽는 곳은 종류 welfare · 출처 welfare(SOURCES에 있음) · 공공데이터포털 열쇠(data)다', () => {
    expect(welfare.kind).toBe('welfare')
    expect(welfare.src).toBe('welfare')
    expect(isSourceId(welfare.src)).toBe(true)
    expect(welfare.key).toBe('data')
    expect(sourceOf(welfare.src)?.key).toBe(welfare.key)
  })

  it('AC-7904.1: 판 주소는 상수 하나(api.odcloud.kr/api/15062448/v1/<해마다 판>)이고 지금 판은 2025-12(uddi:b4960581-…)다', () => {
    expect(WELFARE_EDITION).toEqual({ uddi: 'uddi:b4960581-6aa1-4317-a2a6-d3f947573f24', ym: '2025-12' })
    expect(WELFARE_URL).toBe(`https://api.odcloud.kr/api/15062448/v1/${WELFARE_EDITION.uddi}`)
  })

  it('AC-7904.1: 요청은 GET 한 번(한 쪽에 전국 줄 약 2,600개) · page=1 · perPage=3000 · JSON이고, 주소에 열쇠가 없다', () => {
    const requests = welfare.requests(BODY)
    expect(requests).toHaveLength(1)
    const url = new URL(requests[0].url)
    expect(`${url.origin}${url.pathname}`).toBe(WELFARE_URL)
    expect([...url.searchParams]).toEqual([
      ['page', '1'],
      ['perPage', '3000'],
      ['returnType', 'JSON'],
    ])
    expect(requests[0].url.toLowerCase()).not.toContain('servicekey')
    // 시군구·이름이 달라도(옛 구 묶음이어도) 같은 전국 한 쪽을 받는다(고르기는 답 읽기에서)
    expect(welfare.requests({ kind: 'welfare', sgg: '28125', sidoNames: ['인천광역시'], sggNames: ['중구', '동구'] })).toEqual(requests)
  })

  it('AC-7904.1: 정해 둔 부르기 규칙(fetchSource)으로 보내면 막히지 않고 serviceKey가 하나 붙으며, 받은 답을 그대로 읽는다', async () => {
    const seen: string[] = []
    const fetchImpl = vi.fn<SourceFetch>(async (url) => {
      seen.push(url)
      return new Response(PAGE)
    })
    const fetchSource = createFetchSource({ fetchImpl })
    const got = await fetchSource(welfare.requests(BODY)[0], { kind: welfare.key, value: 'DATA+FAKE/key==0050' })
    expect(got.ok).toBe(true)
    expect(seen).toHaveLength(1)
    const sent = new URL(seen[0])
    expect(sent.hostname).toBe('api.odcloud.kr')
    expect(sent.searchParams.getAll('serviceKey')).toEqual(['DATA+FAKE/key==0050'])
    if (got.ok) expect(welfare.parse([got.text], BODY, TODAY)).toEqual(ok(GARAM))
  })
})

describe('AC-7904.1 welfare — 몸통의 시도·시군구 이름으로 그 지역 사업 줄들 고르기', () => {
  it('AC-7904.1: 기초의료급여·기초생활보장(맞춤형급여)·차상위 3종(본인부담경감·자활·장애인) 줄의 수급권자 수와 기준 연월을 돌려준다(가구 수·다른 사업은 읽지 않음)', () => {
    expect(read(PAGE, ask(['가상도'], ['가람시']))).toEqual(ok(GARAM))
    // 이름의 빈칸은 견주지 않는다
    expect(read(PAGE, ask(['가상도 '], [' 가 람 시']))).toEqual(ok(GARAM))
  })

  it("AC-7904.1: 일반구까지 — '한빛시 누리구'는 빈칸 없이 적은 줄('한빛시누리구')도, 구 이름만 받아도 그 구이고, 다른 시도의 같은 구 이름 줄은 고르지 않는다", () => {
    expect(read(PAGE, ask(['가상도'], ['한빛시 누리구']))).toEqual(ok(NURI))
    expect(read(PAGE, ask(['가상도'], ['누리구']))).toEqual(ok(NURI))
    expect(read(PAGE, ask(['가상도'], ['한빛시별내구']))).toEqual(ok(BYEOLNAE))
    expect(read(PAGE, ask(['먼바다도'], ['누리구']))).toEqual(ok(row('누리구', 950, 1800, 300, 40, 66)))
  })

  it('AC-7904.1: 차상위 사업 줄이 없는 지역은 그 사업을 0명으로 본다(진짜 판: 옹진군 차상위자활 줄 없음)', () => {
    expect(read(PAGE, ask(['가상도'], ['작은섬군']))).toEqual(ok(row('작은섬군', 51, 90, 12, 0, 3)))
  })

  it("AC-7904.1: 숫자가 쉼표 든 글자여도 정수로 읽고, '-'는 0이다", () => {
    const text = edited((page) => {
      rowOf(page, '가상도', '가람시', '기초의료급여').수급권자수 = '4,321'
      rowOf(page, '가상도', '가람시', '차상위자활').수급권자수 = '-'
    })
    expect(read(text, ask(['가상도'], ['가람시']))).toEqual(ok(row('가람시', 4321, 7654, 1234, 0, 345)))
  })

  it('AC-7904.1: 시도 이름은 sidoNamesOf로 판의 이름을 찾는다 — 전라북도·전북특별자치도는 어느 쪽으로 받아도, 둘 다 받아도 같은 시도', () => {
    expect(sidoNamesOf('전북특별자치도')).toEqual(['전북특별자치도', '전라북도'])
    expect(read(PAGE, ask(['전북특별자치도'], ['솔내군']))).toEqual(ok(SOLNAE))
    expect(read(PAGE, ask(['전라북도'], ['솔내군']))).toEqual(ok(SOLNAE))
    expect(read(PAGE, ask(sidoNamesOf('전북특별자치도'), ['솔내군']))).toEqual(ok(SOLNAE))
  })

  it('AC-7904.1: 시도 이름 목록이 비면 시군구 이름만으로 고른다(그 이름 지역이 하나뿐일 때)', () => {
    expect(read(PAGE, ask([], ['가람시']))).toEqual(ok(GARAM))
  })

  it('AC-7904.1: 기준 날짜·연월은 자료 안 기준년월이고, 그 칸이 없으면 판 기준 연월이다', () => {
    const text = edited((page) => {
      for (const r of page.data) r.기준년월 = '2026-06'
    })
    expect(read(text, ask(['가상도'], ['가람시']))).toEqual({ ok: true, value: { ...GARAM, ym: '2026-06' }, asOf: '2026-06-30' })
    const none = edited((page) => {
      for (const r of page.data) delete r.기준년월
    })
    expect(read(none, ask(['가상도'], ['가람시']))).toEqual(ok(GARAM))
  })
})

describe('AC-7922.3 welfare — 옛 구 묶음 · 전남광주통합특별시', () => {
  it('AC-7922.3: 판에 없는 새 시군구(제물포·영종 · 서해·검단 · 화성 일반구 넷)는 옛 구 묶음 이름들의 줄을 더한다', () => {
    const want: Record<string, unknown> = { '옛 중구·동구': OLD_JUNG_DONG, '옛 서구': OLD_SEO, '옛 화성시': OLD_HWASEONG }
    for (const g of OLD_SGG_GROUPS) for (const code5 of g.sggs) expect(read(PAGE, groupAsk(code5)), code5).toEqual(ok(want[g.label]))
    // 몸통 모양: 제물포구 = 인천광역시 · 중구·동구
    expect(groupAsk('28125')).toEqual({ sgg: '28125', sidoNames: ['인천광역시'], sggNames: ['중구', '동구'] })
  })

  it('AC-7922.3: 묶음의 이름은 받은 시군구 이름 차례로 ·로 잇고, 값은 차례와 상관없이 같은 합이다', () => {
    expect(read(PAGE, ask(['인천광역시'], ['동구', '중구']))).toEqual(ok({ ...OLD_JUNG_DONG, sggName: '동구·중구' }))
  })

  it('AC-7922.3: 옛 서구 묶음은 인천광역시 서구만 고른다(광주광역시·가상광역시 서구는 고르지 않음)', () => {
    expect(read(PAGE, groupAsk('28275'))).toEqual(ok(OLD_SEO))
    expect(read(PAGE, ask(['인천광역시'], ['서구']))).toEqual(ok(OLD_SEO))
  })

  it('AC-7922.3: 묶음의 이름 하나라도 판에서 못 찾으면 실패가 아니라 빈 값(null)이다', () => {
    expect(read(PAGE, ask(['인천광역시'], ['중구', '없는구']))).toEqual(ok(null))
    const noDong = edited((page) => {
      page.data = page.data.filter((r) => !(r.시도 === '인천광역시' && r.시군구 === '동구'))
      page.totalCount = page.data.length
    })
    expect(read(noDong, groupAsk('28125'))).toEqual(ok(null))
  })

  it('AC-7922.3: 전국 줄이 다 오지 않은 답(totalCount > 받은 줄)에서 묶음 이름을 다 찾으면 읽고, 하나라도 못 찾으면 failed다', () => {
    const partial = edited((page) => {
      page.totalCount = 3001
    })
    expect(read(partial, groupAsk('28125'))).toEqual(ok(OLD_JUNG_DONG))
    expect(read(partial, ask(['인천광역시'], ['중구', '없는구']))).toEqual(FAIL)
  })

  it('AC-7922.3: 전남광주통합특별시는 sidoNamesOf의 옛 시도 둘(광주광역시·전라남도) 줄에서 찾는다(인천·가상광역시 서구는 고르지 않음)', () => {
    const sidos = sidoNamesOf('전남광주통합특별시')
    expect(sidos).toEqual(['광주광역시', '전라남도'])
    expect(read(PAGE, ask(sidos, ['서구']))).toEqual(ok(GWANGJU_SEO))
    expect(read(PAGE, ask(sidos, ['바람군']))).toEqual(ok(row('바람군', 1240, 2300, 410, 55, 88)))
    // 새 시도 이름을 그대로 받아도 옛 둘로 찾는다 · 옛 이름 하나로 물어도 그대로
    expect(read(PAGE, ask(['전남광주통합특별시'], ['서구']))).toEqual(ok(GWANGJU_SEO))
    expect(read(PAGE, ask(['광주광역시'], ['서구']))).toEqual(ok(GWANGJU_SEO))
  })

  it('AC-7922.3: 묶음 아닌 2026 새 구 이름(판에 아직 없음)은 빈 값(null)이다', () => {
    expect(read(PAGE, ask(['인천광역시'], ['제물포구']))).toEqual(ok(null))
  })

  const GROUP_FAILED: [string, string, WelfareAsk][] = [
    [
      '묶음의 한 구에 기초의료급여 줄이 없음',
      edited((page) => {
        page.data = page.data.filter((r) => !(r.시도 === '인천광역시' && r.시군구 === '동구' && r.사업명 === '기초의료급여'))
      }),
      groupAsk('28125'),
    ],
    [
      '묶음의 한 구의 숫자가 숫자 모양이 아님',
      edited((page) => {
        rowOf(page, '인천광역시', '중구', '차상위자활').수급권자수 = '열다섯'
      }),
      groupAsk('28155'),
    ],
    [
      '묶음 구들의 기준 연월이 다름',
      edited((page) => {
        for (const r of page.data) if (r.시도 === '인천광역시' && r.시군구 === '동구') r.기준년월 = '2025-11'
      }),
      groupAsk('28125'),
    ],
    // 가상도 '한빛시누리구'를 두 이름이 가리키면 두 번 더하게 된다
    ['두 시군구 이름이 같은 지역을 가리킴', PAGE, ask(['가상도'], ['한빛시 누리구', '누리구'])],
    // 가상도 '한빛시누리구'와 먼바다도 '누리구' — 받은 시도 둘에 다 있으면 어느 쪽인지 모른다
    ['받은 시도 둘에 같은 시군구 이름이 있음', PAGE, ask(['가상도', '먼바다도'], ['누리구'])],
  ]

  it.each(GROUP_FAILED)('AC-7922.3: %s → failed', (_name, text, a) => {
    expect(read(text, a)).toEqual(FAIL)
  })
})

describe('AC-7904.1 welfare — 옛 몸통(sidoName·sggName 하나)도 받는다', () => {
  it('AC-7904.1: 시도·시군구 이름 하나씩이면 그 지역 값이고, 시도 이름은 같은 규칙(sidoNamesOf)으로 찾는다', () => {
    expect(read(PAGE, oldAsk('가상도', '가람시'))).toEqual(ok(GARAM))
    expect(read(PAGE, oldAsk('가상도', '한빛시 누리구'))).toEqual(ok(NURI))
    expect(read(PAGE, oldAsk('전라북도', '솔내군'))).toEqual(ok(SOLNAE))
    expect(read(PAGE, oldAsk('전남광주통합특별시', '서구'))).toEqual(ok(GWANGJU_SEO))
    expect(read(PAGE, oldAsk(undefined, '가람시'))).toEqual(ok(GARAM))
  })

  it('AC-7904.2: 옛 몸통도 없는 시군구는 빈 값, 시군구 이름이 없거나 어느 지역인지 모르면 failed다', () => {
    expect(read(PAGE, oldAsk('인천광역시', '제물포구'))).toEqual(ok(null))
    expect(read(PAGE, oldAsk('가상도', undefined))).toEqual(FAIL)
    expect(read(PAGE, oldAsk('가상도', ' '))).toEqual(FAIL)
    expect(read(PAGE, oldAsk(undefined, '누리구'))).toEqual(FAIL)
  })
})

describe('AC-7904.2 welfare — 없는 시군구 · 활용신청 안 됨 · 모양 틀림', () => {
  it('AC-7904.2: 자료에 없는 시군구는 실패가 아니라 빈 값(null)이다', () => {
    expect(read(PAGE, ask(['가상도'], ['없는시']))).toEqual(ok(null))
    // 같은 구 이름이 다른 시도에만 있으면 없는 것이다
    expect(read(PAGE, ask(['가상도'], ['서구']))).toEqual(ok(null))
  })

  it('AC-7904.2: 빈 답(줄 0개)은 빈 값(null)이다', () => {
    expect(read(fixture('empty.json'), ask(['가상도'], ['가람시']))).toEqual(ok(null))
    expect(read(fixture('empty.json'), groupAsk('28125'))).toEqual(ok(null))
  })

  it('AC-7904.2: 미등록 열쇠 답(활용신청 안 됨)은 not-applied다', () => {
    expect(read(fixture('not-registered.json'), ask(['가상도'], ['가람시']))).toEqual({ ok: false, code: 'not-applied' })
  })

  it('AC-7904.2: 전국 줄이 한 쪽에 다 오지 않았으면(totalCount > 받은 줄) 찾은 지역은 읽고, 못 찾으면 없다고 하지 않고 failed다', () => {
    const partial = edited((page) => {
      page.totalCount = 3001
    })
    expect(read(partial, ask(['가상도'], ['가람시']))).toEqual(ok(GARAM))
    expect(read(partial, ask(['가상도'], ['없는시']))).toEqual(FAIL)
  })

  const FAILED: [string, string[], WelfareAsk][] = [
    ['답이 JSON이 아님', ['<html>잠시 뒤 다시</html>'], ask(['가상도'], ['가람시'])],
    ['data 칸이 없음', ['{"page":1,"perPage":3000}'], ask(['가상도'], ['가람시'])],
    ['data가 목록이 아님', ['{"data":{"시군구":"가람시"}}'], ask(['가상도'], ['가람시'])],
    ['유효하지 않은 열쇠(-401) — 열쇠 거절은 failed', [fixture('invalid-key.json')], ask(['가상도'], ['가람시'])],
    ['답이 없음', [], ask(['가상도'], ['가람시'])],
    ['답이 둘', [PAGE, PAGE], ask(['가상도'], ['가람시'])],
    [
      '사업명 칸이 없음(모양이 다른 판)',
      [
        edited((page) => {
          for (const r of page.data) delete r.사업명
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '수급권자수 칸이 없음',
      [
        edited((page) => {
          for (const r of page.data) delete r.수급권자수
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '고른 지역에 기초의료급여 줄이 없음',
      [
        edited((page) => {
          page.data = page.data.filter((r) => !(r.시군구 === '가람시' && r.사업명 === '기초의료급여'))
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '고른 지역에 기초생활보장(맞춤형급여) 줄이 없음',
      [
        edited((page) => {
          page.data = page.data.filter((r) => !(r.시군구 === '가람시' && r.사업명 === '기초생활보장(맞춤형급여)'))
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '고른 줄의 숫자가 숫자 모양이 아님',
      [
        edited((page) => {
          rowOf(page, '가상도', '가람시', '기초의료급여').수급권자수 = '약 4천'
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '고른 줄의 숫자가 음수',
      [
        edited((page) => {
          rowOf(page, '가상도', '가람시', '차상위장애인').수급권자수 = -3
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '고른 줄의 숫자가 소수',
      [
        edited((page) => {
          rowOf(page, '가상도', '가람시', '기초생활보장(맞춤형급여)').수급권자수 = 7654.5
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    [
      '같은 지역·같은 사업 줄이 둘',
      [
        edited((page) => {
          page.data.push({ ...rowOf(page, '가상도', '가람시', '기초의료급여') })
        }),
      ],
      ask(['가상도'], ['가람시']),
    ],
    ['시군구 이름 목록이 비었음(판에 코드 칸이 없다)', [PAGE], ask(['가상도'], [])],
    ['시군구 이름이 빈 글자', [PAGE], ask(['가상도'], [' '])],
    // 가상도 '한빛시누리구'와 먼바다도 '누리구' — 시도 이름 없이는 어느 쪽인지 모른다
    ['시도 이름 없이 받은 시군구 이름이 두 시도에 있음', [PAGE], ask([], ['누리구'])],
  ]

  it.each(FAILED)('AC-7904.2: %s → failed', (_name, texts, a) => {
    expect(parseWelfare(texts, a)).toEqual(FAIL)
  })
})
