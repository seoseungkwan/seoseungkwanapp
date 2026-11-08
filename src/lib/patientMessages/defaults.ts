// 저장한 문구가 없을 때 쓰는 처음 문구. 옮겨 온 곳: 원본 assets/message_templates.html의 TPLS(이름·글 그대로).
// 원본 id는 표의 kind로 바꿨다: jusa → injection, jinryo → followup (design.md '문자 문구 종류').
// 예약 안내(reservation)는 원본에 없는 새 종류다(spec patients-bit-lists AC-2805.3). 글은 사용자가 양식을 주기 전의 자리 글이고, 받으면 이 파일만 바꾼다

/** 표(message_templates) kind 제약이 받는 종류(20261108000000_message_templates_reservation.sql) */
export const TEMPLATE_KINDS = ['injection', 'followup', 'reservation'] as const
export type TemplateKind = (typeof TEMPLATE_KINDS)[number]

// 원본 TPLS의 note. 표(message_templates)에 칸이 없어 화면 안내 글로 쓴다
export const DEFAULT_TEMPLATE_NOTE = '사용 전 병원명·연락처·진료시간을 수정하세요'

export const DEFAULT_TEMPLATES: readonly { kind: TemplateKind; name: string; body: string; sort_order: number }[] = [
  {
    kind: 'injection',
    name: '주사 안내',
    body: '[병원명 설정 필요]\n\n[*1*]님, 안녕하세요.\n병원명 설정 필요입니다.\n<<DATE>>\n[*2*] 주사 예정일입니다.\n병원에서 안내한 시간에 내원해 주세요.\n\n문의: 전화번호 설정 필요\n진료시간: 병원 진료시간 설정 필요',
    sort_order: 0,
  },
  {
    kind: 'followup',
    name: '진료 안내',
    body: '[병원명 설정 필요]\n\n[*1*]님, 안녕하세요.\n병원명 설정 필요입니다.\n<<DATE>>\n[*2*] 진료 예정일입니다.\n예약 시간을 확인하고 내원해 주세요.\n\n문의: 전화번호 설정 필요\n진료시간: 병원 진료시간 설정 필요',
    sort_order: 1,
  },
  {
    kind: 'reservation',
    name: '예약 안내',
    // [*2*] 자리는 예약 시각이다(예약 문자 명단 넷째 칸)
    body: '[병원명 설정 필요]\n\n[*1*]님, 안녕하세요.\n<<DATE>>\n[*2*]에 예약되어 있어요.\n\n문의: 전화번호 설정 필요',
    sort_order: 2,
  },
]
