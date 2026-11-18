// 데스크 계정 (specs/desk-feedback REQ-6304, design.md '③ 설정 데스크 계정 칸', ADR-031).
// 원장이 설정에서 더한 데스크 구글 메일 한 줄. addedAt = 더한 시각, signedInAt = 더한 뒤 그 메일 계정의 가장 최근 로그인 시각(없으면 null). 둘 다 ISO 글자
export type DeskMember = { id: string; email: string; addedAt: string; signedInAt: string | null }

/** add_desk_member의 답: 더함 · 메일 모양 아님 · 이미 병원 계정 · 이미 데스크 메일 · 5개 다 참 */
export type DeskAddResult = 'added' | 'bad' | 'taken' | 'used' | 'limit'

/** 한 병원의 데스크 계정 수 한도(DB 함수 add_desk_member와 같은 수) */
export const DESK_MAX = 5
