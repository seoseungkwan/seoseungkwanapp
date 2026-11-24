import { useId, type InputHTMLAttributes } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import type { FormStyle } from '@/lib/forms/style'
import { autoTheme, themeOf } from '@/lib/forms/themes'
import { MAX_CARDS, MAX_MEMO, MAX_NAME, MAX_STATUS, type DraftCard, type ThemePick } from '@/types/forms'
import { AccentPicker } from './AccentPicker'
import { cardProblems, draftDateLabel, monthProblem, previewNotice, type FormsState } from './formsState'
import { ReadOnlyFields } from './ReadOnlyFields'
import { StyleControls } from './StyleControls'
import { ThemePicker } from './ThemePicker'
import type { Backgrounds } from './useBackgrounds'

// 서식 화면 가운데: 대충 적기 → [정리하기], 안내 달·카드 1~4장, '배경' 칸(ThemePicker — 테마 그림 1·2 / 내 배경)과
// 맨 아래 '글씨·로고' 칸(StyleControls — 제목·본문 글씨, '강조 색' 줄(AccentPicker), 로고) (spec forms REQ-3502·REQ-3503·AC-3504.3,
// spec forms-themes REQ-4610~4612, spec forms-accent REQ-4701, spec form-style REQ-6801, 시안 screen.html '만들기'·docs/mockups/form-style).
// 색·글자는 토큰과 ds만 쓴다. '만들기' 칸(section)은 '배경' 칸으로 끝나고, '글씨·로고' 칸은 같은 패널 안 그 바로 뒤에 둔다
// (ThemePicker.tsx는 고치지 않는다 — forms-accent design.md 7-2절). 예전 '배경' 칸 아래 '글자 색' 칸은 '강조 색' 줄로 옮겼다(AC-6801.5).
// 보는 중(admin-view AC-8011.1)에는 칸을 모두 막고(ReadOnlyFields) [정리하기](AI)·카드 [빼기]·[+ 카드 더하기]를 그리지 않는다(WriteOnly)

const NOTE = '전화번호·주민번호·메일 주소는 적지 마세요. 적은 글은 정리할 때만 AI로 보내고 저장하지 않아요'
const PLACEHOLDER = '예) 5월 5일 어린이날 휴진\n예) 추석 연휴 9월 24일부터 26일까지 쉬어요'
// 여러 줄 글 칸: ds.input과 같은 색·테두리·초점, 높이만 96px부터 늘어난다
const TEXTAREA =
  'min-h-24 w-full min-w-0 resize-y rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden max-md:text-lead'
const SECTION_TITLE = 'text-body font-semibold text-ink'

const pad = (n: number) => String(n).padStart(2, '0')

type CardField = keyof DraftCard
type Props = {
  state: FormsState
  onMemo: (text: string) => void
  onTidy: () => void
  onCard: (index: number, field: CardField, value: string) => void
  onAddCard: () => void
  onRemoveCard: (index: number) => void
  onMonth: (value: string) => void
  onTheme: (theme: ThemePick | null) => void
  bg: Backgrounds // '배경' 칸(내 배경·AI 배경)의 상태와 부르기(useBackgrounds)
  autoAccent: string // 자동 강조 색(로고 색, 없으면 미리보기의 배경 강조색 또는 테마 강조색)
  onAccent: (accent: string | null) => void
  logoSwatches: readonly string[] // 로고에서 뽑은 색 칩(색 고르기 넷 모두에)
  starts: { title: string; body: string; logo: string } // 색이 없을 때 직접 고르기 색 칸의 처음 값
  logoTintable: boolean // 로고에 색을 칠할 수 있다(아니면 로고 색 고르기를 막는다)
  onStyle: (style: FormStyle) => void
  onReset: () => void // [처음대로]: 글씨·로고 값과 강조 색을 처음대로
}

type FieldProps = {
  id: string
  label: string
  hint?: string
  error?: string
  input: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'>
}

function CardField({ id, label, hint, error, input }: FieldProps) {
  const errorId = `${id}-error`
  return (
    <div className={ds.field}>
      <div className="flex items-baseline gap-1.5">
        <label htmlFor={id} className={ds.label}>
          {label}
        </label>
        {hint && <span className={ds.labelHint}>{hint}</span>}
      </div>
      <input id={id} className={ds.input} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} {...input} />
      {error && (
        <p id={errorId} className={ds.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

export function NoticeEditor({
  state,
  onMemo,
  onTidy,
  onCard,
  onAddCard,
  onRemoveCard,
  onMonth,
  onTheme,
  bg,
  autoAccent,
  onAccent,
  logoSwatches,
  starts,
  logoTintable,
  onStyle,
  onReset,
}: Props) {
  const id = useId()
  const problems = cardProblems(state)
  const monthError = monthProblem(state)
  const preview = previewNotice(state)
  const autoName = themeOf(autoTheme(preview)).name
  const memoLength = Array.from(state.memo).length

  return (
    <div className={`${ds.panel} p-4`}>
      <ReadOnlyFields>
        <section aria-label="만들기">
          <div className={ds.field}>
            <label htmlFor={`${id}-memo`} className={ds.label}>
              대충 적기
            </label>
            <textarea
              id={`${id}-memo`}
              className={TEXTAREA}
              maxLength={MAX_MEMO}
              placeholder={PLACEHOLDER}
              value={state.memo}
              aria-describedby={`${id}-note`}
              onChange={(e) => onMemo(e.target.value)}
            />
            <div className="flex items-start justify-between gap-3">
              <p id={`${id}-note`} className={ds.help}>
                {NOTE}
              </p>
              <span className="shrink-0 text-caption text-muted tabular-nums">{`${memoLength}/${MAX_MEMO}`}</span>
            </div>
            <WriteOnly>
              <div>
                <button type="button" className={ds.button.primary} disabled={state.tidying || state.memo.trim() === ''} onClick={onTidy}>
                  {state.tidying ? '정리하는 중…' : '정리하기'}
                </button>
              </div>
            </WriteOnly>
            {state.tidyError && <ErrorCard code={state.tidyError} />}
            {state.truncated && (
              <p role="status" className="text-small text-ink-2">
                카드는 4장까지라 앞의 4장만 넣었어요
              </p>
            )}
          </div>

          <hr className="my-4 border-line" />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className={SECTION_TITLE}>안내 내용</h2>
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-month`} className="text-small text-ink-2">
                안내 달
              </label>
              <div className="w-40">
                <input
                  id={`${id}-month`}
                  type="month"
                  min="2020-01"
                  max="2100-12"
                  className={ds.input}
                  value={`${state.year}-${pad(state.month)}`}
                  aria-invalid={Boolean(monthError)}
                  aria-describedby={monthError ? `${id}-month-error` : undefined}
                  onChange={(e) => onMonth(e.target.value)}
                />
              </div>
            </div>
          </div>
          {monthError && (
            <p id={`${id}-month-error`} className={`${ds.fieldError} mt-1 text-right`}>
              {monthError}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-3">
            {state.cards.map((card, i) => {
              const errors = problems[i] ?? {}
              const base = `${id}-card${i}`
              const date = draftDateLabel(card)
              return (
                <fieldset key={i} className="min-w-0 rounded-float border border-line px-3 pt-1 pb-3">
                  <legend className="px-1 text-caption text-muted">{`카드 ${i + 1}`}</legend>
                  <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
                    <CardField
                      id={`${base}-start`}
                      label="시작 날짜"
                      error={errors.start}
                      input={{ type: 'date', value: card.start, onChange: (e) => onCard(i, 'start', e.target.value) }}
                    />
                    <CardField
                      id={`${base}-end`}
                      label="끝 날짜"
                      hint="이어서 쉴 때"
                      error={errors.end}
                      input={{ type: 'date', value: card.end, onChange: (e) => onCard(i, 'end', e.target.value) }}
                    />
                    <CardField
                      id={`${base}-name`}
                      label="이름"
                      hint={`${MAX_NAME}자까지`}
                      error={errors.name}
                      input={{ type: 'text', maxLength: MAX_NAME, placeholder: '예) 어린이날', value: card.name, onChange: (e) => onCard(i, 'name', e.target.value) }}
                    />
                    <CardField
                      id={`${base}-status`}
                      label="아래 글"
                      hint={`${MAX_STATUS}자까지`}
                      error={errors.status}
                      input={{ type: 'text', maxLength: MAX_STATUS, value: card.status, onChange: (e) => onCard(i, 'status', e.target.value) }}
                    />
                    <div className="col-span-2 flex items-center justify-between gap-2 max-md:col-span-1">
                      <span className="text-caption text-muted">{date ?? ''}</span>
                      <WriteOnly>
                        <button type="button" className={ds.button.ghostSmall} disabled={state.cards.length <= 1} onClick={() => onRemoveCard(i)}>
                          빼기
                        </button>
                      </WriteOnly>
                    </div>
                  </div>
                </fieldset>
              )
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <WriteOnly>
              <button type="button" className={ds.button.secondarySmall} disabled={state.cards.length >= MAX_CARDS} onClick={onAddCard}>
                + 카드 더하기
              </button>
            </WriteOnly>
            <span className="text-caption text-muted">카드는 4장까지 · 이어서 쉬는 날은 끝 날짜를 적어 한 장으로</span>
          </div>

          <hr className="my-4 border-line" />

          <ThemePicker pick={state.theme} autoName={autoName} bg={bg} note={bg.look(preview).note} onPick={onTheme} />
        </section>
        <StyleControls
          tool="notice"
          style={state.style}
          logoSwatches={logoSwatches}
          starts={starts}
          logoTintable={logoTintable}
          onStyle={onStyle}
          onReset={onReset}
          accentRow={<AccentPicker month={state.month} accent={state.accent} autoAccent={autoAccent} logoSwatches={logoSwatches} onAccent={onAccent} />}
        />
      </ReadOnlyFields>
    </div>
  )
}
