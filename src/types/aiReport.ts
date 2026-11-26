// AI 월간 리포트(spec ai-report design.md '타입'). 서버·Claude에는 이 입력의 집계 숫자만 간다
// ReportInput·ReportMetric은 열쇠 순서가 곧 지문이다(reportFingerprint가 JSON.stringify 순서를 본다) — 칸 차례를 바꾸지 않는다

// count = 명(사람 수), visits = 건(접수 건수), rate = 0~1 비율, won = 원 단위 정수 금액(원장님 매출), average = 문 연 날 하루 평균 접수 건수(소수 둘째 자리에서 반올림해 첫째 자리까지)
export type MetricKind = 'count' | 'visits' | 'rate' | 'won' | 'average'
// qty = 의사랑 처방량(총투여량의 합, 사람 수 아님 · 단위 없음, specs/uisarang-upload AC-8816.2). 의사랑 입력의 won은 총진료비·처방 총액이다.
// 비트 지표 종류 다섯(MetricKind)은 그대로 두고(lib/ai/input.test.ts AC-2904.5가 다섯을 형으로 고정한다) 지표 칸 kind에만 더한다
export type UisMetricKind = 'qty'

export type ReportMetric = {
  id: string // 'total.newPatients' · 'group:<id>.patients' · 'rx:<code>' · 'region:<이름>' · 'revisit.within7' · 'age:<이름>' · 'insurance:<이름>' · 'town:<이름>' · 'weekday:<1~7>' · 'hour:<8~20>' · 'doctor:<이름>.amount'
  label: string // '신환' · "처방 그룹 '도수치료' 환자" …
  kind: MetricKind | UisMetricKind
  values: { selected: number | null; prev: number | null; lastYear: number | null } // null = 그 달 자료 없음(비율은 집계 중일 수도)
}

export type ReportInput = {
  month: string // 'YYYY-MM'
  partial: boolean
  prevMonth: string // addMonths(month, -1)
  lastYearMonth: string // addMonths(month, -12)
  hasPrev: boolean
  hasLastYear: boolean
  metrics: ReportMetric[]
  // 의사랑 엑셀로 올린 숫자로 만든 입력만 맨 끝에 붙는다(specs/uisarang-upload AC-8816.2). 비트 입력에는 열쇠가 없어 지문이 지금과 같다
  source?: 'uisarang'
}

export type CardTag = 'up' | 'down' | 'watch' | 'guess'
export type AiCard = { tag: CardTag; text: string; metric: string } // AI가 주는 모양
export type AiReportRaw = { summary: string; cards: AiCard[] }
export type ReportCard = AiCard & { basis: string } // 앱이 근거 줄을 붙인 모양

export type SavedReport = {
  month: string
  partial: boolean
  summary: string
  cards: ReportCard[]
  model: string
  inputHash: string
  createdAt: string
}

export type AiUsage = { inputTokens: number; outputTokens: number; model: string }

// ErrorCode(types/errors.ts)의 AI 번호 가운데 리포트 만들기(POST)가 쓰는 넷(E-AI-READ는 읽기 전용이라 뺀다). 문구는 lib/errors.ts errorInfo로만 꺼낸다
export type AiErrorCode = 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'

// 화면이 받는 모양(spec ai-report-screen design.md '타입'). 저장 지문은 화면에 보내지 않는다
export type AiUsageView = { calls: number; tokens: number; costMicroUsd: number }
export type ShownReport = Omit<SavedReport, 'inputHash'>
export type ReportView = { report: ShownReport | null; stale: boolean; usage: AiUsageView }
