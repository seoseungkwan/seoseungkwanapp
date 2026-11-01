import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { addDays, compareYmd } from '../../src/lib/analytics/dates'
import type { ClaimMonthJson, GridRow, HistoryRow, HospitalCatalog } from '../../src/types/precheck'

// 청구 사전점검 **가짜** 한 달 자료 생성기(REQ-009). 도우미 claim.month JSON(helper Claim/ClaimMonthPayload)과 같은 모양을 만든다.
// 실제 환자 자료는 한 글자도 쓰지 않는다: 이름 '가상환자NN', 차트번호 9로 시작하는 6자리. 원본 tests/test_claim_precheck.py의
// 가짜 사례 v1~v18(내원번호 그대로)을 옮기고, 달을 넘기는 기간(10/30~11/2) 사례를 더했다.
// 뒤 TASK(10·11·14·16·24)는 FAKE_CLAIM_CASES에 이름 붙인 사례를 더한다. 다시 만들기: npx tsx fixtures/precheck/make-fake-claims.ts

export const FAKE_SEED = 20261030
/** 가짜 '오늘'(상병 추세 기간의 끝). 현재 시각을 쓰지 않는다 */
const TODAY = '2026-11-03'

type Role = true | false | 'x'
/** [처방코드, 처방명칭, 수량(표에 적힌 글자 그대로), 급여구분(기본 급여)] */
type FakeRx = [code: string, name: string, qty: string, pay?: string]
type FakeVisit = {
  id: string // 내원번호
  chart: number // 차트번호 9xxxxx의 뒤 번호(가상환자NN의 NN)
  date: string // YYYY-MM-DD
  lines: string[] // 증상 줄. 비면 증상 칸이 빈 줄 하나(원본 build처럼 진료가 되지 않는다)
  joined?: boolean // 증상을 한 칸에 줄바꿈으로 붙여 넣는다(아니면 줄마다 한 줄)
  rx: FakeRx[]
  dx: [code: string, role: Role][]
  memo?: string // 비트에 이미 있는 청구메모(이력의 m)
}
/** 기간 전의 이력(같은 날 두 내원처럼 일부러 넣는 것) */
type FakePast = { id: string; chart: number; date: string; codes: string[]; memo: string }
type FakeMonth = {
  from: string
  to: string
  visits: FakeVisit[]
  past: FakePast[]
  trend?: ClaimMonthJson['dxTrend']
  fill?: false // false면 씨앗으로 이력을 채우지 않는다(규칙 사례가 뜻대로 걸리게)
  codes?: [code: string, name: string, kind: HospitalCatalog['codes'][number]['kind'], standardCode: string][] // 병원 처방 목록에 더할 코드
}

export type FakeClaimCase = { name: string; file: string; note: string; month: FakeMonth }

// ── 사례 ────────────────────────────────────────────────

const MBB: FakeRx[] = [['LA358', '후지내측지', '1.5'], ['A21', '트리암주', '1']]
const KNEE_IA: FakeRx[] = [['KK090', '관절강내주사', '1'], ['A21', '트리암주', '1']]
const MANUAL: FakeRx[] = [['KR006', '도수치료', '1']]

/** 원본 test_claim_precheck.py add(id, chart, date, lines, rx, dx) 그대로(차트번호 n → 9000nn, 날짜 → YYYY-MM-DD) */
const ORIGINAL_V1_V18: FakeVisit[] = [
  { id: 'v1', chart: 1, date: '2026-10-05', lines: ['MBB L4,5 both', 'LBP'], rx: [['LA358', '후지내측지', '2.5'], ['LA357', '척추부신경', '1.0'], ['A21', '트리암주', '1']], dx: [['M5456', true]] },
  { id: 'v2', chart: 2, date: '2026-10-05', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사', '1'], ['A15', '리도카인주', '1']], dx: [['M1706', true]] },
  { id: 'v3', chart: 3, date: '2026-10-05', lines: ['Rt elbow'], rx: [['KK061', '신경간내주사', '1'], ['A15', '리도카인주', '1']], dx: [['M7710', true]] },
  { id: 'v4', chart: 4, date: '2026-10-05', lines: ['Rt knee IA', 'S) knee pain'], joined: true, rx: [['MM010', '표층열', '1'], ['KK090', '관절강내주사', '1'], ['A21', '트리암주', '1']], dx: [['M1706', true]] },
  { id: 'v5', chart: 5, date: '2026-10-05', lines: ['S) LBP'], rx: [['MM010', '표층열', '1'], ['MM020', '심층열', '1']], dx: [['M5456', true]] },
  { id: 'v6', chart: 6, date: '2026-10-05', lines: ['Rt knee 아라간 1차'], rx: [['KK090', '관절강내주사', '1'], ['A49', '아라간플러스주', '1']], dx: [['M545', true]] },
  { id: 'v7', chart: 7, date: '2026-10-05', lines: ['both hands pain'], rx: [['G6502', '수지 2매', '1']], dx: [['M7964', true]] },
  { id: 'v7b', chart: 7, date: '2026-10-06', lines: ['both hands 각각 촬영'], rx: [['G6502', '수지 2매', '1']], dx: [['M7964', true]] },
  { id: 'v8', chart: 8, date: '2026-10-05', lines: ['물리치료만'], rx: [['AA254', '재진', '1'], ['MM010', '표층열', '1']], dx: [['M5456', true]], memo: '물리치료 메모(가상)' },
  { id: 'v9', chart: 9, date: '2026-10-01', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
  { id: 'v10', chart: 9, date: '2026-10-05', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
  { id: 'v11', chart: 10, date: '2026-10-05', lines: ['도수'], rx: MANUAL, dx: [['M5456', true]] },
  { id: 'v12', chart: 10, date: '2026-10-06', lines: ['도수'], rx: MANUAL, dx: [['M5456', true]] },
  { id: 'v13', chart: 10, date: '2026-10-07', lines: ['도수'], rx: MANUAL, dx: [['M5456', true]] },
  { id: 'v14', chart: 11, date: '2026-10-05', lines: ['Rt shoulder', 'S) pain'], rx: [['MM410', '수압팽창술', '1'], ['A21', '트리암주', '1']], dx: [['M750', true]] },
  { id: 'v15', chart: 12, date: '2026-10-05', lines: ['S) knee pain'], rx: [['X1', '가상진통정', '1'], ['Y2', '가상소염캡슐', '1']], dx: [['M1706', true]] },
  { id: 'v16', chart: 13, date: '2026-10-05', lines: ['S) knee pain'], rx: KNEE_IA, dx: [['M5456', true], ['M1706', 'x']] },
  { id: 'v16b', chart: 16, date: '2026-10-05', lines: ['S) knee pain'], rx: KNEE_IA, dx: [['M1706', false]] },
  { id: 'v17', chart: 14, date: '2026-10-05', lines: [], rx: [['MM010', '표층열', '1']], dx: [] },
  { id: 'v18', chart: 15, date: '2026-10-05', lines: ['S) LBP L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
]

// 추천 상병·상병 확인 사례(TASK-11). 원본 tests/test_claim_dx_recommend.py의 가짜 사례를 옮겼다. 처방 이름·상병 이름은 가상
const HA_NAME = '가상플러스주(히알루론산나트륨)(프리필드시린지)_(20mg/2mL)'
const DX_HA: FakeRx = ['A49', HA_NAME, '1']
const DX_G6604: FakeRx = ['G6604', '수근골4매', '1']
const DX_AA17: FakeRx = ['AA17', '가상에페리손정', '10']
const DX_LA358: FakeRx = ['LA358', '후지내측지', '1']
const DX_MM410: FakeRx = ['MM410', '수압팽창술', '1']
const DX_MM010: FakeRx = ['MM010', '표층열', '1']
const DX_DAY = '2026-10-12'

const DX_CHECK_CASE: FakeClaimCase = {
  name: 'dx-check',
  file: 'claim-month-dx-check.json',
  note: '추천 상병·상병 확인(REQ-011): 고시·연결표·경향 통과와 걸림, 비급여, 상병 없는 진료, 흔한 상병. d18~d21·d25는 I·N 표에 드는 코드라도 상병 확인 결과가 원본과 같은지 본다',
  month: {
    from: DX_DAY,
    to: '2026-10-16',
    past: [],
    visits: [
      { id: 'd01', chart: 31, date: DX_DAY, lines: ['S) knee pain'], rx: [DX_HA, ['AA254', '재진', '1'], ['X99', '비급여 히알루론산 주사', '1', '비급여']], dx: [['M5436', true], ['K219', false]] },
      { id: 'd02', chart: 32, date: DX_DAY, lines: ['S) knee pain'], rx: [DX_HA], dx: [['M5436', true], ['M1710', 'x']] },
      { id: 'd03', chart: 33, date: DX_DAY, lines: ['S) knee pain'], rx: [['X99', '비급여 히알루론산 주사', '1', '비급여']], dx: [['M5436', true]] },
      { id: 'd04', chart: 34, date: DX_DAY, lines: ['S) eye'], rx: [['Z1', '가상 히알루론산나트륨 점안액', '1']], dx: [['M5436', true]] },
      { id: 'd05', chart: 35, date: DX_DAY, lines: ['Rt shoulder'], rx: [DX_MM410], dx: [['M750', true]] },
      { id: 'd06', chart: 36, date: DX_DAY, lines: ['Rt shoulder'], rx: [DX_MM410], dx: [['S637', true]] },
      { id: 'd07', chart: 37, date: DX_DAY, lines: ['wrist'], rx: [DX_G6604], dx: [['S6350', true]] },
      { id: 'd08', chart: 38, date: DX_DAY, lines: ['wrist'], rx: [DX_G6604], dx: [['M1990', true]] },
      { id: 'd09', chart: 39, date: DX_DAY, lines: ['wrist'], rx: [DX_G6604], dx: [['S6399', true]] },
      { id: 'd10', chart: 40, date: DX_DAY, lines: ['neck'], rx: [DX_AA17], dx: [['M5422', true], ['K219', false]] },
      { id: 'd11', chart: 41, date: DX_DAY, lines: ['neck'], rx: [DX_AA17], dx: [['M5428', true]] },
      { id: 'd12', chart: 42, date: DX_DAY, lines: ['neck'], rx: [DX_AA17], dx: [['K219', true]] },
      { id: 'd13', chart: 43, date: '2026-10-13', lines: ['knee'], rx: [DX_HA], dx: [['M2556', true]] },
      { id: 'd14', chart: 44, date: '2026-10-13', lines: ['LBP'], rx: [DX_LA358], dx: [['S637', true]] },
      { id: 'd15', chart: 45, date: '2026-10-13', lines: ['LBP'], rx: [DX_LA358], dx: [['M5456', true]] },
      { id: 'd16', chart: 46, date: '2026-10-13', lines: ['RA check'], rx: [['D7813', 'RA factor', '1']], dx: [] },
      { id: 'd17', chart: 47, date: '2026-10-13', lines: ['도수'], rx: [['KR006', '도수치료', '1', '비급여']], dx: [] },
      { id: 'd18', chart: 48, date: '2026-10-14', lines: ['S) LBP'], rx: [DX_MM010], dx: [['M545', true], ['M17', false]] },
      { id: 'd19', chart: 49, date: '2026-10-14', lines: ['S) LBP'], rx: [DX_MM010], dx: [['B950', true], ['M5456', false]] },
      { id: 'd20', chart: 50, date: '2026-10-14', lines: ['S) LBP'], rx: [DX_MM010], dx: [['M5456', true], ['B950', false], ['V0100', 'x']] },
      { id: 'd21', chart: 51, date: '2026-10-14', lines: ['상담만'], rx: [], dx: [['M545', true], ['B950', false]] },
      { id: 'd22', chart: 52, date: '2026-10-15', lines: ['knee'], rx: [['a49', HA_NAME, '1'], ['A49', '가상플러스주 둘째 줄(히알루론산나트륨)', '1']], dx: [['S637', true]] },
      { id: 'd23', chart: 53, date: '2026-10-15', lines: ['wrist'], rx: [['G6604', '수근골 비급여', '1', '비급여'], DX_G6604], dx: [['M1990', true]] },
      { id: 'd24', chart: 54, date: '2026-10-15', lines: ['shoulder'], rx: [DX_MM410, DX_HA], dx: [['M750', true]] },
      { id: 'd25', chart: 55, date: '2026-10-16', lines: ['S) LBP'], rx: [DX_MM010], dx: [['V0100', true]] },
      { id: 'd26', chart: 56, date: '2026-10-16', lines: ['상담만'], rx: [], dx: [] },
      { id: 'd27', chart: 57, date: '2026-10-16', lines: ['LBP'], rx: [DX_LA358], dx: [['K219', true]] },
      { id: 'd28', chart: 58, date: '2026-10-16', lines: ['RA check'], rx: [['D7813', 'RA factor', '1']], dx: [['K219', true]] },
      { id: 'd29', chart: 59, date: '2026-10-16', lines: ['wrist'], rx: [DX_G6604], dx: [['S6410', true]] }, // 연결표 S6350과 앞 두 자리만 같다: 같은 질환군(앞 3자리)이 아니다
      { id: 'd30', chart: 60, date: '2026-10-16', lines: ['shoulder'], rx: [DX_MM410], dx: [['M751', true]] }, // 고시 M750은 앞 3자리가 같아도 인정하지 않는다. 추천에 M750이 남는다
      { id: 'd31', chart: 61, date: '2026-10-16', lines: ['knee'], rx: [DX_HA], dx: [['M2550', true]] }, // 연결표 M2556은 앞 3자리가 같으면 인정한다
      { id: 'd32', chart: 62, date: '2026-10-16', lines: ['eye'], rx: [['Z2', '가상 히알루론산 안약', '1']], dx: [['S637', true]] }, // d32~d36: 고시 히알루론산에서 빼는 말
      { id: 'd33', chart: 63, date: '2026-10-16', lines: ['skin'], rx: [['Z2', '가상 히알루론산 외용액', '1']], dx: [['S637', true]] },
      { id: 'd34', chart: 64, date: '2026-10-16', lines: ['skin'], rx: [['Z2', '가상 히알루론산 크림', '1']], dx: [['S637', true]] },
      { id: 'd35', chart: 65, date: '2026-10-16', lines: ['skin'], rx: [['Z2', '가상 히알루론산 연고', '1']], dx: [['S637', true]] },
      { id: 'd36', chart: 66, date: '2026-10-16', lines: ['skin'], rx: [['Z2', '가상 히알루론산 필러', '1']], dx: [['S637', true]] },
      { id: 'd37', chart: 67, date: '2026-10-16', lines: ['knee'], rx: [['A49', '가상 보통약', '1'], ['A49', '가상 히알루론산주', '1']], dx: [['S637', true]] }, // 규칙이 없던 첫 줄 뒤에 같은 코드의 규칙 있는 줄
      { id: 'd38', chart: 68, date: '2026-10-16', lines: [], rx: [], dx: [['M6601', true]] }, // 진료가 되지 않는 내원. M6601은 상병 표에만 있다(knownDiffs)
    ],
    trend: {
      visits: 1000,
      invalidRows: 0,
      truncated: 0,
      codes: [
        {
          c: 'A49',
          n: 200,
          d: [
            { c: 'M1700', nm: '양쪽 원발성 무릎관절증(가상)', m: 50, s: 10, x: 0, l: 500 },
            { c: 'M2556', nm: '관절통/ 아래다리(가상)', m: 5, s: 20, x: 0, l: 300 },
            { c: 'M750', nm: '유착성 관절낭염(가상)', m: 2, s: 2, x: 0, l: 200 },
          ],
        },
        {
          c: 'AA17',
          n: 300,
          d: [
            { c: 'K219', nm: '식도역류(가상)', m: 10, s: 90, x: 0, l: 110 },
            { c: 'M5422', nm: '경추통(가상)', m: 60, s: 10, x: 0, l: 400 },
            { c: 'M1990', nm: '관절증(가상)', m: 5, s: 40, x: 0, l: 300 },
          ],
        },
        {
          c: 'AB17',
          n: 100,
          d: [
            { c: 'K219', nm: '식도역류(가상)', m: 40, s: 10, x: 0, l: 100 },
            { c: 'M1990', nm: '관절증(가상)', m: 20, s: 5, x: 0, l: 400 },
          ],
        },
        {
          c: 'LA358',
          n: 300,
          d: [
            { c: 'M4806', nm: '척추협착/ 요추부(가상)', m: 100, s: 20, x: 1, l: 380 },
            { c: 'M5456', nm: '경향에 적힌 M5456 이름(가상)', m: 80, s: 5, x: 0, l: 149 },
            { c: 'S637', nm: '경계 150(가상)', m: 1, s: 0, x: 0, l: 150 },
          ],
        },
        { c: 'ZZ001', n: 0, d: [{ c: 'M1000', nm: '', m: 0, s: 0, x: 0, l: 200 }] },
        {
          c: 'ZZ002',
          n: 10,
          d: [
            { c: 'M3000', nm: '같은 수 뒤(가상)', m: 1, s: 1, x: 0, l: 200 },
            { c: 'M2000', nm: '같은 수 앞(가상)', m: 2, s: 0, x: 0, l: 200 },
            { c: 'K000', nm: '흔한 상병 많이 씀(가상)', m: 9, s: 0, x: 0, l: 100 },
          ],
        },
        { c: 'ZZ003', n: 1, d: [{ c: 'M6601', nm: '', m: 1, s: 0, x: 0, l: 200 }] },
      ],
      suggestions: [
        { c: 'LA358', n: 300, k: 967, miss: 10, g: [{ c: 'M54', nm: '요통/ 요천부(가상)', k: 700, x: 0 }, { c: 'M51', nm: '추간판(가상)', k: 967, x: 699 }] },
        { c: 'D7813', n: 40, k: 950, miss: 2, g: [{ c: 'M79', nm: '류마티스(가상)', k: 950, x: 700 }] },
      ],
    },
  },
}

// ── 규칙 사례(TASK-10 AC-010.2·AC-010.3) ─────────────────
// 진료 번호가 사례의 뜻이다: '규칙.hit'은 그 규칙이 걸리고 '규칙.miss'는 걸리지 않는다(뒤에 -설명). golden.test.ts가 원본 결과로 확인한다.
// 사례마다 환자가 따로다(한 환자를 이어 보는 것만 배열로 묶는다). 씨앗 이력 없이 일부러 넣은 지난 내원만 있다. 코드 이름은 가상.
// 처방 글자: 'LA358*1.5 A21 ESWT!' = 코드[:이름][*수량(x는 빈칸처럼 읽히지 않는 글자)][!(비급여)]. 상병 글자: 'M5456 +M5457 ~M1706' = 주상병 +부상병 ~배제상병

const RX_NAMES: Record<string, string> = {
  A15: '리도카인주',
  A21: '트리암주',
  A41: '조영제',
  A49: '아라간플러스주',
  PN: '콘쥬란주',
  SYNO: '시노비안주',
  COLLA: '콜라겐주',
  KETOI: '케토롤락주',
  KETOO: '케토롤락정',
  ACECLO: '아세클로페낙정',
  CELE: '셀레콕시브캡슐',
  TIZA: '티자니딘정',
  CIPRO: '시프로플록사신정',
  EPER: '에페리손정',
  OMEP: '오메프라졸캡슐',
  ESOM: '에소메프라졸정',
  FAMO: '파모티딘정',
  DEXTR: '포도당주',
  DEXTR50: '50% 포도당주',
  STATIN: '스타틴정',
  ZOLE: '졸레드론산주',
  PROLIA: '프롤리아주',
  ESWT: '체외충격파',
  MRIKN: 'MRI 슬관절',
  MRILS: 'MRI 요추',
  SCANO: '전척추 촬영',
  MANIP: '비관혈적 관절 수동술',
  REDUC: '도수 정복술',
  LSMIX: '리도카인트리암주',
  CARM: 'C-arm 투시',
  NACL: '생리식염수',
  HYAL25: '하이알주',
  EPERP: '에페리손 패치',
  ACEP: '아세클로페낙 패치',
  WARF: '와파린정',
  SCAN2: '전척추 촬영 2매',
}

/** 사례 날짜. 월요일이다(주 단위 규칙이 있어서 그날을 고정한다) */
const CASE_DAY = '2026-10-12'

type PastSeed = [date: string, codes: string, memo?: string]
type CaseSeed = [id: string, chart: string, rx: string, dx: string, past?: PastSeed[], date?: string]

/** 그날 앞으로 step일 간격으로 count번 온 지난 내원 */
const back = (step: number, count: number, codes: string, memo = ''): PastSeed[] =>
  Array.from({ length: count }, (_, i): PastSeed => [addDays(CASE_DAY, -step * (i + 1)), codes, memo])

function readCaseRx(text: string): FakeRx[] {
  return text.split(' ').map((token): FakeRx => {
    const m = /^([^*!:]+)(?::([^*!]*))?(?:\*([\w.]+))?(!)?$/.exec(token)
    if (!m) throw new Error(`처방 글자를 확인해 주세요: ${token}`)
    return [m[1], m[2] ?? RX_NAMES[m[1]] ?? m[1], m[3] ?? '1', m[4] ? '비급여' : undefined]
  })
}

function readCaseDx(text: string): FakeVisit['dx'] {
  return text.split(' ').filter(Boolean).map((token): FakeVisit['dx'][number] => {
    if (token.startsWith('+')) return [token.slice(1), false]
    if (token.startsWith('~')) return [token.slice(1), 'x']
    return [token, true]
  })
}

function ruleMonth(from: string, to: string, seeds: readonly (CaseSeed | CaseSeed[])[], codes?: FakeMonth['codes']): FakeMonth {
  const visits: FakeVisit[] = []
  const past: FakePast[] = []
  seeds.forEach((seed, index) => {
    const chart = index + 1
    const group = (Array.isArray(seed[0]) ? seed : [seed]) as CaseSeed[]
    for (const [id, text, rx, dx, pastSeeds, date] of group) {
      visits.push({ id, chart, date: date ?? CASE_DAY, lines: [text], rx: readCaseRx(rx), dx: readCaseDx(dx) })
      pastSeeds?.forEach(([day, pastCodes, memo], i) => past.push({ id: `h-${id}-${i}`, chart, date: day, codes: pastCodes.split(' '), memo: memo ?? '' }))
    }
  })
  return { from, to, visits, past, fill: false, codes }
}

const LUMBAR = 'MBB L4,5 Rt'
const MBB15 = 'LA358*1.5 A21'

/** 그날 자료만 보는 '같은 날 함께 청구'. 병원 코드(Z900 → KK090)도 여기서 본다 */
const SAME_DAY_SEEDS: CaseSeed[] = [
  ['CL-17.hit', 'S) LBP', 'MY142! MM010', 'M5456'],
  ['CL-17.miss', 'S) LBP', 'MY142!', 'M5456'],
  ['LA-10.hit', LUMBAR, 'LA355 LA358 A21', 'M5456'],
  ['LA-10.miss', LUMBAR, MBB15, 'M5456'],
  ['LA-23.hit', 'Rt knee', 'LA274*0.5 KK090 A21', 'M1706'],
  ['LA-23.miss', 'Rt knee', 'LA274*0.5 A21', 'M1706'],
  ['LA-24.hit', 'Rt shoulder', 'LA247 KK090 A21', 'M750'],
  ['LA-24.miss-covered-by-la23', 'Rt knee', 'LA274*0.5 KK090 A21', 'M1706'],
  ['LA-25.hit', 'Rt shoulder', 'LA247 C8020 A15', 'M750'],
  ['LA-25.miss-steroid', 'Rt shoulder', 'LA247 C8020 A15 A21', 'M750'],
  ['IJ-08.hit', 'Rt knee', 'KK090 C8020 A21', 'M1706'],
  ['IJ-08.miss', 'Rt knee', 'KK090 A21', 'M1706'],
  ['IJ-16.hit', 'Rt knee', 'MY142! KK090', 'M1706'],
  ['IJ-16.miss', 'Rt knee', 'MY142!', 'M1706'],
  ['IJ-18.hit', 'S) LBP', 'KK020 KK054', 'M5456'],
  ['IJ-18.miss', 'S) LBP', 'KK020', 'M5456'],
  ['HY-09.hit', 'Rt knee', 'KK090 A49 PN', 'M1706'],
  ['HY-09.miss', 'Rt knee', 'KK090 A49', 'M1706'],
  ['AG-01.hit', 'Rt shoulder', 'HA280 KK090 A41', 'M750'],
  ['AG-01.miss', 'Rt shoulder', 'HA280 A41', 'M750'],
  ['HD-07.hit', 'Rt shoulder', 'MM410 KK090 A21', 'M750'],
  ['HD-07.hit-two-joints', 'Rt shoulder knee', 'MM410 KK090 A21', 'M750'],
  ['HD-07.miss', 'Rt shoulder', 'MM410 A21', 'M750'],
  ['PH-05.hit', 'S) LBP', 'MM011 MM010', 'M5456'],
  ['PH-05.miss', 'S) LBP', 'MM010', 'M5456'],
  ['PH-06.hit', 'S) LBP', 'MM070 MM080', 'M5456'],
  ['PH-06.miss', 'S) LBP', 'MM070', 'M5456'],
  ['PH-07.hit', 'S) LBP', 'MM085 MM070', 'M5456'],
  ['PH-07.miss', 'S) LBP', 'MM085', 'M5456'],
  ['PH-16.hit', 'S) heel pain', 'MX121 MM010', 'M722'],
  ['PH-16.miss', 'S) heel pain', 'MX121', 'M722'],
  ['PH-20.hit', 'S) LBP', 'MM101 MM102', 'M5456'],
  ['PH-20.miss', 'S) LBP', 'MM101', 'M5456'],
  ['TP-01.hit', 'Rt shoulder', 'MM131 MM010', 'M791'],
  ['TP-01.miss', 'Rt shoulder', 'MM131', 'M791'],
  ['TP-02.hit', 'Rt shoulder', 'MM131 MM070', 'M791'],
  ['TP-02.miss', 'Rt shoulder', 'MM131', 'M791'],
  ['TP-08.hit', 'Rt shoulder', 'MM131 MM132', 'M791'],
  ['TP-08.hit-132-only', 'Rt shoulder', 'MM132', 'M791'],
  ['TP-08.miss-two-sites', 'Rt shoulder 2부위', 'MM132', 'M791'],
  ['MN-07.hit', '도수', 'KR006 MM090', 'M5456'],
  ['MN-07.miss', '도수', 'KR006', 'M5456'],
  ['MN-08.hit', '도수', 'KR006 MM101', 'M5456'],
  ['MN-08.miss', '도수', 'KR006', 'M5456'],
  ['MN-10.hit', '도수', 'KR006 ESWT!', 'M5456'],
  ['MN-10.miss', '도수', 'KR006', 'M5456'],
  ['XR-13.hit', LUMBAR, `G0400 ${MBB15}`, 'M5456'],
  ['XR-13.miss-reduction', LUMBAR, `G0400 ${MBB15} REDUC`, 'M5456'],
  ['DR-13.hit', 'S) LBP', 'OMEP FAMO', 'K21'],
  ['DR-13.miss-night', 'S) LBP 야간', 'OMEP FAMO', 'K21'],
  ['IJ-05.hit-hospital-code', 'Rt knee IA', 'Z900 A15', 'M1706'],
  ['IJ-05.miss-unmapped-code', 'Rt knee IA', 'Z901 A15', 'M1706'],
]

/** 상병을 보는 것: 필수 상병 · 부위 대조 · 상병 조합 · 상병마스터 · 청구 형식 */
const DX_SEEDS: CaseSeed[] = [
  ['LA-26.hit', 'Rt face', 'LA340 A21', 'M5456'],
  ['LA-26.miss', 'Rt face', 'LA340 A21', 'G500'],
  ['LA-29.hit', LUMBAR, MBB15, 'K250'],
  ['LA-29.hit-not-counted', LUMBAR, MBB15, 'M810'],
  ['LA-29.miss', LUMBAR, MBB15, 'M5456'],
  ['IJ-13.hit-excluded', 'S) knee pain', 'KK090 A21', 'M5456 ~M1706'],
  ['IJ-14.hit', 'Rt hand trigger', 'KK062 A21', 'M5456'],
  ['IJ-14.miss', 'Rt hand trigger', 'KK062 A21', 'M653'],
  ['HY-03.hit', 'Rt knee', 'KK090 SYNO', 'M5456'],
  ['HY-03.miss', 'Rt knee', 'KK090 SYNO', 'M1706'],
  ['HY-16.hit', 'Rt knee', 'KK090 PN', 'M5456'],
  ['HY-16.miss', 'Rt knee', 'KK090 PN', 'M1706'],
  ['HD-01.hit', 'Rt shoulder', 'MM410 A21', 'M5456'],
  ['HD-01.miss', 'Rt shoulder', 'MM410 A21', 'M750'],
  ['PH-11.hit', 'S) LBP', 'MM060', 'M5456'],
  ['PH-11.miss', 'S) LBP', 'MM060', 'G560'],
  ['PH-13.hit', 'S) elbow', 'MX121', 'M5456'],
  ['PH-13.miss', 'S) elbow', 'MX121', 'M770'],
  ['TP-05.hit', 'Rt shoulder', 'MM131', 'M5456'],
  ['TP-05.miss', 'Rt shoulder', 'MM131', 'M791'],
  ['MN-05.hit', '도수', 'KR006', 'G510'],
  ['MN-05.hit-injury-only', '도수', 'KR006', 'S335'],
  ['MN-05.miss', '도수', 'KR006', 'M5456'],
  ['ES-02.hit', 'Rt heel', 'ESWT', 'M5456'],
  ['ES-02.miss', 'Rt heel', 'ESWT', 'M722'],
  ['MR-06.hit', 'Rt knee', 'MRIKN', 'M1706'],
  ['MR-06.miss', 'Rt knee', 'MRIKN', 'S831'],
  ['DR-14.hit', 'S) LBP', 'OMEP ACECLO', 'M5456'],
  ['DR-14.miss', 'S) LBP', 'OMEP ACECLO', 'K21'],
  ['VD-01.hit', 'S) pain', 'D4903060', 'M5456'],
  ['VD-01.miss', 'S) pain', 'D4903060', 'E55'],
  ['VD-01.miss-drug-history', 'S) pain', 'D4903060 STATIN', 'M5456'],
  ['LA-27.hit', 'C-spine Rt', 'LA242 A21', 'M5456'],
  ['LA-27.miss', 'C-spine Rt', 'LA242 A21', 'G500'],
  ['LA-28.hit', 'Rt knee', 'LA346 A21', 'M1706'],
  ['LA-28.miss', 'Rt shoulder', 'LA346 A21', 'M750'],
  ['LA-33.hit', 'SI joint Rt', 'LA359 A21 A41', 'M5456'],
  ['LA-33.miss', LUMBAR, 'LA359 A21 A41', 'M5456'],
  ['IJ-09.hit', 'Rt knee', 'C8140010', 'M1706'],
  ['IJ-09.miss-bursa', 'Rt knee bursa', 'C8140010', 'M1706'],
  ['HY-02.hit', 'Rt ankle', 'KK090 A49', 'M1706'],
  ['HY-02.miss', 'Rt knee', 'KK090 A49', 'M1706'],
  ['AG-02.hit', 'Rt ankle', 'HA280 A41', 'M1706'],
  ['AG-02.miss', 'Rt knee', 'HA280 A41', 'M1706'],
  ['AG-05.hit', 'Rt knee', 'HA280 A41', 'M750'],
  ['AG-05.miss', 'Rt knee', 'HA280 A41', 'M1706'],
  ['ES-03.hit', 'Rt shoulder', 'ESWT!', 'M750'],
  ['ES-03.miss', 'Rt shoulder', 'ESWT!', 'M753'],
  ['DX-02.hit', 'S) pain', 'MM010', 'W199'],
  ['DX-02.miss', 'S) pain', 'MM010', 'M5456'],
  ['DX-08.miss-table-only', 'S) pain', 'MM010', 'M5456 ~M1706'],
  ['ES-01.hit', 'Rt heel', 'ESWT', 'M722'],
  ['ES-01.miss', 'Rt heel', 'ESWT!', 'M722'],
  ['US-01.hit', 'Rt knee', 'EB401', 'M1706'],
  ['US-01.miss', 'Rt knee', 'EB401!', 'M1706'],
  ['LA-38.miss-info-only', LUMBAR, MBB15, 'M5456'],
]

/** 수량·종류를 세는 것: 같은 날 한도 · 배율 상한 · 약 요건 · 촬영 매수 · 약 병용 */
const LIMIT_SEEDS: CaseSeed[] = [
  ['LA-37.hit', 'Rt knee', 'LA358*1.5 KK090 KK061 A21', 'M1706'],
  ['LA-37.miss', 'Rt knee', 'LA358*1.5 KK090 A21', 'M1706'],
  ['IJ-03.hit', 'Rt knee', 'KK090*3 A21', 'M1706'],
  ['IJ-03.miss', 'Rt knee', 'KK090*2 A21', 'M1706'],
  ['IJ-07.hit', 'Rt elbow', 'KK061*3 A21', 'M7710'],
  ['IJ-07.miss', 'Rt elbow', 'KK061*2 A21', 'M7710'],
  ['PH-03.hit', 'S) LBP', 'MM010*2', 'M5456'],
  ['PH-03.miss', 'S) LBP', 'MM010', 'M5456'],
  ['DR-12.hit', 'S) LBP', 'OMEP ESOM', 'K21'],
  ['DR-12.miss', 'S) LBP', 'OMEP', 'K21'],
  ['DR-18.hit', 'S) LBP', 'TIZA EPER', 'M5456'],
  ['DR-18.miss', 'S) LBP', 'EPER', 'M5456'],
  ['VD-03.hit', 'S) pain', 'D4903060 D4903110', 'E55'],
  ['VD-03.hit-method', 'S) pain', 'D4903060:비타민D_LC-MS', 'E55'],
  ['VD-03.miss', 'S) pain', 'D4903060', 'E55'],
  ['LA-02.hit', LUMBAR, 'LA358*2.5 A21', 'M5456'],
  ['LA-02.hit-segments', 'MBB L1,2,3,4 Rt', 'LA358*2 A21', 'M5456'],
  ['LA-02.miss', LUMBAR, MBB15, 'M5456'],
  ['LA-03.hit', LUMBAR, 'LA358*1 A21', 'M5456'],
  ['LA-03.miss', LUMBAR, MBB15, 'M5456'],
  ['LA-04.hit', 'Rt neck', 'LA251*2 A21', 'M542'],
  ['LA-04.hit-two-lines', 'LBP both', 'LA357 LA357 A21', 'M5456'],
  ['LA-04.miss', 'Rt neck', 'LA251 A21', 'M542'],
  ['LA-05.hit', 'ICNB Rt 3 level', 'LA248*3 A21', 'M546'],
  ['LA-05.hit-levels', 'ICNB Rt 3 level', 'LA248*1 A21', 'M546'],
  ['LA-05.miss', 'ICNB Rt 3 level', 'LA248*2 A21', 'M546'],
  ['LA-06.hit', 'Rt occipital', 'LA241*2 A21', 'G442'],
  ['LA-06.miss', 'Rt occipital', 'LA241 A21', 'G442'],
  ['LA-07.hit', 'Rt popliteal', 'LA274 A21', 'M1706'],
  ['LA-07.hit-below-ankle', 'Rt foot', 'LA272*0.5 A21', 'M722'],
  ['LA-07.hit-knee-word-only', 'Rt 무릎', 'LA274 A21', 'M1706'],
  ['LA-07.miss', 'Rt popliteal', 'LA274*0.5 A21', 'M1706'],
  ['LA-08.hit', 'Rt digital', 'LA347*2 A21', 'M653'],
  ['LA-08.miss', 'Rt digital', 'LA347 A21', 'M653'],
  ['IJ-11.hit', 'Rt knee', 'C8020*2', 'M1706'],
  ['IJ-11.hit-no-side', 'knee aspiration', 'C8020', 'M1706'],
  ['IJ-11.miss', 'Rt knee', 'C8020', 'M1706'],
  ['LA-15.hit', LUMBAR, 'LA354 A21', 'M5456'],
  ['LA-15.miss', LUMBAR, 'LA354 A21 A41', 'M5456'],
  ['LA-15.miss-not-applicable', LUMBAR, MBB15, 'M5456'],
  ['IJ-10.hit', 'Rt knee', 'C8020010', 'M1706'],
  ['IJ-10.miss', 'Rt knee', 'C8020010 A21', 'M1706'],
  ['IJ-10.miss-drainage', 'Rt knee 배액', 'C8020010', 'M1706'],
  ['IJ-12.hit', 'Rt knee', 'KK090 DEXTR', 'M1706'],
  ['IJ-12.hit-mix', 'Rt knee prolo', 'KK090 DEXTR', 'M1706'],
  ['IJ-12.hit-50', 'Rt knee', 'KK090 DEXTR50', 'M1706'],
  ['IJ-12.miss', 'Rt knee', 'KK090 A21', 'M1706'],
  ['AG-06.hit', 'Rt shoulder', 'HA280', 'M750'],
  ['AG-06.hit-no-fluoro', 'Rt shoulder', 'HA280 A41', 'M750'],
  ['AG-06.miss', 'Rt shoulder C-arm', 'HA280 A41', 'M750'],
  ['TP-06.hit', 'Rt shoulder', 'MM131 A15', 'M791'],
  ['TP-06.miss', 'Rt shoulder', 'MM131 A21', 'M791'],
  ['XR-03.hit', 'Rt hand', 'G6501 G6502', 'M7964'],
  ['XR-03.miss', 'Rt hand', 'G6502', 'M7964'],
  ['XR-08.hit', 'Rt hand', 'G6501 GB042', 'M7964'],
  ['XR-08.miss', 'Rt hand', 'G6502 GB042', 'M7964'],
  ['XR-09.hit', 'whole spine', 'SCANO*2', 'M5456'],
  ['XR-09.miss', 'whole spine', 'SCANO', 'M5456'],
  ['DR-02.hit', 'S) LBP', 'KETOI ACECLO', 'M5456'],
  ['DR-02.hit-oral', 'S) LBP', 'KETOO ACECLO', 'M5456'],
  ['DR-02.miss', 'S) LBP', 'ACECLO', 'M5456'],
  ['DR-03.hit', 'S) LBP', 'TIZA CIPRO', 'M5456'],
  ['DR-03.miss', 'S) LBP', 'TIZA', 'M5456'],
  ['DR-07.hit', 'S) LBP', '620500010 656005780', 'M5456'],
  ['DR-07.miss', 'S) LBP', '620500010 620500020', 'M5456'],
  ['DR-09.hit', 'S) LBP', 'ACECLO CELE', 'M5456'],
  ['DR-09.miss', 'S) LBP', 'ACECLO', 'M5456'],
]

/** 차트 글을 보는 '기록 요건' */
const DOCUMENT_SEEDS: CaseSeed[] = [
  ['LA-21.hit', 'MBB L4,5', 'LA358*1.5', 'M5456'],
  ['LA-21.miss', LUMBAR, MBB15, 'M5456'],
  ['HY-11.hit', 'Rt knee KL IV', 'KK090 A49', 'M1706'],
  ['HY-11.miss', 'Rt knee', 'KK090 A49', 'M1706'],
  ['AG-03.hit', 'Rt shoulder', 'HA280 A41', 'M750'],
  ['AG-03.hit-no-purpose', 'Rt shoulder MRI', 'HA280 A41', 'M750'],
  ['AG-03.miss', 'Rt shoulder MRI 감별 진단', 'HA280 A41', 'M750'],
  ['PH-12.hit', 'S) LBP', 'MM090', 'M5456'],
  ['PH-12.miss', 'S) LBP 위축 30분', 'MM090', 'M5456'],
  ['TP-07.hit', 'Rt shoulder', 'MM131', 'M791'],
  ['TP-07.miss', 'Rt shoulder stretch 압통', 'MM131', 'M791'],
  ['US-03.hit', 'Rt knee', 'EB401 EB421', 'M1706'],
  ['US-03.miss', 'Rt knee 압통', 'EB401 EB421', 'M1706'],
  ['US-05.hit', 'Rt knee', 'EB401', 'M1706'],
  ['US-05.miss', 'Rt knee 판독', 'EB401', 'M1706'],
  ['MR-01.hit', 'LBP', 'MRILS', 'M511'],
  ['MR-01.miss', 'LBP e-form', 'MRILS', 'M511'],
  ['MR-01.miss-other-dx', 'LBP', 'MRILS', 'M5456'],
  ['MR-02.hit', 'LBP', 'MRILS', 'M511'],
  ['MR-02.miss', 'LBP 방사통', 'MRILS', 'M511'],
  ['MR-08.hit', 'LBP', 'MRILS', 'M511'],
  ['MR-08.miss', 'LBP 판독', 'MRILS', 'M511'],
  ['MR-10.hit', 'Rt knee', 'MRIKN', 'S831'],
  ['MR-10.miss', 'Rt knee 수상', 'MRIKN', 'S831'],
]

const KNEE_MEMO = 'Rt knee'
const SHOULDER_MEMO = 'Rt shoulder'
const oldLbpVisit = (id: string): CaseSeed => [id, 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-08-20']

/** 지난 내원을 보는 것: 횟수 · 간격 · 치료 기간 · 앞선 치료 · 진찰료. 이력 없음(첫 내원) 사례도 함께 */
const HISTORY_SEEDS: (CaseSeed | CaseSeed[])[] = [
  ['LA-16.hit', LUMBAR, MBB15, 'M5456', back(5, 15, 'LA358 A21', LUMBAR)],
  ['LA-16.miss', LUMBAR, MBB15, 'M5456', back(5, 14, 'LA358 A21', LUMBAR)],
  ['LA-18.hit', LUMBAR, MBB15, 'M5456', back(2, 3, 'LA358 A21', LUMBAR)],
  ['LA-18.miss', LUMBAR, MBB15, 'M5456', back(2, 2, 'LA358 A21', LUMBAR)],
  ['LA-35.hit', LUMBAR, MBB15, 'M5456', [['2025-12-01', 'LA358 A21', LUMBAR], ['2026-04-01', 'LA358 A21', LUMBAR]]],
  ['LA-35.miss', LUMBAR, MBB15, 'M5456', [['2026-04-01', 'LA358 A21', LUMBAR]]],
  ['LA-36.hit', 'LBP both', 'LA357 A21', 'M5456', back(3, 3, 'LA357 A21', 'LBP both')],
  ['LA-36.miss', 'LBP both', 'LA357 A21', 'M5456', back(3, 2, 'LA357 A21', 'LBP both')],
  ['IJ-02.hit', KNEE_MEMO, 'KK090 A21', 'M1706', back(60, 4, 'KK090 A21', KNEE_MEMO)],
  ['IJ-02.hit-top-of-range', KNEE_MEMO, 'KK090 A21', 'M1706', back(60, 3, 'KK090 A21', KNEE_MEMO)],
  ['IJ-02.miss', KNEE_MEMO, 'KK090 A21', 'M1706', back(60, 2, 'KK090 A21', KNEE_MEMO)],
  ['IJ-04.hit', KNEE_MEMO, 'KK090 A21', 'M1706', back(5, 4, 'KK090 A21', KNEE_MEMO)],
  ['IJ-04.miss', KNEE_MEMO, 'KK090 A21', 'M1706', back(15, 1, 'KK090 A21', KNEE_MEMO)],
  ['HY-06.hit', SHOULDER_MEMO, 'KK090 A49', 'M750', [['2026-04-01', 'KK090 A49', SHOULDER_MEMO]]],
  ['HY-06.miss', SHOULDER_MEMO, 'KK090 A49', 'M750'],
  ['HY-07.hit', KNEE_MEMO, 'KK090 A49', 'M1706', back(7, 3, 'KK090 A49', KNEE_MEMO)],
  ['HY-07.miss', KNEE_MEMO, 'KK090 A49', 'M1706', back(7, 2, 'KK090 A49', KNEE_MEMO)],
  ['HY-13.hit', KNEE_MEMO, 'KK090 PN', 'M1706', [['2026-10-08', 'KK090 PN', KNEE_MEMO]]],
  ['HY-13.miss', KNEE_MEMO, 'KK090 PN', 'M1706', [['2026-08-01', 'KK090 PN', KNEE_MEMO]]],
  ['HY-14.hit', KNEE_MEMO, 'KK090 COLLA', 'M1706', back(14, 5, 'KK090 COLLA', KNEE_MEMO)],
  ['HY-14.miss', KNEE_MEMO, 'KK090 COLLA', 'M1706', back(14, 2, 'KK090 COLLA', KNEE_MEMO)],
  ['HY-15.hit', KNEE_MEMO, 'KK090 PN', 'M1706', [['2026-01-10', 'KK090 PN', KNEE_MEMO]]],
  ['HY-15.miss', KNEE_MEMO, 'KK090 PN', 'M1706', [['2026-08-10', 'KK090 PN', KNEE_MEMO]]],
  ['AG-04.hit', SHOULDER_MEMO, 'HA280 A41', 'M750', [['2026-03-01', 'HA280 A41', SHOULDER_MEMO]]],
  ['AG-04.miss', SHOULDER_MEMO, 'HA280 A41', 'M750'],
  ['HD-02.hit', SHOULDER_MEMO, 'MM410 A21', 'M750', back(60, 2, 'MM410 A21', SHOULDER_MEMO)],
  ['HD-02.miss', SHOULDER_MEMO, 'MM410 A21', 'M750', back(60, 1, 'MM410 A21', SHOULDER_MEMO)],
  ['PH-15.hit', 'S) elbow', 'MX121', 'M770', [['2026-10-12', 'MX121'], ['2026-10-13', 'MX121']], '2026-10-14'],
  ['PH-15.miss-last-week', 'S) elbow', 'MX121', 'M770', [['2026-10-08', 'MX121'], ['2026-10-09', 'MX121']], '2026-10-14'],
  ['PH-19.hit', 'S) LBP', 'MM101', 'M5456', back(5, 2, 'MM101')],
  ['PH-19.miss', 'S) LBP', 'MM101', 'M5456', [['2026-08-01', 'MM101']]],
  ['TP-03.hit', SHOULDER_MEMO, 'MM131', 'M791', back(3, 6, 'MM131')],
  ['TP-03.miss', SHOULDER_MEMO, 'MM131', 'M791', back(3, 2, 'MM131')],
  ['MN-04.hit', '도수', 'KR006', 'M5456', back(5, 15, 'KR006')],
  ['MN-04.miss-before-start', '도수', 'KR006', 'M5456', back(20, 15, 'KR006')],
  ['MR-03.hit', 'LBP', 'MRILS', 'M511', back(60, 2, 'MRILS')],
  ['MR-03.miss', 'LBP', 'MRILS', 'M511'],
  ['MR-07.hit', KNEE_MEMO, 'MRIKN', 'S831', [['2026-03-01', 'MRIKN', KNEE_MEMO]]],
  ['MR-07.miss-worse', 'Rt knee 악화', 'MRIKN', 'S831', [['2026-03-01', 'MRIKN', KNEE_MEMO]]],
  ['BM-04.hit', 'S) checkup', 'HC344', 'M810', [['2026-03-01', 'HC342']]],
  ['BM-04.miss', 'S) checkup', 'HC344', 'M810'],
  ['OP-03.hit', 'S) checkup', 'ZOLE', 'M810', back(30, 6, 'ZOLE')],
  ['OP-03.miss', 'S) checkup', 'ZOLE', 'M810', back(30, 2, 'ZOLE')],
  ['OP-05.hit', 'S) checkup', 'PROLIA', 'M810', [['2026-02-01', 'PROLIA'], ['2026-06-01', 'PROLIA']]],
  ['OP-05.miss', 'S) checkup', 'PROLIA', 'M810', [['2026-02-01', 'PROLIA']]],
  ['OP-09.hit', 'S) checkup', 'D5010010', 'M810', [['2026-03-01', 'D5010010']]],
  ['OP-09.miss', 'S) checkup', 'D5010010', 'M810'],
  ['VD-02.hit', 'S) pain', 'D4903060', 'E55', [['2026-03-01', 'D4903060'], ['2026-06-01', 'D4903060']]],
  ['VD-02.miss-last-year', 'S) pain', 'D4903060', 'E55', [['2025-12-01', 'D4903060']]],
  ['IJ-01.hit', KNEE_MEMO, 'KK090 A21', 'M1706', [['2026-10-05', 'KK090 A21', KNEE_MEMO]]],
  ['IJ-01.miss', KNEE_MEMO, 'KK090 A21', 'M1706', [['2026-09-01', 'KK090 A21', KNEE_MEMO]]],
  ['IJ-01.miss-other-knee', KNEE_MEMO, 'KK090 A21', 'M1706', [['2026-10-05', 'KK090 A21', 'Lt knee']]],
  ['IJ-15.hit', 'Rt hand', 'KK062 A21', 'M653', [['2026-10-05', 'KK062 A21', 'Rt hand']]],
  ['IJ-15.miss', 'Rt hand', 'KK062 A21', 'M653', [['2026-09-01', 'KK062 A21', 'Rt hand']]],
  ['HY-04.hit', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-08-01', 'KK090 A49', KNEE_MEMO]]],
  ['HY-04.hit-single', KNEE_MEMO, 'KK090 SYNO', 'M1706', [['2026-08-01', 'KK090 SYNO', KNEE_MEMO]]],
  ['HY-04.miss', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-02-01', 'KK090 A49', KNEE_MEMO]]],
  ['HY-08.hit', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-10-08', 'KK090 A49', KNEE_MEMO]]],
  ['HY-08.miss', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-10-05', 'KK090 A49', KNEE_MEMO]]],
  ['HD-03.hit', SHOULDER_MEMO, 'MM410 A21', 'M750', [['2026-10-05', 'MM410 A21', SHOULDER_MEMO]]],
  ['HD-03.miss-no-history', SHOULDER_MEMO, 'MM410 A21', 'M750'],
  ['TP-04.hit', SHOULDER_MEMO, 'MM131', 'M791', [['2026-10-11', 'MM131']]],
  ['TP-04.miss', SHOULDER_MEMO, 'MM131', 'M791', [['2026-10-05', 'MM131']]],
  ['BM-01.hit', 'S) checkup', 'HC344', 'M810', [['2026-03-01', 'HC344']]],
  ['BM-01.miss', 'S) checkup', 'HC344', 'M810', [['2025-10-20', 'HC344']]],
  ['OP-04.hit', 'S) checkup', 'PROLIA', 'M810', [['2026-08-01', 'PROLIA']]],
  ['OP-04.miss', 'S) checkup', 'PROLIA', 'M810', [['2026-03-01', 'PROLIA']]],
  ['PH-14.hit', 'S) elbow', 'MX121', 'M770', back(14, 3, 'MX121')],
  ['PH-14.hit-long', 'S) elbow', 'MX121', 'M770', back(14, 5, 'MX121')],
  ['PH-14.miss', 'S) elbow', 'MX121', 'M770', [['2026-10-01', 'MX121']]],
  ['PH-18.hit', 'S) LBP', 'MM051', 'M5456', back(10, 3, 'MM051')],
  ['PH-18.miss', 'S) LBP', 'MM051', 'M5456', [['2026-10-01', 'MM051']]],
  ['MN-06.hit', '도수', 'KR006', 'M5456'],
  ['MN-06.miss', '도수', 'KR006', 'M5456', back(5, 4, 'MM010')],
  ['MN-06.miss-exception', '도수 수술 후', 'KR006', 'M5456'],
  ['MN-06.miss-ongoing', '도수', 'KR006', 'M5456', [['2026-10-01', 'KR006']]],
  [['vf02-first', 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-10-01'], ['VF-02.hit', 'S) LBP', 'AA154 MM010', 'M5456']],
  ['VF-02.hit-dx-unknown', 'S) LBP', 'AA154 MM010', 'M5456', [['2026-10-01', 'MM010']]],
  ['VF-02.miss-no-history', 'S) LBP', 'AA154 MM010', 'M5456'],
  [oldLbpVisit('vf03-first'), ['VF-03.hit', 'S) LBP', 'AA154 MM010', 'M5456']],
  [oldLbpVisit('vf03-first-closed'), ['VF-03.miss-closed', 'S) LBP 종결 후 재발', 'AA154 MM010', 'M5456']],
  ['VF-04.hit', 'S) LBP', 'AA254 MM010', 'M5456', [['2026-05-01', 'MM010']]],
  ['VF-04.miss', 'S) LBP', 'AA254 MM010', 'M5456', [['2026-10-01', 'MM010']]],
  // 날짜 경계: 주는 월~일, 달 끝 날을 넘는 달 계산, 간격·기간의 딱 맞는 날
  ['PH-15.hit-sunday', 'S) elbow', 'MX121', 'M770', [['2026-10-12', 'MX121'], ['2026-10-13', 'MX121']], '2026-10-18'],
  ['PH-15.miss-next-monday', 'S) elbow', 'MX121', 'M770', [['2026-10-17', 'MX121'], ['2026-10-18', 'MX121']], '2026-10-19'],
  ['HY-04.hit-month-end', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-03-31', 'KK090 A49', KNEE_MEMO]], '2026-09-29'],
  ['HY-04.miss-month-end', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-03-31', 'KK090 A49', KNEE_MEMO]], '2026-09-30'],
  ['HD-03.hit-13-days', SHOULDER_MEMO, 'MM410 A21', 'M750', back(13, 1, 'MM410 A21', SHOULDER_MEMO)],
  ['HD-03.miss-14-days', SHOULDER_MEMO, 'MM410 A21', 'M750', back(14, 1, 'MM410 A21', SHOULDER_MEMO)],
  ['LA-18.hit-window-edge', LUMBAR, MBB15, 'M5456', [['2026-10-06', 'LA358 A21', LUMBAR], ['2026-10-08', 'LA358 A21', LUMBAR], ['2026-10-10', 'LA358 A21', LUMBAR]]],
  ['LA-18.miss-window-edge', LUMBAR, MBB15, 'M5456', [['2026-10-05', 'LA358 A21', LUMBAR], ['2026-10-08', 'LA358 A21', LUMBAR], ['2026-10-10', 'LA358 A21', LUMBAR]]],
  ['OP-04.hit-month-end', 'S) checkup', 'PROLIA', 'M810', [['2026-03-31', 'PROLIA']], '2026-09-01'],
  ['OP-04.miss-month-end', 'S) checkup', 'PROLIA', 'M810', [['2026-03-31', 'PROLIA']], '2026-09-02'],
]

/** 그날 자료만 보는 규칙의 이름 붙은 걸림·안 걸림, 판정이 갈리는 자리(한도 바로 위아래, 등급이 내려가는 자리, 건너뛰는 자리) */
const BRANCH_SEEDS: CaseSeed[] = [
  ['DX-01.hit', 'S) pain', 'MM010', 'M545'],
  ['DX-01.hit-excluded-too', 'S) pain', 'MM010', 'M5456 ~M545'],
  ['DX-01.miss', 'S) pain', 'MM010', 'M5456'],
  ['DX-06.hit-no-main', 'S) pain', 'MM010', '+M5456'],
  ['DX-06.hit-two-mains', 'S) pain', 'MM010', 'M5456 M1706'],
  ['DX-06.miss', 'S) pain', 'MM010', 'M5456 +M1706'],
  ['CL-15.miss-has-chart', 'S) pain', 'MM010', 'M5456'],
  ['LA-01.hit', 'MBB L4,5 both', 'LA358*2.5 LA357*1 A21', 'M5456'],
  ['LA-01.miss-at-limit', 'MBB L4,5 both', 'LA358*2 LA357*1 A21', 'M5456'],
  ['LA-09.hit-three-codes', LUMBAR, 'LA354 LA356 LA358*1.5 A21 A41', 'M5456'],
  ['LA-09.hit-second-block', KNEE_MEMO, 'LA274 LA272 A21', 'M1706'],
  ['LA-09.miss-second-half', KNEE_MEMO, 'LA274 LA272*0.5 A21', 'M1706'],
  ['LA-11.hit', 'LBP both', 'LA357 LA358*1.5 A21', 'M5456'],
  ['LA-11.miss', LUMBAR, MBB15, 'M5456'],
  ['LA-13.hit', LUMBAR, 'LA354 A21 A41', 'M5456'],
  ['LA-13.miss', 'MBB L4,5 Rt C-arm', 'LA354 A21 A41', 'M5456'],
  ['LA-13.miss-carm-line', LUMBAR, 'LA354 A21 A41 CARM', 'M5456'],
  ['LA-13.hit-la276-supraclavicular', 'supraclavicular Rt', 'LA276 A21', 'M750'],
  ['LA-13.miss-la276-no-word', SHOULDER_MEMO, 'LA276 A21', 'M750'],
  ['LA-14.hit', LUMBAR, MBB15, 'M5456'],
  ['LA-14.hit-one-view', 'MBB L4,5 Rt AP', MBB15, 'M5456'],
  ['LA-14.miss', 'MBB L4,5 Rt AP lat', MBB15, 'M5456'],
  ['LA-22.hit', SHOULDER_MEMO, 'LA247 A21', 'M750'],
  ['LA-22.miss', 'Rt shoulder 압통', 'LA247 A21', 'M750'],
  ['IJ-05.hit', 'Rt knee IA', 'KK090 A15', 'M1706'],
  ['IJ-05.miss-steroid', 'Rt knee IA', 'KK090 A15 A21', 'M1706'],
  ['IJ-05.miss-combined-line', 'Rt knee IA', 'KK090 LSMIX', 'M1706'],
  ['IJ-06.hit', 'Rt elbow', 'KK061 A15', 'M7710'],
  ['IJ-06.miss', 'Rt elbow', 'KK061 A21', 'M7710'],
  ['IJ-13.hit', KNEE_MEMO, 'KK090 A21', 'M5456'],
  ['IJ-13.miss', KNEE_MEMO, 'KK090 A21', 'M1706'],
  ['IJ-13.miss-no-steroid', KNEE_MEMO, 'KK090 A15', 'M5456'],
  ['IJ-17.hit', KNEE_MEMO, 'KK090 A21', 'M750'],
  ['IJ-17.hit-excluded-not-counted', KNEE_MEMO, 'KK090 A21', 'M750 ~M1706'],
  ['IJ-17.miss', KNEE_MEMO, 'KK090 A21', 'M1706'],
  ['IJ-17.miss-any-region', KNEE_MEMO, 'KK090 A21', 'M791'],
  ['IJ-17.miss-no-region', KNEE_MEMO, 'KK090 A21', 'E55'],
  ['IJ-17.miss-unspecified', KNEE_MEMO, 'KK090 A21', 'M5329'],
  ['HY-01.hit', KNEE_MEMO, 'KK090 A49', 'M5456'],
  ['HY-01.miss', KNEE_MEMO, 'KK090 A49', 'M1706'],
  ['HY-12.hit', KNEE_MEMO, 'KK090 A49', 'M5456'],
  ['HY-12.miss', KNEE_MEMO, 'KK090 A49', 'M1706'],
  ['HD-04.hit', SHOULDER_MEMO, 'MM410 A21', 'M750'],
  ['HD-04.miss', SHOULDER_MEMO, 'MM410 A41', 'M750'],
  ['HD-05.hit', SHOULDER_MEMO, 'MM410 A41', 'M750'],
  ['HD-05.hit-image-only', 'Rt shoulder C-arm', 'MM410 A41', 'M750'],
  ['HD-05.miss', 'Rt shoulder C-arm 용적', 'MM410 A41', 'M750'],
  ['HD-06.hit', SHOULDER_MEMO, 'MM410 A41', 'M750'],
  ['HD-06.miss-rom', 'Rt shoulder FF 90', 'MM410 A41', 'M750'],
  ['HD-06.miss-osteoporosis', 'Rt shoulder 골다공증', 'MM410 A41', 'M750'],
  ['HD-08.miss-off-by-default', KNEE_MEMO, 'MANIP', 'M1706'],
  ['PH-01.hit', KNEE_MEMO, 'MM010 KK090 A21', 'M1706'],
  ['PH-01.miss', KNEE_MEMO, 'MM010', 'M1706'],
  ['PH-01.miss-not-in-set', KNEE_MEMO, 'MM101 KK090 A21', 'M1706'],
  ['PH-04.hit', 'S) LBP', 'MM010 MM020', 'M5456'],
  ['PH-04.miss', 'S) LBP', 'MM010', 'M5456'],
  ['XR-01.hit', 'both hands', 'G6502', 'M7964'],
  ['XR-01.hit-qty', 'both hands', 'G6501*2', 'M7964'],
  ['XR-01.miss-separate', 'both hands 각각', 'G6502', 'M7964'],
  ['XR-01.miss-one-film', 'both hands', 'G6501', 'M7964'],
  ['XR-01.miss-no-bilateral', 'Rt hand', 'G6502', 'M7964'],
  ['VF-01.hit', '물리치료만', 'AA254 MM010', 'M5456'],
  ['VF-01.miss-exam', '호소', 'AA254 MM010', 'M5456'],
  ['VF-01.miss-other-line', '물리치료만', 'AA254 MM010 OTHER1', 'M5456'],
  ['VF-01.miss-no-service', '물리치료만', 'AA254', 'M5456'],
  ['DR-14.miss-no-nsaid', 'S) LBP', 'OMEP', 'M5456'],
  ['LA-03.miss-no-side', 'MBB L4,5', 'LA358*1 A21', 'M5456'],
  ['LA-03.miss-two-regions', 'C5,6 L4,5 Rt', 'LA358*1 A21', 'M5456'],
  ['LA-02.miss-region-split', 'C5,6 L4,5 Rt', 'LA358*3 A21', 'M5456'],
  ['LA-04.hit-exempt-from-split', 'C5,6 L4,5 Rt', 'LA357*2 A21', 'M5456'],
  ['AG-01.hit-two-joints', 'Rt shoulder knee', 'HA280 KK090 A41', 'M750'],
  ['LA-37.hit-two-sites', 'Rt knee shoulder', 'LA358*1.5 KK090 KK061 A21', 'M1706'],
  ['LA-28.hit-chart-matches-procedure', SHOULDER_MEMO, 'LA346 A21', 'M1706'],
  ['LA-28.miss-any-region', KNEE_MEMO, 'LA346 A21', 'M791'],
  ['LA-28.miss-no-region', KNEE_MEMO, 'LA346 A21', 'E55'],
  ['LA-28.miss-unspecified', KNEE_MEMO, 'LA346 A21', 'M5329'],
  ['AG-05.miss-any-region', KNEE_MEMO, 'HA280 A41', 'M791'],
  ['AG-05.miss-no-region', KNEE_MEMO, 'HA280 A41', 'E55'],
  ['AG-05.miss-unspecified', KNEE_MEMO, 'HA280 A41', 'M5329'],
]

const lastDay = (date: string, codes: string, memo = ''): PastSeed[] => [[date, codes, memo]]

/** 지난 내원을 보는 규칙의 이름 붙은 걸림·안 걸림, 판정이 갈리는 자리(약 조건, 기간의 딱 맞는 날, 진찰료 30일·90일) */
const HISTORY_BRANCH_SEEDS: (CaseSeed | CaseSeed[])[] = [
  ['LA-17.hit', LUMBAR, MBB15, 'M5456', [['2026-07-20', 'LA358 A21', LUMBAR], ['2026-09-01', 'LA358 A21', LUMBAR]]],
  ['LA-17.hit-exception-dx', LUMBAR, MBB15, 'G500', [['2026-07-20', 'LA358 A21', LUMBAR], ['2026-09-01', 'LA358 A21', LUMBAR]]],
  ['LA-17.miss', LUMBAR, MBB15, 'M5456', lastDay('2026-09-01', 'LA358 A21', LUMBAR)],
  ['LA-17.hit-past-two-months', LUMBAR, MBB15, 'M5456', lastDay('2026-08-12', 'LA358 A21', LUMBAR)],
  ['LA-17.miss-within-two-months', LUMBAR, MBB15, 'M5456', lastDay('2026-08-13', 'LA358 A21', LUMBAR)],
  ['LA-17.hit-gap-90', LUMBAR, MBB15, 'M5456', back(90, 1, 'LA358 A21', LUMBAR)],
  ['LA-17.miss-gap-91', LUMBAR, MBB15, 'M5456', back(91, 1, 'LA358 A21', LUMBAR)],
  ['LA-19.hit', LUMBAR, MBB15, 'M5456', back(6, 1, 'LA358 A21', LUMBAR)],
  ['LA-19.hit-other-site', LUMBAR, MBB15, 'M5456', back(4, 1, 'LA346 A21', SHOULDER_MEMO)],
  ['LA-19.miss-7-days', LUMBAR, MBB15, 'M5456', back(7, 1, 'LA358 A21', LUMBAR)],
  ['LA-19.miss-no-steroid-before', LUMBAR, MBB15, 'M5456', back(4, 1, 'LA358', LUMBAR)],
  ['LA-19.miss-no-steroid-today', LUMBAR, 'LA358*1.5', 'M5456', back(4, 1, 'LA358 A21', LUMBAR)],
  ['LA-20.hit', LUMBAR, MBB15, 'M5456', back(13, 1, 'LA358 A21', LUMBAR)],
  ['LA-20.miss-14-days', LUMBAR, MBB15, 'M5456', back(14, 1, 'LA358 A21', LUMBAR)],
  ['LA-20.miss-no-steroid-before', LUMBAR, MBB15, 'M5456', back(9, 1, 'LA358', LUMBAR)],
  ['LA-20.miss-other-region', LUMBAR, MBB15, 'M5456', back(9, 1, 'LA358 A21', 'C-MBB C5,6 Rt')],
  ['IJ-01.hit-13-days', KNEE_MEMO, 'KK090 A21', 'M1706', back(13, 1, 'KK090 A21', KNEE_MEMO)],
  ['IJ-01.hit-after-mm410', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'MM410 A21', KNEE_MEMO)],
  ['IJ-01.miss-14-days', KNEE_MEMO, 'KK090 A21', 'M1706', back(14, 1, 'KK090 A21', KNEE_MEMO)],
  ['IJ-01.miss-no-steroid-before', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090', KNEE_MEMO)],
  ['IJ-01.miss-no-steroid-today', KNEE_MEMO, 'KK090 A15', 'M1706', back(7, 1, 'KK090 A21', KNEE_MEMO)],
  ['IJ-02.hit-mm410-counts', KNEE_MEMO, 'KK090 A21', 'M1706', back(60, 4, 'MM410 A21', KNEE_MEMO)],
  ['IJ-02.miss-no-steroid-before', KNEE_MEMO, 'KK090 A21', 'M1706', back(60, 4, 'KK090', KNEE_MEMO)],
  ['IJ-02.miss-other-knee', KNEE_MEMO, 'KK090 A21', 'M1706', back(60, 4, 'KK090 A21', 'Lt knee')],
  ['IJ-04.hit-qty', KNEE_MEMO, 'KK090*3 A21', 'M1706', back(5, 2, 'KK090 A21', KNEE_MEMO)],
  ['IJ-04.miss-no-steroid-before', KNEE_MEMO, 'KK090 A21', 'M1706', back(5, 4, 'KK090', KNEE_MEMO)],
  ['IJ-15.miss-no-steroid-before', 'Rt hand', 'KK062 A21', 'M653', back(7, 1, 'KK062', 'Rt hand')],
  ['HY-04.miss-mid-cycle', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-08-01', 'KK090 A49', KNEE_MEMO], ['2026-10-05', 'KK090 A49', KNEE_MEMO]]],
  ['HY-12.miss-mid-cycle', KNEE_MEMO, 'KK090 A49', 'M1706', [['2026-08-01', 'KK090 A49', KNEE_MEMO], ['2026-10-05', 'KK090 A49', KNEE_MEMO]]],
  ['HY-12.hit-after-hy04', KNEE_MEMO, 'KK090 A49', 'M1706', lastDay('2026-08-01', 'KK090 A49', KNEE_MEMO)],
  ['HY-12.miss-hy04-only-alert', KNEE_MEMO, 'KK090 SYNO', 'M1706', lastDay('2026-08-01', 'KK090 SYNO', KNEE_MEMO)],
  ['MN-03.hit', '도수', 'KR006', 'M5456', [['2026-10-12', 'KR006'], ['2026-10-13', 'KR006']], '2026-10-14'],
  ['MN-03.miss-last-week', '도수', 'KR006', 'M5456', [['2026-10-08', 'KR006'], ['2026-10-09', 'KR006']], '2026-10-14'],
  ['VF-02.hit-30-days', 'S) LBP', 'AA154 MM010', 'M5456', back(30, 1, 'MM010')],
  ['VF-02.miss-31-days', 'S) LBP', 'AA154 MM010', 'M5456', back(31, 1, 'MM010')],
  [['vf02-other-dx-first', 'S) LBP', 'AA254 MM010', 'M1706', [], '2026-10-01'], ['VF-02.miss-other-dx', 'S) LBP', 'AA154 MM010', 'M5456']],
  [['vf03-31-first', 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-09-11'], ['VF-03.hit-31-days', 'S) LBP', 'AA154 MM010', 'M5456']],
  [['vf03-90-first', 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-07-14'], ['VF-03.hit-90-days', 'S) LBP', 'AA154 MM010', 'M5456']],
  [['vf03-30-first', 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-09-12'], ['VF-03.miss-30-days', 'S) LBP', 'AA154 MM010', 'M5456']],
  [['vf03-91-first', 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-07-13'], ['VF-03.miss-91-days', 'S) LBP', 'AA154 MM010', 'M5456']],
  ['VF-03.miss-dx-unknown', 'S) LBP', 'AA154 MM010', 'M5456', back(40, 1, 'MM010')],
  ['VF-04.hit-91-days', 'S) LBP', 'AA254 MM010', 'M5456', back(91, 1, 'MM010')],
  ['VF-04.miss-90-days', 'S) LBP', 'AA254 MM010', 'M5456', back(90, 1, 'MM010')],
  // 처방 목록 줄(HOSPITAL_CODES)의 이름. 이번 달에 처방이 없는 코드라 이력 줄 이름을 사전에서 찾는다.
  // 보험코드가 확인된 시술이면 기본 사전 이름(MBB·IA)을 써서 이름의 '패치'가 사라지고, 케나콧이 주사로 남아 스테로이드로 읽힌다
  ['IJ-01.hit-list-nerve-block', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z911', KNEE_MEMO)],
  ['IJ-01.hit-list-kk-code', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z915', KNEE_MEMO)],
  ['IJ-01.hit-list-long-la-code', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z916', KNEE_MEMO)],
  ['IJ-01.miss-list-not-nerve-block', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z912', KNEE_MEMO)],
  // 이름에 '신경'과 '차단'이 함께 있어야 한다. 하나만 있으면 이름의 '패치'가 남아 먹는·바르는 약으로 읽힌다
  ['IJ-01.miss-list-name-nerve-only', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z919', KNEE_MEMO)],
  ['IJ-01.miss-list-name-block-only', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z920', KNEE_MEMO)],
  ['IJ-01.miss-list-not-procedure', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z913', KNEE_MEMO)],
  ['IJ-01.miss-list-not-in-dictionary', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z914', KNEE_MEMO)],
  ['IJ-01.miss-list-other-kk-code', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'KK090 Z917', KNEE_MEMO)],
  ['IJ-05.hit-list-blank-name', 'Rt knee IA', 'Z918: A15', 'M1706'],
]

/** 그날 자료: 8자리 코드, 비급여 줄, 수량 빈칸, 좌우·레벨별 상한의 바로 위아래 */
// 줄 이름과 목록 이름 어디에도 약 성분이 없는 달: 코드만으로 약 역할을 정하는 길을 본다.
// 오늘은 규칙 표(clinic_codes)와 원본 상수(STEROID · lidoCodes) 두 곳에 같은 코드가 있어 한쪽만 고장 나면 여기서 드러나지 않는다.
// 상수만 남긴 경우는 engine.test.ts가 규칙 표 사본으로 본다
const DRUG_ROLE_SEEDS: readonly CaseSeed[] = [
  ['IJ-05.hit-lido-by-code', 'Rt knee IA', 'KK090 A15:가상주사', 'M1706'],
  ['IJ-05.miss-steroid-by-code-a21', 'Rt knee IA', 'KK090 A15:가상주사 A21:가상주사', 'M1706'],
  ['IJ-05.miss-steroid-by-code-a19', 'Rt knee IA', 'KK090 A15:가상주사 A19:가상주사', 'M1706'],
  ['IJ-05.miss-other-code-not-lido', 'Rt knee IA', 'KK090 A99:가상주사', 'M1706'],
  ['HY-01.hit-a49-by-code', 'Rt knee', 'KK090 A49:가상주사', 'M5456'],
  ['AG-06.hit-a41-by-code', 'Rt shoulder', 'HA280:가상주사 A41:가상주사', 'M750'],
]

// 이름으로 약 역할을 정하는 길(AC-010.7): 분류 확인 대기 줄은 이름(이름 없으면 코드 글자)에 기본 약 이름이 들면 그 역할로 점검하고 줄 이름도 목록의 이름이 된다.
// 대기 줄이 아닌 것은 이름 있는 other와 보험코드로 확인된 시술이다. 결과로 드러나는 곳은 둘이다.
// 연골주사 역할: 히알·아라간은 약 분류 낱말에 없어(아라간플러스만 있다) 역할이 있어야만 HY-01이 걸린다. 트리암·덱사·리도카인은 분류 낱말에 있어 역할이 없어도 그 약으로 읽힌다.
// 줄 이름: 이력에만 있는 코드는 줄 이름이 곧 처방 이름이라, 이름이 바뀌면 먹는 약·바르는 약으로 읽히지 않아 주사 분류가 남는다(덱사메타손정 → 덱사)
const DRUG_NAME_CODES: NonNullable<FakeMonth['codes']> = [
  ['Z701', '히알주', 'drug', ''],
  ['Z702', '아라간주', 'drug', ''],
  ['Zm5', '히알주', 'drug', ''],
  ['hy7', '히알주', 'drug', ''],
  ['Z703', '히알주', 'unknown', ''],
  ['Z704', '히알검사', 'lab', ''],
  ['Z705', '히알시술', 'procedure', ''],
  ['Z706', '히알시술', 'procedure', 'KK020'],
  ['Z707', '히알시술', 'procedure', 'LA358'],
  ['Z708', '히알주', 'other', ''],
  ['Z709', '히알관절주사', 'procedure', 'KK090'],
  ['Z710', '히알 신경 차단', 'procedure', 'LA358'],
  ['Z711', '가상주', 'drug', ''],
  ['Z712', '가상주', 'unknown', ''],
  ['Z713', '가상시술', 'procedure', ''],
  ['Z714', '', 'drug', ''],
  ['히알01', '', 'drug', ''],
  ['히알02', '', 'other', ''],
  ['히알03', '가상주', 'drug', ''],
  ['Z715', '덱사히알주', 'drug', ''],
  ['리도카인덱사히알01', '', 'drug', ''],
  ['Z716', '트리암주', 'drug', ''],
  ['Z717', '덱사주', 'unknown', ''],
  ['Z718', '트리암주', 'other', ''],
  ['Z719', '리도카인덱사주', 'drug', ''],
  ['Z720', '트리암정', 'drug', ''],
  // 이력에만 있는 코드(Z732만 이번 달 처방에도 있다)
  ['Z730', '덱사메타손정', 'drug', ''],
  ['Z731', '트리암패치', 'drug', ''],
  ['Zm6', '덱사메타손정', 'drug', ''],
  ['트리암01', '', 'drug', ''],
  ['Z732', '덱사메타손정', 'drug', ''],
  ['Z733', '덱사메타손정', 'other', ''],
  ['Z735', '가상주', 'drug', ''],
  ['Z736', '덱사 신경 차단', 'procedure', 'LA358'],
  ['Z737', '히알덱사정', 'drug', ''],
  ['Z738', '리도카인덱사 가나다라마바사아 20mg', 'drug', ''],
  ['트리암정01', '', 'drug', ''],
  ['히알05', '', 'procedure', 'KK090'],
  ['Z739', '히알 신경 차단', 'procedure', 'la358001'],
]

const kneeShotPast = (code: string) => back(7, 1, `KK090 ${code}`, KNEE_MEMO)

const DRUG_NAME_SEEDS: readonly CaseSeed[] = [
  // 규칙 표에 없는 '히알주'를 쓴 급여 줄 + 증상 글 + 무릎이 아닌 상병: 약값 상병 규칙 HY-01과 HY-12가 나온다
  ['HY-01.hit-name-hyal-drug', KNEE_MEMO, 'Z701:히알주', 'M5456'],
  ['HY-01.hit-name-aragan-drug', KNEE_MEMO, 'Z702:아라간주', 'M5456'],
  ['HY-01.miss-name-hyal-knee-dx', KNEE_MEMO, 'Z701:히알주', 'M1706'],
  ['HY-01.hit-name-mixed-case-code', KNEE_MEMO, 'Zm5:히알주', 'M5456'],
  ['HY-01.hit-name-lower-case-code', KNEE_MEMO, 'hy7:히알주', 'M5456'],
  // 대기 줄 종류마다
  ['HY-01.hit-name-unknown-row', KNEE_MEMO, 'Z703:히알주', 'M5456'],
  ['HY-01.hit-name-lab-row', KNEE_MEMO, 'Z704:히알검사', 'M5456'],
  ['HY-01.hit-name-procedure-no-fee-code', KNEE_MEMO, 'Z705:히알시술', 'M5456'],
  ['HY-01.hit-name-procedure-other-fee-code', KNEE_MEMO, 'Z706:히알시술', 'M5456'],
  ['HY-01.hit-name-procedure-la-without-nerve-block', KNEE_MEMO, 'Z707:히알시술', 'M5456'],
  // 대기 줄이 아니면 이름이 맞아도 역할이 없다
  ['HY-01.miss-name-other-row', KNEE_MEMO, 'Z708:히알주', 'M5456'],
  ['HY-01.miss-name-confirmed-procedure-kk090', KNEE_MEMO, 'Z709:히알관절주사', 'M5456'],
  ['HY-01.miss-name-confirmed-procedure-la-nerve-block', KNEE_MEMO, 'Z710:히알신경차단', 'M5456'],
  // 대기 줄인데 기본 이름이 없으면 역할이 없다
  ['HY-01.miss-no-default-name-drug', KNEE_MEMO, 'Z711:가상주', 'M5456'],
  ['HY-01.miss-no-default-name-unknown', KNEE_MEMO, 'Z712:가상주', 'M5456'],
  ['HY-01.miss-no-default-name-procedure', KNEE_MEMO, 'Z713:가상시술', 'M5456'],
  // 이름 없는 줄은 코드 글자로 맞춰 본다(이름 없는 other도 대기 줄이다). 이름이 있으면 코드 글자를 보지 않는다
  ['HY-01.hit-nameless-code-holds-name', KNEE_MEMO, '히알01:', 'M5456'],
  ['HY-01.hit-nameless-other-code-holds-name', KNEE_MEMO, '히알02:', 'M5456'],
  ['HY-01.miss-nameless-code-without-name', KNEE_MEMO, 'Z714:', 'M5456'],
  ['HY-01.miss-named-row-code-holds-name', KNEE_MEMO, '히알03:가상주', 'M5456'],
  // 기본 이름 둘: 역할을 합친다(덱사 스테로이드 + 히알 연골주사, 리도카인 국소마취제 + 덱사 스테로이드)
  ['HY-01.hit-two-names-merged', KNEE_MEMO, 'Z715:덱사히알주', 'M5456'],
  ['IJ-05.miss-two-names-merged', 'Rt knee IA', 'KK090 Z719:리도카인덱사주', 'M1706'],
  // 이름 없는 줄은 첫 이름만 줄 이름에 남아 '덱사'를 분류 낱말이 못 읽는다. 스테로이드는 합친 역할로만 남는다(오늘 약 조건을 맞춰 IJ-01이 걸린다)
  ['IJ-01.hit-nameless-three-names-merged', KNEE_MEMO, 'KK090 리도카인덱사히알01:', 'M1706', back(7, 1, 'KK090 A21', KNEE_MEMO)],
  // 스테로이드: 국소마취제만 쓴 관절강 주사(IJ-05)가 아니게 된다. 트리암·덱사는 분류 낱말에 있어 other 줄도 같다
  ['IJ-05.miss-name-steroid-role', 'Rt knee IA', 'KK090 A15 Z716:트리암주', 'M1706'],
  ['IJ-05.miss-name-dexa-unknown-row', 'Rt knee IA', 'KK090 A15 Z717:덱사주', 'M1706'],
  ['IJ-05.miss-name-other-row-table-word', 'Rt knee IA', 'KK090 A15 Z718:트리암주', 'M1706'],
  ['IJ-05.hit-no-default-name-no-steroid-role', 'Rt knee IA', 'KK090 A15 Z711:가상주', 'M1706'],
  ['IJ-05.hit-name-tablet-this-month-not-injection', 'Rt knee IA', 'KK090 A15 Z720:트리암정', 'M1706'],
  // 이력에만 있는 기본 이름 약: 줄 이름이 목록의 이름으로 바뀌어 먹는 약·바르는 약으로 읽히지 않는다
  ['IJ-01.hit-name-tablet-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z730')],
  ['IJ-01.hit-name-patch-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z731')],
  ['IJ-01.hit-name-mixed-case-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('ZM6')],
  ['IJ-01.hit-nameless-code-holds-name-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('트리암01')],
  ['IJ-01.hit-two-names-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z737')],
  // 이번 달 처방에 나오면 그 이름을 쓴다(먹는 약으로 읽혀 주사 분류가 빠진다)
  ['z732-this-month', 'S) pain', 'Z732:덱사메타손정', 'M5456'],
  ['IJ-01.miss-name-tablet-named-this-month', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z732')],
  ['IJ-01.miss-name-other-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z733')],
  ['IJ-01.miss-no-default-name-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z735')],
  // 확인된 시술은 역할이 없고 줄 이름은 기본 사전의 이름(MBB)이지만, 목록 이름의 '덱사'를 분류 낱말이 읽는다
  ['IJ-01.hit-confirmed-procedure-list-name-table-word', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('Z736')],
  // 이름 둘이 걸려도 줄 이름은 첫 이름(리도카인)이다. 마지막 이름(덱사)이면 글자가 짧아져 히알루론산~20mg 분류 낱말의 20자 안에 든다
  ['HY-01.miss-two-names-first-name-span', KNEE_MEMO, 'Z738:히알루론산', 'M5456'],
  // 이름 없는 줄도 줄 이름이 바뀐다. 코드 글자로 남으면 '정01'이 먹는 약으로 읽혀 주사 분류가 빠진다
  ['IJ-01.hit-nameless-route-word-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast('트리암정01')],
  // 이름 없는 시술은 보험코드가 있어도 확인된 시술이 아니라 대기 줄이다(코드 글자로 역할을 얻는다)
  ['HY-01.hit-nameless-procedure-fee-code', KNEE_MEMO, '히알05:', 'M5456'],
  // 보험코드는 대소문자를 접어 읽는다. 도우미는 소문자 보험코드를 막지도 접지도 않는다
  ['HY-01.miss-name-confirmed-procedure-lower-fee-code', KNEE_MEMO, 'Z739:히알신경차단', 'M5456'],
]

// 약 정보를 읽는 길(원본 requestDrugInfo): 이번 달 처방(47 표)에 나온 코드와 그 보험코드 중 9자리만 약 표에 묻는다.
// 코드 셋은 약 표의 트리암시놀론 주사다. 묻는 코드는 달 전체에 하나로 정해져 같은 코드의 있고 없음을 달을 나눠 둔다
const TRIAM_SHOT = '642306741'
const TRIAM_SHOT_2 = '645903001'
const TRIAM_SHOT_3 = '648503771'
const TRIAM_SHOT_4 = '655601771'
const NOT_IN_DRUG_TABLE = '999999999'
const kneeShotAfter = (id: string, code: string): CaseSeed => [id, KNEE_MEMO, 'KK090 A21', 'M1706', kneeShotPast(code)]
const DRUG_INFO_CODES: NonNullable<FakeMonth['codes']> = [
  ['Z800', '가상약', 'other', TRIAM_SHOT],
  ['Z801', '가상약', 'other', TRIAM_SHOT_2],
  [TRIAM_SHOT_4, '가상약', 'other', 'KK020'],
]
// 이번 달 처방에 9자리 코드가 하나도 없다: 묻지 않아 약 정보가 없다(지난 주사가 스테로이드로 읽히지 않는다)
const DRUG_INFO_HISTORY_ONLY_SEEDS: readonly CaseSeed[] = [
  kneeShotAfter('IJ-01.miss-nine-digit-history-only', TRIAM_SHOT),
  kneeShotAfter('IJ-01.miss-catalog-fee-code-history-only', 'Z800'),
]
// 다른 환자가 이번 달에 처방하면 그 코드와 보험코드를 물어 이력 줄도 약 정보를 읽는다
const DRUG_INFO_THIS_MONTH_SEEDS: readonly CaseSeed[] = [
  ['other-patient-nine-digit', 'S) pain', `${TRIAM_SHOT}:가상약`, 'M5456'],
  kneeShotAfter('IJ-01.hit-nine-digit-also-this-month', TRIAM_SHOT),
  kneeShotAfter('IJ-01.hit-catalog-fee-code-also-this-month', 'Z800'),
  ['other-patient-catalog-row', 'S) pain', 'Z801:가상약', 'M5456'],
  kneeShotAfter('IJ-01.hit-catalog-row-also-this-month', 'Z801'),
  // 9자리 코드 자체는 이번 달에 없지만 목록 줄의 보험코드로 물었다
  kneeShotAfter('IJ-01.hit-fee-code-asked-by-catalog-row', TRIAM_SHOT_2),
  // 목록 줄의 보험코드가 9자리가 아니어도 코드 자체가 9자리면 물어 코드로 읽는다
  ['other-patient-nine-digit-row', 'S) pain', `${TRIAM_SHOT_4}:가상약`, 'M5456'],
  kneeShotAfter('IJ-01.hit-nine-digit-row-other-fee-code', TRIAM_SHOT_4),
  // 같은 달이어도 묻지 않은 코드는 약 정보가 없다
  kneeShotAfter('IJ-01.miss-other-nine-digit-history-only', TRIAM_SHOT_3),
]
// 물어도 표에 없는 코드만 있다: 답이 비어 약 정보가 없는 것과 같다(모르는 코드는 답에서 빠진다)
const DRUG_INFO_NOT_FOUND_SEEDS: readonly CaseSeed[] = [
  ['other-patient-not-in-table', 'S) pain', `${NOT_IN_DRUG_TABLE}:가상약`, 'M5456'],
  kneeShotAfter('IJ-01.miss-asked-code-not-in-table', NOT_IN_DRUG_TABLE),
  kneeShotAfter('IJ-01.miss-nine-digit-history-only-empty-answer', TRIAM_SHOT),
]

const BRANCH_2_SEEDS: CaseSeed[] = [
  ['PH-20.hit-long-code', 'S) LBP', 'MM101001 MM102001', 'M5456'],
  ['PH-05.miss-noncovered-a', 'S) LBP', 'MM011! MM010', 'M5456'],
  ['PH-05.miss-noncovered-b', 'S) LBP', 'MM011 MM010!', 'M5456'],
  ['LA-24.hit-la274-with-kk061', KNEE_MEMO, 'LA274*0.5 KK061 A21', 'M1706'],
  ['LA-25.miss-combined-line', SHOULDER_MEMO, 'LA247 C8020 LSMIX', 'M750'],
  ['LA-25.miss-no-drug', SHOULDER_MEMO, 'LA247 C8020', 'M750'],
  ['LA-25.miss-other-drug', SHOULDER_MEMO, 'LA247 C8020 A15 NACL', 'M750'],
  ['HY-09.hit-two-joints', 'Rt knee shoulder', 'KK090 A49 PN', 'M1706'],
  ['TP-08.hit-132-only-long-code', SHOULDER_MEMO, 'MM132001', 'M791'],
  ['TP-08.hit-one-site', 'Rt shoulder 1부위', 'MM132', 'M791'],
  ['MN-05.hit-injury-plus-excluded', '도수', 'KR006', 'S335 ~G510'],
  ['IJ-05.miss-no-drug', 'Rt knee IA', 'KK090', 'M1706'],
  ['IJ-05.miss-other-drug', 'Rt knee IA', 'KK090 NACL', 'M1706'],
  ['TP-06.miss-noncovered', SHOULDER_MEMO, 'MM131 A15!', 'M791'],
  ['LA-37.hit-two-joints-one-site', 'Rt elbow wrist', 'LA358*1.5 KK090 KK061 A21', 'M7710'],
  ['IJ-03.miss-no-steroid', KNEE_MEMO, 'KK090*3 A15', 'M1706'],
  ['IJ-03.hit-blank-qty', KNEE_MEMO, 'KK090*x KK090*x KK090*x A21', 'M1706'],
  ['PH-03.hit-blank-qty', 'S) LBP', 'MM010*x MM010*x', 'M5456'],
  ['LA-09.hit-spine-all', 'LBP both', 'LA357 LA358*1.5 LA354 A21 A41', 'M5456'],
  ['LA-09.miss-two-lesions', 'Rt shoulder knee', 'LA346 LA274 LA272*0.5 A21', 'M750'],
  ['LA-09.miss-no-points', SHOULDER_MEMO, 'LA247 LA346 A21', 'M750'],
  ['LA-09.hit-second-block-two-lines', KNEE_MEMO, 'LA274 LA272*0.5 LA272*0.5 A21', 'M1706'],
  ['LA-09.hit-long-code', KNEE_MEMO, 'LA274001 LA272001 A21', 'M1706'],
  ['DR-18.miss-topical', 'S) LBP', 'EPER EPERP', 'M5456'],
  ['LA-01.miss-noncovered', 'MBB L4,5 both', 'LA358*2.5 LA357*1! A21', 'M5456'],
  ['LA-08.miss-no-word', 'Rt hand', 'LA347*2 A21', 'M653'],
  ['LA-08.miss-both', 'both digital', 'LA347*2 A21', 'M653'],
  ['LA-08.hit-both', 'both digital', 'LA347*3 A21', 'M653'],
  ['LA-08.hit-la272', 'Rt digital', 'LA272*2 A21', 'M653'],
  ['LA-08.miss-la272', 'Rt digital', 'LA272 A21', 'M653'],
  ['LA-08.hit-la272-both', 'both digital', 'LA272*3 A21', 'M653'],
  ['LA-08.miss-la272-both', 'both digital', 'LA272*2 A21', 'M653'],
  ['IJ-11.miss-both', 'both knee', 'C8020*2', 'M1706'],
  ['IJ-11.hit-both-one', 'both knee', 'C8020', 'M1706'],
  ['LA-07.miss-below-ankle-at-cap', 'Rt foot', 'LA272*0.25 A21', 'M722'],
  ['LA-07.miss-no-site-word', 'Rt hip', 'LA274 A21', 'M160'],
  ['LA-05.miss-both', 'ICNB both 3 level', 'LA248*4 A21', 'M546'],
  ['LA-05.hit-both', 'ICNB both 3 level', 'LA248*5 A21', 'M546'],
  ['LA-05.miss-two-levels', 'ICNB Rt 2 level', 'LA248*1.5 A21', 'M546'],
  ['LA-05.hit-two-levels', 'ICNB Rt 2 level', 'LA248*1 A21', 'M546'],
  ['LA-05.miss-no-side', 'ICNB 2 level', 'LA248*1 A21', 'M546'],
  ['LA-05.miss-no-level', 'ICNB Rt', 'LA248*1 A21', 'M546'],
  ['LA-02.miss-both-at-cap', 'MBB L4,5 both', 'LA358*3 A21', 'M5456'],
  ['LA-02.hit-both', 'MBB L4,5 both', 'LA358*3.5 A21', 'M5456'],
  ['LA-02.miss-no-side', 'MBB L4,5', 'LA358*3 A21', 'M5456'],
  ['LA-02.hit-no-side', 'MBB L4,5', 'LA358*3.5 A21', 'M5456'],
  ['LA-02.miss-rt-at-cap', LUMBAR, 'LA358*2 A21', 'M5456'],
  ['LA-06.miss-no-side', 'occipital', 'LA241*1.5 A21', 'G442'],
  ['LA-06.hit-no-side', 'occipital', 'LA241*2 A21', 'G442'],
  ['LA-06.miss-both', 'both occipital', 'LA241*1.5 A21', 'G442'],
  ['LA-06.hit-both', 'both occipital', 'LA241*2 A21', 'G442'],
  ['LA-03.miss-both', 'MBB L4,5 both', 'LA358*2.5 A21', 'M5456'],
  ['LA-03.hit-both', 'MBB L4,5 both', 'LA358*2 A21', 'M5456'],
  ['LA-03.miss-three-rt', 'L3,4,5 Rt', 'LA358*2 A21', 'M5456'],
  ['LA-03.hit-three-rt', 'L3,4,5 Rt', 'LA358*1.5 A21', 'M5456'],
  ['LA-03.miss-one-rt', 'L5 Rt', 'LA358 A21', 'M5456'],
  ['LA-27.miss-no-dx-line', 'C-spine Rt', 'LA242 A21', ''],
  ['LA-27.hit-injury', 'C-spine Rt', 'LA242 A21', 'S335'],
  ['HY-02.miss-no-joint', 'pain', 'KK090 A49', 'M1706'],
  ['HY-02.miss-spine-only', 'LBP', 'KK090 A49', 'M1706'],
  ['HY-02.miss-one-allowed', 'Rt knee ankle', 'KK090 A49', 'M1706'],
  ['IJ-09.miss-no-joint', 'pain', 'C8140010', 'M1706'],
  ['US-03.miss-one-code', KNEE_MEMO, 'EB401', 'M1706'],
  ['US-03.hit-long-code', KNEE_MEMO, 'EB401001 EB421001', 'M1706'],
  ['LA-21.miss-midline', 'C5,6', 'LA321 A21', 'M542'],
  ['LA-21.hit-no-site', 'Rt', 'LA358*1.5 A21', 'M5456'],
  ['LA-21.hit-no-drug', LUMBAR, 'LA358*1.5', 'M5456'],
  ['LA-21.hit-no-side', 'MBB L4,5', 'LA358*1.5 A21', 'M5456'],
  ['MR-02.miss-other-dx', 'LBP', 'MRILS', 'M5456'],
  ['MR-10.miss-other-dx', KNEE_MEMO, 'MRIKN', 'M1706'],
  ['AG-03.hit-no-test', 'Rt shoulder 감별 진단', 'HA280 A41', 'M750'],
  ['XR-03.hit-qty', 'Rt hand', 'G6501*2', 'M7964'],
  ['XR-03.miss-two-film-qty', 'Rt hand', 'G6502*2', 'M7964'],
  ['XR-08.hit-over-cap', 'Rt hand', 'G6502*3 GB043*2', 'M7964'],
  ['XR-08.miss-at-cap', 'Rt hand', 'G6502*3 GB045', 'M7964'],
  ['XR-08.miss-no-films', 'Rt hand', 'GB042', 'M7964'],
  ['XR-08.hit-blank-qty', 'Rt hand', 'G6501*x GB042*x', 'M7964'],
  ['XR-09.hit-two-film-code', 'whole spine', 'SCAN2', 'M5456'],
  ['ES-03.miss-excluded-only', SHOULDER_MEMO, 'ESWT!', 'M753 ~M750'],
  ['ES-03.hit-anticoagulant', SHOULDER_MEMO, 'ESWT! WARF', 'M753'],
  ['DR-09.miss-topical', 'S) LBP', 'ACECLO ACEP', 'M5456'],
  ['DR-07.miss-same-code', 'S) LBP', '620500010 620500010', 'M5456'],
  ['DR-02.miss-only-ketorolac', 'S) LBP', 'KETOI', 'M5456'],
  ['DR-12.miss-two-families', 'S) LBP', 'OMEP FAMO', 'K21'],
  ['DX-02.hit-table', 'S) pain', 'MM010', 'B950'],
  ['DX-02.miss-sub', 'S) pain', 'MM010', 'M5456 +W199'],
  ['DX-06.miss-no-dx-line', 'S) pain', 'MM010', ''],
  ['IJ-13.hit-other-excluded', KNEE_MEMO, 'KK090 A21', 'M5456 ~G510'],
  ['LA-09.hit-plus-other-lesion', 'MBB L4,5 Rt knee', 'LA354 LA356 LA358*1.5 LA274*0.5 A21 A41', 'M5456'],
  ['LA-09.miss-second-half-lines-swapped', KNEE_MEMO, 'LA272*0.5 LA274 A21', 'M1706'],
  ['LA-01.miss-blank-qty', LUMBAR, 'LA358*x LA357*3 A21', 'M5456'],
  ['PH-03.miss-one-blank-qty', 'S) LBP', 'MM010*x', 'M5456'],
  ['LA-03.hit-blank-qty', LUMBAR, 'LA358*x A21', 'M5456'],
  ['LA-08.hit-long-code', 'Rt digital', 'LA347001*2 A21', 'M653'],
]

/** 그날 앞으로 며칠 전(들)의 지난 내원 */
const ago = (days: number[], codes: string, memo = ''): PastSeed[] => days.map((day): PastSeed => [addDays(CASE_DAY, -day), codes, memo])

/** 지난 내원: 기간·횟수의 바로 위아래, 다른 관절·다른 상병, 약 종류 */
const HISTORY_BRANCH_2_SEEDS: (CaseSeed | CaseSeed[])[] = [
  ['HY-04.miss-other-knee', KNEE_MEMO, 'KK090 A49', 'M1706', lastDay('2026-08-01', 'KK090 A49', 'Lt knee')],
  ['HY-06.miss-knee', KNEE_MEMO, 'KK090 A49', 'M1706', lastDay('2026-04-01', 'KK090 A49', KNEE_MEMO)],
  ['HY-06.miss-gap-14', SHOULDER_MEMO, 'KK090 A49', 'M750', ago([14], 'KK090 A49', SHOULDER_MEMO)],
  ['HY-06.hit-gap-15', SHOULDER_MEMO, 'KK090 A49', 'M750', ago([15], 'KK090 A49', SHOULDER_MEMO)],
  ['HY-07.miss-new-cycle', KNEE_MEMO, 'KK090 A49', 'M1706', back(15, 3, 'KK090 A49', KNEE_MEMO)],
  ['HY-07.hit-gap-14', KNEE_MEMO, 'KK090 A49', 'M1706', back(14, 3, 'KK090 A49', KNEE_MEMO)],
  ['HY-07.hit-25mg', KNEE_MEMO, 'KK090 HYAL25', 'M1706', back(7, 5, 'KK090 HYAL25', KNEE_MEMO)],
  ['HY-07.miss-25mg-four', KNEE_MEMO, 'KK090 HYAL25', 'M1706', back(7, 3, 'KK090 HYAL25', KNEE_MEMO)],
  ['HY-13.hit-six-doses', KNEE_MEMO, 'KK090 PN', 'M1706', back(14, 5, 'KK090 PN', KNEE_MEMO)],
  ['HY-13.hit-6-days', KNEE_MEMO, 'KK090 PN', 'M1706', ago([6], 'KK090 PN', KNEE_MEMO)],
  ['HY-13.miss-7-days', KNEE_MEMO, 'KK090 PN', 'M1706', ago([7], 'KK090 PN', KNEE_MEMO)],
  ['HY-14.miss-cycle-over', KNEE_MEMO, 'KK090 COLLA', 'M1706', [['2026-02-01', 'KK090 COLLA', KNEE_MEMO], ['2026-02-15', 'KK090 COLLA', KNEE_MEMO], ['2026-03-01', 'KK090 COLLA', KNEE_MEMO], ['2026-03-15', 'KK090 COLLA', KNEE_MEMO], ['2026-04-01', 'KK090 COLLA', KNEE_MEMO]]],
  ['HY-15.hit-six-months', KNEE_MEMO, 'KK090 PN', 'M1706', lastDay('2026-04-12', 'KK090 PN', KNEE_MEMO)],
  ['HY-15.miss-under-six-months', KNEE_MEMO, 'KK090 PN', 'M1706', lastDay('2026-04-13', 'KK090 PN', KNEE_MEMO)],
  ['LA-16.miss-new-episode', LUMBAR, MBB15, 'M5456', ago([91, 96, 101, 106, 111, 116, 121, 126, 131, 136, 141, 146, 151, 156, 161], 'LA358 A21', LUMBAR)],
  ['LA-18.miss-other-lesion', LUMBAR, MBB15, 'M5456', back(2, 3, 'LA346 A21', SHOULDER_MEMO)],
  ['LA-35.miss-gap-90', LUMBAR, MBB15, 'M5456', ago([180, 90], 'LA358 A21', LUMBAR)],
  ['LA-35.hit-gap-91', LUMBAR, MBB15, 'M5456', ago([182, 91], 'LA358 A21', LUMBAR)],
  ['LA-36.miss-14-days', 'LBP both', 'LA357 A21', 'M5456', ago([14, 5, 3], 'LA357 A21', 'LBP both')],
  ['LA-36.hit-13-days', 'LBP both', 'LA357 A21', 'M5456', ago([13, 5, 3], 'LA357 A21', 'LBP both')],
  ['PH-19.miss-other-dx', 'S) LBP', 'MM101', 'M1706', back(5, 2, 'MM101')],
  ['PH-19.miss-gap-31', 'S) LBP', 'MM101', 'M5456', ago([62, 31], 'MM101')],
  ['PH-19.hit-gap-30', 'S) LBP', 'MM101', 'M5456', ago([60, 30], 'MM101')],
  ['TP-03.hit-16', SHOULDER_MEMO, 'MM131', 'M791', back(2, 15, 'MM131')],
  ['TP-03.miss-six', SHOULDER_MEMO, 'MM131', 'M791', back(3, 5, 'MM131')],
  ['MN-04.hit-25', '도수', 'KR006', 'M5456', back(4, 24, 'KR006')],
  ['MN-04.miss-15', '도수', 'KR006', 'M5456', back(5, 14, 'KR006')],
  ['MN-04.hit-start-day-counts', '도수', 'KR006', 'M5456', [...back(7, 14, 'KR006'), ['2026-07-01', 'KR006']]],
  ['MN-04.miss-day-before-start', '도수', 'KR006', 'M5456', [...back(7, 14, 'KR006'), ['2026-06-30', 'KR006']]],
  ['IJ-04.hit-29-days', KNEE_MEMO, 'KK090 A21', 'M1706', ago([29, 15, 10, 5], 'KK090 A21', KNEE_MEMO)],
  ['IJ-04.hit-30-days-out-lower-grade', KNEE_MEMO, 'KK090 A21', 'M1706', ago([30, 15, 10, 5], 'KK090 A21', KNEE_MEMO)],
  ['AG-04.miss-other-joint', SHOULDER_MEMO, 'HA280 A41', 'M750', lastDay('2026-03-01', 'HA280 A41', KNEE_MEMO)],
  ['AG-04.hit-within-30-days', SHOULDER_MEMO, 'HA280 A41', 'M750', ago([10], 'HA280 A41', SHOULDER_MEMO)],
  ['HD-02.hit-364-days', SHOULDER_MEMO, 'MM410 A21', 'M750', ago([364, 60], 'MM410 A21', SHOULDER_MEMO)],
  ['HD-02.miss-365-days', SHOULDER_MEMO, 'MM410 A21', 'M750', ago([365, 60], 'MM410 A21', SHOULDER_MEMO)],
  ['MR-03.hit-second', 'LBP', 'MRILS', 'M511', back(60, 1, 'MRILS')],
  ['MR-03.miss-other-dx', 'LBP', 'MRILS', 'M5456', back(60, 2, 'MRILS')],
  ['MR-07.miss-other-knee', KNEE_MEMO, 'MRIKN', 'S831', lastDay('2026-03-01', 'MRIKN', 'Lt knee')],
  ['OP-03.miss-six', 'S) checkup', 'ZOLE', 'M810', back(30, 5, 'ZOLE')],
  ['OP-03.miss-other-drug', 'S) checkup', 'PROLIA', 'M810', back(30, 6, 'PROLIA')],
  ['OP-05.miss-last-year', 'S) checkup', 'PROLIA', 'M810', [['2025-11-01', 'PROLIA'], ['2025-12-01', 'PROLIA']]],
  ['VD-02.hit-new-years-day', 'S) pain', 'D4903060', 'E55', [['2026-01-01', 'D4903060'], ['2026-03-01', 'D4903060']]],
  ['VD-02.miss-new-years-eve', 'S) pain', 'D4903060', 'E55', [['2025-12-31', 'D4903060'], ['2026-03-01', 'D4903060']]],
  ['PH-14.miss-28-days', 'S) elbow', 'MX121', 'M770', ago([28, 14], 'MX121')],
  ['PH-14.hit-29-days', 'S) elbow', 'MX121', 'M770', ago([29, 15], 'MX121')],
  ['PH-14.hit-56-days', 'S) elbow', 'MX121', 'M770', ago([56, 42, 28, 14], 'MX121')],
  ['PH-14.hit-57-days', 'S) elbow', 'MX121', 'M770', ago([57, 42, 28, 14], 'MX121')],
  ['PH-14.miss-new-course', 'S) elbow', 'MX121', 'M770', ago([62, 31], 'MX121')],
  ['PH-18.miss-28-days', 'S) LBP', 'MM051', 'M5456', ago([28, 14], 'MM051')],
  ['PH-18.hit-29-days', 'S) LBP', 'MM051', 'M5456', ago([29, 15], 'MM051')],
  ['MN-06.hit-three-prior', '도수', 'KR006', 'M5456', back(5, 3, 'MM010')],
  ['MN-06.hit-short-span', '도수', 'KR006', 'M5456', back(3, 4, 'MM010')],
  ['MN-06.hit-span-13', '도수', 'KR006', 'M5456', ago([14, 10, 5, 2], 'MM010')],
  ['MN-06.miss-span-14', '도수', 'KR006', 'M5456', ago([15, 10, 5, 2], 'MM010')],
  ['MN-06.hit-ongoing-91', '도수', 'KR006', 'M5456', ago([91], 'KR006')],
  ['MN-06.miss-ongoing-90', '도수', 'KR006', 'M5456', ago([90], 'KR006')],
  ['MN-06.hit-prior-too-old', '도수', 'KR006', 'M5456', ago([106, 101, 96, 91], 'MM010')],
  ['VF-01.miss-aa154', '물리치료만', 'AA154 MM010', 'M5456'],
  ['VF-01.hit-with-drug', '물리치료만', 'AA254 MM010 A21', 'M5456'],
  ['VF-01.hit-with-pacs', '물리치료만', 'AA254 MM010 GB041', 'M5456'],
  ['VF-01.hit-injection', '물리치료만', 'AA254 KK090 A21', 'M1706'],
  ['VF-02.miss-aa222', 'S) LBP', 'AA222 MM010', 'M5456', back(5, 1, 'MM010')],
  ['VF-02.miss-no-rx-past', 'S) LBP', 'AA154 MM010', 'M5456', [[addDays(CASE_DAY, -5), '', '메모만(가상)']]],
  [['vf02-prev-excluded-first', 'S) LBP', 'AA254 MM010', '~M5456 M1706', [], '2026-10-01'], ['VF-02.miss-previous-excluded', 'S) LBP', 'AA154 MM010', 'M5456']],
  [['vf02-today-excluded-first', 'S) LBP', 'AA254 MM010', 'M5456', [], '2026-10-01'], ['VF-02.miss-today-excluded', 'S) LBP', 'AA154 MM010', 'M1706 ~M5456']],
  [['vf02-same-three-first', 'S) LBP', 'AA254 MM010', 'M5457', [], '2026-10-01'], ['VF-02.hit-same-first-three', 'S) LBP', 'AA154 MM010', 'M5456']],
]

/** 상병 자료(83D)가 아예 없는 달: 상병을 보는 규칙은 건너뛰고 건너뛴 수로 센다 */
const NO_DX_SEEDS: CaseSeed[] = [
  ['VF-02.miss-aa222-not-counted-as-skipped', 'S) pain', 'AA222', ''],
  ['IJ-13.miss-no-dx-data', KNEE_MEMO, 'KK090 A21', ''],
  ['DR-14.miss-no-dx-data', 'S) LBP', 'OMEP ACECLO', ''],
  ['LA-27.miss-no-dx-data', 'C-spine Rt', 'LA242 A21', ''],
  ['LA-28.miss-no-dx-data', KNEE_MEMO, 'LA346 A21', ''],
  ['MR-01.miss-no-dx-data', 'LBP', 'MRILS', ''],
  ['ES-03.miss-no-dx-data', SHOULDER_MEMO, 'ESWT!', ''],
  ['DX-06.miss-no-dx-data', 'S) pain', 'MM010', ''],
  ['DX-01.miss-no-dx-data', 'S) pain', 'MM010', ''],
  ['VF-02.miss-no-dx-data', 'S) LBP', 'AA154 MM010', '', back(5, 1, 'MM010')],
  ['PH-19.hit-no-dx-data', 'S) LBP', 'MM101', '', back(5, 2, 'MM101')],
  ['LA-17.hit-no-dx-data', LUMBAR, MBB15, '', [['2026-07-20', 'LA358 A21', LUMBAR]]],
  ['MN-05.miss-no-dx-data', '도수', 'KR006', ''],
]

// 여기서는 보험코드로 시술을 확인하는 길만 본다. 트리암은 원본 병원 모드의 기본 약 이름이라 쓰지 않는다(약 역할이 붙어 'miss' 사례까지 걸린다). 케나콧은 그 목록에 없다.
// 이름으로 약 역할을 정하는 길은 DRUG_NAME_SEEDS가 본다
const PATCH_NAME = '케나콧 패치'
const HOSPITAL_CODES: NonNullable<FakeMonth['codes']> = [
  ['Z911', `${PATCH_NAME} 신경 차단`, 'procedure', 'LA358'],
  ['Z912', PATCH_NAME, 'procedure', 'LA358'],
  ['Z913', `${PATCH_NAME} 신경차단`, 'other', 'LA358'],
  ['Z914', `${PATCH_NAME} 신경차단`, 'procedure', 'LA999'],
  ['Z915', PATCH_NAME, 'procedure', 'KK090'],
  ['Z916', `${PATCH_NAME} 신경차단`, 'procedure', 'LA358001'],
  ['Z917', PATCH_NAME, 'procedure', 'KK020'],
  ['Z918', '', 'procedure', 'KK090'],
  ['Z919', `${PATCH_NAME} 신경`, 'procedure', 'LA358'],
  ['Z920', `${PATCH_NAME} 차단`, 'procedure', 'LA358'],
]

/** 규칙 시작 날짜(2026-07-01)의 앞뒤 */
const DATE_SEEDS: CaseSeed[] = [
  ['MN-05.miss-before-start', '도수', 'KR006', 'G510', [], '2026-06-30'],
  ['MN-05.hit-on-start', '도수', 'KR006', 'G510', [], '2026-07-01'],
  ['MN-07.miss-before-start', '도수', 'KR006 MM090', 'M5456', [], '2026-06-30'],
  ['MN-07.hit-on-start', '도수', 'KR006 MM090', 'M5456', [], '2026-07-01'],
]

/** 설정을 넣어 돌리는 사례(끄기·켜기·등급 바꾸기. 진료 번호에 hit·miss가 없다: 기본 설정과 결과가 다르다) */
const SETTINGS_SEEDS: CaseSeed[] = [
  ['settings-off-ij05', 'Rt knee IA', 'KK090 A15', 'M1706'],
  ['settings-off-la01', 'MBB L4,5 both', 'LA358*2.5 LA357*1 A21', 'M5456'],
  ['settings-on-hd08', KNEE_MEMO, 'MANIP', 'M1706'],
  ['settings-grade-hd07', SHOULDER_MEMO, 'MM410 KK090 A21', 'M750'],
  ['settings-grade-ij13', 'S) knee pain', 'KK090 A21', 'M5456 ~M1706'],
  ['settings-grade-ph01', 'Rt knee IA', 'MM010 KK090 A21', 'M1706'],
  ['settings-hy12-from-hy01', KNEE_MEMO, 'KK090 A49', 'M5456'],
  ['settings-hy12-from-hy03', KNEE_MEMO, 'KK090 SYNO', 'M5456'],
]

// 무작위 달을 원본과 나란히 돌려 찾은 갈림길을 가장 작게 줄인 사례. 손으로 쓴 사례들이 못 본 길이다.
// 이력 줄 이름은 그 달에서 처음 나온 이름을 쓰므로(원본 nameOf), 사례의 뜻이 흐려지지 않게 약 이름으로 판정하는 코드는 이 달에서 이름을 하나만 쓴다.
// 코드 하나에 이름이 둘일 때 어느 이름을 잡는지는 rules-table-order가 본다
const FOUND_SEEDS: (CaseSeed | CaseSeed[])[] = [
  ['IJ-02.miss-today-drug-not-steroid', 'shoulder', 'A21:프롤리아주 MM410', '', ago([270, 137, 90], 'A21 MM410')],
  ['LA-17.hit-past-other-nerve-in-episode', 'Rt', 'LA272', '', [...ago([80], 'LA244'), ...ago([5], 'LA346')]],
  ['LA-17.hit-unknown-lesion', 'Rt', 'LA272', '', ago([80], 'LA244')],
  ['LA-17.hit-spine-all', 'L1,2,3,4', 'LA274', '', ago([74], 'LA357')],
  ['LA-17.hit-spine-all-long-code', 'L1,2,3,4', 'LA274', '', ago([74], 'LA357100')],
  ['LA-17.miss-long-la357-spine-other-joint', 'Rt knee', 'LA272', '', [['2026-08-01', 'LA357100', 'L4,5 Rt']]],
  ['HY-13.hit-sixth-dose-in-calendar-cycle', '입원', 'D4903060:콘쥬란주', '', ago([56, 20, 19, 13, 9], 'D4903060')],
  ['HY-13.hit-larger-count-wins', 'S)', 'D4903060:콘쥬란주', '', ago([28, 13, 12, 7, 6], 'D4903060')],
  ['AG-04.hit-larger-count-wins', '도수', 'HA280', '', ago([31, 9], 'HA280')],
  ['HY-01.miss-not-injection-by-drug-info', 'MBB', '652603190:히알루론산나트륨주25mg', 'S3350'],
  ['DR-14.hit-with-nsaid-by-drug-info', 'hand', '669604770: Z114:오메프라졸캡슐', 'T141'],
  ['IJ-12.hit-vitamin-d-test', '안면', 'G4102:비타민D_LC-MS KK061:신경간내주사', ''],
  ['LA-19.hit-past-name-from-this-month', 'both', 'LA354:덱사메타손주', '', ago([5], 'LA354')],
  ['XR-03.hit-zero-qty-shown-as-one', 'Rt', 'G3302:가상시술 G3302:가상시술*0', ''],
  ['DR-07.hit-no-drug-info-skipped', '진단', 'A21:트리암주 653802100:메틸프레드니솔론정 689000470:', ''],
  ['DR-07.miss-same-ingredient-by-drug-info', '도수', '641604720: 073100280:', ''],
  ['DR-12.miss-same-name-ingredient', 'SI', 'OMEP:오메프라졸캡슐 LA261:오메프라졸캡슐', ''],
  // 같은 성분: 주성분코드 앞 네 자리와 투여 경로(일곱째 자리)가 같으면 같은 성분이다. 함량·제형은 보지 않는다
  ['DR-07.hit-same-ingredient-other-strength', 'S) pain', '628900160: 641907671:', ''],
  ['DR-07.hit-same-ingredient-other-form', 'S) pain', '621801920: 644304150:', ''],
  ['DR-07.miss-same-ingredient-other-route', 'S) pain', '625201541: 645901100:', ''],
  ['DR-07.miss-other-ingredient-same-tail', 'S) pain', '620500140: 621801810:', ''],
  ['LA-22.miss-word-from-key-extra', '요통', 'LA274', ''],
  ['CL-17.hit-hospital-code-by-standard', '단순촬영', 'Z109:케토롤락주 MM049:', ''],
  ['IJ-13.hit-standard-code-drug-role', 'S)', 'KK090 Z108:', 'M542'],
  ['IJ-05.hit-own-code-with-other-standard', 'Rt knee IA', 'KK062:가상시술 A15', 'M1706'],
  ['IJ-17.hit-dx-regions-in-table-order', 'elbow', 'KK090', 'M511'],
  ['LA-28.hit-longest-dx-prefix', '하퇴', 'LA346', 'M511'],
  ['LA-28.hit-position-only-listed-prefix', 'MBB', 'LA362:', 'A02 +M750'],
  ['LA-28.hit-position-map', '판독', 'LA352:오메프라졸캡슐', 'M2551'],
  ['LA-28.hit-long-code-lesion', '호소', 'LA2750:히알루론산나트륨주20mg', 'G442'],
  ['LA-21.hit-long-code-in-group', '호소', 'LA2750:히알루론산나트륨주20mg', ''],
  ['LA-21.hit-level-without-site-word', 'K-L 4', 'LA357:척추부신경', ''],
  ['LA-21.hit-midline-long-code', 'IA', 'LA3210:', ''],
  // 척추 레벨 숫자는 1~29만 센다
  ['level-zero-not-counted', 'MBB L0,4 Rt', MBB15, 'M5456'],
  ['level-29-counted', 'MBB L4,29 Rt', MBB15, 'M5456'],
  ['level-30-not-counted', 'MBB L4,30 Rt', MBB15, 'M5456'],
  ['AG-03.hit-long-code-by-five', 'Rt', 'HA280100:체외충격파', ''],
  ['LA-13.miss-conditional-long-code', 'pain', 'LA276100:', ''],
  // 6개월 주기(HY-14): 첫 투여일에서 6개월째 날부터 새 주기다
  ['HY-14.hit-second-dose-starts-cycle', 'K-L', 'COL01:콜라겐주', '', ['2026-01-12', '2026-08-12', '2026-08-20', '2026-09-01', '2026-09-10', '2026-10-01'].map((day): PastSeed => [day, 'COL01'])],
  ['HY-14.miss-new-cycle-on-six-month-day', 'K-L', 'COL01:콜라겐주', '', ['2026-04-12', '2026-05-12', '2026-06-12', '2026-07-12', '2026-09-12'].map((day): PastSeed => [day, 'COL01'])],
  ['HY-14.hit-day-before-six-months', 'K-L', 'COL01:콜라겐주', '', ['2026-04-13', '2026-05-12', '2026-06-12', '2026-07-12', '2026-09-12'].map((day): PastSeed => [day, 'COL01'])],
  // 주 1회 묶음(HY-07): 공백이 14일을 넘으면 오늘부터 새로 센다
  ['HY-07.miss-gap-over-14-days', 'LBP', '643307731:히알루론산나트륨주20mg', '', ago([35, 26, 15], '643307731')],
  // 이력 메모는 그 날 차트 글 뒤에 줄을 바꿔 붙는다
  [
    ['hy08-earlier', '양측 IA S1', '643307731:히알루론산나트륨주20mg', '', [], '2026-10-08'],
    ['HY-08.miss-memo-joined-to-chart', 'LBP', '643307731:히알루론산나트륨주20mg', '', [['2026-10-08', '643307731', 'prolo lateral']]],
  ],
  [
    ['hy08-earlier-no-site', 'S)', '643307731:히알루론산나트륨주20mg', '', [], '2026-10-08'],
    ['HY-08.miss-past-side-from-memo', 'Rt knee', '643307731:히알루론산나트륨주20mg', '', [['2026-10-08', '643307731', 'Lt knee']]],
  ],
  // 도수 앞선 물리치료(MN-06): 90일째까지 센다
  ['MN-06.miss-prior-on-day-90', 'S) pain', 'KR006', 'M5456', ago([90, 60, 30, 10], 'MM010')],
  ['MN-06.hit-prior-on-day-91', 'S) pain', 'KR006', 'M5456', ago([91, 60, 30, 10], 'MM010')],
  ['LA-37.hit-two-sites-one-joint', 'Rt knee L4,5', 'LA358*1.5 KK090 KK061 A21', 'M1706'],
  // 긴 코드는 앞 다섯 자리로 본다
  ['LA-04.hit-two-long-la357-lines', 'L4,5 Rt', 'LA357100 LA357200 A21', 'M5456'],
  ['LA-04.hit-exempt-long-code-two-regions', 'C5,6 L4,5 Rt', 'LA357100*3 A21', 'M5456'],
  ['US-03.miss-same-base-long-codes', KNEE_MEMO, 'EB401100 EB401200', 'M1706'],
  ['PH-01.hit-long-code-points', 'Rt knee', 'MM010100 KK090 A21', 'M1706'],
  // 수량 0 · 끝자리 0: 원본은 1장으로 친다
  ['XR-01.miss-zero-qty', 'both hands', 'G6501*0', 'M7964'],
  ['XR-01.hit-zero-qty-shown-as-one', 'both hands', 'G6502*0', 'M7964'],
  ['XR-09.miss-zero-qty', 'whole spine', 'SCANO*0', 'M5456'],
  ['XR-08.hit-zero-film-digit', 'Rt hand', 'G6500 GB042', 'M7964'],
  ['XR-08.miss-pacs-zero-digit', 'Rt hand', 'G6501 GB040', 'M7964'],
  ['XR-03.miss-g0400-not-film', 'Rt', 'G0400 G0400', 'M7964'],
  // 처방 목록 코드의 대소문자: 목록이 있는 달의 원본 cm(병원 모드)은 글자 그대로 찾고, 없으면 대소문자를 접어 찾는다.
  // 처방 줄은 대문자로 찾으므로(ZM1) 목록에 Zm1·zm2로 적힌 코드 모두 찾아 보험코드(KK090)를 읽는다
  ['IJ-05.hit-mixed-case-catalog-code', 'Rt knee IA', 'Zm1:병원주사 A15', 'M1706'],
  ['IJ-05.hit-lower-case-catalog-code', 'Rt knee IA', 'zm2:병원주사 A15', 'M1706'],
  // 상병 앞자리가 겹치면 가장 긴 것을 본다. S33은 요천추, S336은 천미추라 요추 시술과 맞지 않는다
  ['LA-28.hit-s336-lumbar', LUMBAR, MBB15, 'S3360'],
  // 더해 세는 코드(IJ-02의 MM410)도 긴 코드는 앞 다섯 자리로 본다. 오늘이 5번째라 확인필요다(못 찾으면 4번째라 참고로 내려간다)
  ['IJ-02.hit-long-mm410-in-history', KNEE_MEMO, 'KK090 A21', 'M1706', [...ago([20, 40, 60], 'KK090 A21', KNEE_MEMO), ...ago([80], 'MM410001 A21', KNEE_MEMO)]],
  // 대소문자가 섞인 목록 코드가 이력에만 있다. 이력 코드는 도우미가 대문자로 준다(ZM3). 찾아야 지난 내원을 KK090으로 세어 간격이 걸린다
  ['IJ-01.hit-mixed-case-catalog-code-history-only', KNEE_MEMO, 'KK090 A21', 'M1706', back(7, 1, 'ZM3 A21', KNEE_MEMO)],
]

// 47 표의 줄이 차트를 오가는 달. 이력 줄의 이름은 표에서 (차트, 날짜)가 처음 나온 차례로 찾은 첫 이름이다(원본 nameOf의 Object.values(RXDATA)).
// 코드 하나에 이름이 둘이면 그 차례에 따라 약 종류가 갈린다. '트리암주'만 스테로이드로 읽혀 IJ-01(지난 내원의 스테로이드 주사)이 걸린다
const tableVisit = (id: string, chart: number, date: string, rx: string): FakeVisit => ({ id, chart, date, lines: [KNEE_MEMO], rx: readCaseRx(rx), dx: readCaseDx('M1706') })
const tablePast = (id: string, chart: number, code: string): FakePast => ({ id: `h-${id}`, chart, date: '2026-10-05', codes: ['KK090', code], memo: KNEE_MEMO })
const TABLE_ORDER_VISITS: FakeVisit[] = [
  // 앞 환자 10/1 → 뒤 환자 10/2 Q1 가상주 → 앞 환자 10/5 Q1 트리암주: 먼저 나온 이름은 가상주다. 차트별로 묶어 찾으면 트리암주를 잡는다
  tableVisit('mix1-a-first', 1, '2026-10-01', 'MM010'),
  tableVisit('mix1-b', 2, '2026-10-02', 'Q1:가상주 KK090'),
  tableVisit('mix1-a-later', 1, '2026-10-05', 'Q1:트리암주 KK090'),
  tableVisit('IJ-01.miss-history-name-table-order', 3, CASE_DAY, 'KK090 A21'),
  // 거꾸로: 먼저 나온 이름이 트리암주다. 차트별로 묶어 찾으면 가상주를 잡아 놓친다
  tableVisit('mix2-a-first', 4, '2026-10-01', 'MM010'),
  tableVisit('mix2-b', 5, '2026-10-02', 'Q2:트리암주 KK090'),
  tableVisit('mix2-a-later', 4, '2026-10-05', 'Q2:가상주 KK090'),
  tableVisit('IJ-01.hit-history-name-table-order', 6, CASE_DAY, 'KK090 A21'),
  // 같은 날로 되돌아오는 줄: 그날 목록은 처음 나온 자리에 있다. 표의 줄 차례로 찾으면 가상주가 먼저지만 원본은 트리암주를 잡는다
  tableVisit('mix3-a-first', 7, '2026-10-01', 'MM010'),
  tableVisit('mix3-b', 8, '2026-10-02', 'Q3:가상주 KK090'),
  tableVisit('mix3-a-same-day', 7, '2026-10-01', 'Q3:트리암주 KK090'),
  tableVisit('IJ-01.hit-history-name-day-list', 9, CASE_DAY, 'KK090 A21'),
]
const TABLE_ORDER_PAST: FakePast[] = [
  tablePast('IJ-01.miss-history-name-table-order', 3, 'Q1'),
  tablePast('IJ-01.hit-history-name-table-order', 6, 'Q2'),
  tablePast('IJ-01.hit-history-name-day-list', 9, 'Q3'),
]

// 2027년 달. 규칙 표의 회계연도 시작 날 고침(start_overrides)은 2026년 것뿐이라 2027년은 1월 1일부터 센다(MN-04)
const DAY_2027 = '2027-03-15'
const before2027 = (days: number[]): PastSeed[] => days.map((day): PastSeed => [addDays(DAY_2027, -day), 'KR006'])
const everyFourDays = (count: number) => Array.from({ length: count }, (_, i) => 4 * (i + 1))
const YEAR_2027_SEEDS: CaseSeed[] = [
  // 올해 15번 왔고 오늘이 16번째다
  ['MN-04.hit-2027', '도수', 'KR006', 'M5456', before2027(everyFourDays(15)), DAY_2027],
  // 올해 14번 + 작년 12월 5번. 작년 것을 세지 않아 오늘이 15번째다
  ['MN-04.miss-2027-prev-year', '도수', 'KR006', 'M5456', before2027([...everyFourDays(14), 80, 84, 88, 92, 96]), DAY_2027],
]

const OCT_FROM = '2026-10-01'
const OCT_TO = '2026-10-31'

export const FAKE_CLAIM_CASES: readonly FakeClaimCase[] = [
  {
    name: 'rules-v1-v18',
    file: 'claim-month-rules-v1-v18.json',
    note: '원본 test_claim_precheck.py의 가짜 사례 v1~v18(v7b·v16b 포함). 같은 날 두 내원 이력(900010 9/15)과 지난 MBB 이력(900009 7/10)',
    month: {
      from: '2026-10-01',
      to: '2026-10-07',
      visits: ORIGINAL_V1_V18,
      past: [
        { id: 'h900010-a', chart: 10, date: '2026-09-15', codes: ['KR006'], memo: '도수 1회' },
        { id: 'h900010-b', chart: 10, date: '2026-09-15', codes: ['kr006', 'MM010'], memo: '도수 1회' },
        { id: 'h900009-p', chart: 9, date: '2026-07-10', codes: ['LA358', 'A21'], memo: 'MBB L4,5 Rt(가상 메모)' },
      ],
    },
  },
  {
    name: 'cross-month',
    file: 'claim-month-cross-month.json',
    note: '달을 넘기는 기간 10/30~11/2(AC-009.5). 같은 환자(900021)가 10월·11월에 오고, 비급여 도수 한 줄',
    month: {
      from: '2026-10-30',
      to: '2026-11-02',
      visits: [
        { id: 'c1', chart: 21, date: '2026-10-30', lines: ['S) knee pain'], rx: KNEE_IA, dx: [['M1706', true]] },
        { id: 'c2', chart: 22, date: '2026-10-31', lines: ['MBB L4,5 Rt'], rx: MBB, dx: [['M5456', true]] },
        { id: 'c3', chart: 21, date: '2026-11-02', lines: ['Rt knee IA'], rx: [['KK090', '관절강내주사', '1'], ['A15', '리도카인주', '1']], dx: [['M1706', true]] },
        { id: 'c4', chart: 23, date: '2026-11-02', lines: ['S) LBP', '도수'], rx: [['MM010', '표층열', '1'], ['MM020', '심층열', '1'], ['KR006', '도수치료', '1', '비급여']], dx: [['M5456', true], ['M5457', false]] },
      ],
      past: [],
    },
  },
  DX_CHECK_CASE,
  {
    name: 'rules-same-day',
    file: 'claim-month-rules-same-day.json',
    note: "조건 종류 same_day_pair의 걸림·안 걸림(진료 번호 '규칙.hit·규칙.miss'). 병원 코드 Z900 → 보험코드 KK090 사례 포함",
    month: ruleMonth(OCT_FROM, OCT_TO, SAME_DAY_SEEDS, [['Z900', '병원주사코드', 'procedure', 'KK090']]),
  },
  {
    name: 'rules-dx',
    file: 'claim-month-rules-dx.json',
    note: '상병을 보는 조건 종류(required_dx·dx_site_match·forbidden_dx_combo·dx_master·claim_code)와 info_only의 안 걸림',
    month: ruleMonth(OCT_FROM, OCT_TO, DX_SEEDS),
  },
  {
    name: 'rules-limits',
    file: 'claim-month-rules-limits.json',
    note: '수량·종류를 세는 조건 종류(same_day_limit·multiplier_cap·drug_requirement·imaging_count·dur)',
    month: ruleMonth(OCT_FROM, OCT_TO, LIMIT_SEEDS),
  },
  {
    name: 'rules-documents',
    file: 'claim-month-rules-documents.json',
    note: '차트 글을 보는 조건 종류 documentation',
    month: ruleMonth(OCT_FROM, OCT_TO, DOCUMENT_SEEDS),
  },
  {
    name: 'rules-history',
    file: 'claim-month-rules-history.json',
    note: '지난 내원을 보는 조건 종류(count_window·interval·episode_period·prerequisite·visit_fee)와 이력 없는 첫 내원. 기간이 석 달이라 같은 기간 안의 지난 내원도 본다',
    month: ruleMonth('2026-08-01', OCT_TO, HISTORY_SEEDS),
  },
  {
    name: 'rules-branches',
    file: 'claim-month-rules-branches.json',
    note: '그날 자료만 보는 규칙의 판정이 갈리는 자리(한도 위아래, 등급이 내려가는 자리, 건너뛰는 자리)와 이름 붙은 걸림·안 걸림',
    month: ruleMonth(OCT_FROM, OCT_TO, BRANCH_SEEDS),
  },
  {
    name: 'rules-history-branches',
    file: 'claim-month-rules-history-branches.json',
    note: '지난 내원을 보는 규칙의 판정이 갈리는 자리(약 조건, 기간의 딱 맞는 날, 진찰료 30일·90일)와 이름 붙은 걸림·안 걸림',
    month: ruleMonth('2026-07-01', OCT_TO, HISTORY_BRANCH_SEEDS, HOSPITAL_CODES),
  },
  {
    name: 'rules-branches-2',
    file: 'claim-month-rules-branches-2.json',
    note: '그날 자료: 8자리 코드, 비급여 줄, 수량 빈칸, 좌우·레벨별 상한의 바로 위아래',
    month: ruleMonth(OCT_FROM, OCT_TO, BRANCH_2_SEEDS),
  },
  {
    name: 'rules-found',
    file: 'claim-month-rules-found.json',
    note: '무작위 비교로 찾아 줄인 사례: 약 정보표, 긴 코드, 기간의 경계, 수량 0, 처방 목록 코드의 대소문자, 겹치는 상병 앞자리',
    month: ruleMonth(OCT_FROM, OCT_TO, FOUND_SEEDS, [
      ['Z109', '시프로플록사신정', 'unknown', 'MY143'],
      ['Z108', '건초내 주사', 'unknown', 'A21'],
      ['KK062', '가상시술', 'procedure', 'ZZ999'],
      ['Zm1', '병원주사', 'procedure', 'KK090'],
      ['zm2', '병원주사', 'procedure', 'KK090'],
      ['Zm3', '병원주사', 'procedure', 'KK090'],
    ]),
  },
  {
    name: 'rules-table-order',
    file: 'claim-month-rules-table-order.json',
    note: '47 표의 줄이 차트를 오가는 달. 코드 하나에 이름이 둘이면 이력 줄은 (차트, 날짜)가 처음 나온 차례의 첫 이름을 쓴다(양쪽 방향 + 같은 날로 되돌아오는 줄)',
    month: { from: OCT_FROM, to: OCT_TO, visits: TABLE_ORDER_VISITS, past: TABLE_ORDER_PAST, fill: false },
  },
  {
    name: 'rules-2027',
    file: 'claim-month-rules-2027.json',
    note: '2026년 밖의 달: 회계연도 시작 날 고침이 없는 해의 도수치료 횟수(MN-04)',
    month: ruleMonth('2027-03-01', '2027-03-31', YEAR_2027_SEEDS),
  },
  {
    name: 'rules-drug-roles',
    file: 'claim-month-rules-drug-roles.json',
    note: '이름에 성분이 없는 약: 코드로 정한 약 역할만으로 판정',
    month: ruleMonth(OCT_FROM, OCT_TO, DRUG_ROLE_SEEDS, [
      ['A15', '가상주사', 'drug', 'A15'],
      ['A21', '가상주사', 'drug', 'A21'],
      ['A19', '가상주사', 'drug', 'A19'],
      ['A99', '가상주사', 'drug', 'A99'],
      ['A49', '가상주사', 'drug', 'A49'],
      ['A41', '가상주사', 'drug', 'A41'],
      ['HA280', '가상주사', 'procedure', 'HA280'],
    ]),
  },
  {
    name: 'rules-drug-names',
    file: 'claim-month-rules-drug-names.json',
    note: '이름으로 약 역할을 정하는 길(AC-010.7): 분류 확인 대기 줄의 종류마다, 대기 줄이 아닌 줄, 기본 이름이 없는 줄, 코드 글자, 이름 둘, 이력에만 있는 약',
    month: ruleMonth(OCT_FROM, OCT_TO, DRUG_NAME_SEEDS, DRUG_NAME_CODES),
  },
  {
    name: 'rules-drug-info-history-only',
    file: 'claim-month-rules-drug-info-history-only.json',
    note: '약 정보(원본 requestDrugInfo): 9자리 코드와 보험코드가 이력에만 있는 달. 묻는 코드가 없어 약 정보가 없다',
    month: ruleMonth(OCT_FROM, OCT_TO, DRUG_INFO_HISTORY_ONLY_SEEDS, DRUG_INFO_CODES),
  },
  {
    name: 'rules-drug-info-this-month',
    file: 'claim-month-rules-drug-info-this-month.json',
    note: '약 정보(원본 requestDrugInfo): 같은 코드를 다른 환자가 이번 달에 처방한 달. 물어서 이력 줄도 읽는다',
    month: ruleMonth(OCT_FROM, OCT_TO, DRUG_INFO_THIS_MONTH_SEEDS, DRUG_INFO_CODES),
  },
  {
    name: 'rules-drug-info-not-found',
    file: 'claim-month-rules-drug-info-not-found.json',
    note: '약 정보(원본 requestDrugInfo): 물은 코드가 약 표에 없어 답이 빈 달',
    month: ruleMonth(OCT_FROM, OCT_TO, DRUG_INFO_NOT_FOUND_SEEDS, DRUG_INFO_CODES),
  },
  {
    name: 'rules-history-branches-2',
    file: 'claim-month-rules-history-branches-2.json',
    note: '지난 내원: 기간·횟수의 바로 위아래, 다른 관절·다른 상병, 약 종류',
    month: ruleMonth('2026-07-01', OCT_TO, HISTORY_BRANCH_2_SEEDS),
  },
  {
    name: 'rules-no-dx',
    file: 'claim-month-rules-no-dx.json',
    note: '상병 자료(83D)가 아예 없는 달. 상병을 보는 규칙은 건너뛴 수로 센다',
    month: ruleMonth(OCT_FROM, OCT_TO, NO_DX_SEEDS),
  },
  {
    name: 'rules-dates',
    file: 'claim-month-rules-dates.json',
    note: '규칙 시작 날짜(2026-07-01) 앞뒤의 진료(AC-010.4)',
    month: ruleMonth('2026-06-29', '2026-07-02', DATE_SEEDS),
  },
  {
    name: 'rules-settings',
    file: 'claim-month-rules-settings.json',
    note: '설정 {off, on, grade}을 넣어 돌리는 사례(AC-010.4). 골든은 기본 설정과 바꾼 설정 둘 다 만든다',
    month: ruleMonth(OCT_FROM, OCT_TO, SETTINGS_SEEDS),
  },
]

// ── 함께 오는 고정 자료(추세·처방 목록). 코드 이름은 가상 ─────────────────

const DX_TREND: ClaimMonthJson['dxTrend'] = {
  visits: 120,
  invalidRows: 0,
  truncated: 0,
  codes: [
    {
      c: 'KK090',
      n: 40,
      d: [
        { c: 'M1706', nm: '상병 M1706', m: 30, s: 6, x: 0, l: 420 },
        { c: 'M5456', nm: '상병 M5456', m: 2, s: 8, x: 0, l: 90 },
      ],
    },
    { c: 'LA358', n: 25, d: [{ c: 'M5456', nm: '상병 M5456', m: 20, s: 3, x: 0, l: 380 }] },
  ],
  suggestions: [{ c: 'KK090', n: 40, k: 900, miss: 4, g: [{ c: 'M17', nm: '상병 M1706', k: 900, x: 0 }] }],
}

const CATALOG_CODES: [code: string, name: string, kind: HospitalCatalog['codes'][number]['kind']][] = [
  ['A15', '리도카인주', 'drug'],
  ['A21', '트리암주', 'drug'],
  ['A49', '아라간플러스주', 'drug'],
  ['AA254', '재진', 'other'],
  ['G6502', '수지 2매', 'other'],
  ['KK061', '신경간내주사', 'procedure'],
  ['KK090', '관절강내주사', 'procedure'],
  ['KR006', '도수치료', 'procedure'],
  ['LA357', '척추부신경', 'procedure'],
  ['LA358', '후지내측지', 'procedure'],
  ['MM010', '표층열', 'procedure'],
  ['MM020', '심층열', 'procedure'],
  ['MM410', '수압팽창술', 'procedure'],
  ['X1', '가상진통정', 'drug'],
  ['Y2', '가상소염캡슐', 'drug'],
]

const CATALOG: HospitalCatalog = {
  codes: CATALOG_CODES.map(([code, name, kind]) => ({ code, name, kind, active: true, standardCode: code })),
  la: [
    { code: 'LA357', name: '척추부신경 차단술(가상 이름)', active: true },
    { code: 'LA358', name: '후지내측지 신경 차단술(가상 이름)', active: true },
  ],
}

// ── 씨앗 난수(mulberry32). Math.random을 쓰지 않는다 ──────────

type Rand = () => number

function mulberry32(seed: number): Rand {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)]

const FILLER_CODES = ['MM010', 'MM020', 'KK090', 'A21', 'A15', 'LA358', 'KR006', 'AA254']
const FILLER_MEMOS = ['지난번 메모(가상)', '주사 1회(가상 메모)']

// ── 표 줄 만들기 ─────────────────────────────────────────

const chartOf = (n: number) => `9${String(n).padStart(5, '0')}`
const nameOf = (n: number) => `가상환자${String(n).padStart(2, '0')}`
const compactDay = (ymd: string) => ymd.replace(/-/g, '')
const ROLE: Record<string, string> = { true: '주상병', false: '부상병', x: '배재상병' } // 비트 표기(배재)

function rows83(visits: readonly FakeVisit[]): GridRow[] {
  const rows: GridRow[] = []
  for (const v of visits) {
    const base = { 내원번호: v.id, 차트번호: chartOf(v.chart), 환자명: nameOf(v.chart) }
    const cells = v.lines.length === 0 ? [''] : v.joined ? [v.lines.join('\n')] : v.lines
    for (const cell of cells) rows.push({ ...base, 증상: cell, 기록날짜: compactDay(v.date) })
  }
  // 비트 83 표 끝의 건수 줄(원본 isChartSummaryRow). 증상이 비어 진료가 되지 않는다
  rows.push({ 내원번호: '【총계】', 차트번호: `${visits.length}건`, 환자명: '', 증상: '', 기록날짜: '' })
  return rows
}

function rows83d(visits: readonly FakeVisit[]): GridRow[] {
  return visits.flatMap((v) =>
    v.dx.map(([code, role]) => ({
      내원번호: v.id,
      차트번호: chartOf(v.chart),
      상병청구코드: code,
      상병명칭: `상병 ${code}`,
      주상병여부: ROLE[String(role)],
      산정특례기호: '',
      과목코드: 'OS',
      진단일자: compactDay(v.date),
    })),
  )
}

function rows47(visits: readonly FakeVisit[]): GridRow[] {
  const rows: GridRow[] = visits.flatMap((v) =>
    v.rx.map(([code, name, qty, pay]) => ({
      처방코드: code,
      처방명칭: name,
      차트번호: chartOf(v.chart),
      처방일자: compactDay(v.date),
      급여구분: pay ?? '급여',
      수량: qty,
    })),
  )
  // 비트 47 표의 합계 줄(차트번호가 비어 건너뛴다)
  rows.push({ 처방코드: '▶ 합계', 처방명칭: '', 차트번호: '', 처방일자: '', 급여구분: '', 수량: '' })
  return rows
}

/** 12개월 이력: 그 기간의 진료(증상 없는 v17도 비트에는 내원이 있다) + 일부러 넣은 지난 내원 + 씨앗으로 채운 지난 내원 */
function historyRows(month: FakeMonth, rand: Rand): HistoryRow[] {
  const used = new Set<string>()
  const rows: HistoryRow[] = []
  for (const v of month.visits) {
    used.add(`${v.chart}|${v.date}`)
    rows.push({ v: v.id, p: chartOf(v.chart), d: v.date, c: [...new Set(v.rx.map(([code]) => code.toUpperCase()))], m: v.memo ?? '' })
  }
  for (const p of month.past) {
    used.add(`${p.chart}|${p.date}`)
    rows.push({ v: p.id, p: chartOf(p.chart), d: p.date, c: p.codes, m: p.memo })
  }
  const charts = month.fill === false ? [] : [...new Set(month.visits.map((v) => v.chart))].sort((a, b) => a - b)
  for (const chart of charts) {
    const visits = Math.floor(rand() * 4) // 0~3번 더 왔다
    for (let i = 0; i < visits; i++) {
      const date = addDays(month.from, -(1 + Math.floor(rand() * 364))) // 기간 시작 365일 전 ~ 하루 전
      const codes = [...new Set(Array.from({ length: 1 + Math.floor(rand() * 3) }, () => pick(rand, FILLER_CODES)))]
      const memo = rand() < 0.25 ? pick(rand, FILLER_MEMOS) : ''
      if (used.has(`${chart}|${date}`)) continue
      used.add(`${chart}|${date}`)
      rows.push({ v: `h${chartOf(chart)}-${i}`, p: chartOf(chart), d: date, c: codes, m: memo })
    }
  }
  // 도우미 SQL처럼 환자 → 날짜 → 내원번호 차례
  return rows.sort((a, b) => a.p.localeCompare(b.p) || compareYmd(a.d, b.d) || a.v.localeCompare(b.v))
}

function buildMonth(month: FakeMonth, rand: Rand): ClaimMonthJson {
  const s83 = rows83(month.visits)
  const s83d = rows83d(month.visits)
  const s47 = rows47(month.visits)
  const history = historyRows(month, rand)
  return {
    version: 1,
    period: { from: month.from, to: month.to },
    historyRange: { from: addDays(month.from, -365), to: month.to },
    trendRange: { from: addDays(TODAY, -364), to: TODAY },
    counts: { s83: s83.length, s83d: s83d.length, s47: s47.length, history: history.length },
    s83,
    s83d,
    s47,
    history,
    historyStats: { invalidRows: 0, invalidCodes: 0, truncated: 0 },
    dxTrend: month.trend ?? DX_TREND,
    catalog: month.codes?.length
      ? {
          ...CATALOG,
          // 같은 코드는 이 달의 줄로 바꾼다(실제 목록에는 코드가 한 번씩만 있다)
          codes: [
            ...CATALOG.codes.filter((row) => !month.codes?.some(([code]) => code === row.code)),
            ...month.codes.map(([code, name, kind, standardCode]) => ({ code, name, kind, active: true, standardCode })),
          ],
        }
      : CATALOG,
  }
}

/** 사례마다 도우미 claim.month JSON. 같은 씨앗이면 같은 결과다(사례마다 씨앗 + 차례 번호) */
export function buildFakeClaims(seed: number = FAKE_SEED): { name: string; file: string; json: ClaimMonthJson }[] {
  return FAKE_CLAIM_CASES.map((c, index) => ({
    name: c.name,
    file: c.file,
    json: structuredClone(buildMonth(c.month, mulberry32(seed + index * 7919))),
  }))
}

/** 파일에 쓰는 글자(사람이 읽기 쉽게 들여 쓴 JSON. 도우미는 들여 쓰지 않지만 풀면 같은 값이다) */
export function fakeClaimText(json: ClaimMonthJson): string {
  return `${JSON.stringify(json, null, 2)}\n`
}

export function writeFakeClaims(dir: string): string[] {
  mkdirSync(dir, { recursive: true })
  return buildFakeClaims().map(({ file, json }) => {
    const path = join(dir, file)
    writeFileSync(path, fakeClaimText(json))
    return path
  })
}

// 직접 돌릴 때만(시험이 import하면 돌지 않는다). import.meta를 쓰지 않는다(make-fake-fixtures.ts와 같은 까닭)
const script = process.argv[1] === undefined ? '' : resolve(process.argv[1])
if (/[\\/]fixtures[\\/]precheck[\\/]make-fake-claims\.ts$/.test(script)) {
  const root = resolve(dirname(script), '..', '..')
  for (const path of writeFakeClaims(join(dirname(script), 'fake'))) console.log(relative(root, path))
}
