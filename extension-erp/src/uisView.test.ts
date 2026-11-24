// @vitest-environment jsdom
// TASK-11 (spec erp-uisarang) design.md 8-6·10-1~10-3·11절: 의사랑 안내 안쪽 그리기(renderUis). 글은 design.md 10절(시안 고친 판) 그대로,
// 숫자는 시안 예시 관계(notes.md '예시 숫자 관계')로 지은 값이다(환자 정보 없음). 모든 글은 textContent로만 들어간다
import { describe, expect, it, vi } from 'vitest'
import type { Where } from './cells'
import type { FillResult } from './fill'
import { UIS_PANEL_WORDS } from './panel'
import { planUisCells, stopOf, uisCells, type UisStop } from './uisCells'
import { UIS_COUNT_KEYS, UIS_KINDS, UIS_SALES_KEYS } from './uisTypes'
import type { UisCountKey, UisDay, UisKind, UisReport, UisSalesKey, UisSettings } from './uisTypes'
import { renderUis, type UisAction, type UisView } from './uisView'

const DAY = '2026-11-23'
const END = '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.'
const UNTOUCHED = '아무 칸도 바꾸지 않았어요.'
const WHERE_DESKTOP = '저장할 곳: 바탕화면 › ERP마감 폴더'

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const kids = (el: Element | null | undefined) => [...(el?.children ?? [])].map(text)

// --- 시안 예시 숫자 답(notes.md '예시 숫자 관계') ---

const COUNTS: Record<UisCountKey, number> = {
  carm: 18,
  sono: 21,
  arthro: 0,
  manual: 6,
  eswt: 4,
  manualConsult: 2,
  lipus: 0,
  nail: 0,
  ct: 0,
  surgery: 0,
  eswtStd: 0,
  eswtRadial: 0,
  ptVisit: 31,
}
const SALES: Record<UisSalesKey, number> = {
  carm: 482_000,
  sono: 731_500,
  arthro: 0,
  manual: 498_000,
  eswt: 360_000,
  pt: 862_400,
  etc1: 154_000,
  etc2: 0,
  etc3: 0,
  etc4: 0,
}
const BANDS = ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90'] as const
const AGE_NEW = [0, 1, 1, 0, 1, 2, 1, 1, 0, 0] // 합 7 = 신규환자
const AGE_RETURN = [1, 3, 5, 7, 10, 16, 22, 17, 8, 1] // 합 90

function report(kind: UisKind, over: Partial<UisReport> = {}): UisReport {
  return { kind, state: 'ok', cached: false, from: DAY, to: DAY, value: null, columns: [], ...over }
}

/** 의사랑 답(design.md 3-2). states로 보고서 상태를, uis로 uis 칸을 바꾼다 */
function uisDay(states: Partial<Record<UisKind, Partial<UisReport>>> = {}, uis: Partial<UisDay['uis']> = {}): UisDay {
  const salesOnly = UIS_SALES_KEYS.filter((k) => !(UIS_COUNT_KEYS as readonly string[]).includes(k))
  return {
    date: DAY,
    patients: { new: 7, first90: null, return: 57, ptVisit: 31, noExamFee: 0, total: 97 },
    groups: [
      ...UIS_COUNT_KEYS.map((k) => ({
        key: k,
        patients: COUNTS[k],
        total: k in SALES ? SALES[k as UisSalesKey] : null,
        unpaidVisits: null,
        new: null,
        first90: null,
        return: null,
      })),
      ...salesOnly.map((k) => ({ key: k, patients: null, total: SALES[k], unpaidVisits: null, new: null, first90: null, return: null })),
    ],
    ages: BANDS.map((band, i) => ({ band, new: AGE_NEW[i], first90: null, return: AGE_RETURN[i] })),
    money: {
      total: 5_182_300,
      insurer: 3_441_200,
      receivableIn: null,
      unpaidNew: null,
      noncovered: 1_206_000,
      discount: null,
      disabledFund: null,
      received: 1_741_100,
      card: 1_388_600,
      cash: 352_500,
      transfer: null,
      refund: null,
    },
    inpatientVisits: null,
    reservations: { kinds: [], patients: 33 },
    injection: null,
    overlap: null,
    warnings: { moneyUnconfirmed: false, splitUnconfirmed: false, unpaidVisits: 0, unknownAge: 0, noHistory: false },
    source: 'uisarang',
    uis: {
      folder: 'desktop',
      reports: UIS_KINDS.map((kind) => report(kind, states[kind])),
      open: [],
      deleted: 6,
      kept: 0,
      deleteFailed: 0,
      unknownFiles: 0,
      checks: {
        totalFee: null,
        received: null,
        headcount: null,
        rxTotal: null,
        visitRows: null,
        visitNew: null,
        rsvRows: null,
        rsvVisited: null,
        noDate: false,
      },
      fractional: [],
      negative: [],
      reservations: { total: 34, visited: 29 },
      ...uis,
    },
  }
}

/** 시안 ⑱처럼 고른 설정: 건수 6줄 · 매출 6줄, 기타1 이름 '크라이오'(나머지 11칸은 고르지 않음) */
function mockSettings(): UisSettings {
  const counts: UisCountKey[] = ['carm', 'sono', 'manualConsult', 'manual', 'eswt', 'ptVisit']
  const sales: UisSalesKey[] = ['carm', 'sono', 'manual', 'eswt', 'pt', 'etc1']
  return {
    v: 1,
    counts: Object.fromEntries(counts.map((k) => [k, [`${k.toUpperCase()}1`]])),
    sales: Object.fromEntries(sales.map((k) => [k, [`${k.toUpperCase()}9`]])),
    etcNames: { etc1: '크라이오', etc2: '', etc3: '', etc4: '' },
  }
}

/** 채운 뒤 보기(fillAll 결과는 칸 계획에서 고르지 않은 칸만 옮긴다) */
function doneView(day: UisDay, o: { filled?: number; result?: Partial<FillResult>; canUndo?: boolean } = {}): UisView {
  const s = mockSettings()
  const cells = uisCells(day, s)
  const plan = planUisCells(day, s)
  const result: FillResult = {
    filled: o.filled ?? plan.filter((p) => !p.why && p.value !== null).length,
    kept: 0,
    skipped: [],
    unpicked: plan.filter((p) => p.why === 'unpicked').map((p) => p.where),
    noName: plan.filter((p) => p.why === 'noName').map((p) => p.where),
    unknown: plan.filter((p) => p.why === 'unknown').length,
    held: 0,
    undo: [],
    ...o.result,
  }
  return { kind: 'done', day, cells, result, canUndo: o.canUndo ?? true }
}

function draw(view: UisView) {
  const act = vi.fn<(a: UisAction) => void>()
  const drawn = renderUis(document, view, act, UIS_PANEL_WORDS)
  const labels = drawn.buttons.map(text)
  const press = (label: string) => {
    const one = drawn.buttons.find((b) => text(b) === label)
    if (!one) throw new Error(`[${label}] 단추가 없다: ${labels.join(', ')}`)
    one.click()
  }
  const child = (cls: string) => [...drawn.body.children].filter((c) => c.classList.contains(cls))
  return { ...drawn, act, labels, press, child, lines: kids(drawn.body) }
}

function stopView(day: UisDay, action: 'fill' | 'export' = 'fill'): UisView {
  const stop = stopOf(day)
  if (!stop) throw new Error('멈춤이 아니다')
  return { kind: 'stop', stop, day, action }
}

/** 고르지 않아 건너뛴 11칸의 짧은 줄 이름(시안 ③, 예약 합계 줄을 채우지 않아 ESWT 두 칸이 앞으로 옴) */
const UNPICKED_LINE =
  '치료현황 관절조영술 · 치료현황 리푸스 · 치료현황 손발톱케어 · 치료현황 CT · 치료현황 수술 · ESWT Standard · ESWT Radial · 치료별 매출 관절조영 · 치료별 매출 기타2 · 치료별 매출 기타3 외 1줄'
const CHECK = [
  '의사랑과 맞춰 볼 숫자',
  '외래 총매출 5,182,300원',
  '진료수납액 1,741,100원',
  '환자 합계 97명',
  '의사랑 일일수입통계 화면의 같은 숫자와 먼저 견주어 보세요.',
]
const UNPICKED = ['고르지 않아 건너뛴 칸 11칸', UNPICKED_LINE, '설정에서 코드를 고르지 않은 항목이라 그대로 두었어요.']
const NONE = [
  '의사랑에 없어 비워 둔 칸 75칸',
  '업무일지 1 환자현황 90일초진 · 외래 수입 미수입금(+) · 미수발생(-) · 감액 · 장애인기금(-) · 계좌이체액(-) · 현불/환불(-) · 입원수입',
  '업무일지 2 예약 나머지 칸 · 치료별 건수 · 연령별 90일초진 · 주사1회환자 · 신환주사환자 · 신환주사건수',
  '의사랑 통계 합계로는 셀 수 없는 칸이라 비워 두었어요. 직접 넣어 주세요. 계좌이체는 현금수납액에 들어 있고, 내원하지 않은 환자의 미수 · 환불은 일일수입통계에 빠져요.',
]
const RSV = '예약환자통계: 예약 34건 · 내원 29건. ERP 예약 줄은 종류별로 직접 넣어 주세요.'

describe('AC-4212.4 결과 안내(design.md 10-2, 시안 ③④⑤⑧)', () => {
  it('AC-4212.4: ③ 다 채움 — 맞춰 볼 숫자 → 채움 줄 → 지움 줄 → 건너뛴 칸 → 의사랑에 없어 비워 둔 칸 75칸 → 예약 참고 → 끝 줄, [되돌리기] [엑셀로 받기] [설정 열기]', () => {
    const d = draw(doneView(uisDay()))
    expect(d.head).toBe('의사랑 값 채우기')
    const children = [...d.body.children]
    expect(children.map((c) => c.className)).toEqual(['check', 'lead', 'kept', 'blk', 'blk', '', 'end'])
    expect(kids(children[0])).toEqual(CHECK)
    expect(d.lines.slice(1, 3)).toEqual(['2026-11-23 의사랑 값으로 45칸을 채웠어요. 저장은 하지 않았어요.', '읽은 엑셀 6개는 이 PC에서 지웠어요.'])
    expect(kids(children[3])).toEqual(UNPICKED)
    expect(kids(children[4])).toEqual(NONE)
    // 업무일지 이름은 굵게(시안)
    expect([...children[4].querySelectorAll('.rows b')].map(text)).toEqual(['업무일지 1', '업무일지 2'])
    expect(d.lines.slice(5)).toEqual([RSV, END])
    expect(d.labels).toEqual(['되돌리기', '엑셀로 받기', '설정 열기'])
    expect(d.buttons.every((b) => b.type === 'button' && b.className === 'btn btn-2')).toBe(true)
    // 칸 묶음 제목 뒤 수는 굵게(지금 panel.ts 꼴)
    expect(text(children[3].querySelector('.h b'))).toBe('11칸')
  })

  it('AC-4212.4: [되돌리기]·[엑셀로 받기]·[설정 열기]는 undo·export·settings, 되돌릴 수 없으면 [되돌리기]가 없다', () => {
    const d = draw(doneView(uisDay()))
    d.press('되돌리기')
    d.press('엑셀로 받기')
    d.press('설정 열기')
    expect(d.act.mock.calls.map((c) => c[0])).toEqual(['undo', 'export', 'settings'])
    expect(draw(doneView(uisDay(), { canUndo: false })).labels).toEqual(['엑셀로 받기', '설정 열기'])
  })

  it("AC-4212.4: ④ 일부 칸 못 읽음 — '의사랑에서 읽지 못한 칸 {N}칸' · 칸 이름 · 까닭 줄(칸 없음 → 소수 → 재진 음수) · 할 일, 건너뛴 칸 앞", () => {
    const day = uisDay({ income: { columns: ['카드수납액', '현금수납액'] } }, { fractional: ['sono'], negative: ['return'] })
    day.money.card = null
    day.money.cash = null
    day.patients.return = null
    const sono = day.groups.find((g) => g.key === 'sono')
    if (sono) sono.patients = null
    const d = draw(doneView(day))
    const children = [...d.body.children]
    expect(children.map((c) => c.className)).toEqual(['check', 'lead', 'kept', 'blk', 'blk', 'blk', '', 'end'])
    expect(d.lines[1]).toBe('2026-11-23 의사랑 값으로 41칸을 채웠어요. 저장은 하지 않았어요.')
    const unread = children[3]
    expect(text(unread.querySelector('.h'))).toBe('의사랑에서 읽지 못한 칸 4칸')
    expect(text(unread.querySelector('.rows'))).toBe('환자현황 재진 · 치료현황 SONO · 외래 수입 카드수납액(-) · 외래 수입 현금수납액(-)')
    expect([...unread.querySelectorAll('.whys li')].map(text)).toEqual([
      "일일수입통계에 '카드수납액' · '현금수납액' 칸이 없어요.",
      'SONO 건수: 고른 코드의 총투여량에 소수가 있어요.',
      '재진: 재진수에서 물리치료내원을 빼니 0보다 작아요.',
    ])
    expect(text(unread.lastElementChild)).toBe(
      '의사랑 통계 표의 칸 설정이 바뀌었을 수 있어요. 비워 둔 칸은 직접 넣거나, 그 칸이 보이게 한 뒤 엑셀을 다시 저장하고 다시 눌러 주세요.',
    )
    expect(kids(children[4])).toEqual(UNPICKED)
  })

  it("AC-4212.4: ⑤ 맞춰 보기 어긋남 — 주황 경고는 의사랑에 없어 비워 둔 칸 뒤, 뒤 줄 '채우기는 했어요. …' 다음 예약 참고 · 끝 줄", () => {
    const day = uisDay(
      {},
      {
        checks: {
          totalFee: [5_182_300, 5_179_300],
          received: [1_741_100, 1_729_100],
          headcount: [97, 97],
          rxTotal: null,
          visitRows: [96, 97],
          visitNew: null,
          rsvRows: null,
          rsvVisited: null,
          noDate: false,
        },
      },
    )
    const d = draw(doneView(day))
    const children = [...d.body.children]
    expect(children.map((c) => c.className)).toEqual(['check', 'lead', 'kept', 'blk', 'blk', 'warns', 'small', '', 'end'])
    expect([...children[5].querySelectorAll('li')].map(text)).toEqual([
      '총진료비(5,182,300원)가 급여총액 + 비급여(5,179,300원)와 달라요.',
      '진료수납액(1,741,100원)이 현금 + 카드(1,729,100원)와 달라요.',
      '내원일별환자현황 아래쪽 표 환자 수(96명)가 인원수(97명)와 달라요. 연령별 표가 1명 모자랄 수 있어요.',
    ])
    expect(d.lines[6]).toBe('채우기는 했어요. 의사랑 화면과 견주어 확인해 주세요.')
    expect(d.lines.slice(7)).toEqual([RSV, END])
  })

  it("AC-4212.4: ⑧ 있는 엑셀로 채움 — 지움 · 앞서 읽음 · 종류 모름 · 남김 · 못 지움(빨강) 줄, '엑셀이 없어 비워 둔 칸 {N}칸'과 보고서마다 까닭", () => {
    const day = uisDay(
      { income: { cached: true }, rsvPatients: { state: 'missing', from: null, to: null } },
      { folder: 'profile', deleted: 6, unknownFiles: 1, kept: 1, deleteFailed: 1, reservations: null },
    )
    const d = draw(doneView(day))
    const children = [...d.body.children]
    expect(children.map((c) => c.className)).toEqual(['check', 'lead', 'kept', 'kept', 'kept', 'kept', 'bad', 'blk', 'blk', 'blk', 'end'])
    expect(d.lines.slice(1, 7)).toEqual([
      '2026-11-23 의사랑 값으로 44칸을 채웠어요. 저장은 하지 않았어요.',
      '읽은 엑셀 5개는 이 PC에서 지웠어요.',
      '앞서 읽어 둔 엑셀 1개 값도 함께 썼어요.',
      '의사랑 통계 엑셀이 아닌 엑셀 1개도 지웠어요.',
      '날짜가 다른 엑셀 1개는 지우지 않고 두었어요.',
      '지우지 못한 엑셀이 1개 있어요. 사용자 폴더 › ERP마감 폴더에서 직접 지워 주세요.',
    ])
    expect(kids(children[7])).toEqual([
      '엑셀이 없어 비워 둔 칸 1칸',
      '예약 실예약환자수',
      '예약환자통계 아래쪽 표가 없어 비워 두었어요. 직접 넣어 주세요.',
    ])
    expect(kids(children[8])).toEqual(UNPICKED)
    expect(kids(children[9])).toEqual(NONE)
  })

  it('AC-4212.4: 엑셀이 없는 보고서가 둘이면 보고서마다 까닭 줄 하나(UIS_KINDS 차례), 맞춰 볼 숫자는 null인 줄을 뺀다', () => {
    const day = uisDay({ visits: { state: 'missing' }, visitPatients: { state: 'missing' }, rsvPatients: { state: 'missing' } })
    day.patients.new = null
    day.patients.total = null
    const d = draw(doneView(day))
    expect(kids(d.child('check')[0])).toEqual([CHECK[0], CHECK[1], CHECK[2], CHECK[4]])
    const absent = d.child('blk')[0]
    expect(text(absent.querySelector('.h'))).toBe('엑셀이 없어 비워 둔 칸 24칸')
    expect([...absent.querySelectorAll('.small')].map(text)).toEqual([
      '내원일별환자현황 아래쪽 표가 없어 비워 두었어요. 직접 넣어 주세요.',
      '예약환자통계 아래쪽 표가 없어 비워 두었어요. 직접 넣어 주세요.',
    ])
  })

  it('AC-4212.4: 맞춰 볼 숫자가 하나도 없으면 그 상자를 그리지 않는다', () => {
    const day = uisDay({ income: { state: 'missing' }, visits: { state: 'missing' }, visitPatients: { state: 'missing' } })
    day.money.total = null
    day.money.received = null
    day.patients.total = null
    expect(draw(doneView(day)).child('check')).toHaveLength(0)
  })

  it("AC-4212.4: 건너뛴 칸은 고르지 않음 → 이름 빈 기타 줄 → 찾지 못함 → 치료사별 → 읽기 전용(지금 글 그대로), [빈 칸만]으로 둔 칸은 채움 줄 바로 다음", () => {
    const a: Where = { j: 1, box: '환자현황', row: '신환' }
    const b: Where = { j: 2, field: '도수 총금액' }
    const c: Where = { j: 1, box: '외래 수입', row: '비급여' }
    const e: Where = { j: 2, card: '치료별 매출', row: '기타2', col: '금액(원)' }
    const view = doneView(uisDay(), {
      result: {
        kept: 3,
        skipped: [
          { where: a, skip: 'notFound' },
          { where: b, skip: 'therapist' },
          { where: c, skip: 'locked' },
        ],
        noName: [e],
      },
    })
    const d = draw(view)
    expect(d.lines[2]).toBe('이미 적힌 3칸은 그대로 두었어요.')
    expect(d.child('blk').map((blk) => text(blk.querySelector('.h')))).toEqual([
      '고르지 않아 건너뛴 칸 11칸',
      'ERP 줄 이름이 빈 기타 줄 1칸',
      '화면에서 찾지 못한 칸 1칸',
      '치료사별 입력 줄 1칸',
      '읽기 전용 칸 1칸',
      '의사랑에 없어 비워 둔 칸 75칸',
    ])
    expect(kids(d.child('blk')[2])).toEqual(['화면에서 찾지 못한 칸 1칸', '환자현황 신환', 'ERP 화면에서 찾지 못해 그대로 둔 칸이에요. 직접 넣어 주세요.'])
  })

  it('AC-4212.4: 맞춰 보기 경고는 design.md 6-2 차례 아홉 + 조회일 없음 · 나이 못 셈 줄이고, 예약 참고가 없으면 그 줄을 뺀다', () => {
    const day = uisDay(
      {},
      {
        checks: {
          totalFee: [10, 9],
          received: [10, 9],
          headcount: [10, 9],
          rxTotal: [100, 90],
          visitRows: [12, 10],
          visitNew: [3, 4],
          rsvRows: [5, 6],
          rsvVisited: [7, 8],
          noDate: true,
        },
        reservations: null,
      },
    )
    day.warnings.unknownAge = 2
    const d = draw(doneView(day))
    expect([...(d.child('warns')[0]?.querySelectorAll('li') ?? [])].map(text)).toEqual([
      '총진료비(10원)가 급여총액 + 비급여(9원)와 달라요.',
      '진료수납액(10원)이 현금 + 카드(9원)와 달라요.',
      '인원계(10명)가 초진 + 재진(9명)과 달라요.',
      '기간별처방통계 코드 줄 총액 합(90원)이 합계 줄(100원)과 달라요.',
      '내원일별환자현황 아래쪽 표 환자 수(12명)가 인원수(10명)와 달라요. 연령별 표가 2명 많을 수 있어요.',
      '내원일별환자현황 아래쪽 표 신규(3명)가 위쪽 표 신규환자(4명)와 달라요.',
      '예약환자통계 아래쪽 표 예약(5건)이 위쪽 표 예약건수(6건)와 달라요.',
      '예약환자통계 아래쪽 표 방문(7건)이 위쪽 표 이행건수(8건)와 달라요.',
      '내원일별환자현황 아래쪽 표에서 조회일을 찾지 못했어요. 그날 줄을 누르고 저장했는지 확인해 주세요.',
      '주민번호로 나이를 셀 수 없는 환자 2명은 연령별 표에 넣지 않았어요.',
    ])
    expect(d.lines).not.toContain(RSV)
    expect(d.lines.slice(-2)).toEqual(['채우기는 했어요. 의사랑 화면과 견주어 확인해 주세요.', END])
  })
})

const FILE_ROWS = [
  '1. 일일수입통계',
  '2. 기간별처방통계',
  '3. 내원일별환자현황 위쪽 표',
  '4. 내원일별환자현황 아래쪽 표',
  '5. 예약환자통계 위쪽 표',
  '6. 예약환자통계 아래쪽 표',
]
const filesRows = (d: ReturnType<typeof draw>) => [...(d.child('files')[0]?.querySelectorAll('li') ?? [])].map(kids)
const HOW = "조회일은 2026-11-23 하루, 외/입 구분은 '전체'로 두고 [검색]한 뒤 표 오른쪽 위 초록 엑셀 단추로 저장해 주세요."

describe('AC-4212.3 엑셀 없음 ⑥ · 일부 없음 ⑦(design.md 10-1)', () => {
  const allMissing = () =>
    uisDay(Object.fromEntries(UIS_KINDS.map((k) => [k, { state: 'missing', from: null, to: null }])), { deleted: 0, reservations: null })

  it("AC-4212.3: ⑥ 쓸 수 있는 보고서가 없으면 '아래 보고서 6개' · 저장할 엑셀 6줄(모두 없음) · 위쪽 표 안내 · 저장법 · 저장할 곳 · 환자별 표 · 아무 칸도 · [설정 열기]", () => {
    const d = draw(stopView(allMissing()))
    expect(d.head).toBe('의사랑 값 채우기')
    expect(d.lines[0]).toBe('의사랑 통계에서 아래 보고서 6개를 엑셀로 저장해 주세요.')
    expect(text(d.child('files')[0].querySelector('.h'))).toBe('저장할 엑셀')
    expect(filesRows(d)).toEqual(FILE_ROWS.map((row) => [row, '없음']))
    expect(d.lines.slice(2)).toEqual([
      '3 · 5번(위쪽 표)은 없어도 채울 수 있어요. 있으면 아래쪽 표와 숫자를 한 번 더 맞춰 봐요.',
      HOW,
      WHERE_DESKTOP,
      '4 · 6번은 환자별 표예요. ERP 도우미가 이 PC 안에서만 읽고 바로 지워요.',
      UNTOUCHED,
    ])
    expect(d.labels).toEqual(['설정 열기'])
    d.press('설정 열기')
    expect(d.act).toHaveBeenCalledWith('settings')
    // 없음은 빨강
    expect([...d.child('files')[0].querySelectorAll('.st')].every((s) => s.className === 'st bad')).toBe(true)
  })

  it("AC-4212.3: ⑦ 꼭 4개 가운데 하나 없음 — '{보고서}를 엑셀로 저장해 주세요.' · 있음/있음 (앞서 읽음)/없음 · [안내 닫기] [엑셀로 받기] [있는 엑셀로 채우기]", () => {
    const day = uisDay({ income: { cached: true }, rsvPatients: { state: 'missing', from: null, to: null } }, { deleted: 4 })
    const d = draw(stopView(day))
    expect(d.lines[0]).toBe('의사랑 통계에서 예약환자통계 아래쪽 표를 엑셀로 저장해 주세요.')
    expect(filesRows(d)).toEqual([
      [FILE_ROWS[0], '있음 (앞서 읽음)'],
      [FILE_ROWS[1], '있음'],
      [FILE_ROWS[2], '있음'],
      [FILE_ROWS[3], '있음'],
      [FILE_ROWS[4], '있음'],
      [FILE_ROWS[5], '없음'],
    ])
    expect([...d.child('files')[0].querySelectorAll('.st')].map((s) => s.className)).toEqual([
      'st ok',
      'st ok',
      'st ok',
      'st ok',
      'st ok',
      'st bad',
    ])
    expect(d.lines.slice(2)).toEqual([
      HOW,
      WHERE_DESKTOP,
      '아무 칸도 바꾸지 않았어요. 저장한 뒤 [의사랑 값 채우기]를 다시 눌러 주세요. [있는 엑셀로 채우기]를 누르면 없는 엑셀의 칸만 비우고 채워요.',
    ])
    expect(d.labels).toEqual(['안내 닫기', '엑셀로 받기', '있는 엑셀로 채우기'])
    d.press('안내 닫기')
    d.press('엑셀로 받기')
    d.press('있는 엑셀로 채우기')
    expect(d.act.mock.calls.map((c) => c[0])).toEqual(['close', 'export', 'fillAnyway'])
  })

  it("AC-4212.3: ⑦ 여럿 없으면 '아래 보고서 {N}개', 위쪽 표만 없는 것은 줄에 '없음'으로만 보인다", () => {
    const day = uisDay({ income: { state: 'missing' }, visits: { state: 'missing' }, rsvPatients: { state: 'missing' } })
    const stop = stopOf(day) as UisStop
    expect(stop).toEqual({ kind: 'some', missing: ['income', 'rsvPatients'] })
    const d = draw(stopView(day))
    expect(d.lines[0]).toBe('의사랑 통계에서 아래 보고서 2개를 엑셀로 저장해 주세요.')
    expect(filesRows(d).map((r) => r[1])).toEqual(['없음', '있음', '없음', '있음', '있음', '없음'])
  })

  it("AC-4212.3: 저장할 곳은 답의 폴더로 '사용자 폴더 › ERP마감 폴더'가 된다", () => {
    const day = allMissing()
    day.uis.folder = 'profile'
    expect(draw(stopView(day)).lines).toContain('저장할 곳: 사용자 폴더 › ERP마감 폴더')
  })
})

describe('AC-4212.2 날짜 다름 ⑨ · 조건 ⑩ · 같은 엑셀 둘 ⑪(design.md 10-1, 11절 4·15)', () => {
  it("AC-4212.2: ⑨ '엑셀 날짜가 마감 일자와 달라요.' · '마감 일자 {날짜}' / '엑셀 조회일' · 파일이 있는 보고서마다 조회일(다르면 빨강, 없으면 '찾지 못함') · 다시 저장 · 남김 · 환자별 지움", () => {
    const day = uisDay(
      {
        income: { state: 'otherDate', from: '2026-11-22', to: '2026-11-22' },
        rx: { state: 'otherDate', from: '2026-11-01', to: '2026-11-22' },
        visitPatients: { state: 'otherDate', from: null, to: null },
        rsv: { state: 'missing', from: null, to: null },
      },
      { kept: 2, deleted: 1 },
    )
    const d = draw(stopView(day))
    expect(d.head).toBe('의사랑 값 채우기')
    expect(d.lines[0]).toBe('엑셀 날짜가 마감 일자와 달라요.')
    const files = d.child('files')[0]
    expect(kids(files.querySelector('.h'))).toEqual(['마감 일자 2026-11-23', '엑셀 조회일'])
    expect(filesRows(d)).toEqual([
      ['일일수입통계', '2026-11-22'],
      ['기간별처방통계', '2026-11-01 ~ 2026-11-22'],
      ['내원일별환자현황 위쪽 표', '2026-11-23'],
      ['내원일별환자현황 아래쪽 표', '찾지 못함'],
      ['예약환자통계 아래쪽 표', '2026-11-23'],
    ])
    expect([...files.querySelectorAll('.st')].map((s) => s.className)).toEqual(['st bad', 'st bad', 'st', 'st bad', 'st'])
    expect(d.lines.slice(2)).toEqual([
      '날짜가 다른 엑셀 3개를 조회일 2026-11-23으로 다시 [검색]해 저장한 뒤 다시 눌러 주세요.',
      '아무 칸도 바꾸지 않았어요. 날짜가 다른 합계 엑셀은 지우지 않고 그대로 두었어요.',
      '환자별 엑셀(4 · 6번)은 날짜가 달라도 읽은 뒤 바로 지웠어요.',
    ])
    expect(d.labels).toEqual([])
  })

  it('AC-4212.2: ⑨ 환자별 엑셀이 날짜 다름이 아니면 환자별 지움 줄이 없다', () => {
    const day = uisDay({ income: { state: 'otherDate', from: '2026-11-22', to: '2026-11-22' } })
    const d = draw(stopView(day))
    expect(d.lines.slice(2)).toEqual([
      '날짜가 다른 엑셀 1개를 조회일 2026-11-23으로 다시 [검색]해 저장한 뒤 다시 눌러 주세요.',
      '아무 칸도 바꾸지 않았어요. 날짜가 다른 합계 엑셀은 지우지 않고 그대로 두었어요.',
    ])
  })

  it("AC-4212.2 AC-4212.7: ⑩ \"{보고서} 엑셀의 외/입 구분이 '{값}'예요.\"(라벨 이름 없이 늘 이 글) · '전체'로 바꿔 다시 저장 · 아무 칸도, 단추 없음", () => {
    const d = draw(stopView(uisDay({ rx: { state: 'notAll', value: '외래' } })))
    expect(d.lines).toEqual([
      "기간별처방통계 엑셀의 외/입 구분이 '외래'예요.",
      "의사랑 통계에서 외/입 구분을 '전체'로 바꿔 [검색]한 뒤 다시 엑셀로 저장해 주세요.",
      UNTOUCHED,
    ])
    expect(d.child('lead')).toHaveLength(1)
    expect(d.labels).toEqual([])
  })

  it("AC-4212.2 AC-4212.7: ⑪ '{보고서} 엑셀이 여러 개 있어요.'(수 없이) · '{폴더}에서 하나만 남기고…' · '어느 것이 맞는지 몰라…', 환자별이면 '모두 지웠어요' 줄을 더한다", () => {
    const sum = draw(stopView(uisDay({ income: { state: 'twice' } })))
    expect(sum.lines).toEqual([
      '일일수입통계 엑셀이 여러 개 있어요.',
      '바탕화면 › ERP마감 폴더에서 하나만 남기고 지운 뒤 다시 눌러 주세요.',
      '어느 것이 맞는지 몰라 아무 칸도 바꾸지 않았어요.',
    ])
    expect(sum.labels).toEqual([])
    const patient = draw(stopView(uisDay({ visitPatients: { state: 'twice' } })))
    expect(patient.lines).toEqual([
      '내원일별환자현황 아래쪽 표 엑셀이 여러 개 있어요.',
      '바탕화면 › ERP마감 폴더에서 하나만 남기고 지운 뒤 다시 눌러 주세요.',
      '어느 것이 맞는지 몰라 아무 칸도 바꾸지 않았어요.',
      '환자별 엑셀은 모두 지웠어요. 하나만 다시 저장해 주세요.',
    ])
    // 답에 파일 수 칸이 없어 수를 말하지 않는다(design.md 10-1 ⑪, 고침 1)
    for (const line of [...sum.lines, ...patient.lines]) expect(line).not.toMatch(/\d개|둘/)
  })

  it('AC-4212.2: 멈춤 판정 차례는 날짜 다름 → 조건 → 같은 엑셀 둘(첫 갈래 안내만 그린다)', () => {
    const all = uisDay({ income: { state: 'twice' }, rx: { state: 'notAll', value: '외래' }, rsv: { state: 'otherDate', from: '2026-11-22' } })
    expect(draw(stopView(all)).lines[0]).toBe('엑셀 날짜가 마감 일자와 달라요.')
    const two = uisDay({ income: { state: 'twice' }, rx: { state: 'notAll', value: '입원' } })
    expect(draw(stopView(two)).lines[0]).toBe("기간별처방통계 엑셀의 외/입 구분이 '입원'예요.")
  })

  it('AC-4212.2: 조건 값·보고서 글은 textContent로만 들어간다(HTML로 읽지 않는다)', () => {
    const d = draw(stopView(uisDay({ income: { state: 'notAll', value: '<img src=x onerror=alert(1)>' } })))
    expect(d.body.querySelector('img')).toBeNull()
    expect(d.lines[0]).toBe("일일수입통계 엑셀의 외/입 구분이 '<img src=x onerror=alert(1)>'예요.")
  })

  it('AC-4212.2: 지우지 못한 엑셀이 있으면 멈춤 안내 끝에 빨강 줄을 더한다', () => {
    const d = draw(stopView(uisDay({ income: { state: 'twice' } }, { deleteFailed: 2 })))
    expect(d.lines.at(-1)).toBe('지우지 못한 엑셀이 2개 있어요. 바탕화면 › ERP마감 폴더에서 직접 지워 주세요.')
    expect(d.body.lastElementChild?.className).toBe('bad')
  })
})

describe('AC-4212.1 한셀에 열림 ⑫(design.md 10-1)', () => {
  it("AC-4212.1: 열린 엑셀이 있으면 다른 판정보다 먼저 ⑫ — 빨간 머리 줄 · '{보고서}가 한셀에 열려 있어요. …' · 까닭 · 번호 E-UIS-FILE-OPEN, 단추 없음", () => {
    const day = uisDay({ income: { state: 'otherDate', from: '2026-11-22' }, rx: { state: 'twice' } }, { open: ['visitPatients'] })
    const d = draw(stopView(day))
    expect(d.head).toBe('의사랑 값 채우기')
    expect(d.lines).toEqual([
      '한셀에 열려 있는 엑셀이 있어 읽지 못했어요.',
      '내원일별환자현황 아래쪽 표가 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.',
      '환자별 엑셀은 읽은 뒤 바로 지워야 해서, 열려 있으면 읽지 않아요.',
      '아무 칸도 바꾸지 않았어요. (번호 E-UIS-FILE-OPEN)',
    ])
    expect(d.body.firstElementChild?.className).toBe('lead err')
    expect(d.labels).toEqual([])
  })

  it("AC-4212.1: 보고서를 모르면 'ERP마감 폴더의 엑셀이 …', 여럿이면 이름을 ' · '로 잇는다(같은 보고서는 한 번, UIS_KINDS 차례)", () => {
    expect(draw(stopView(uisDay({}, { open: ['unknown'] }))).lines[1]).toBe(
      'ERP마감 폴더의 엑셀이 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.',
    )
    expect(draw(stopView(uisDay({}, { open: ['rx', 'unknown', 'income', 'rx'] }))).lines[1]).toBe(
      '일일수입통계 · 기간별처방통계가 한셀에 열려 있어요. 한셀 창을 닫은 뒤 다시 눌러 주세요.',
    )
  })
})

describe('AC-4213.3 [엑셀로 받기]가 보이는 곳(③⑦ 10-3)과 없는 곳(멈춤 안내)', () => {
  it("AC-4213.3: 단추 줄 [엑셀로 받기]로 멈추면 머리는 '엑셀로 받기'이고 ⑥⑨⑩⑪⑫ 안내에는 [엑셀로 받기]가 없다", () => {
    const stops: UisDay[] = [
      uisDay(Object.fromEntries(UIS_KINDS.map((k) => [k, { state: 'missing' }]))),
      uisDay({ income: { state: 'otherDate', from: '2026-11-22' } }),
      uisDay({ rx: { state: 'notAll', value: '외래' } }),
      uisDay({ income: { state: 'twice' } }),
      uisDay({}, { open: ['income'] }),
    ]
    for (const day of stops) {
      const d = draw(stopView(day, 'export'))
      expect(d.head).toBe('엑셀로 받기')
      expect(d.labels).not.toContain('엑셀로 받기')
      expect(text(d.body)).not.toContain('[엑셀로 받기]')
    }
  })

  it('AC-4213.3: 결과 안내 ③와 일부 없음 ⑦에는 [엑셀로 받기]가 있고 누르면 export', () => {
    expect(draw(doneView(uisDay())).labels).toContain('엑셀로 받기')
    const some = draw(stopView(uisDay({ rx: { state: 'missing' } })))
    expect(some.labels).toContain('엑셀로 받기')
    some.press('엑셀로 받기')
    expect(some.act).toHaveBeenCalledWith('export')
  })

  it("AC-4213.3: 10-3 받았어요 안내 — 머리 '엑셀로 받기' · 받은 줄 · 파일 이름 · 지움 줄들 · 빈 칸 까닭, [닫기] [의사랑 값 채우기]", () => {
    const day = uisDay({ income: { cached: true } }, { deleted: 6, unknownFiles: 1, kept: 1, deleteFailed: 1 })
    const d = draw({ kind: 'exported', day, fileName: 'ERP마감-의사랑-2026-11-23.xlsx' })
    expect(d.head).toBe('엑셀로 받기')
    expect(d.lines).toEqual([
      '2026-11-23 의사랑 값을 엑셀 파일로 받았어요. ERP 칸은 바꾸지 않았어요.',
      '파일 이름: ERP마감-의사랑-2026-11-23.xlsx(크롬 다운로드 폴더)',
      '읽은 엑셀 5개는 이 PC에서 지웠어요.',
      '앞서 읽어 둔 엑셀 1개 값도 함께 썼어요.',
      '의사랑 통계 엑셀이 아닌 엑셀 1개도 지웠어요.',
      '날짜가 다른 엑셀 1개는 지우지 않고 두었어요.',
      '지우지 못한 엑셀이 1개 있어요. 바탕화면 › ERP마감 폴더에서 직접 지워 주세요.',
      "빈 칸은 끝 열 '빈 칸 까닭'을 보고 직접 넣어 주세요.",
    ])
    expect(d.body.firstElementChild?.className).toBe('lead')
    expect(d.labels).toEqual(['닫기', '의사랑 값 채우기'])
    d.press('닫기')
    d.press('의사랑 값 채우기')
    expect(d.act.mock.calls.map((c) => c[0])).toEqual(['close', 'fill'])
  })

  it('AC-4213.3: 받았어요 안내도 지운 엑셀이 없으면 지움 줄을 뺀다', () => {
    const d = draw({ kind: 'exported', day: uisDay({}, { deleted: 0 }), fileName: 'ERP마감-의사랑-2026-11-23.xlsx' })
    expect(d.lines).toHaveLength(3)
  })
})

describe('AC-4212.5 기간 채우기 ⑬ · 설정 저장 전 ⑭ · 오류', () => {
  it("AC-4212.5: ⑬ 머리 '기간 채우기' · '하루씩만' · 까닭과 할 일 · 아무 칸도, [닫기]만(기간 고르기 칸 없음)", () => {
    const d = draw({ kind: 'range' })
    expect(d.head).toBe('기간 채우기')
    expect(d.lines).toEqual([
      '의사랑 자료로는 하루씩만 채울 수 있어요.',
      '의사랑 일일수입통계가 하루씩만 나와서예요. 날마다 그날 엑셀 6개를 저장하고 [의사랑 값 채우기]를 눌러 주세요.',
      UNTOUCHED,
    ])
    expect(d.body.querySelectorAll('input, select')).toHaveLength(0)
    expect(d.labels).toEqual(['닫기'])
    d.press('닫기')
    expect(d.act).toHaveBeenCalledWith('close')
  })

  it("AC-4212.5: ⑭ '처음 한 번 설정 화면에서 코드를 고르고 [저장]을 눌러 주세요.' · 지금 뒤 줄 · [설정 열기]", () => {
    const d = draw({ kind: 'first' })
    expect(d.head).toBe('의사랑 값 채우기')
    expect(d.lines).toEqual(['처음 한 번 설정 화면에서 코드를 고르고 [저장]을 눌러 주세요.', '설정 화면을 새 탭으로 열었어요. 아무 칸도 바꾸지 않았어요.'])
    expect(d.labels).toEqual(['설정 열기'])
    d.press('설정 열기')
    expect(d.act).toHaveBeenCalledWith('settings')
  })

  it('AC-4212.5: 오류는 의사랑 오류 글(explainFor) · 번호 줄이고, 번호 꼴이 아닌 글은 E-BRIDGE-BAD-REPLY로 본다', () => {
    const folder = draw({ kind: 'err', code: 'E-UIS-FOLDER' })
    expect(folder.head).toBe('의사랑 값 채우기')
    expect(folder.lines).toEqual([
      'ERP마감 폴더를 만들거나 열지 못했어요.',
      'ERP 도우미 설치 파일(install.cmd)을 다시 실행해 주세요. 계속되면 이 번호를 알려 주세요.',
      '아무 칸도 바꾸지 않았어요. (번호 E-UIS-FOLDER)',
    ])
    expect(folder.body.firstElementChild?.className).toBe('lead err')
    expect(folder.labels).toEqual([])
    expect(draw({ kind: 'err', code: 'E-UIS-SOMETHING' }).lines[0]).toBe('의사랑 엑셀을 읽지 못했어요.')
    const bad = draw({ kind: 'err', code: '<b>E</b>' })
    expect(bad.body.querySelector('b')).toBeNull()
    expect(bad.lines[2]).toBe('아무 칸도 바꾸지 않았어요. (번호 E-BRIDGE-BAD-REPLY)')
  })
})
