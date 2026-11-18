// 메모 엔진의 안쪽 기본값(clinic-profile design.md 15절). 병원 문구 칸이 없을 때 엔진이 쓰는 값이고, 설정 화면이 같은 값을 흐린 글로 보인다.
// engine.ts에 있던 값을 그대로 옮겼다(값을 바꾸면 우리 의원 골든 결과가 바뀐다) [환자 자료 구역]

/** TPL.mainCentralCodes가 없을 때 Central 시술로 보는 처방코드 */
export const DEFAULT_MAIN_CENTRAL_CODES = 'LA321, LA323, LA326, LA354, LA356, LA357, LA358, LA359'
/** TPL.intervalCodes가 없을 때 주사 간격을 볼 처방코드 */
export const DEFAULT_INTERVAL_CODES = 'LA358, KK090'
/** TPL.intervalDays가 없거나 틀렸을 때 주사 간격 일수 */
export const DEFAULT_INTERVAL_DAYS = 7
/** TPL.twoSiteRules가 없을 때 2부위로 보는 처방(줄마다 `코드` 또는 `코드 = 함께 있어도 되는 코드, …`) */
export const DEFAULT_TWO_SITE_RULES = 'KK090 = LA274, LA272\nKK061\nKK062'
