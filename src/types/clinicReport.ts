// 원장님 보고 숫자 한 벌(일일 또는 월말). 통계 이름으로 둔다: types/report.ts·ReportNumbers는 feat-ai-report 몫이다(C6).
// 도우미가 읽은 그대로이고 서버로 보내지 않는다(금액·보고 글은 화면 메모리에만, CLAUDE.md '서버에는 숫자만').
// 보고 글은 복사해 밖(메신저 등)으로 나가므로 입력은 집계 숫자·기간·병원 이름뿐이다. 차트번호·이름·환자 줄을 넣지 않는다(AC-510.4)
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
      financeUnconfirmed: boolean // 0.13.0 전 도우미가 금액을 세지 않은 벌(0.13.0은 늘 거짓, bit-total AC-6912.4). 보고 글은 금액 줄을 '–'로 쓴다
      financeUnconfirmedReason?: string // 0.13.0 전 도우미만 준다. 보고 글에는 쓰지 않는다(AC-6908.2)
      notes: string[]
    }
  | { ok: false; period: string; reason: string } // 원본이 '보고를 확정할 수 없음'으로 멈춘 벌

export type ClinicReportMode = 'daily' | 'monthly'

export type ClinicReportInput = { mode: ClinicReportMode; numbers: ClinicReportNumbers; hospitalName: string }

// 글 벌은 글과 안내뿐이다. financeUnconfirmed 벌(0.13.0 전 도우미)도 금액 줄이 '–'인 보통 글이라 따로 칠할 줄이 없다(bit-total AC-6908.5)
export type ClinicReportResult =
  | { text: string; notes: string[] }
  | { error: 'future-date' }
  | { error: 'unconfirmed'; reason: string }
