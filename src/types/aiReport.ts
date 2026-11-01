// AI 월간 리포트(spec ai-report design.md '타입'). 서버·Claude에는 이 입력의 집계 숫자만 간다
// ReportInput·ReportMetric은 열쇠 순서가 곧 지문이다(reportFingerprint가 JSON.stringify 순서를 본다) — 칸 차례를 바꾸지 않는다

export type MetricKind = 'count' | 'rate' // count = 명, rate = 0~1 비율

export type ReportMetric = {
  id: string // 'total.newPatients' · 'group:<id>.patients' · 'rx:<code>' · 'region:<이름>' · 'revisit.within7'
  label: string // '신환' · "처방 그룹 '도수치료' 환자" …
  kind: MetricKind
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

// ErrorCode(types/errors.ts)의 AI 번호 넷. 문구는 lib/errors.ts errorInfo로만 꺼낸다
export type AiErrorCode = 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'
