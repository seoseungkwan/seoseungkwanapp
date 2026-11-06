// 치료 묶음(spec revenue design.md 7절). 이름이 일반적인 까닭: 통계 처방별 추세는 같은 모양(RxGroup)을 쓰지만 표는 따로(stats_rx_groups)다(spec treatment-trend). 매출만의 칸을 넣지 않는다

/** id null = 아직 저장 안 함 */
export type RxGroup = { id: string | null; name: string; codes: string[]; sortOrder: number }

export const RX_GROUP_NAME_MAX = 30
export const RX_GROUPS_MAX = 50
export const RX_GROUP_CODES_MAX = 1000
