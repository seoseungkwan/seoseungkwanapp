import type { ReactNode } from 'react'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { LOGO_SCALE, TEXT_SCALE, type FormStyle } from '@/lib/forms/style'
import { ColorChips } from './ColorChips'

// 서식 편집 칸 맨 아래 '글씨·로고' 칸 (spec form-style REQ-6801 AC-6801.1·AC-6801.2·AC-6801.6~AC-6801.8, design.md 8절,
// 승인 시안 docs/mockups/form-style/index.html). 줄: 제목 글씨 · 본문 글씨 · (강조 색 — 진료일정 안내만, accentRow) · 로고, 도움말, [처음대로].
// 글씨 줄은 '크기' 밀대(%)와 색 고르기(ColorChips), 로고 줄은 밀대와 로고 색 고르기. 값(style)은 부르는 쪽 상태에 있고 바꾸면 새 값 전체를 onStyle로 보낸다.
// 색을 칠할 수 없는 로고(배경이 남은 그림)면 로고 색 고르기만 막고 까닭을 보인다 — 저장된 로고 색 값은 건드리지 않는다(AC-6801.8).
// 앱 화면 색은 토큰과 ds만 쓴다. 시안에서만 있는 것('어두운 AI 배경으로 보기', 강조 색 제목 옆 설명)은 넣지 않는다(notes.md).
// 보는 중(admin-view AC-8011.1)에는 [처음대로]를 그리지 않는다(WriteOnly). 칸은 부르는 편집 칸의 ReadOnlyFields가 막는다

const HELP = {
  notice:
    "제목은 '진료일정안내', 본문은 위 안내 두 줄과 카드 속 글씨예요. 본문 색은 안내 두 줄과 카드 이름에 들고, 'N월'·날짜 띠·상태 글씨는 '강조 색'을 따라요. [자동]은 로고가 있으면 로고 색이에요. 자리보다 크게는 커지지 않아요.",
  guide: '제목은 큰 문구 두 줄, 본문은 진회색 띠 안의 줄 글이에요. [자동]이면 제목은 띠 색, 본문은 흰색이에요. 자리보다 크게는 커지지 않아요.',
} as const
const LOCKED = '배경이 있는 로고라 색을 바꿀 수 없어요. 원래 색으로 그려요'
// 묶음 상자: 편집 칸의 다른 묶음(카드·노란 윗단)과 같은 8px 모서리·1px line
const GROUP = 'mt-4 min-w-0 rounded-float border border-line px-3 pt-1 pb-3'
const LEGEND = 'px-1 text-caption text-muted'
// 줄 하나: 아래 점선(마지막 줄 — 로고 — 은 없음, 시안 .row:last-of-type). 묶음 안 div는 줄뿐이다
const ROW = 'flex flex-col gap-2 border-b border-dashed border-line py-3 last-of-type:border-b-0'
const ROW_TITLE = 'text-small font-semibold text-ink'
const SLIDER = `h-8 min-w-0 flex-1 cursor-pointer accent-accent ${ds.focusRing}`

type Range = { readonly min: number; readonly max: number; readonly step: number }

// 줄 하나: 제목(h3) + 오른쪽 덧글(강조 색의 지금 색 글) + 내용. 강조 색 줄(AccentPicker)도 같은 모양을 쓴다
export function StyleRow({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className={ROW}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={ROW_TITLE}>{title}</h3>
        {aside}
      </div>
      {children}
    </div>
  )
}

function SizeSlider({ name, range, value, onValue }: { name: string; range: Range; value: number; onValue: (value: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-small text-ink-2">
      <span className="shrink-0">크기</span>
      <input
        type="range"
        aria-label={name}
        className={SLIDER}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onValue(Number(e.target.value))}
      />
      <span className="w-12 shrink-0 text-right font-semibold text-ink tabular-nums">{`${value}%`}</span>
    </label>
  )
}

type Props = {
  tool: 'notice' | 'guide' // 도움말 글(진료일정 안내·환자 안내문)
  style: FormStyle
  logoSwatches: readonly string[] // 로고에서 뽑은 색 칩(네 고르기 모두에)
  starts: { title: string; body: string; logo: string } // 색이 null일 때 직접 고르기 색 칸의 처음 값
  logoTintable: boolean // 로고에 색을 칠할 수 있다(이름 글자·투명 점이 넉넉한 준비한 그림·읽는 중)
  onStyle: (style: FormStyle) => void
  onReset: () => void // [처음대로]
  accentRow?: ReactNode // 진료일정 안내의 '강조 색' 줄(AccentPicker). 본문 글씨와 로고 사이에 둔다
}

export function StyleControls({ tool, style, logoSwatches, starts, logoTintable, onStyle, onReset, accentRow }: Props) {
  const set = (patch: Partial<FormStyle>) => onStyle({ ...style, ...patch })

  return (
    <fieldset className={GROUP}>
      <legend className={LEGEND}>글씨·로고</legend>
      <StyleRow title="제목 글씨">
        <SizeSlider name="제목 글씨 크기" range={TEXT_SCALE} value={style.titleScale} onValue={(titleScale) => set({ titleScale })} />
        <ColorChips
          label="제목 글씨 색"
          first="자동"
          value={style.titleColor}
          start={starts.title}
          logoSwatches={logoSwatches}
          onChange={(titleColor) => set({ titleColor })}
        />
      </StyleRow>
      <StyleRow title="본문 글씨">
        <SizeSlider name="본문 글씨 크기" range={TEXT_SCALE} value={style.bodyScale} onValue={(bodyScale) => set({ bodyScale })} />
        <ColorChips
          label="본문 글씨 색"
          first="자동"
          value={style.bodyColor}
          start={starts.body}
          logoSwatches={logoSwatches}
          onChange={(bodyColor) => set({ bodyColor })}
        />
      </StyleRow>
      {accentRow}
      <StyleRow title="로고">
        <SizeSlider name="로고 크기" range={LOGO_SCALE} value={style.logoScale} onValue={(logoScale) => set({ logoScale })} />
        <ColorChips
          label="로고 색"
          first="원래 색"
          value={style.logoColor}
          start={starts.logo}
          logoSwatches={logoSwatches}
          disabled={!logoTintable}
          onChange={(logoColor) => set({ logoColor })}
        />
        {!logoTintable && <p className={ds.help}>{LOCKED}</p>}
      </StyleRow>
      <p className={`${ds.help} mt-1`}>{HELP[tool]}</p>
      <WriteOnly>
        <button type="button" className={`${ds.button.secondarySmall} mt-3`} onClick={onReset}>
          처음대로
        </button>
      </WriteOnly>
    </fieldset>
  )
}
