// 원장님 보고 숫자 한 벌(일일 또는 월말). 통계 이름으로 둔다: types/report.ts·ReportNumbers는 feat-ai-report 몫이다(C6).
// 도우미가 읽은 그대로이고 서버로 보내지 않는다(금액·보고 글은 화면 메모리에만, CLAUDE.md '서버에는 숫자만').
// 글 만들기(formatClinicReport)는 TASK-10
export type ClinicReportNumbers =
  | {
      ok: true
      period: string // 일일 'YYYY-MM-DD', 월말 'YYYY-MM'
      totalVisits: number
      newPatients: number
      returnPatients: number
      totalAmount: number // 금액은 모두 원 단위 정수
      insurerAmount: number
      noncoveredAmount: number
      cashAmount: number
      cardAmount: number
      transferAmount: number
      treatments: { manual: number; eswt: number; carm: number; sono: number; cryo: number }
      laCodes: { code: string; count: number }[]
      financeUnconfirmed: boolean
      financeUnconfirmedReason?: string
      notes: string[]
    }
  | { ok: false; period: string; reason: string } // 원본이 '보고를 확정할 수 없음'으로 멈춘 벌
