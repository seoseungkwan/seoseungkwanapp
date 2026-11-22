import { ds } from '@/components/ui/classes'
import { look as methodLook } from '../method/look'

// 처음·열쇠 없음 부품의 반복 모양(시안 docs/mockups/location/index.html의 .btn·.btn.primary.lg·.field·.inp·.help·.chip 값).
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
  // 단추(시안 .btn 36px · .btn.primary.lg 44px)
  button: pc(ds.button.secondary),
  primaryLarge: pc(ds.button.primaryLarge),
  // 머리 [분석 방법](시안 .tools a.btn — 처음 안내 한 장으로 내려가는 링크). 판 단추와 같은 PC 값(method/look.ts)
  methodLink: methodLook.button,
  // 처음 안내 한 장 자리(머리 링크가 내려가 초점을 두는 곳, 시안 #method)
  methodSpot: 'scroll-mt-4 focus:outline-none',
  // 칸(시안 .field·.inp, 고르기 칸도 입력란과 같은 44px)
  field: 'grid min-w-0 content-start gap-1.5',
  label: 'text-small font-semibold text-ink',
  select: pc(ds.input),
  help: ds.help,
  // 상태 표(시안 .chip): 들어 있어요 · 안 넣음 · 열쇠가 맞지 않아요 · 확인하지 못했어요
  chipOk: ds.chip.positive,
  chipMissing: ds.chip.neutral,
  chipRejected: ds.chip.negative,
  chipFailed: ds.chip.warning,
} as const
