// 치료 묶음(spec revenue design.md 7절). 이름이 일반적인 까닭: 통계 탭이 합친 뒤 다시 쓴다(design.md 11절). 매출만의 칸을 넣지 않는다

/** id null = 아직 저장 안 함 */
export type RxGroup = { id: string | null; name: string; codes: string[]; sortOrder: number }

export const RX_GROUP_NAME_MAX = 30
export const RX_GROUPS_MAX = 50
export const RX_GROUP_CODES_MAX = 1000
