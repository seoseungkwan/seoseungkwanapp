import type { KeysReply, KeyState } from '@/types/location'

// 처음·열쇠 없음 화면의 열쇠 셋 줄(spec location requirements '화면 글 기본값' 열쇠 상태, design.md 14·15절).
// 공공데이터포털(DATA_GO_KR_KEY)·카카오 장소 찾기(KAKAO_REST_KEY)는 서버 경로 keys가 알려 준 상태,
// 카카오 지도(NEXT_PUBLIC_KAKAO_MAP_KEY)는 브라우저가 넣었는지만 안다 → 지도 열쇠 상태는 들어 있어요·안 넣음 둘뿐이다

/** 카카오 지도 열쇠 상태: 넣었는지만 안다 */
export type MapKeyState = Extract<KeyState, 'ok' | 'missing'>
/** 열쇠 없이도 되는 것(열쇠 없음 화면 단추 셋): 매물 붙여 넣기 · 진행 메모 · 개원 비용 계산 */
export type FreeTool = 'listings' | 'memo' | 'costs'
export type KeyRowId = 'data' | 'map' | 'kakao'

/** 열쇠 셋 줄: 이름 · 받는 자료(화면 글 기본값 그대로, 차례도 그대로) */
export const KEY_ROWS: readonly { id: KeyRowId; name: string; gets: string }[] = [
  {
    id: 'data',
    name: '공공데이터포털 열쇠',
    gets: '사는 사람·세대, 아파트·입주 예정, 실거래가, 건물 서류, 둘레 병원·진료 시간·장비, 진료비, 가게, 개폐업, 경로당·체력단련장·학교·교통사고 다발 지역·전통시장, 역·정류장 타고 내린 사람(사람 흐름), 의료급여·차상위',
  },
  { id: 'map', name: '카카오 지도 열쇠', gets: '지도, 거리 사진(로드뷰)·하늘 사진' },
  { id: 'kakao', name: '카카오 장소 찾기 열쇠', gets: '주소 찾기, 둘레 시설(약국·마트·큰 병원·산업단지)' },
]

/** 상태 표 글 */
export const KEY_STATE_TEXT: Record<KeyState, string> = {
  ok: '들어 있어요',
  missing: '안 넣음',
  rejected: '열쇠가 맞지 않아요',
  failed: '확인하지 못했어요',
}

/** 줄마다 상태: 공공 = keys.data · 지도 = mapKey · 장소 찾기 = keys.kakao */
export function keyStates(keys: KeysReply, mapKey: MapKeyState): Record<KeyRowId, KeyState> {
  return { data: keys.data, map: mapKey, kakao: keys.kakao }
}

/** 열쇠 없음 화면을 보일 때: 공공데이터포털·카카오 장소 찾기 열쇠가 둘 다 안 넣음(design.md 14절) */
export function showNoKey(keys: KeysReply): boolean {
  return keys.data === 'missing' && keys.kakao === 'missing'
}
