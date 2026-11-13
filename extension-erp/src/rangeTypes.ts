// 기간 채우기(spec erp-closing-range) 공용 타입과 시간 상수 — design.md 5절
import type { OverlapChoice } from './types.js'

/** 날짜를 바꾼 뒤 그날이 다 그려지기까지 기다리는 한도 */
export const LOAD_TIMEOUT_MS = 30_000
/** 저장 단추를 누른 뒤 성공·오류 쪽지를 기다리는 한도 */
export const SAVE_TIMEOUT_MS = 30_000
/** 다 불러온 신호가 이만큼 이어져야 'ok' */
export const STABLE_MS = 400
/** 날짜 칸으로 안 바뀌면 이만큼 뒤 둘째 길(history.state + popstate) */
export const FALLBACK_MS = 1_000
/** 한 번에 고를 수 있는 날 수(2026-11-13 사용자 "92일(약 3달)까지") */
export const MAX_DAYS = 92

export type JournalState = { exists: boolean; status: 'draft' | 'confirmed' | null }
export type LoadResult = 'ok' | 'error' | 'timeout'
export type SaveResult = 'ok' | 'error' | 'timeout' | 'missing'
export type Block =
  | { kind: 'dialog' }
  | { kind: 'todayOnly' }
  | { kind: 'noSaveBar' }
  | { kind: 'readOnly' }
  | { kind: 'helper'; code: string }
  | { kind: 'noSaveButton' }
  | { kind: 'dateChanged' }
  | { kind: 'cellsMissing'; count: number }
  | { kind: 'overlapUnpicked' }
  | { kind: 'unexpected' }
export type SkipWhy = 'zero' | 'draft'
export type FailWhy = 'load' | 'w1Error' | 'w1Timeout' | 'w2Error' | 'w2Timeout'

export type ScanSummary = {
  from: string
  to: string
  /** 채울 날(새로 + 이미 + 못 불러온 날), 옛날부터. S = fill.length */
  fill: string[]
  fresh: string[]
  written: { date: string; status: 'draft' | 'confirmed' | null }[]
  zero: string[]
  unloaded: string[]
  overlapVisits: number
}

export type RunSummary = {
  from: string
  to: string
  /** 승인 때 S */
  total: number
  saved: string[]
  skipped: { date: string; why: SkipWhy }[]
  failed: { date: string; why: FailWhy }[]
  remaining: string[]
}

export type RangeView =
  | { kind: 'pick'; from: string; to: string; today: string }
  | { kind: 'todayOnly' }
  | { kind: 'scanning'; total: number; done: number }
  | { kind: 'confirm'; scan: ScanSummary; last?: OverlapChoice }
  | { kind: 'running'; total: number; saved: number; current: string; stopping?: boolean }
  | { kind: 'stopped'; run: RunSummary }
  | { kind: 'blocked'; block: Block; run: RunSummary }
  | { kind: 'end'; run: RunSummary }

export type RangeAction =
  | { kind: 'scan'; from: string; to: string }
  | { kind: 'cancelScan' }
  | { kind: 'start'; choice?: OverlapChoice }
  | { kind: 'stop' }
  | { kind: 'resume' }
  | { kind: 'close' }
