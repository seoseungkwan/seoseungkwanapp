import { EMR_KINDS, type EmrKind } from '@/types/clinicProfile'

// 쓰는 EMR 글자 한 곳(spec emr-choice REQ-7102 AC-7102.1·AC-7102.3, design.md 1절). 순수 글자다 — 네트워크·화면 틀·저장소를 쓰지 않는다.
// 병원 정보 칸(단추 글)·대시보드 첫 화면·비트 PC 연결 화면이 같이 써서 글이 어긋나지 않는다

/** 비트가 아닌 EMR(안내 글을 보이는 셋) */
export type NonBitEmr = Exclude<EmrKind, 'bit'>

/** 단추 글(AC-7102.2) */
export const EMR_LABEL: Record<EmrKind, string> = {
  bit: '비트',
  uisarang: '의사랑',
  egis: '이지스',
  other: '그 밖의 EMR',
}

/** '우리 병원은 쓰는 EMR이 {…} 되어 있어요'에 쓰는 말(AC-7102.3) */
export const EMR_WITH_RO: Record<NonBitEmr, string> = {
  uisarang: '의사랑으로',
  egis: '이지스로',
  other: '그 밖의 EMR로',
}

const WAIT_TITLE: Record<NonBitEmr, string> = {
  uisarang: '의사랑 연결은 준비하고 있어요',
  egis: '이지스 연결은 준비하고 있어요',
  other: '우리 병원 EMR은 아직 연결할 수 없어요',
}

/** 넷('bit'·'uisarang'·'egis'·'other') 중 하나인가 */
export function isEmrKind(value: unknown): value is EmrKind {
  return (EMR_KINDS as readonly unknown[]).includes(value)
}

/** 비트가 아닌 병원의 안내 제목(AC-7102.3) */
export function emrWaitTitle(emr: NonBitEmr): string {
  return WAIT_TITLE[emr]
}
