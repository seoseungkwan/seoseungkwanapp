import type { RxGroupDef } from '@/types/analysis'
import type { DoctorBreakdown, Ledger, RsvKindDef, SunapEdit, SunapTotals } from '@/types/sunap'

// 수납일지 장부 Worker 메시지 약속 (spec sunap-ilji design.md 'Worker 메시지', REQ-4904) [환자 자료 구역].
// 화면 훅(useSunapWorker)은 이 타입으로 주고받는다. 통로 포트는 기존 connectScreenBridge가 {type: 'bridge-port'}로 넘긴다.
//
// 불러오기 차례(화면): bridge.stream('contact.targets', {kind: 'sunap', from: day, to: day})와
// bridge.stream('store.load', {months: [day의 YYYY-MM]})를 열고, 둘 다 끝나면(또는 거절되면) 그 결과를 load에 실어 보낸다.
// 조각은 통로 포트로 Worker에 바로 가고, 화면이 쥐는 것은 {id}·오류 번호뿐이다

/** 화면이 연 스트림 하나의 결과: 끝났으면 {id}(StreamResult.id), 거절됐으면 {code}(BridgeError.code) */
export type SunapStreamRef = { id: string } | { code: string }

/** 고친 칸 몇 개(값 바꾸기, 빈 비고는 비고 지우기) 또는 칸 하나 되돌리기([비트 값으로]·예약 '비트 따라가기') */
export type SunapPatch = Partial<SunapEdit> | { revert: keyof SunapEdit }

export type SunapLoadMessage = {
  type: 'load'
  day: string // YYYY-MM-DD
  kinds: RsvKindDef[] // 설정의 다음 예약 종류 목록(spec sunap-kinds AC-5502.4). Worker가 readKinds로 다시 본다
  blockDef: RxGroupDef | null // 설정에서 고른 Block 묶음 정의(안 골랐으면 null)
  ptDef: RxGroupDef | null // 물리치료 묶음 정의
  targets: SunapStreamRef // contact.targets {kind: 'sunap', from: day, to: day}
  store: SunapStreamRef // store.load {months: [day.slice(0, 7)]}
}

/** 화면 → Worker. edit·close·reopen은 마지막으로 불러온 날에 한다 */
export type SunapScreenMessage =
  | SunapLoadMessage
  | { type: 'edit'; chart: string; patch: SunapPatch }
  | { type: 'close'; now: number } // Date.now()
  | { type: 'reopen' }

export type SunapOp = 'load' | 'edit' | 'close' | 'reopen'

/**
 * 장부 보기 = buildLedger 결과 + dayTotals. doctors는 장부의 진료의 이름 목록 대신 원장님별 수
 * (ledgerDoctors, spec sunap-doctors AC-5003.2): 원장님(미지정 빼고) 두 분 이상일 때만, 아니면·옛 도우미 답이면 null
 */
export type SunapLedgerView = Omit<Ledger, 'doctors'> & { totals: SunapTotals; doctors: DoctorBreakdown | null }

/**
 * Worker → 화면. edit·close·reopen은 PC 저장(store.save)이 됐다는 답이 온 뒤에만 ledger를 보낸다.
 * closed는 close 저장 뒤 ledger 다음에 온다: 화면이 이 숫자로 서버(closeSunapDay)에 올린다.
 * error는 오류 번호만 싣는다. 실패한 일(op)은 PC 저장을 바꾸지 않았다
 */
export type SunapWorkerMessage =
  | ({ type: 'ledger' } & SunapLedgerView)
  | { type: 'closed'; day: string; totals: SunapTotals; late: boolean }
  | { type: 'error'; op: SunapOp; code: string }

/** 비고 칸 글자 수 한도 */
export const SUNAP_NOTE_MAX = 100
