import { hasPrivateShape } from '@/lib/payload/validate'
import {
  GUIDE_LIMITS,
  PICTURE_IDS,
  type GuideContent,
  type GuideDrawing,
  type GuideField,
  type GuideLine,
  type GuideMark,
  type GuideProblems,
  type PictureId,
} from '@/types/formGuide'
import { checkDrawing } from './guideDrawing'
import { layoutGuide } from './guideLayout'
import type { GuideColors } from './logoColors'
import { checkStyle, isDefaultStyle, type FormStyle } from './style'

// 서식 탭 환자 안내문의 칸 규칙: 칸 검사·저장 값 검사·목록 제목·파일 이름 (specs/forms-guide REQ-4502, design.md 3절).
// 배치 넘침 까닭(칸 넘침·띠 넘침 band)은 guideLayout.ts가 붙이고, 빈 칸·글자 수·개인정보·윗줄만·강조·줄 수는 여기서 붙인다.
// 화면·저장·뽑기의 막음은 guideProblems 하나로 정한다. 네트워크·console·저장소를 쓰지 않는 순수 함수다

const CONTROL = /\p{Cc}/u
// 그림 파일 이름에 쓸 수 없는 글자(윈도우 파일 이름 규칙)
const FILE_UNSAFE = /[\\/:*?"<>|]/g

// 저장 값의 열쇠 13개(GuideContent)와 줄의 열쇠 둘
const GUIDE_KEYS = ['tag', 'subtitle', 'big1', 'big2', 'firstSmall', 'boxTop', 'boxBottom', 'picture', 'drawing', 'bandTitle', 'mark', 'lines', 'note'] as const
const LINE_KEYS = ['text', 'em'] as const
// 있어도 되고 없어도 되는 열쇠: 직접 고른 두 색(clinic-profile AC-6604.6)·글씨·로고 값(form-style AC-6806.3)
const OPTIONAL_KEYS = ['colors', 'style'] as const
const COLOR_KEYS = ['main', 'dark'] as const
const COLOR_HEX = /^#[0-9a-f]{6}$/
const TEXT_FIELDS: readonly GuideField[] = ['tag', 'subtitle', 'big1', 'big2', 'boxTop', 'boxBottom', 'bandTitle', 'note']
// 꼭 적어야 하는 칸과 비었을 때 까닭(그 밖의 글 칸은 비워도 된다)
const REQUIRED: Partial<Record<GuideField, string>> = {
  tag: '머리표를 적어 주세요',
  subtitle: '작은 제목을 적어 주세요',
  big1: '큰 문구 윗줄을 적어 주세요',
  big2: '큰 문구 아랫줄을 적어 주세요',
}
const PRIVATE = '전화번호·주민번호·메일 주소 모양은 넣을 수 없어요'
const TOP_ONLY = '윗줄만 쓸 수는 없어요. 아랫줄을 적어 주세요'
const EM_MISSING = '그 줄에 있는 낱말만 강조할 수 있어요'
const NO_LINES = '줄을 하나 이상 적어 주세요'
const TOO_MANY = `줄은 ${GUIDE_LIMITS.lines}개까지예요`
const BLANK_LINE = '줄 글을 적거나 [빼기]를 눌러 주세요'

type Fields = Record<string, unknown>

const lengthOf = (text: string) => Array.from(text).length
const isPrivate = (text: string) => CONTROL.test(text) || hasPrivateShape(text)
const isMark = (value: unknown): value is GuideMark => value === 'check' || value === 'number'
const isPicture = (value: unknown): value is PictureId | 'custom' | null =>
  value === null || value === 'custom' || (PICTURE_IDS as readonly unknown[]).includes(value)

// 정해진 열쇠(keys)가 빠짐없이, 그것만 있는 객체(배열·null 아님)
function exactly(value: unknown, keys: readonly string[]): Fields | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const own = Object.keys(value)
  return own.length === keys.length && keys.every((key) => own.includes(key)) ? (value as Fields) : null
}

// 앞뒤 공백을 뗀 글(빈 글 아님)의 글자 수·제어 문자·개인정보 모양
function textProblem(text: string, max: number): string | null {
  if (lengthOf(text) > max) return `${max}자까지 적을 수 있어요`
  if (isPrivate(text)) return PRIVATE
  return null
}

// 칸 검사(AC-4502.1~4502.4). 글자 수는 앞뒤 공백을 뗀 유니코드 글자 수. 까닭 열쇠는 글 칸 이름·line<i>·em<i>·lines
export function checkGuide(c: GuideContent): GuideProblems {
  const problems: GuideProblems = {}

  for (const key of TEXT_FIELDS) {
    const text = c[key].trim()
    const problem = text === '' ? (REQUIRED[key] ?? null) : textProblem(text, GUIDE_LIMITS[key])
    if (problem) problems[key] = problem
  }
  // 흰 상자는 아랫줄만 쓸 수 있고 윗줄만은 안 된다
  if (c.boxTop.trim() !== '' && c.boxBottom.trim() === '') problems.boxBottom = TOP_ONLY

  // 줄: 1~4개. 모두 빈 글이면 줄 없음 하나로 알리고(빈 줄마다 붙이지 않는다), 다른 줄이 있을 때만 빈 줄에 붙인다
  const anyFilled = c.lines.some((line) => line.text.trim() !== '')
  if (c.lines.length > GUIDE_LIMITS.lines) problems.lines = TOO_MANY
  else if (!anyFilled) problems.lines = NO_LINES
  c.lines.forEach((line, i) => {
    const text = line.text.trim()
    const problem = text === '' ? (anyFilled ? BLANK_LINE : null) : textProblem(text, GUIDE_LIMITS.line)
    if (problem) problems[`line${i}`] = problem
    // 강조: 빈 글이거나 그 줄 글 안에 그대로 있는 글
    if (line.em === '') return
    if (isPrivate(line.em.trim())) problems[`em${i}`] = PRIVATE
    else if (!line.text.includes(line.em)) problems[`em${i}`] = EM_MISSING
  })

  return problems
}

// 배치 까닭과 칸 검사 까닭을 합친다. 같은 칸이면 칸 검사 까닭이 이긴다.
// 배치는 그림과 같은 글씨 크기(c.style)로 본다(spec form-style AC-6804.7)
export function guideProblems(c: GuideContent & { style?: FormStyle }): GuideProblems {
  return { ...layoutGuide(c).problems, ...checkGuide(c) }
}

// 안내문 값: 칸 13개 + 직접 고른 두 색(spec clinic-profile REQ-6604 AC-6604.5·AC-6604.6, design.md 6절).
// 색은 [직접 고르기]일 때만 colors 열쇠로 둔다. 열쇠가 없거나 null이면 [자동](로고 색 또는 지금 색)이다 — 색을 저장하지 않은 옛 안내문도 [자동].
// 글씨·로고 값(spec form-style design.md 2절)은 처음대로가 아닐 때만 style 열쇠로 둔다. 열쇠가 없으면 처음대로
export type GuideValue = GuideContent & { colors?: GuideColors | null; style?: FormStyle }

// 직접 고른 두 색: { main, dark }('#' + 소문자 16진수 6자리)만 새 객체로. 아니면 null
export function checkGuideColors(value: unknown): GuideColors | null {
  const v = exactly(value, COLOR_KEYS)
  if (v === null) return null
  const { main, dark } = v
  return typeof main === 'string' && typeof dark === 'string' && COLOR_HEX.test(main) && COLOR_HEX.test(dark) ? { main, dark } : null
}

// 안내문의 직접 고른 색. 없거나 null이거나 모양이 틀리면 null([자동])
export function guideColorsOf(c: GuideValue): GuideColors | null {
  return checkGuideColors(c.colors)
}

// 저장한 줄·저장 직전 값(AC-4502.5): 모양이 정확하고 guideProblems가 빈 값만, 글 칸의 앞뒤 공백을 뗀 새 객체로. 아니면 null.
// 더할 수 있는 열쇠는 colors·style 둘뿐이다. colors(AC-6604.6): 맞는 두 색이면 함께 남기고, null이면 열쇠 없이([자동]), 틀리면 null.
// style(form-style AC-6806.3): 정확히 여섯 열쇠·범위·색 모양이면 함께 남기고, 처음대로면 열쇠 없이, 틀리면(null 포함) null
export function checkGuideValue(value: unknown): GuideValue | null {
  const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)
  const extra = isObject ? OPTIONAL_KEYS.filter((key) => Object.hasOwn(value, key)) : []
  const v = exactly(value, [...GUIDE_KEYS, ...extra])
  if (v === null) return null
  let colors: GuideColors | null = null
  if (extra.includes('colors') && v.colors !== null) {
    colors = checkGuideColors(v.colors)
    if (colors === null) return null
  }
  let style: FormStyle | null = null
  if (extra.includes('style')) {
    style = checkStyle(v.style)
    if (style === null) return null
  }

  const texts = {} as Record<GuideField, string>
  for (const key of TEXT_FIELDS) {
    const text = v[key]
    if (typeof text !== 'string') return null
    texts[key] = text.trim()
  }
  const { firstSmall, picture, mark } = v
  if (typeof firstSmall !== 'boolean' || !isMark(mark) || !isPicture(picture)) return null

  // AI 그림은 고른 그림이 custom일 때만 담고, 그때는 checkDrawing이 다시 만든 값을 쓴다
  let drawing: GuideDrawing | null = null
  if (picture === 'custom') {
    drawing = checkDrawing(v.drawing)
    if (drawing === null) return null
  } else if (v.drawing !== null) return null

  if (!Array.isArray(v.lines)) return null
  const lines: GuideLine[] = []
  for (const item of Array.from(v.lines as unknown[])) { // 비어 있는 칸은 undefined가 되어 걸린다
    const line = exactly(item, LINE_KEYS)
    if (line === null || typeof line.text !== 'string' || typeof line.em !== 'string') return null
    lines.push({ text: line.text.trim(), em: line.em.trim() })
  }

  const content: GuideContent = {
    tag: texts.tag,
    subtitle: texts.subtitle,
    big1: texts.big1,
    big2: texts.big2,
    firstSmall,
    boxTop: texts.boxTop,
    boxBottom: texts.boxBottom,
    picture,
    drawing,
    bandTitle: texts.bandTitle,
    mark,
    lines,
    note: texts.note,
  }
  // 줄 넘침은 검사한 글씨 크기를 넣은 배치로 본다(AC-6804.7)
  if (Object.keys(guideProblems(style === null ? content : { ...content, style })).length !== 0) return null
  const out: GuideValue = colors ? { ...content, colors } : content
  if (style !== null && !isDefaultStyle(style)) out.style = style
  return out
}

// 저장할 값: 고른 그림이 custom이 아니면 drawing을 null로 바꾼 새 객체(받은 객체는 고치지 않는다).
// 화면은 다른 그림을 골라도 AI 그림을 남겨 두므로, 저장·readyGuide는 checkGuideValue(savableGuide(content))를 쓴다
export function savableGuide(c: GuideValue): GuideValue {
  return { ...c, drawing: c.picture === 'custom' ? c.drawing : null }
}

export function guideTitle(c: GuideContent): string {
  return c.tag.trim()
}

export function guideFileName(c: GuideContent): string {
  return `환자안내문_${c.tag.replace(FILE_UNSAFE, '').trim()}.png`
}

// 새 안내문: 빈 글 칸, 윗줄 작게 아님, 그림·AI 그림 없음, 체크 표시, 빈 줄 하나. 여러 곳이 같이 쓰니 얼려 둔다
export const BLANK_GUIDE: GuideContent = Object.freeze({
  tag: '',
  subtitle: '',
  big1: '',
  big2: '',
  firstSmall: false,
  boxTop: '',
  boxBottom: '',
  picture: null,
  drawing: null,
  bandTitle: '',
  mark: 'check',
  lines: Object.freeze([Object.freeze({ text: '', em: '' })]) as GuideLine[],
  note: '',
})
