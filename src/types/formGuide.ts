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
  picture: PictureId | null
  bandTitle: string
  mark: GuideMark
  lines: GuideLine[]
  note: string
}
export type SavedGuide = { id: string; updatedAt: string; content: GuideContent }
export type GuideField = 'tag' | 'subtitle' | 'big1' | 'big2' | 'boxTop' | 'boxBottom' | 'bandTitle' | 'note'
// 까닭 열쇠: 글 칸 이름, `line0`~`line3`, `em0`~`em3`, `lines`(줄 없음), `band`(띠 넘침)
export type GuideProblems = Partial<Record<string, string>>
