import { ds } from '@/components/ui/classes'
import { BASIC_COLORS } from './colorChoices'

// 서식 색 고르기 한 벌 (spec form-style REQ-6801 AC-6801.3·AC-6801.4·AC-6801.8, REQ-6802 AC-6802.2, design.md 8절,
// 승인 시안 docs/mockups/form-style/index.html chooser()). 차례: ① 첫 단추([자동] 또는 [원래 색]) ② 로고 색 칩이 있으면 '로고 색' 글과 칩
// ③ '기본 색' 글과 16가지 칩 ④ '직접 고르기' 색 칸. 묶음 하나(role group, 이름 = 고르기 이름)이고 지금 값과 같은 단추·칩만 눌려 있다.
// 값이 어느 칩과도 다르면 색 칸에 눌린 표시(테두리, data-own). 칩 바탕은 사용자가 고르는 색 값이라 style 속성으로만 넣고, 앱 색은 토큰과 ds만 쓴다

// 막힘(AC-6801.8): 40% 흐림 + not-allowed 커서(ds 공통 막힘과 같은 값)
const OFF = 'disabled:cursor-not-allowed disabled:opacity-40'
// 칩: 지름 28px(휴대폰 44px) 둥근 단추, 흰 띠 2px 안에 색. 눌리면 바깥 2px ink 고리
const CHIP = `size-7 shrink-0 cursor-pointer rounded-full border-2 border-surface ${ds.focusRing} ${OFF} max-md:size-11`
const CHIP_ON = 'ring-2 ring-ink'
const CHIP_OFF = 'ring-1 ring-line-strong'
// 색 칸: 44×32px·안쪽 2px(AccentPicker·환자 안내문 '색' 칸과 같은 모양). 직접 고른 색이면 accent 테두리
const COLOR_INPUT = `h-8 w-11 shrink-0 cursor-pointer rounded-control border bg-surface p-0.5 ${ds.focusRing} ${OFF}`
const COLOR_OWN = 'border-accent ring-1 ring-accent'
const COLOR_PLAIN = 'border-line-strong'
const GROUP_TEXT = 'text-caption text-muted'
const SEP = 'h-5 w-px shrink-0 bg-line'

const BASIC_HEXES: readonly string[] = BASIC_COLORS.map((c) => c.hex)

type Props = {
  label: string // 고르기 이름(묶음 이름·칩 이름 앞머리) — '제목 글씨 색'·'본문 글씨 색'·'강조 색'·'로고 색'
  first: '자동' | '원래 색' // 첫 단추 글(누르면 null)
  value: string | null // 지금 값('#' + 소문자 16진수 6자리). null = 첫 단추
  start: string // 값이 null일 때 색 칸의 처음 값
  logoSwatches: readonly string[] // 로고에서 뽑은 색(없으면 '로고 색' 글과 칩이 없다)
  disabled?: boolean // 단추·칩·색 칸 모두 막는다(색을 칠할 수 없는 로고)
  onChange: (value: string | null) => void
}

export function ColorChips({ label, first, value, start, logoSwatches, disabled = false, onChange }: Props) {
  const own = value !== null && !logoSwatches.includes(value) && !BASIC_HEXES.includes(value)
  const chip = (name: string, hex: string, key: string) => {
    const on = value === hex
    return (
      <button
        key={key}
        type="button"
        aria-label={`${label} ${name}`}
        title={name}
        aria-pressed={on}
        disabled={disabled}
        className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
        style={{ backgroundColor: hex }}
        onClick={() => onChange(hex)}
      />
    )
  }
  const pick = (next: string) => onChange(next.toLowerCase())

  return (
    <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-1.5">
      <div className={ds.segment.group}>
        <button
          type="button"
          aria-pressed={value === null}
          disabled={disabled}
          className={`${ds.segment.button} ${value === null ? ds.segment.on : ds.segment.off} ${OFF}`}
          onClick={() => onChange(null)}
        >
          {first}
        </button>
      </div>
      {logoSwatches.length > 0 && (
        <>
          <span className={GROUP_TEXT}>로고 색</span>
          {logoSwatches.map((hex, i) => chip(`로고 색 ${i + 1}`, hex, `logo-${i}`))}
          <span aria-hidden="true" className={SEP} />
        </>
      )}
      <span className={GROUP_TEXT}>기본 색</span>
      {BASIC_COLORS.map((c) => chip(c.name, c.hex, c.name))}
      <span aria-hidden="true" className={SEP} />
      <label className={`inline-flex items-center gap-1.5 ${GROUP_TEXT}`}>
        <span>직접 고르기</span>
        <input
          type="color"
          aria-label={`${label} 직접 고르기`}
          data-own={own ? 'true' : undefined}
          disabled={disabled}
          className={`${COLOR_INPUT} ${own ? COLOR_OWN : COLOR_PLAIN}`}
          value={value ?? start}
          onChange={(e) => pick(e.target.value)}
        />
      </label>
    </div>
  )
}
