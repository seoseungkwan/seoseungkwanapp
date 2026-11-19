import { ds } from '@/components/ui/classes'
import { isLightAccent } from '@/lib/forms/themes'
import { ColorChips } from './ColorChips'
import { StyleRow } from './StyleControls'

// 진료일정(휴진) 안내 '글씨·로고' 칸의 '강조 색' 줄 (spec form-style AC-6801.5·AC-6803.2, design.md 8절, 승인 시안 docs/mockups/form-style).
// 예전 '배경' 칸 아래 '글자 색' 칸(spec forms-accent REQ-4701)이 이름·자리를 바꿔 이 줄이 됐다 — 값(accent, null = 자동)과 옅은 색 경고는 그대로.
// 고르기는 ColorChips([자동] · 로고 색 칩 · 기본 색 16가지 · 직접 고르기), 지금 색 글은 고른 색이면 그 값, 자동이면 '자동 <자동 색>'.
// 자동 색은 로고 두 색이 있으면 로고 색, 없으면 배경 강조색 → 테마 강조색(부르는 쪽 noticeAutoColors). 앱 화면 색은 토큰과 ds만 쓴다

const WARN = '옅은 색이라 흰 글자·흰 카드 위 글이 잘 안 보일 수 있어요'

type Props = {
  month: number // 안내 달 — 도움말 'N월'
  accent: string | null // 직접 고른 강조 색('#' + 소문자 16진수 6자리). null = 자동
  autoAccent: string // 자동일 때 쓰이는 색(미리보기와 같은 자동 강조 색)
  logoSwatches: readonly string[] // 로고에서 뽑은 색 칩
  onAccent: (accent: string | null) => void
}

export function AccentPicker({ month, accent, autoAccent, logoSwatches, onAccent }: Props) {
  const now = accent ?? `자동 ${autoAccent}`
  return (
    <StyleRow title="강조 색" aside={<span className="text-caption text-ink-2 tabular-nums">{now}</span>}>
      <ColorChips label="강조 색" first="자동" value={accent} start={autoAccent} logoSwatches={logoSwatches} onChange={onAccent} />
      <p className={ds.help}>{`'${month}월'·날짜 띠·카드 아래 글이 이 색이에요. 자동은 로고가 있으면 로고 색, 없으면 테마·배경에 맞춰 골라요`}</p>
      {accent !== null && isLightAccent(accent) && <p className="text-small text-warning">{WARN}</p>}
    </StyleRow>
  )
}
