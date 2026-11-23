// 웹이 받아 주는 도우미·확장 버전(design.md 4-4·13절). 도우미 버전(helper/Directory.Build.props)을 올릴 때
// LATEST_HELPER도 같은 커밋에서 올린다(handshake.test.ts가 맞춰 본다). 막아야 할 만큼 바뀌었으면 MIN_HELPER도 올린다
import { PROTOCOL } from './protocol'

/** 이보다 낮은 도우미는 막는다(update-helper) */
export const MIN_HELPER = '0.3.0'
/** 이보다 낮은 도우미는 쓰게 두되 "새 도우미가 있어요"를 보인다 */
export const LATEST_HELPER = '0.13.2'
/** 이보다 낮은 확장은 막는다(update-extension) */
export const MIN_EXTENSION = '0.1.0'
/**
 * 예약 문자 명단·장기 미방문 명단(spec patients-bit-lists)을 읽는 도우미. 이보다 낮으면 두 도구는 읽지 않고 업데이트 안내를 보인다(AC-2802.5).
 * 다른 도구는 막지 않는다(MIN_HELPER는 그대로). 이 묶음의 도우미를 내보낼 때(TASK-7) 도우미 버전·LATEST_HELPER를 이 값으로 맞춘다
 */
export const LIST_HELPER = '0.5.0'
/**
 * 수납일지 하루 장부(contact.targets kind 'sunap')·달 파일 sunap 칸(spec sunap-ilji)을 쓰는 도우미. 이보다 낮으면 수납일지 탭은 읽지 않고
 * 업데이트 안내를 보인다. 다른 도구는 막지 않는다(MIN_HELPER는 그대로)
 */
export const SUNAP_HELPER = '0.8.0'
/**
 * 예약 탭 비트 찾기·접수와 비트 예약(contact.targets kind 'calfind'·'calday', spec clinic-calendar)을 쓰는 도우미. 이보다 낮으면 예약 탭은
 * 비트 없는 기기처럼 그린다(찾기·비트 예약 칸·도착 셈 없음). 다른 도구는 막지 않는다(MIN_HELPER는 그대로)
 */
export const CAL_HELPER = '0.10.0'
/**
 * 통계 답 v5의 환자·날 금액 줄 extra.pays(spec stats-insights)를 보내는 도우미. 이보다 낮으면 매출 칸 '신환 1명당' 탭은 업데이트 안내만 보인다(AC-6106.5).
 * 다른 도구는 막지 않는다(MIN_HELPER는 그대로)
 */
export const VALUE_HELPER = '0.11.0'
/**
 * bit.input 항목 appends(비트 메모 뒤에 붙이기, spec clinic-profile REQ-6611)를 아는 도우미. 옛 도우미는 appends를 모르는 칸으로 묶음 전체를 거절하므로
 * 이보다 낮으면 청구 화면이 [뒤에 붙이기]를 보이지 않는다(AC-6611.1). 다른 도구는 막지 않는다(MIN_HELPER는 그대로)
 */
export const APPEND_HELPER = '0.12.0'

export type WebVersions = { protocol: number; minHelper: string; latestHelper: string; minExtension: string }

export const WEB_VERSIONS: WebVersions = {
  protocol: PROTOCOL,
  minHelper: MIN_HELPER,
  latestHelper: LATEST_HELPER,
  minExtension: MIN_EXTENSION,
}
