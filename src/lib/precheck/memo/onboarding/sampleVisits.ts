import type { RxLine, Visit } from '@/types/precheck'

// 처음 질문 보기 메모의 가짜 진료 3건(clinic-profile REQ-6614, design.md 16절). 환자 자료가 아니다: 이름·차트번호는 '가짜' 글자다.
// 처방 코드는 중립 기본 문구(neutralPhrases)의 CODEMAP에 있는 표준 코드뿐이다(약 코드는 병원마다 달라 넣지 않는다) [환자 자료 구역]

/** 보기 메모 칸 이름(AC-6614.4), sampleVisits()와 같은 차례 */
export const SAMPLE_LABELS = ['허리 신경차단술 2개', '어깨 관절 주사', '무릎 연골주사'] as const

const rx = (code: string, name: string, qty: number): RxLine => ({ code, name, qty, benefit: true, pay: '급여' })
function fake(n: number, lines: string[], rows: RxLine[]): Visit {
  return { key: `가짜-${n}`, chart: `가짜${n}`, date: '2026-01-05', month: '2026-01', name: `가짜 환자 ${n}`, lines, hints: lines.map(() => null), rx: rows, dx: [], memosInBit: [] }
}

/** 가짜 진료 3건: 허리 MBB L4,5,S1 both + SNB Rt / 어깨 관절 주사 Rt / 무릎 연골주사 Rt 2회차 + K-L 3/3. 부를 때마다 새로 만든다(엔진이 진료에 분석 칸을 붙인다) */
export function sampleVisits(): Visit[] {
  return [
    fake(1, ['LBP', 'MBB L4,5,S1 both', 'SNB Rt'], [rx('LA358', 'MBB', 2), rx('LA272', 'SNB', 1)]),
    fake(2, ['Rt shoulder pain', 'Rt shoulder IA'], [rx('KK090', 'IA', 1)]),
    fake(3, ['Rt knee OA', 'KLG 3/3', '연골주사 Rt knee 2차'], [rx('KK090', 'IA', 1)]),
  ]
}
