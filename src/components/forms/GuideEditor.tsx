import { useId, type Dispatch } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { DRAWING_LIMITS, GUIDE_LIMITS, PICTURES, PICTURE_IDS, type GuideField, type GuideMark, type GuideProblems, type PictureId } from '@/types/formGuide'
import { MAX_MEMO } from '@/types/forms'
import type { GuideAction, GuideState } from './guideState'

// 서식 화면 가운데(환자 안내문): 대충 적기 → [정리하기], '노란 윗단'·'진회색 띠' 칸, 그림 고르기와 AI로 그림 그리기
// (spec forms-guide REQ-4502·4506·4513, design.md 9절, 시안 docs/mockups/forms-guide ?s=screen · go=draw). 색·글자는 토큰과 ds만 쓴다.
// 칸 아래 까닭은 부르는 쪽이 준 visibleProblems다. 부르기(정리·그리기)는 부르는 쪽(GuideWorkspace)이 하고, 칸 고치기는 동작(dispatch)으로 보낸다

const MEMO_NOTE = '전화번호·주민번호·메일 주소는 적지 마세요. 적은 글은 정리할 때만 AI로 보내고 저장하지 않아요. AI는 적은 글에 없는 숫자를 넣지 않아요'
const MEMO_PLACEHOLDER = '예) 보험 서류 필요하면 수납할 때 말해 달라고. 진단서, 영수증, 세부내역서, 통원확인서. 보험사마다 다름'
const DRAW_NOTE = '적은 낱말만 AI로 보내요. 마음에 안 들면 다시 눌러 새로 그려요'
const CUSTOM = 'custom'
// 여러 줄 글 칸: ds.input과 같은 색·테두리·초점, 높이만 96px부터 늘어난다(휴진 안내 NoticeEditor와 같다)
const TEXTAREA =
  'min-h-24 w-full min-w-0 resize-y rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden max-md:text-lead'
const SECTION_TITLE = 'text-body font-semibold text-ink'
const GROUP = 'mt-3 min-w-0 rounded-float border border-line px-3 pt-1 pb-3'
const LEGEND = 'px-1 text-caption text-muted'
const TWO = 'grid grid-cols-2 gap-2 max-md:grid-cols-1'
const MARKS: readonly [GuideMark, string][] = [
  ['check', '✓ 체크'],
  ['number', '1·2·3 번호'],
]

const isPictureId = (value: string): value is PictureId => (PICTURE_IDS as readonly string[]).includes(value)

type Props = {
  state: GuideState
  problems: GuideProblems
  dispatch: Dispatch<GuideAction>
  onTidy: () => void
  onDraw: () => void
}

type FieldProps = {
  id: string
  label: string
  hint: string
  max: number
  value: string
  error?: string
  onChange: (value: string) => void
}

// 글 칸 하나: 이름(+ 선택·한도 안내) → 입력 → 까닭. 시안 field()와 같은 글
function TextField({ id, label, hint, max, value, error, onChange }: FieldProps) {
  const errorId = `${id}-error`
  return (
    <div className={ds.field}>
      <div className="flex items-baseline gap-1.5">
        <label htmlFor={id} className={ds.label}>
          {label}
        </label>
        <span className={ds.labelHint}>{hint}</span>
      </div>
      <input
        id={id}
        type="text"
        className={ds.input}
        maxLength={max}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={errorId} className={ds.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

export function GuideEditor({ state, problems, dispatch, onTidy, onDraw }: Props) {
  const id = useId()
  const { content } = state
  const memoLength = Array.from(state.memo).length

  // 글 칸 여덟(머리표~아래 작은 글). hint는 시안 그대로: '선택 · n자까지 · 덧붙임'
  const field = (key: GuideField, label: string, opt: boolean, extra = '') => {
    const max = GUIDE_LIMITS[key]
    const hint = `${opt ? '선택 · ' : ''}${max}자까지${extra ? ` · ${extra}` : ''}`
    return (
      <TextField
        id={`${id}-${key}`}
        label={label}
        hint={hint}
        max={max}
        value={content[key]}
        error={problems[key]}
        onChange={(value) => dispatch({ type: 'field', field: key, value })}
      />
    )
  }
  const reason = (key: string) =>
    problems[key] ? (
      <p id={`${id}-${key}-error`} className={ds.fieldError}>
        {problems[key]}
      </p>
    ) : null

  return (
    <section aria-label="만들기" className={`${ds.panel} p-4`}>
      <div className={ds.field}>
        <label htmlFor={`${id}-memo`} className={ds.label}>
          대충 적기
        </label>
        <textarea
          id={`${id}-memo`}
          className={TEXTAREA}
          maxLength={MAX_MEMO}
          placeholder={MEMO_PLACEHOLDER}
          value={state.memo}
          aria-describedby={`${id}-memo-note`}
          onChange={(e) => dispatch({ type: 'memo', text: e.target.value })}
        />
        <div className="flex items-start justify-between gap-3">
          <p id={`${id}-memo-note`} className={ds.help}>
            {MEMO_NOTE}
          </p>
          <span className="shrink-0 text-caption text-muted tabular-nums">{`${memoLength}/${MAX_MEMO}`}</span>
        </div>
        <div>
          <button type="button" className={ds.button.primary} disabled={state.tidying || state.memo.trim() === ''} onClick={onTidy}>
            {state.tidying ? '정리하는 중…' : '정리하기'}
          </button>
        </div>
        {state.tidyError && <ErrorCard code={state.tidyError} />}
        {state.truncated && (
          <p role="status" className="text-small text-ink-2">
            줄은 4개까지라 앞의 4개만 넣었어요
          </p>
        )}
      </div>

      <hr className="my-4 border-line" />

      <h2 className={SECTION_TITLE}>안내 내용</h2>

      <fieldset className={GROUP}>
        <legend className={LEGEND}>노란 윗단</legend>
        <div className={TWO}>
          {field('tag', '머리표', false)}
          {field('subtitle', '작은 제목', false)}
        </div>
        <div className={`${TWO} mt-2`}>
          {field('big1', '큰 문구 윗줄', false)}
          {field('big2', '큰 문구 아랫줄', false)}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-small text-ink-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5">
            <span className={ds.checkboxWrap}>
              <input
                type="checkbox"
                className={ds.checkbox}
                checked={content.firstSmall}
                onChange={(e) => dispatch({ type: 'firstSmall', value: e.target.checked })}
              />
              <Icon name="check" className={ds.checkboxMark} />
            </span>
            윗줄 작게
          </label>
          <span>(아랫줄을 크게 — 금액·횟수 안내)</span>
        </div>
        <div className={`${TWO} mt-2`}>
          {field('boxTop', '흰 상자 윗줄', true, '작은 글')}
          {field('boxBottom', '흰 상자 아랫줄', true, '굵은 글')}
        </div>

        <div className={`${ds.field} mt-2`}>
          <div className="flex items-baseline gap-1.5">
            <label htmlFor={`${id}-picture`} className={ds.label}>
              그림
            </label>
            <span className={ds.labelHint}>선택</span>
          </div>
          <select
            id={`${id}-picture`}
            className={ds.input}
            value={content.picture ?? ''}
            onChange={(e) => {
              const value = e.target.value
              dispatch({ type: 'picture', picture: value === CUSTOM ? CUSTOM : isPictureId(value) ? value : null })
            }}
          >
            <option value="">없음</option>
            {PICTURES.map((picture) => (
              <option key={picture.id} value={picture.id}>
                {picture.name}
              </option>
            ))}
            {content.drawing && <option value={CUSTOM}>{`AI로 그린 그림: ${content.drawing.subject}`}</option>}
          </select>
        </div>

        <div className={`${ds.field} mt-2`}>
          <div className="flex items-baseline gap-1.5">
            <label htmlFor={`${id}-subject`} className={ds.label}>
              새로 그릴 것
            </label>
            <span className={ds.labelHint}>{`선택 · ${DRAWING_LIMITS.subject}자까지`}</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              id={`${id}-subject`}
              type="text"
              className={ds.input}
              maxLength={DRAWING_LIMITS.subject}
              placeholder="예) 휠체어"
              value={state.subject}
              aria-describedby={`${id}-subject-note`}
              onChange={(e) => dispatch({ type: 'subject', text: e.target.value })}
            />
            <button
              type="button"
              className={`${ds.button.secondarySmall} shrink-0`}
              disabled={state.drawingBusy || state.subject.trim() === ''}
              onClick={onDraw}
            >
              {state.drawingBusy ? '그리는 중…' : 'AI로 그림 그리기'}
            </button>
          </div>
          <p id={`${id}-subject-note`} className={ds.help}>
            {DRAW_NOTE}
          </p>
          {state.drawError && <ErrorCard code={state.drawError} />}
        </div>
      </fieldset>

      <fieldset className={GROUP}>
        <legend className={LEGEND}>진회색 띠</legend>
        {field('bandTitle', '띠 제목', true)}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className={ds.label}>줄 표시</span>
          <div role="group" aria-label="줄 표시" className={`${ds.segment.group} max-md:grid-cols-2`}>
            {MARKS.map(([mark, name]) => {
              const on = content.mark === mark
              return (
                <button
                  key={mark}
                  type="button"
                  aria-pressed={on}
                  className={`${ds.segment.button} ${on ? ds.segment.on : ds.segment.off}`}
                  onClick={() => dispatch({ type: 'mark', mark })}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col">
          {content.lines.map((line, i) => {
            const n = i + 1
            const lineError = problems[`line${i}`]
            const emError = problems[`em${i}`]
            return (
              <div key={i} className="mt-2 grid grid-cols-[minmax(0,1fr)_150px_auto] items-start gap-2 max-md:grid-cols-1">
                <div className={ds.field}>
                  <input
                    type="text"
                    className={ds.input}
                    aria-label={`줄 ${n}`}
                    maxLength={GUIDE_LIMITS.line}
                    placeholder={`줄 ${n} (${GUIDE_LIMITS.line}자까지)`}
                    value={line.text}
                    aria-invalid={Boolean(lineError)}
                    aria-describedby={lineError ? `${id}-line${i}-error` : undefined}
                    onChange={(e) => dispatch({ type: 'line', index: i, field: 'text', value: e.target.value })}
                  />
                  {reason(`line${i}`)}
                </div>
                <div className={ds.field}>
                  <input
                    type="text"
                    className={ds.input}
                    aria-label={`줄 ${n} 노랑 강조`}
                    placeholder="노랑 강조(선택)"
                    value={line.em}
                    aria-invalid={Boolean(emError)}
                    aria-describedby={emError ? `${id}-em${i}-error` : undefined}
                    onChange={(e) => dispatch({ type: 'line', index: i, field: 'em', value: e.target.value })}
                  />
                  {reason(`em${i}`)}
                </div>
                <button
                  type="button"
                  className={ds.button.ghostSmall}
                  disabled={content.lines.length <= 1}
                  onClick={() => dispatch({ type: 'removeLine', index: i })}
                >
                  빼기
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={ds.button.secondarySmall}
            disabled={content.lines.length >= GUIDE_LIMITS.lines}
            onClick={() => dispatch({ type: 'addLine' })}
          >
            + 줄 더하기
          </button>
          <span className="text-caption text-muted">줄은 4개까지 · 짧은 항목은 저절로 두 열</span>
        </div>
        {(problems.band || problems.lines) && (
          <div className="mt-1.5 flex flex-col gap-1">
            {reason('band')}
            {reason('lines')}
          </div>
        )}
        <div className="mt-2">{field('note', '아래 작은 글', true, '앞에 ※가 붙어요')}</div>
      </fieldset>
    </section>
  )
}
