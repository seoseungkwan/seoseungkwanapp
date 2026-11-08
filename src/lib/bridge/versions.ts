// 웹이 받아 주는 도우미·확장 버전(design.md 4-4·13절). 도우미 버전(helper/Directory.Build.props)을 올릴 때
// LATEST_HELPER도 같은 커밋에서 올린다(handshake.test.ts가 맞춰 본다). 막아야 할 만큼 바뀌었으면 MIN_HELPER도 올린다
import { PROTOCOL } from './protocol'

/** 이보다 낮은 도우미는 막는다(update-helper) */
export const MIN_HELPER = '0.3.0'
/** 이보다 낮은 도우미는 쓰게 두되 "새 도우미가 있어요"를 보인다 */
export const LATEST_HELPER = '0.5.0'
/** 이보다 낮은 확장은 막는다(update-extension) */
export const MIN_EXTENSION = '0.1.0'
/**
 * 예약 문자 명단·장기 미방문 명단(spec patients-bit-lists)을 읽는 도우미. 이보다 낮으면 두 도구는 읽지 않고 업데이트 안내를 보인다(AC-2802.5).
 * 다른 도구는 막지 않는다(MIN_HELPER는 그대로). 이 묶음의 도우미를 내보낼 때(TASK-7) 도우미 버전·LATEST_HELPER를 이 값으로 맞춘다
 */
export const LIST_HELPER = '0.5.0'

export type WebVersions = { protocol: number; minHelper: string; latestHelper: string; minExtension: string }

export const WEB_VERSIONS: WebVersions = {
  protocol: PROTOCOL,
  minHelper: MIN_HELPER,
  latestHelper: LATEST_HELPER,
  minExtension: MIN_EXTENSION,
}
