import { ds } from '@/components/ui/classes'

// 자료실 화면의 반복 모양(승인 시안 docs/mockups/library/index.html의 .btn·.tbtn·.fc·.ob·.inp·.tb·.chip 값, spec library design.md '화면').
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): ds 묶음에서 768px 미만에서만 바뀌는 클래스(max-md 앞말)를 뺀다.
// 빼기·바꾸기만 하므로 남는 이름은 classes.ts에 통째로 적혀 있고, 바꿔 넣는 이름은 이 파일에 통째로 적는다(Tailwind가 소스 글자에서 찾는다)

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
  // 단추(시안 .btn 36px · .btn.sm 32px · .btn.danger 빨간 글자)
  button: pc(ds.button.secondary),
  primary: pc(ds.button.primary),
  buttonSmall: pc(ds.button.secondarySmall),
  danger: pc(ds.button.danger),
  dangerSmall: swap(pc(ds.button.secondarySmall), 'text-ink', 'text-negative'),
  // 옛 판 보기·접기(시안 .tbtn: 28px·좌우 4px·왼쪽 -4px·13px 500 accent, 올림 밑줄)
  toggle: `-ml-1 inline-flex h-7 items-center gap-1 px-1 text-small font-medium text-accent underline-offset-3 hover:underline ${press} ${ds.focusRing}`,
  // 분류 칩(시안 .fc 36px·좌우 12px·사이 6px): 눌리면 accent 테두리·바탕 + 안쪽 1px 고리
  choice: `inline-flex h-9 items-center gap-1.5 border px-3 text-body ${press} ${ds.focusRing} border-line-strong bg-surface font-medium text-ink-2 hover:bg-canvas`,
  choiceOn: `inline-flex h-9 items-center gap-1.5 border px-3 text-body ${press} ${ds.focusRing} border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-accent ring-inset`,
  // 올리기 창 분류 단추(시안 .ob): 크기는 칩과 같고 글자는 ink 400, 잠기면 40% 흐림
  option: `inline-flex h-9 items-center border px-3 text-body ${press} ${ds.focusRing} border-line-strong bg-surface font-normal text-ink not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40`,
  optionOn: `inline-flex h-9 items-center border px-3 text-body ${press} ${ds.focusRing} border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-accent ring-inset`,
  // 칸(시안 .field·.lb·.req·.inp·.help·.ferr)
  field: 'grid min-w-0 content-start gap-1.5',
  label: 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink',
  labelHint: 'text-caption font-normal text-muted',
  input: pc(ds.input),
  help: ds.help,
  fieldError: ds.fieldError,
  // 표(시안 .tb): 머리 40px·몸 44px, 이름 칸만 줄바꿈(위아래 10px), 크기 칸 오른쪽 맞춤, 접은 판 위 줄은 아래 선 없음
  panel: ds.panel,
  tableWrap: ds.table.wrap,
  table: ds.table.table,
  th: ds.table.th,
  thNum: swap(ds.table.th, 'text-left', 'text-right'),
  row: ds.table.row,
  td: ds.table.td,
  tdSub: ds.table.tdSub,
  tdNum: ds.table.tdNum,
  tdName: `${swap(ds.table.td, 'whitespace-nowrap', 'whitespace-normal')} py-2.5`,
  tdAction: `${ds.table.td} text-right`,
  noLine: (classes: string) => swap(classes, 'border-b', 'border-b-0'),
  chipLatest: ds.chip.positive,
  // 떠 있는 층(확인 창·올리기 창)
  layer: ds.layer,
} as const
