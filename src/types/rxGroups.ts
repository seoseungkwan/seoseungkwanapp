// 치료 묶음(spec revenue design.md 7절). 이름이 일반적인 까닭: 통계 처방별 추세는 같은 모양(RxGroup)을 쓰지만 표는 따로(stats_rx_groups)다(spec treatment-trend). 매출만의 칸을 넣지 않는다

/** id null = 아직 저장 안 함 */
export type RxGroup = { id: string | null; name: string; codes: string[]; sortOrder: number }

// 통계 처방별 추세 묶음만의 칸(spec group-exclude). 매출 RxGroup은 그대로다. 칸은 늘 groupOut·groupCond(treatmentView)로 읽는다
/** 넣는 처방 code는 unless 가운데 하나라도 같은 날 받으면 그 처방으로는 세지 않는다 */
export type RxCond = { code: string; unless: string[] }
/** out = 그날 하나라도 받으면 세지 않는 처방. 두 칸 모두 없으면 빈 것 */
export type StatsRxGroup = RxGroup & { out?: string[]; cond?: RxCond[] }

export const RX_GROUP_NAME_MAX = 30
export const RX_GROUPS_MAX = 50
export const RX_GROUP_CODES_MAX = 1000
