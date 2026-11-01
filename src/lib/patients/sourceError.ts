import type { PatientsSourceReason } from '@/types/patients'

// 원본 양지바른이 자료 문제로 멈추는 곳(필수 칸 없음·중복·같은 내원번호에 다른 환자·충돌 번호 등)에서 던진다.
// 글에는 오류 번호와 정해 둔 이유만 싣는다 — 진짜 자료에서도 같은 코드가 돌므로 환자 값(이름·차트번호·전화·줄 번호)은 넣지 않는다.
export class PatientsSourceError extends Error {
  readonly code = 'E-PATIENTS-SOURCE'
  readonly reason: PatientsSourceReason

  constructor(reason: PatientsSourceReason) {
    super(`E-PATIENTS-SOURCE (${reason})`)
    this.name = 'PatientsSourceError'
    this.reason = reason
  }
}
