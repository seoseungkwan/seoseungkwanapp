'use client'

// 점수 무게 판 (spec location REQ-7919·AC-7907.2·AC-7921.1·AC-7921.7, design.md 8·18절, 시안 ?s=weights 승인 2·3).
// 바깥 무게 막대 다섯 + [기본 무게로], 항목마다 [세부 ▾]를 펼치면 세부 무게 막대·만점 기준 칸(사는 사람·수요는 셀 나이대, p-welfare는 방향 고르기)·[기본값으로].
// 세부 줄은 SCORE_GROUPS 차례 그대로(자리 맨 아래 s-clinics '같은 건물·옆 건물 의원 수'도 저절로), 이름은 score.ts label 한 곳.
// onPickDepts를 주면 판 머리와 '경쟁' [세부] 맨 위 줄에 [과목 고르기](판은 부르는 쪽이 연다). 그 줄 글은 rivalShort(경쟁 과목 짧은 이름)가 있을 때만.
// 부품은 props·콜백만 쓴다: 설정은 rule로 받고, 칸 검사(score.ts checkScoreRule)를 모두 통과한 바뀐 설정만
//   onChange — 고칠 때마다 바로(부모가 지도 색·순위·점수를 다시 셈, 바깥 자료를 다시 부르지 않음)
//   onSave   — 마지막으로 고친 뒤 SAVE_DELAY_MS가 지나면 한 번(saveLater.ts, 판이 사라지면 기다리던 것을 바로). 칸이 틀어지면 기다리던 저장도 버린다
// 로 넘긴다. 틀린 칸은 그 칸 아래 RULE_TEXT 글이 보이고 둘 다 부르지 않는다.
// 밖에서 내용이 다른 설정이 오면(불러오기 등) 그 값으로 다시 그리고, 판이 넘긴 것과 같은 설정이면 고치던 칸을 그대로 둔다
import { Fragment, useId, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { AGE_BANDS, SCORE_GROUPS, type GroupId, type RuleProblem, type ScoreGroupDef, type ScoreRule, type ScoreSubDef } from '@/lib/location/score'
import {
  readDraft,
  resetGroup,
  resetWeights,
  ruleKey,
  setCriterion,
  setLess,
  setSubWeight,
  setWeight,
  toDraft,
  toggleBand,
  type CriterionField,
  type Draft,
} from './draft'
import { useSaveLater } from './saveLater'
import { SUB_TEXT, WEIGHTS_TEXT as T } from './text'

export { SAVE_DELAY_MS } from './saveLater'

export type ScoreWeightsProps = {
  /** 지금 설정(location_settings.score_rule). 틀린 칸·빠진 세부 항목은 처음 값으로 본다 */
  rule: ScoreRule
  /** 칸 검사를 통과한 바뀐 설정 — 고칠 때마다 바로 */
  onChange?: (rule: ScoreRule) => void
  /** 저장할 설정 — 멈춘 뒤 한 번 */
  onSave: (rule: ScoreRule) => void
  /** 처음에 펼쳐 둘 항목(시안 ?s=weights는 다섯 모두) */
  defaultOpen?: readonly GroupId[]
  /** 경쟁 과목 짧은 이름을 ·로 이은 글(depts.ts rivalShortText) — '경쟁' [세부] 맨 위 줄. 빈 글이면 '없음'(시안), 안 주면 그 줄이 없다 */
  rivalShort?: string
  /** [과목 고르기](판 머리 · '경쟁' [세부] 맨 위 줄)를 누름 — 과목 고르기 판은 부르는 쪽이 연다. 안 주면 단추가 없다 */
  onPickDepts?: () => void
}

const SLIDER_MAX = 50
const SLIDER_STEP = 5

const HEAD = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'
const TEXT_BTN = `inline-flex cursor-pointer items-center whitespace-nowrap rounded-control px-1 font-medium hover:underline ${ds.focusRing}`
const RESET_BTN = `${TEXT_BTN} h-6 text-small text-ink-2`
const DETAIL_BTN = `${TEXT_BTN} h-7 text-caption text-accent`
const PICK_BTN = `${TEXT_BTN} h-6 text-small text-accent`
const PICK_INLINE = `ml-1.5 inline-flex h-5 cursor-pointer items-center whitespace-nowrap rounded-control px-0.5 align-baseline text-caption font-medium text-accent hover:underline ${ds.focusRing}`
const SLIDER = `h-6 w-full min-w-0 cursor-pointer accent-accent ${ds.focusRing}`
const GROUP_ROW = 'grid grid-cols-[104px_minmax(0,1fr)_28px_auto] items-center gap-3 py-1.5'
const PANEL = 'mt-0.5 mb-3 grid gap-3 rounded-control border border-line bg-canvas p-3'
const PANEL_HEAD = 'text-caption font-semibold text-ink'
const PANEL_NOTE = 'ml-1 font-normal text-muted'
const CHECK = `size-4 shrink-0 cursor-pointer accent-accent ${ds.focusRing}`
const LINE = 'flex flex-wrap items-center gap-1 text-caption text-muted'
const BOX = `h-6.5 w-18 min-w-0 rounded-control border border-line-strong bg-surface px-1.5 text-right text-caption tabular-nums text-ink hover:border-muted focus-visible:border-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent aria-invalid:border-negative`
const SUM = 'flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-caption text-muted'
const SUM_NUM = 'font-semibold tabular-nums text-ink'
const SEG = 'inline-flex w-fit overflow-clip rounded-control border border-line-strong bg-surface'
const SEG_BTN = `h-6 cursor-pointer border-l border-line-strong px-2 text-caption first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`
const SEG_ON = `${SEG_BTN} bg-accent-soft font-semibold text-accent-strong`
const SEG_OFF = `${SEG_BTN} font-medium text-ink-2 hover:bg-canvas`

const inGroup = (g: ScoreGroupDef, p: RuleProblem) => p.at === g.id || g.subs.some((s) => s.id === p.at) || (g.id === 'people' && p.at === 'bands')
const textsOf = (problems: readonly RuleProblem[]) => [...new Set(problems.map((p) => p.text))].join(' ')

export function ScoreWeights({ rule, onChange, onSave, defaultOpen = [], rivalShort, onPickDepts }: ScoreWeightsProps) {
  const uid = useId()
  const [draft, setDraft] = useState(() => toDraft(rule))
  const [seen, setSeen] = useState(() => ({ rule, key: ruleKey(rule) }))
  const [open, setOpen] = useState<ReadonlySet<GroupId>>(() => new Set(defaultOpen))
  const save = useSaveLater(onSave)

  // 밖에서 다른 설정이 오면 그 값으로(판이 넘긴 설정과 같으면 고치던 칸을 지우지 않는다)
  if (rule !== seen.rule) {
    const key = ruleKey(rule)
    setSeen({ rule, key })
    if (key !== seen.key) setDraft(toDraft(rule))
  }

  const { problems } = readDraft(draft)

  function apply(next: Draft) {
    setDraft(next)
    const out = readDraft(next).rule
    save.later(out)
    if (!out) return
    setSeen((prev) => ({ rule: prev.rule, key: ruleKey(out) }))
    onChange?.(out)
  }

  function toggle(g: ScoreGroupDef) {
    const shut = open.has(g.id)
    // 틀린 칸이 있으면 닫지 않는다(안내 글이 숨어 저장이 막힌 줄 모르게 되지 않게)
    if (shut && problems.some((p) => inGroup(g, p))) return
    const next = new Set(open)
    if (shut) next.delete(g.id)
    else next.add(g.id)
    setOpen(next)
  }

  const sum = SCORE_GROUPS.reduce((a, g) => a + draft.weights[g.id], 0)
  const titleId = `${uid}-title`

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <div className={HEAD}>
        <h2 id={titleId} className="text-subtitle font-semibold text-ink">
          {T.title}
        </h2>
        <span className="flex items-center gap-3">
          {onPickDepts ? (
            <button type="button" className={PICK_BTN} aria-haspopup="dialog" onClick={onPickDepts}>
              {T.pickDepts}
            </button>
          ) : null}
          <button type="button" className={RESET_BTN} onClick={() => apply(resetWeights(draft))}>
            {T.resetWeights}
          </button>
        </span>
      </div>
      <p className="mt-1.5 text-caption text-muted">{T.help}</p>
      {SCORE_GROUPS.map((g) => {
        const sliderId = `${uid}-${g.id}`
        const panelId = `${uid}-${g.id}-detail`
        const isOpen = open.has(g.id)
        return (
          <Fragment key={g.id}>
            <div className={GROUP_ROW}>
              <label htmlFor={sliderId} className="text-small font-medium text-ink-2">
                {g.name}
              </label>
              <input
                type="range"
                id={sliderId}
                className={SLIDER}
                min={0}
                max={SLIDER_MAX}
                step={SLIDER_STEP}
                value={draft.weights[g.id]}
                onChange={(e) => apply(setWeight(draft, g.id, Number(e.target.value)))}
              />
              <output htmlFor={sliderId} className="text-right text-body font-semibold tabular-nums text-ink">
                {draft.weights[g.id]}
              </output>
              <button
                type="button"
                className={DETAIL_BTN}
                aria-label={`${g.name} ${T.detail}`}
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(g)}
              >
                {`${T.detail} ${isOpen ? '▴' : '▾'}`}
              </button>
            </div>
            {isOpen ? (
              <GroupDetail
                id={panelId}
                uid={uid}
                group={g}
                draft={draft}
                problems={problems}
                apply={apply}
                rivalShort={rivalShort}
                onPickDepts={onPickDepts}
              />
            ) : null}
          </Fragment>
        )
      })}
      <p className={`mt-1 ${SUM}`}>
        무게 합계 <b className={SUM_NUM}>{sum}</b>
        {T.sumTail}
      </p>
    </section>
  )
}

type DetailProps = {
  id: string
  uid: string
  group: ScoreGroupDef
  draft: Draft
  problems: readonly RuleProblem[]
  apply: (next: Draft) => void
  rivalShort?: string
  onPickDepts?: () => void
}

function GroupDetail({ id, uid, group, draft, problems, apply, rivalShort, onPickDepts }: DetailProps) {
  const bandsBad = group.id === 'people' ? problems.filter((p) => p.at === 'bands') : []
  const bandsErrId = `${uid}-bands-error`
  const subSum = group.subs.reduce((a, s) => a + draft.items[s.id].w, 0)
  return (
    <div id={id} className={PANEL}>
      {group.id === 'rivals' && rivalShort !== undefined ? (
        <p className={PANEL_HEAD}>
          {T.rivalDepts} <span className={PANEL_NOTE}>{rivalShort === '' ? T.noRival : rivalShort}</span>
          {onPickDepts ? (
            <button type="button" className={PICK_INLINE} aria-haspopup="dialog" onClick={onPickDepts}>
              {T.pickDepts}
            </button>
          ) : null}
        </p>
      ) : null}
      {group.id === 'people' ? (
        <fieldset className="min-w-0" aria-describedby={bandsBad.length > 0 ? bandsErrId : undefined}>
          <legend className={PANEL_HEAD}>
            {T.bandsTitle} <span className={PANEL_NOTE}>{T.bandsNote}</span>
          </legend>
          <div className="mt-1.5 grid grid-cols-4 gap-x-2 gap-y-1">
            {AGE_BANDS.map((band, i) => (
              <label key={band} className="flex cursor-pointer items-center gap-1.5 text-caption text-ink-2">
                <input type="checkbox" className={CHECK} checked={draft.bands.includes(i)} onChange={() => apply(toggleBand(draft, i))} />
                {band}
              </label>
            ))}
          </div>
          {bandsBad.length > 0 ? (
            <p id={bandsErrId} className={`mt-1 ${ds.fieldError}`}>
              {textsOf(bandsBad)}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <div>
        <p className={PANEL_HEAD}>
          {T.subsTitle} {group.scan ? null : <span className={PANEL_NOTE}>{T.candidateGroup}</span>}
        </p>
        {group.subs.map((s) => (
          <SubRow key={s.id} uid={uid} group={group} sub={s} draft={draft} problems={problems.filter((p) => p.at === s.id)} apply={apply} />
        ))}
      </div>
      <div className={SUM}>
        <p>
          세부 무게 합계 <b className={SUM_NUM}>{subSum}</b>
          {T.subSumTail}
        </p>
        <button type="button" className={RESET_BTN} aria-label={`${group.name} ${T.resetGroup}`} onClick={() => apply(resetGroup(draft, group.id))}>
          {T.resetGroup}
        </button>
      </div>
    </div>
  )
}

type RowProps = { uid: string; group: ScoreGroupDef; sub: ScoreSubDef; draft: Draft; problems: readonly RuleProblem[]; apply: (next: Draft) => void }

function SubRow({ uid, group, sub, draft, problems, apply }: RowProps) {
  const text = SUB_TEXT[sub.id]
  const name = sub.label
  const item = draft.items[sub.id]
  const sliderId = `${uid}-${sub.id}`
  const labelId = `${sliderId}-label`
  const errId = `${sliderId}-error`
  // 칸 하나의 문제는 그 칸, 순서 문제(100점 값 ≥ 0점 값)는 두 칸 모두
  const bad = (field: CriterionField) => problems.some((p) => p.field === field || (p.field === undefined && field !== 'full'))
  const box = (field: CriterionField, label: string) => (
    <input
      type="text"
      inputMode="numeric"
      className={BOX}
      aria-label={`${name} ${label}`}
      value={item[field]}
      aria-invalid={bad(field) || undefined}
      aria-describedby={bad(field) ? errId : undefined}
      onChange={(e) => apply(setCriterion(draft, sub.id, field, e.target.value))}
    />
  )

  let line: ReactNode
  if (text.pick) line = <p className={LINE}>{`고른 값이 '${text.pick}'이면 100점`}</p>
  else if (item.less)
    line = (
      <p className={LINE}>
        {box('best', '100점 기준')}
        {`${text.unit} 이하면 100점 · `}
        {box('worst', '0점 기준')}
        {`${text.unit} 이상이면 0점`}
      </p>
    )
  else
    line = (
      <p className={LINE}>
        {text.pre ? `${text.pre} ` : null}
        {box('full', '만점 기준')}
        {`${text.more ?? text.unit} 100점`}
      </p>
    )

  return (
    <div role="group" aria-labelledby={labelId} className="grid gap-0.5 border-b border-line py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <label id={labelId} htmlFor={sliderId} className="text-caption font-medium text-ink-2">
            {name}
          </label>
          {group.scan && !sub.scan ? <span className={ds.chip.neutral}>{T.candidateSub}</span> : null}
        </span>
        <output htmlFor={sliderId} className="text-caption font-semibold tabular-nums text-ink">
          {item.w}
        </output>
      </div>
      <input
        type="range"
        id={sliderId}
        className={SLIDER}
        min={0}
        max={SLIDER_MAX}
        step={SLIDER_STEP}
        value={item.w}
        onChange={(e) => apply(setSubWeight(draft, sub.id, Number(e.target.value)))}
      />
      {sub.flip ? (
        <div role="group" aria-label={`${name} 방향`} className={`mt-0.5 ${SEG}`}>
          <button type="button" className={item.less ? SEG_OFF : SEG_ON} aria-pressed={!item.less} onClick={() => apply(setLess(draft, sub.id, false))}>
            {T.more}
          </button>
          <button type="button" className={item.less ? SEG_ON : SEG_OFF} aria-pressed={item.less} onClick={() => apply(setLess(draft, sub.id, true))}>
            {T.less}
          </button>
        </div>
      ) : null}
      {line}
      {problems.length > 0 ? (
        <p id={errId} className={ds.fieldError}>
          {textsOf(problems)}
        </p>
      ) : null}
    </div>
  )
}
