import { ds } from '@/components/ui/classes'

// 동네 훑기 부품의 반복 모양(시안 docs/mockups/location/index.html의 .btn·.btn.primary·.field·.inp·.help·.chip.accent·.tbtn·.sh 값).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): ds 묶음에서 768px 미만에서만 바뀌는 클래스(max-md 앞말)를 뺀다.
// 빼기만 하므로 남는 이름은 모두 classes.ts에 통째로 적혀 있다(Tailwind가 찾는다)

// 앞말 글자를 통째로 적지 않는다(source.test가 소스에서 화면 폭 앞말을 찾는다) → 뒤에 쌍점이 오는지만 본다
const PHONE_ONLY = /^max-md(?=:)/
/** ds 묶음에서 폰 전용 클래스를 뺀다 */
const pc = (classes: string) =>
  classes
    .split(/\s+/)
    .filter((c) => c !== '' && !PHONE_ONLY.test(c))
    .join(' ')

export const look = {
  // 단추(시안 .btn 36px · .btn.primary 36px)
  button: pc(ds.button.secondary),
  primary: pc(ds.button.primary),
  // 칸(시안 .scanbar .field 180px · .inp 44px)
  field: 'grid w-45 min-w-0 content-start gap-1.5',
  label: 'text-small font-semibold text-ink',
  select: pc(ds.input),
  help: ds.help,
  // 후보 칩(시안 .chip.accent)
  chip: ds.chip.accent,
  // 글자 단추(시안 .tbtn — 높이 없이 글줄 안에)
  textLink: `inline-flex cursor-pointer items-center gap-1 rounded-control text-caption font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`,
  moreButton: `mt-1 inline-flex h-8 cursor-pointer items-center gap-1 rounded-control px-1 text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`,
  // 묶음 머리(시안 .sh)
  head: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
} as const
