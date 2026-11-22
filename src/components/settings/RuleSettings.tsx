'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { badgeText } from '@/lib/notices/ruleView'
import { changedRuleIds, readRuleRows, readRuleSettings, toRuleChoices, toRuleSettings, withRulesFrom, writeRuleSettings } from '@/lib/storage/claimSettings'
import { readRuleBadges } from '@/lib/storage/ruleChanges'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ErrorCode } from '@/types/errors'
import type { Grade, PrecheckFromScreen, PrecheckToScreen, RuleSummary, SavedRuleSettings } from '@/types/precheck'
import type { RuleBadge } from '@/types/ruleAuto'

// 설정 화면 '점검 규칙' 칸 (precheck REQ-012 AC-012.6, 목업 화면 10). 이 청구 화면들은 나중에 다시 디자인한다(사용자 2026-10-31) → 동작과 상태를 맞추고 모양은 공통 묶음(ds)만 쓴다.
// 규칙 목록은 Worker에 ruleList로 받는다(표 JSON을 화면이 불러오지 않는다, AC-007.4). 고른 값은 원본 저장 모양 그대로 들고 있다가 [저장] 때 바뀐 줄만 보낸다.
// 줄이 있다 = 규칙표 기본값과 다르다. 기본값으로 돌아오면 줄이 없는 것으로 본다 → [저장]이 그 줄을 지운다
// 고시로 바뀐 규칙(specs/rule-auto REQ-7817, 시안 ?v=settings): readRuleBadges를 화면을 열 때 한 번 읽어 규칙 칸 제목 옆에 칩, 오늘 쓰이는 판이면 제목·고시 근거도 그 판 것.
// 못 읽으면 칩 없이 지금 표 그대로다(오류 상자 없음). 켜기·등급·기본값은 원래 규칙 그대로 걸린다

const GRADES: readonly Grade[] = ['확인필요', '알림', '참고']
// 값은 DB·규칙표 글자 그대로, 보이는 글자만 목업대로
const GRADE_LABEL: Record<Grade, string> = { 확인필요: '확인 필요', 알림: '알림', 참고: '참고' }
const PAGE_SIZE = 20
const RULE_LIST_TIMEOUT_MS = 30_000
const EMPTY: SavedRuleSettings = { schema: 1, off: [], on: [], grade: [] }

type RuleListReply = Extract<PrecheckToScreen, { type: 'ruleList' }>
type Filter = { query: string; group: string; grade: string }
const NO_FILTER: Filter = { query: '', group: '', grade: '' }
type RuleChoice = ReturnType<typeof toRuleChoices>[number]

// ── Worker ────────────────────────────────────────────────

const LOAD_FAILED: RuleListReply = { type: 'ruleList', ok: false, code: 'E-RULES-LOAD-FAILED' }

/** ruleList 한 번 묻고 Worker를 끝낸다. 언제나(못 만듦·오류·30초·떠남) 답을 돌려주고 거절하지 않는다 */
function askRuleList(signal: AbortSignal): Promise<RuleListReply> {
  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('../../workers/precheck.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(LOAD_FAILED)
      return
    }
    const timer = setTimeout(() => finish(LOAD_FAILED), RULE_LIST_TIMEOUT_MS)
    function finish(reply: RuleListReply) {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      worker.onmessage = null
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
      resolve(reply)
    }
    const onAbort = () => finish(LOAD_FAILED)
    signal.addEventListener('abort', onAbort)
    worker.onmessage = (event: MessageEvent<PrecheckToScreen>) => {
      if (event.data.type === 'ruleList') finish(event.data)
    }
    worker.onerror = () => finish(LOAD_FAILED)
    worker.onmessageerror = () => finish(LOAD_FAILED)
    const ask: PrecheckFromScreen = { type: 'ruleList' }
    worker.postMessage(ask)
  })
}

// ── 고른 값 다루기(그리지 않는다) ─────────────────────────

/** 그 규칙 줄을 빼거나 바꾼다. 기본값과 같으면 줄을 두지 않는다 */
function withChoice(settings: SavedRuleSettings, rule: RuleSummary, enabled: boolean, grade: Grade | null): SavedRuleSettings {
  const rest = toRuleChoices(settings).filter((r) => r.rule_id !== rule.id)
  const picked = grade === rule.grade ? null : grade
  const isDefault = enabled === rule.enabled_default && picked === null
  return toRuleSettings(isDefault ? rest : [...rest, { rule_id: rule.id, enabled, grade: picked }])
}

function withoutRow(settings: SavedRuleSettings, id: string): SavedRuleSettings {
  return toRuleSettings(toRuleChoices(settings).filter((r) => r.rule_id !== id))
}

function matches(rule: RuleSummary, filter: Filter, grade: Grade): boolean {
  const query = filter.query.trim().toLowerCase()
  if (filter.group !== '' && rule.domain !== filter.group) return false
  if (filter.grade !== '' && grade !== filter.grade) return false
  return query === '' || `${rule.id} ${rule.title} ${rule.domain}`.toLowerCase().includes(query)
}

/** 바꾼 날: 한국 날짜 월/일 (10/31). 날짜 계산은 dates.ts 한 곳 */
function monthDay(iso: string): string {
  const [, month, day] = todayInKorea(new Date(iso)).split('-')
  return `${Number(month)}/${Number(day)}`
}

function datesOf(rows: readonly { rule_id: string; updated_at: string }[]): Map<string, string> {
  return new Map(rows.map((r) => [r.rule_id, monthDay(r.updated_at)]))
}

/** 보이는 규칙: 오늘 쓰이는 판이 있으면 제목·고시 근거를 그 판 것으로(rule-auto 기본값 12). 번호·등급·기본 켜짐은 원래 규칙 그대로 */
function shownRule(rule: RuleSummary, badge: RuleBadge | undefined): RuleSummary {
  if (!badge) return rule
  return { ...rule, title: badge.title ?? rule.title, basis: badge.basis ?? rule.basis }
}

// ── 상태 ──────────────────────────────────────────────────

function useRuleSettings() {
  const [view, setView] = useState<{ kind: 'loading' } | { kind: 'failed'; code: ErrorCode } | { kind: 'ready'; rules: RuleSummary[] }>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [saved, setSaved] = useState<SavedRuleSettings>(EMPTY)
  const [draft, setDraft] = useState<SavedRuleSettings>(EMPTY)
  const [dates, setDates] = useState<ReadonlyMap<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  // 기다리는 동안 다시 누름은 여기서 막는다(ds 기다림 모양은 모양뿐이다)
  const savingNow = useRef(false)
  // 실패한 저장들이 건드린 규칙(거듭 실패하면 쌓는다). 서버에 들어갔는지 모르니 다시 저장할 때 화면 값으로 맞춘다
  const attempted = useRef<ReadonlySet<string>>(new Set())

  useEffect(() => {
    const leave = new AbortController()
    const load = async () => {
      const list = await askRuleList(leave.signal)
      if (leave.signal.aborted) return
      if (!list.ok) {
        setView({ kind: 'failed', code: list.code })
        return
      }
      try {
        const rows = await readRuleRows(supabaseBrowser())
        if (leave.signal.aborted) return
        const settings = toRuleSettings(rows)
        setSaved(settings)
        setDraft(settings)
        setDates(datesOf(rows))
        setView({ kind: 'ready', rules: list.rules })
      } catch {
        if (!leave.signal.aborted) setView({ kind: 'failed', code: 'E-SETTINGS-FAILED' })
      }
    }
    void load()
    return () => leave.abort()
  }, [attempt])

  const retryLoad = () => {
    setView({ kind: 'loading' })
    setAttempt((n) => n + 1)
  }

  const undo = () => {
    setDraft(saved)
    if (!saveFailed) return
    // 실패한 저장의 앞부분(upsert)은 이미 들어갔을 수 있다 → saved를 믿지 않고 서버 값을 다시 읽는다
    attempted.current = new Set()
    setSaveFailed(false)
    retryLoad()
  }

  const save = useCallback(async () => {
    if (savingNow.current) return
    savingNow.current = true
    setSaving(true)
    setSaveFailed(false)
    const sent = draft
    let touched = attempted.current
    try {
      touched = new Set([...attempted.current, ...changedRuleIds(saved, sent)])
      const sb = supabaseBrowser()
      // 지난 저장이 실패했으면 어디까지 들어갔는지 모른다(뒤쪽만 실패했거나 답만 못 받았을 수 있다) → 서버 줄을 먼저 읽는다. 못 읽으면 아무것도 보내지 않는다.
      // 맞추는 것은 사용자가 건드린 규칙뿐이다. 나머지는 그동안 다른 탭이 고쳤을 수 있으니 서버 값을 따른다([저장]은 바뀐 것만 보낸다)
      const before = saveFailed ? await readRuleSettings(sb) : saved
      const after = saveFailed ? withRulesFrom(before, sent, touched) : sent
      await writeRuleSettings(sb, before, after)
      attempted.current = new Set()
      setSaved(after)
      // 저장하는 동안 더 바꾼 것은 draft에 남아 바뀐 것으로 보인다
      setDraft((now) => withRulesFrom(after, now, changedRuleIds(sent, now)))
      // 바꾼 날은 DB가 정한다. 못 읽어도 저장은 된 것이라 오류를 보이지 않는다(다음에 열 때 나온다)
      try {
        setDates(datesOf(await readRuleRows(sb)))
      } catch {}
    } catch {
      attempted.current = touched
      setSaveFailed(true)
    } finally {
      savingNow.current = false
      setSaving(false)
    }
  }, [draft, saved, saveFailed])

  const changed = useMemo(() => changedRuleIds(saved, draft), [saved, draft])
  const choices = useMemo(() => new Map<string, RuleChoice>(toRuleChoices(draft).map((r) => [r.rule_id, r])), [draft])

  return { view, retryLoad, draft, setDraft, choices, changed, dates, saving, saveFailed, save, undo }
}

const NO_BADGES: ReadonlyMap<string, RuleBadge> = new Map()

/** 고시로 바뀐 규칙 칩(AC-7817): 화면을 열 때 한 번 읽는다. 실패('failed')·던짐은 칩 없음 — 오류 상자를 보이지 않는다. 떠난 뒤 온 답은 버린다 */
function useRuleBadges(): ReadonlyMap<string, RuleBadge> {
  const [badges, setBadges] = useState<ReadonlyMap<string, RuleBadge>>(NO_BADGES)
  useEffect(() => {
    let left = false
    const load = async () => {
      try {
        const answer = await readRuleBadges()
        if (!left && answer !== 'failed') setBadges(answer)
      } catch {}
    }
    void load()
    return () => {
      left = true
    }
  }, [])
  return badges
}

// ── 그리기 ────────────────────────────────────────────────

// 폰(768px 미만): 표 머리를 숨기고 줄마다 세로로 쌓는다(옆으로 밀지 않아도 모든 칸이 보인다). 첫 칸(켜기) 옆 칸에 나머지가 차례로 온다
const rowClass = `${ds.table.row} max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)] max-md:gap-x-3 max-md:gap-y-1 max-md:border-b max-md:border-line max-md:px-4 max-md:py-3`
const cellPhone = 'max-md:col-start-2 max-md:h-auto max-md:border-b-0 max-md:p-0 max-md:last:pr-0'
const cellClass = `${ds.table.td} ${cellPhone}`
const cellWrap = `${cellClass} whitespace-normal`
const cellSub = `${ds.table.tdSub} ${cellPhone} whitespace-normal`
const checkCell = `${ds.table.check} max-md:col-start-1 max-md:row-span-5 max-md:row-start-1 max-md:h-auto max-md:border-b-0 max-md:p-0`
const COLUMNS = ['켜기', '규칙', '묶음', '등급', '고시 근거', '바꾼 날', '기본값']
const REVERTED_TEXT = '고시 변경 되돌림' // 시안 notes.md '설정 → 점검 규칙'

/** 규칙 칸 제목 옆 칩: 되돌리지 않은 판이 있으면 `고시로 바뀜 · {날짜}부터`(파랑), 모두 되돌렸으면 `고시 변경 되돌림`(회색) */
function BadgeChip({ badge }: { badge: RuleBadge }) {
  return badge.reverted ? <span className={ds.chip.neutral}>{REVERTED_TEXT}</span> : <span className={ds.chip.accent}>{badgeText(badge.from)}</span>
}

function RuleRow({
  rule,
  badge,
  choice,
  changed,
  date,
  onChoose,
  onReset,
}: {
  rule: RuleSummary
  badge: RuleBadge | undefined
  choice: RuleChoice | undefined
  changed: boolean
  date: string | undefined
  onChoose(enabled: boolean, grade: Grade | null): void
  onReset(): void
}) {
  const enabled = choice?.enabled ?? rule.enabled_default
  const grade = choice?.grade ?? rule.grade
  return (
    <tr className={rowClass}>
      <td className={checkCell}>
        <label className="inline-flex cursor-pointer items-center max-md:size-11">
          <span className={ds.checkboxWrap}>
            <input
              type="checkbox"
              aria-label={`${rule.id} 켜기`}
              checked={enabled}
              onChange={(event) => onChoose(event.target.checked, choice?.grade ?? null)}
              className={ds.checkbox}
            />
            <svg aria-hidden="true" className={ds.checkboxMark} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
          </span>
        </label>
      </td>
      <td className={cellWrap}>
        <span data-rule-id className="block text-caption tabular-nums text-muted">
          {rule.id}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={enabled ? 'text-ink' : 'text-muted'}>{rule.title}</span>
          {badge && <BadgeChip badge={badge} />}
        </span>
      </td>
      <td className={cellClass}>
        <span className={ds.chip.neutral}>{rule.domain}</span>
      </td>
      <td className={cellClass}>
        <select
          aria-label={`${rule.id} 등급`}
          value={grade}
          onChange={(event) => onChoose(enabled, event.target.value as Grade)}
          className={ds.input}
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {GRADE_LABEL[g]}
            </option>
          ))}
        </select>
        {/* 칸이 줄바꿈 안 함(dsCell)이라 줄 안 글자로 두면 상자 옆으로 넘쳐 옆 칸과 겹친다: 상자 아래 자기 줄로(AC-3201.1) */}
        <span className={`mt-1 block ${ds.help}`}>기본: {GRADE_LABEL[rule.grade]}</span>
      </td>
      <td className={cellSub}>{rule.basis.map((b) => b.number).join(' · ')}</td>
      <td className={`${ds.table.tdSub} ${cellPhone}`}>
        <span className="inline-flex items-center gap-1">
          {date ?? '—'}
          {changed && <span className={ds.chip.neutral}>바꿈</span>}
        </span>
      </td>
      <td className={cellClass}>
        <button type="button" aria-label={`${rule.id} 기본값으로`} disabled={choice === undefined} onClick={onReset} className={ds.textButton}>
          기본값으로
        </button>
      </td>
    </tr>
  )
}

export function RuleSettings() {
  const state = useRuleSettings()
  const { view, draft, setDraft, choices, changed, dates, saving, saveFailed, save, undo } = state
  const badges = useRuleBadges()
  const [filter, setFilter] = useState<Filter>(NO_FILTER)
  const [shown, setShown] = useState(PAGE_SIZE)
  const listed = view.kind === 'ready' ? view.rules : null
  // 찾기·그리기는 보이는 제목·근거로(AC-7817.1)
  const rules = useMemo(() => listed?.map((r) => shownRule(r, badges.get(r.id))) ?? null, [listed, badges])

  const groups = useMemo(() => [...new Set((rules ?? []).map((r) => r.domain))], [rules])
  const found = useMemo(
    () => (rules ?? []).filter((r) => matches(r, filter, choices.get(r.id)?.grade ?? r.grade)),
    [rules, filter, choices],
  )
  const onCount = useMemo(
    () => (rules ?? []).filter((r) => choices.get(r.id)?.enabled ?? r.enabled_default).length,
    [rules, choices],
  )

  const refine = (patch: Partial<Filter>) => {
    setFilter((now) => ({ ...now, ...patch }))
    setShown(PAGE_SIZE)
  }

  const nextCount = Math.min(PAGE_SIZE, found.length - shown)
  const total = rules?.length ?? 0

  return (
    <section className={ds.panel} aria-labelledby="rule-settings-title">
      <div className={ds.panelHead}>
        <h2 id="rule-settings-title" className={ds.panelTitle}>
          점검 규칙
        </h2>
        {rules && <span className={ds.count}>{`${total}개 · 켜짐 ${onCount} · 꺼짐 ${total - onCount}`}</span>}
      </div>

      {view.kind === 'loading' && (
        <div className={ds.panelBody}>
          <p role="status" className="text-body text-ink-2">
            규칙을 불러오는 중이에요…
          </p>
        </div>
      )}

      {view.kind === 'failed' && (
        <div className={`${ds.panelBody} flex flex-col items-start gap-3`}>
          <ErrorCard code={view.code} />
          <button type="button" onClick={state.retryLoad} className={ds.button.secondarySmall}>
            다시 불러오기
          </button>
        </div>
      )}

      {rules && (
        <>
          <div className={`${ds.panelBody} flex flex-wrap gap-2`}>
            <div className="w-full md:w-72">
              <input
                type="search"
                aria-label="규칙 찾기"
                placeholder="규칙 이름이나 번호로 찾기"
                value={filter.query}
                onChange={(event) => refine({ query: event.target.value })}
                className={ds.input}
              />
            </div>
            <div className="w-full md:w-48">
              <select aria-label="묶음" value={filter.group} onChange={(event) => refine({ group: event.target.value })} className={ds.input}>
                <option value="">묶음: 전체</option>
                {groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full md:w-40">
              <select aria-label="등급" value={filter.grade} onChange={(event) => refine({ grade: event.target.value })} className={ds.input}>
                <option value="">등급: 전체</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {GRADE_LABEL[g]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={ds.table.wrap}>
            <table className={ds.table.table}>
              <thead className="max-md:hidden">
                <tr>
                  {COLUMNS.map((name, i) => (
                    <th key={i} scope="col" className={ds.table.th}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {found.length === 0 && (
                  <tr>
                    <td colSpan={COLUMNS.length} className={ds.table.emptyRow}>
                      찾는 규칙이 없어요.
                    </td>
                  </tr>
                )}
                {found.slice(0, shown).map((rule) => (
                  <RuleRow
                    key={rule.id}
                    rule={rule}
                    badge={badges.get(rule.id)}
                    choice={choices.get(rule.id)}
                    changed={changed.has(rule.id)}
                    date={dates.get(rule.id)}
                    onChoose={(enabled, grade) => setDraft(withChoice(draft, rule, enabled, grade))}
                    onReset={() => setDraft(withoutRow(draft, rule.id))}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-line px-5 py-3 max-md:px-4">
            {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
            <div className="flex flex-wrap items-center gap-2">
              {nextCount > 0 && (
                <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className={ds.textButton}>
                  {`다음 ${nextCount}개`}
                </button>
              )}
              <span className="ml-auto flex flex-wrap items-center gap-2">
                <span className={ds.count}>{`바꾼 것 ${changed.size}개`}</span>
                {/* 저장 중에 되돌리면 화면만 옛 값이 되어 서버와 어긋난다. 실패 뒤에는 '바뀐 것'이 0개여도 서버가 다를 수 있어 두 단추를 다 연다 */}
                <button type="button" disabled={saving || (changed.size === 0 && !saveFailed)} onClick={undo} className={ds.button.secondarySmall}>
                  되돌리기
                </button>
                <button
                  type="button"
                  disabled={changed.size === 0 && !saveFailed}
                  aria-busy={saving ? 'true' : undefined}
                  onClick={() => void save()}
                  className={ds.button.primarySmall}
                >
                  {saveFailed ? '다시 저장' : '저장'}
                </button>
              </span>
            </div>
            <p className={ds.help}>저장하면 바로 적용돼요. 비트 PC에서 청구 작업 중이면 그 화면에 &quot;설정이 바뀌었어요, 다시 점검하세요&quot;가 떠요.</p>
          </div>
        </>
      )}
    </section>
  )
}
