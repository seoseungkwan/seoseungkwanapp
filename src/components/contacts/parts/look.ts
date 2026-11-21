import { ds } from '@/components/ui/classes'

// 주소록 부품의 반복 모양(시안 docs/mockups/contacts/index.html의 .btn·.tbtn·.mini·.fc·.ob·.inp·.chip 값).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21, spec contacts design.md '이 명세가 정한 것' 마지막): ds 묶음에서 768px 미만에서만 바뀌는 클래스(max-md 앞말)를 뺀다.
// 빼기만 하므로 남는 이름은 모두 classes.ts에 통째로 적혀 있다(Tailwind가 찾는다). 새 이름은 이 파일에 통째로 적는다

const PHONE_ONLY = /^max-md:/
/** ds 묶음에서 폰 전용 클래스를 뺀다 */
const pc = (classes: string) =>
  classes
    .split(/\s+/)
    .filter((c) => c !== '' && !PHONE_ONLY.test(c))
    .join(' ')
/** 같은 속성 클래스를 하나 바꾼다(겹치면 어느 쪽이 이길지 모르므로 더하지 않고 바꾼다) */
const swap = (classes: string, from: string, to: string) =>
  classes
    .split(' ')
    .map((c) => (c === from ? to : c))
    .join(' ')

const press = 'cursor-pointer whitespace-nowrap rounded-control transition'

export const look = {
  focusRing: ds.focusRing,
  // 단추(시안 .btn 36px · .btn.sm 32px)
  button: pc(ds.button.secondary),
  primary: pc(ds.button.primary),
  buttonSmall: pc(ds.button.secondarySmall),
  primarySmall: pc(ds.button.primarySmall),
  danger: pc(ds.button.danger),
  dangerSmall: swap(pc(ds.button.secondarySmall), 'text-ink', 'text-negative'),
  // 아이콘만 있는 닫기(시안 .btn.icon.ghost 36×36)
  iconButton: swap(pc(ds.button.ghost), 'px-4', 'w-9 px-0'),
  // 글자 단추(시안 .tbtn: 32px·좌우 4px·13px 500)
  textButton: `inline-flex h-8 items-center gap-1 px-1 text-small font-medium underline-offset-3 hover:underline ${press} ${ds.focusRing} text-accent`,
  textButtonMuted: `inline-flex h-8 items-center gap-1 px-1 text-small font-medium underline-offset-3 hover:underline ${press} ${ds.focusRing} text-ink-2`,
  textButtonDanger: `inline-flex h-8 items-center gap-1 px-1 text-small font-medium underline-offset-3 hover:underline ${press} ${ds.focusRing} text-negative`,
  // 작은 단추(시안 .mini: 28px·좌우 8px·12px 500) — [복사]·[보기]/[가리기]
  mini: `inline-flex h-7 items-center gap-1 border px-2 text-caption font-medium ${press} ${ds.focusRing} border-line-strong bg-surface text-ink-2 hover:bg-canvas`,
  miniDone: `inline-flex h-7 items-center gap-1 border px-2 text-caption font-medium ${press} ${ds.focusRing} border-positive/40 bg-positive-soft text-positive`,
  // 고르는 단추(시안 .fc 분류 칩 · .ob 판 분류): 36px·좌우 12px, 눌리면 accent 테두리·바탕 + 안쪽 1px 고리
  choice: `inline-flex h-9 items-center gap-1.5 border px-3 text-body ${press} ${ds.focusRing} border-line-strong bg-surface font-medium text-ink-2 hover:bg-canvas`,
  choiceOn: `inline-flex h-9 items-center gap-1.5 border px-3 text-body ${press} ${ds.focusRing} border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-accent ring-inset`,
  // 판 분류 단추(시안 .ob): 크기는 칩과 같고 글자는 ink 400, 눌리면 칩과 같다
  option: `inline-flex h-9 items-center border px-3 text-body ${press} ${ds.focusRing} border-line-strong bg-surface font-normal text-ink hover:bg-canvas`,
  optionOn: `inline-flex h-9 items-center border px-3 text-body ${press} ${ds.focusRing} border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-accent ring-inset`,
  // 칸(시안 .field·.inp·.help·.ferr)
  field: 'grid min-w-0 content-start gap-1.5',
  label: 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink',
  required: 'text-caption font-normal text-muted',
  input: pc(ds.input),
  // 안에 그림·단추·단위가 있는 칸: 좌우 12px 대신 그 자리만큼(찾기 칸 왼쪽 36·오른쪽 40, 원 단위 오른쪽 32, [보기] 오른쪽 64)
  searchInput: swap(pc(ds.input), 'px-3', 'pr-10 pl-9'),
  suffixInput: swap(pc(ds.input), 'px-3', 'pr-8 pl-3'),
  secretInput: swap(pc(ds.input), 'px-3', 'pr-16 pl-3'),
  textarea: swap(pc(ds.input), 'h-11', 'h-22 resize-y py-2.5'),
  help: ds.help,
  fieldError: ds.fieldError,
  // 칩(시안 .chip)
  chipNeutral: ds.chip.neutral,
  chipSoon: ds.chip.warning,
  chipToday: swap(swap(ds.chip.warning, 'border-transparent', 'border-warning/40'), 'font-medium', 'font-semibold'),
  chipEnded: swap(swap(ds.chip.neutral, 'text-ink-2', 'text-muted'), 'font-medium', 'font-normal'),
  // 떠 있는 층(확인 창)
  layer: ds.layer,
} as const
