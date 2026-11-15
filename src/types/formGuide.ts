// 서식 탭 환자 안내문 (specs/forms-guide design.md 2절). 안내문 한 장 = 노란 윗단(머리표·작은 제목·큰 문구 두 줄·흰 상자·그림)
// + 진회색 띠(띠 제목·줄 1~4개·아래 작은 글) + 흰 로고 칸. 화면이 고치는 중인 값도 GuideContent 하나로 다룬다(빈 칸 허용)

// 칸마다 글자 수 한도(앞뒤 공백을 뗀 유니코드 글자 수)와 줄 수 한도
export const GUIDE_LIMITS = { tag: 10, subtitle: 14, big1: 8, big2: 8, boxTop: 16, boxBottom: 14, bandTitle: 16, line: 28, note: 28, lines: 4 } as const

// 미리 그려 둔 그림 16개(차례가 고르기 칸의 차례다)
export const PICTURE_IDS = [
  'spine', 'knee', 'hand', 'syringe', 'document', 'disc', 'idcard', 'clock',
  'chair', 'ticket', 'calendar', 'card', 'pill', 'xray', 'nosign', 'warning',
] as const
export type PictureId = (typeof PICTURE_IDS)[number]

// 그림 16개의 이름(PICTURE_IDS와 같은 차례). 화면 고르기 칸과 AI 정리 시스템 글이 같이 쓴다
export const PICTURES: readonly { id: PictureId; name: string }[] = [
  { id: 'spine', name: '척추' },
  { id: 'knee', name: '무릎' },
  { id: 'hand', name: '손(도수치료)' },
  { id: 'syringe', name: '주사' },
  { id: 'document', name: '서류' },
  { id: 'disc', name: '영상 CD' },
  { id: 'idcard', name: '신분증' },
  { id: 'clock', name: '시계' },
  { id: 'chair', name: '의자' },
  { id: 'ticket', name: '번호표' },
  { id: 'calendar', name: '달력' },
  { id: 'card', name: '결제 카드' },
  { id: 'pill', name: '약' },
  { id: 'xray', name: '엑스레이' },
  { id: 'nosign', name: '금지' },
  { id: 'warning', name: '주의' },
]

// AI 그림(REQ-4511): 170×170 좌표의 도형 목록. 색은 이름으로만 받고, 실제 색 값은 그리는 쪽(화면)이 정한다
export const DRAW_KINDS = ['circle', 'ellipse', 'rect', 'line', 'path'] as const
export type DrawKind = (typeof DRAW_KINDS)[number]
// kind마다 nums 개수: circle(cx cy r) · ellipse(cx cy rx ry) · rect(x y w h rx) · line(x1 y1 x2 y2) · path(없음, d에 적는다)
export const DRAW_NUMS: Readonly<Record<DrawKind, number>> = { circle: 3, ellipse: 4, rect: 5, line: 4, path: 0 }
export const DRAW_COLORS = ['yellow', 'dark', 'white', 'none'] as const // 노랑·진회색·흰색·칠하지 않음
export type DrawColor = (typeof DRAW_COLORS)[number]
export type DrawShape = { kind: DrawKind; nums: number[]; d: string; fill: DrawColor; stroke: DrawColor; width: number } // d: path만, 아니면 ''
export type GuideDrawing = { subject: string; shapes: DrawShape[] } // subject: 사람이 적은 '그릴 것'
// 그릴 것 글자 수 · 도형 수 · path d 글자 수 · 선 굵기 · JSON 글 바이트 수
export const DRAWING_LIMITS = { subject: 20, shapes: 40, path: 300, width: 12, bytes: 8000 } as const

export type GuideMark = 'check' | 'number' // 줄 표시: 체크(✓) 또는 번호(1·2·3)
export type GuideLine = { text: string; em: string } // em: 노랑 강조 낱말(빈 글 = 없음)
export type GuideContent = {
  tag: string
  subtitle: string
  big1: string
  big2: string
  firstSmall: boolean // 큰 문구 윗줄 작게
  boxTop: string
  boxBottom: string
  picture: PictureId | 'custom' | null // 'custom' = AI로 그린 그림(drawing)
  // AI로 그린 그림. 화면에서는 다른 그림을 골라도 남겨 두고, 저장할 때는 picture가 'custom'일 때만 담는다
  drawing: GuideDrawing | null
  bandTitle: string
  mark: GuideMark
  lines: GuideLine[]
  note: string
}
export type SavedGuide = { id: string; updatedAt: string; content: GuideContent }
export type GuideField = 'tag' | 'subtitle' | 'big1' | 'big2' | 'boxTop' | 'boxBottom' | 'bandTitle' | 'note'
// 까닭 열쇠: 글 칸 이름, `line0`~`line3`, `em0`~`em3`, `lines`(줄 없음), `band`(띠 넘침)
export type GuideProblems = Partial<Record<string, string>>
