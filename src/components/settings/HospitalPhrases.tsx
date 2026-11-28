'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { WriteOnly } from '@/components/shell/viewing'
import { useRxCatalog } from '@/components/stats/useRxCatalog'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { fieldPlace, neutralPhrases, overLearnLimit, validatePhrases, type LearnRule, type PhraseDiffRow, type PhraseError, type Phrases, type PhraseTab } from '@/lib/precheck/memo'
import { readHospitalSettings, startHospitalSettings, writeHospitalSettings } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { buildCodeRows } from './codeCatalog'
import { BasicTab } from './phrases/BasicTab'
import { CodesTab, undecidedCodes } from './phrases/CodesTab'
import { ErrorList } from './phrases/fields'
import { LearnTab } from './phrases/LearnTab'
import { withPhraseChanges } from './phrases/merge'
import { ProcTab } from './phrases/ProcTab'
import { ReasonTab } from './phrases/ReasonTab'
import { RulesTab } from './phrases/RulesTab'
import { SaveDiff } from './phrases/SaveDiff'
import { saveDiffRows } from './phrases/saveDiffRows'
import { TryTab } from './phrases/TryTab'
import { TRY_CHART, TRY_RX, type TryText } from './phrases/tryVisit'
import { WordsTab } from './phrases/WordsTab'
import { ReadOnlyFields } from './ReadOnlyFields'

// 설정의 '병원 문구' 칸(AC-018.7·AC-018.18·AC-018.19, memo-settings REQ-3007·시안 docs/mockups/memo-settings). 저장하는 값의 모양은 AC-014.3 + memoRules 그대로다(묶음은 화면 배치일 뿐이다).
// 묶음 단추 여섯 개(기본 · 시술별 문구와 약 · 처방코드 · 표기 규칙 · 사유 문장 · 메모 시험)와 아래 저장 줄 하나. 고치는 값(draft)·읽은 값(opened)·저장·비교 상태는 여기 하나에 둔다.
// [저장]은 바로 쓰지 않고 바뀐 부분 표를 보인 뒤 [이대로 저장]에 쓴다(AC-3007.5). 쓸 때는 고친 칸만 그때 읽은 값에 얹는다(AC-3007.6).
// 처방코드 묶음의 목록은 통계에 저장된 날별 처방(집계)을 찾기 목록과 같은 길(useRxCatalog)로 한 번 읽어 만든다. 메모 시험 글은 화면 상태에만 둔다(AC-3007.4).
// 병원 설정 줄이 없거나 검사를 지나지 못하면 잠금 칸이고 저장 단추가 없다(AC-018.18). 잠금 칸은 파란 안내 + [처음 질문 하기](/settings/first-run)·[기본 문구로 바로 시작](중립 기본 문구로
// 줄을 만들고 다시 읽는다)이다(clinic-profile AC-6607.1·AC-6607.2, design.md 9절). Worker 답 없이 같은 판단을 한다. 환자 자료가 오지 않는다.
// 묶음 '차트 줄임말'(chartWords, AC-6612.1)은 '메모 시험' 앞에 있다. 숨어 있던 칸(AC-6613)은 사유 문장·시술별 문구와 약 묶음에 있다.
// 보는 중(admin-view AC-8011.3, 관리자가 다른 의원을 읽기만)에는 [처음 질문 다시 하기]·[처음 질문 하기]·[기본 문구로 바로 시작]·저장 줄을 그리지 않고(WriteOnly)
// 고치는 묶음의 칸을 막는다(ReadOnlyFields, 처방코드 묶음은 그 안에서 표만). 묶음 단추·'메모 시험'(이 화면에서만 만들어 보는 글)은 그대로다
// 묶음 '학습'(claim-learn AC-9304.1, '메모 시험' 뒤): 학습 목록을 draft에서 켜고 끄고 고치고 지운다. 저장은 같은 [저장] → 바뀐 부분 표이고,
// 쓸 때는 내가 고친·지운 학습만 그때 읽은 학습 목록에 얹는다(다른 PC가 더한 학습·센 남은 확인은 남는다). 학습이 한도를 넘으면 쓰지 않고 학습 묶음을 연다(AC-9304.3).
// 주소로 열기(AC-9306.2, open): 읽기가 끝나면 그 묶음을 열고, 칸(why.ts fieldPlace의 칸 이름과 같은 이름표)으로 내려가 2초 강조한다.
// 학습이면 학습 묶음의 그 학습 줄, 칸을 못 찾거나 칸이 없으면 묶음으로만 내려간다. 주소 값은 SettingsPage의 phraseOpenOf가 정해진 키만 골라 준다

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'blocked' } | { kind: 'ready' }
type Tab = PhraseTab

/** 주소로 열 병원 문구 자리(AC-9306.2): 묶음 키 + 칸 키(fieldPlace가 아는 칸) 또는 학습 번호 */
export type PhraseOpen = { tab: PhraseTab; field?: string; learn?: string }

/** 묶음 단추. 이름은 why.ts PHRASE_TAB_LABELS와 같다(phrases/fieldPlace.test.ts가 본다) */
export const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'basic', label: '기본' },
  { key: 'proc', label: '시술별 문구와 약' },
  { key: 'codes', label: '처방코드' },
  { key: 'rules', label: '표기 규칙' },
  { key: 'reason', label: '사유 문장' },
  { key: 'words', label: '차트 줄임말' },
  { key: 'try', label: '메모 시험' },
  { key: 'learn', label: '학습' },
]

const BASIC_KEYS = ['mark', 'sideStyle', 'cartilageSideLang', 'levelSep', 'lineJoin', 'drugWrap', 'drugUnit', 'drugQty']
const PROC_KEYS = ['main', 'mainCentral', 'mainCentralCodes', 'mainPeripheral', 'cpb', 'snb', 'icnb', 'ara', 'klg', 'iaAra', 'iaEtc', 'ts', 'byProc', 'byRegion', 'fixedPhrases']
const RULE_KEYS = ['sideMode', 'sideSpread', 'splitCpb', 'splitSnb', 'splitEach', 'kneeSetSkipIa', 'rename', 'sideByCode', 'siteNames']
const REASON_KEYS = ['itv', 'ia2', 'intervalDays', 'intervalCodes', 'twoSiteRules', 'reasonPriority']
/** 처음 질문 화면(spec clinic-profile design.md 16절) */
const FIRST_RUN_HREF = '/settings/first-run'

/** 틀린 칸이 있는 묶음. 화면에 칸이 없는 경로면 null(아래 요약에 글로 보인다) */
function tabOf(path: string): Tab | null {
  const [head, key] = path.split('.')
  if (head === 'TPL') {
    if (BASIC_KEYS.includes(key)) return 'basic'
    if (PROC_KEYS.includes(key)) return 'proc'
    if (RULE_KEYS.includes(key)) return 'rules'
    if (REASON_KEYS.includes(key)) return 'reason'
    return null
  }
  if (head === 'procedureDrugs' || path === 'memoRules.singleOwnerDrug') return 'proc'
  if (head === 'CODEMAP' || head === 'CODEMAP_DEL' || key === 'order') return 'codes'
  if (head === 'memoRules') return 'rules'
  if (head === 'chartWords') return 'words'
  if (head === 'learned') return 'learn'
  return null
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sameWords = (a: Phrases['chartWords'], b: Phrases['chartWords']) => same(a ?? [], b ?? [])

/**
 * 학습 목록: before → after로 내가 고친·지운·더한 학습만 now에 얹는다(학습 번호마다). 고친 학습의 남은 확인은 now 값(다른 PC·청구 화면이 센다).
 * 고치지 않은 학습과 그사이 다른 PC가 더한 학습은 now 그대로다. 고친 것이 없으면 now 그대로(칸이 없으면 없는 채로)
 */
function withLearnedChanges(now: readonly LearnRule[] | undefined, before: readonly LearnRule[], after: readonly LearnRule[]): LearnRule[] | undefined {
  if (same(before, after)) return now ? [...now] : undefined
  // 학습 번호 → 그때 읽은 학습. 내가 손대지 않은 학습(was에 없음 = 그사이 더한 학습, 또는 was와 같음)은 now 값 그대로 남는다
  const was = new Map(before.map((rule) => [rule.id, rule]))
  const will = new Map(after.map((rule) => [rule.id, rule]))
  const kept = (now ?? []).flatMap((rule): LearnRule[] => {
    if (!was.has(rule.id)) return [rule]
    const mine = will.get(rule.id)
    if (!mine) return []
    return same(was.get(rule.id), mine) ? [rule] : [{ ...mine, left: rule.left }]
  })
  const added = after.filter((rule) => !was.has(rule.id) && !kept.some((other) => other.id === rule.id))
  return [...kept, ...added]
}

/** withPhraseChanges(원래 칸만 얹는다)에 차트 줄임말 표·학습 목록을 더한다: before → after로 고쳤으면 내 표, 아니면 now의 표 그대로(다른 PC가 적은 줄이 남는다) */
function withAllChanges(now: Phrases, before: Phrases, after: Phrases): Phrases {
  const merged = withPhraseChanges(now, before, after)
  const withWords = sameWords(before.chartWords, after.chartWords) ? merged : { ...merged, chartWords: after.chartWords ?? [] }
  const learned = withLearnedChanges(now.learned, before.learned ?? [], after.learned ?? [])
  const result: Phrases = { ...withWords }
  if (learned === undefined) delete result.learned
  else result.learned = learned
  return result
}

/** 주소로 연 칸 강조(2초, design.md 8절). 칸 묶음에 원래 없던 클래스만 더했다 뺀다 */
const FLASH = ['rounded-control', 'bg-accent-soft', 'outline-2', 'outline-offset-2', 'outline-accent'] as const
const FLASH_MS = 2000

/** 묶음 안에서 이름표 글이 label인 칸 묶음(이름표의 부모: TemplateField·DefaultedField·TextField 칸 하나). 없으면 null */
function fieldBox(panel: HTMLElement, label: string): HTMLElement | null {
  const hit = Array.from(panel.querySelectorAll('label')).find((element) => element.textContent?.trim() === label)
  return hit?.parentElement ?? null
}

// 화면 안 탭(관리자 화면과 같은 모양): 40px·body(휴대폰 44px), 탭 줄 아래 1px line. 지금 탭은 ink 600 + 아래 2px accent 밑줄
const tabBase =
  'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
const tabCurrent = `${tabBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

/** 잠금 칸(AC-018.18·AC-6607.1): 파란 안내이고 오류 번호가 없다. 시작에 실패하면 저장 실패와 같은 오류 칸이 아래에 뜬다 */
function StartChoice({ busy, failed, onStart }: { busy: boolean; failed: boolean; onStart(): void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <div role="status" aria-label="처음 질문" className="rounded-control bg-accent-soft px-4 py-3 text-small font-semibold text-accent-strong">
        아직 병원 문구가 없어요. 처음 질문으로 우리 병원 메모 모양을 맞추거나, 기본 문구로 바로 시작할 수 있어요.
      </div>
      <WriteOnly>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={FIRST_RUN_HREF} className={`${ds.button.primary} no-underline`}>
            처음 질문 하기
          </Link>
          <button type="button" className={ds.button.secondary} aria-busy={busy || undefined} onClick={onStart}>
            기본 문구로 바로 시작
          </button>
        </div>
      </WriteOnly>
      {failed && <ErrorCard code="E-SETTINGS-FAILED" />}
    </div>
  )
}

export function HospitalPhrases({ open = null }: { open?: PhraseOpen | null } = {}) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [draft, setDraft] = useState<Phrases | null>(null)
  const [errors, setErrors] = useState<PhraseError[]>([])
  const [tab, setTab] = useState<Tab>('basic')
  const [confirm, setConfirm] = useState<{ rows: PhraseDiffRow[]; value: Phrases } | null>(null)
  const [nothing, setNothing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const [starting, setStarting] = useState(false)
  const [startFailed, setStartFailed] = useState(false)
  const [tryText, setTryText] = useState<TryText>({ chart: TRY_CHART, rx: TRY_RX })
  /** 마지막으로 서버와 맞춘 값: 열 때 읽은 값, 저장한 뒤에는 저장한 값. 무엇을 고쳤는지 이것과 견준다 */
  const opened = useRef<Phrases | null>(null)
  /** opened를 그리기에 쓰는 사본(처방코드 묶음의 '새 코드'는 저장된 사전에 없는 코드다) */
  const [saved, setSaved] = useState<Phrases | null>(null)
  const [today] = useState(todayInKorea)
  const catalog = useRxCatalog(today, 0)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const baseId = useId()
  const tabId = (key: Tab) => `${baseId}-tab-${key}`
  const panelId = `${baseId}-panel`
  const panelRef = useRef<HTMLDivElement>(null)
  /** 주소로 갈 자리(AC-9306.2). 한 번 가면 비운다 */
  const landing = useRef<PhraseOpen | null>(open)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  /** 주소로 연 학습(학습 묶음이 그 줄로 내려가 강조한다) */
  const [flashLearn, setFlashLearn] = useState<string | null>(null)
  /** 저장이 학습 한도로 막혔다(AC-9304.3) */
  const [limitHit, setLimitHit] = useState(false)

  const read = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const row = await readHospitalSettings(supabaseBrowser())
      const checked = validatePhrases(row?.phrases)
      if (!checked.ok) {
        setLoad({ kind: 'blocked' })
        return
      }
      opened.current = checked.value
      setSaved(checked.value)
      setDraft(checked.value)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  const { open: openCatalog } = catalog
  useEffect(() => {
    if (load.kind === 'ready') openCatalog()
  }, [load.kind, openCatalog])

  // 주소로 열기(AC-9306.2) ①: 읽기가 끝나면 그 묶음을 연다
  useEffect(() => {
    if (load.kind === 'ready' && landing.current) setTab(landing.current.tab)
  }, [load.kind])

  // ②: 그 묶음이 그려진 뒤 칸(이름표가 fieldPlace의 칸 이름인 칸)으로 내려가 2초 강조. 학습이면 학습 묶음에 그 줄을 맡긴다. 못 찾으면 묶음으로만 내려간다
  useEffect(() => {
    const goal = landing.current
    const panel = panelRef.current
    if (load.kind !== 'ready' || !goal || goal.tab !== tab || !panel) return
    landing.current = null
    if (goal.learn && opened.current?.learned?.some((rule) => rule.id === goal.learn)) {
      setFlashLearn(goal.learn)
      return
    }
    const place = goal.field ? fieldPlace(goal.field) : null
    const box = place ? fieldBox(panel, place.label) : null
    ;(box ?? panel).scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    if (!box) return
    const added = FLASH.filter((name) => !box.classList.contains(name))
    box.classList.add(...added)
    flashTimer.current = setTimeout(() => box.classList.remove(...added), FLASH_MS)
  }, [load.kind, tab])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  /** 묶음 고르기(단추·글쇠). 주소로 연 학습 강조는 끝낸다 */
  const pickTab = (key: Tab) => {
    setFlashLearn(null)
    setTab(key)
  }

  const recentRows = useMemo(() => (saved && catalog.state === 'ready' ? buildCodeRows(catalog.days, saved, today, 'recent') : []), [saved, catalog.state, catalog.days, today])
  const newCodes = draft ? undecidedCodes(recentRows, draft).length : 0

  /** 묶음이 고친 값. 열려 있던 비교 표는 옛 값이라 닫는다 */
  const update = (next: Phrases) => {
    setSavedNote(false)
    setNothing(false)
    setConfirm(null)
    setLimitHit(false)
    setDraft(next)
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.key === tab)
    const last = TABS.length - 1
    const moves: Record<string, number> = { ArrowRight: at === last ? 0 : at + 1, ArrowLeft: at === 0 ? last : at - 1, Home: 0, End: last }
    if (!(event.key in moves)) return
    event.preventDefault()
    const key = TABS[moves[event.key]].key
    pickTab(key)
    tabRefs.current[key]?.focus()
  }

  /** [기본 문구로 바로 시작](AC-6607.2): 중립 기본 문구로 줄을 만들거나(있으면 문구만 바꾼다) 다른 창이 만든 줄을 쓰고, 다시 읽어 '기본' 묶음을 연다 */
  async function start() {
    if (starting) return
    setStarting(true)
    setStartFailed(false)
    const result = await startHospitalSettings(supabaseBrowser(), neutralPhrases())
    setStarting(false)
    if (result !== 'ok') {
      setStartFailed(true)
      return
    }
    setTab('basic')
    await read()
  }

  /** [저장]: 검사하고, 바뀐 칸이 있으면 비교 표를 연다(AC-3007.5) */
  function askSave() {
    if (!draft || !opened.current || saving) return
    setSavedNote(false)
    setNothing(false)
    if (overLearnLimit(draft)) {
      // 학습 한도(AC-9304.3): 쓰지 않고 학습 묶음의 '한도' 글을 보인다
      setConfirm(null)
      setLimitHit(true)
      pickTab('learn')
      return
    }
    const checked = validatePhrases(draft)
    if (!checked.ok) {
      setErrors(checked.errors)
      setConfirm(null)
      const first = checked.errors.map((error) => tabOf(error.path)).find((key) => key !== null)
      if (first) setTab(first)
      return
    }
    setErrors([])
    const rows = saveDiffRows(opened.current, checked.value)
    if (rows.length === 0) setNothing(true)
    else setConfirm({ rows, value: draft })
  }

  /** [이대로 저장] */
  async function save(sent: Phrases) {
    if (!opened.current || saving) return
    setConfirm(null)
    const checked = validatePhrases(sent)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setSaving(true)
    setSaveFailed(false)
    try {
      const sb = supabaseBrowser()
      // 그때 읽은 값 위에 고친 칸만 얹는다: 다른 PC가 고친 문구와 코드 사전, 다른 칸이 고친 상병 연결표를 덮지 않게
      const now = await readHospitalSettings(sb)
      const latest = validatePhrases(now?.phrases)
      if (!now || !latest.ok) {
        setLoad({ kind: 'blocked' }) // 그사이 줄이 없어졌거나 틀려졌다: 이 값으로 쓰면 막음이 풀린다(AC-018.18)
        return
      }
      const candidate = withAllChanges(latest.value, opened.current, checked.value)
      if (overLearnLimit(candidate)) {
        setLimitHit(true)
        pickTab('learn')
        return
      }
      const merged = validatePhrases(candidate)
      if (!merged.ok) {
        setErrors(merged.errors)
        return
      }
      await writeHospitalSettings(sb, { phrases: merged.value, dxLinks: now.dxLinks })
      opened.current = merged.value
      setSaved(merged.value)
      // 저장하는 동안 더 고친 것은 남긴다
      setDraft((current) => (current ? withAllChanges(merged.value, sent, current) : current))
      setSavedNote(true)
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const unplaced = errors.filter((error) => tabOf(error.path) === null)

  return (
    <section aria-labelledby="hospital-phrases-title" className={`${ds.panel} flex flex-col gap-4 p-5 max-md:p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id="hospital-phrases-title" className={ds.panelTitle}>
            병원 문구
          </h2>
          <p className="text-small text-ink-2">청구메모에 들어가는 말을 우리 병원에 맞게 고쳐요. 저장하기 전까지 실제 메모는 바뀌지 않아요.</p>
        </div>
        {load.kind === 'ready' && (
          <WriteOnly>
            <Link href={FIRST_RUN_HREF} className={ds.button.secondarySmall}>
              처음 질문 다시 하기
            </Link>
          </WriteOnly>
        )}
      </div>
      {load.kind === 'loading' && <p className="text-small text-muted">병원 문구를 읽는 중이에요…</p>}
      {load.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-SETTINGS-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={() => void read()}>
            다시 불러오기
          </button>
        </div>
      )}
      {load.kind === 'blocked' && <StartChoice busy={starting} failed={startFailed} onStart={() => void start()} />}
      {load.kind === 'ready' && draft && (
        <>
          <div role="tablist" aria-label="병원 문구 묶음" onKeyDown={onTabKeyDown} className="flex flex-wrap border-b border-line">
            {TABS.map((t) => {
              const on = t.key === tab
              return (
                <button
                  key={t.key}
                  ref={(element) => {
                    tabRefs.current[t.key] = element
                  }}
                  type="button"
                  role="tab"
                  id={tabId(t.key)}
                  aria-selected={on}
                  aria-controls={panelId}
                  tabIndex={on ? 0 : -1}
                  onClick={() => pickTab(t.key)}
                  className={on ? tabCurrent : tabIdle}
                >
                  {t.label}
                  {t.key === 'codes' && newCodes > 0 && (
                    <>
                      {' '}
                      <span aria-hidden="true" className={ds.chip.warning}>
                        새 {newCodes}
                      </span>
                      <span className="sr-only">새 코드 {newCodes}개</span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
          <div ref={panelRef} role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
            {tab !== 'codes' && tab !== 'try' && (
              <ReadOnlyFields>
                {tab === 'basic' && <BasicTab draft={draft} errors={errors} onChange={update} />}
                {tab === 'proc' && <ProcTab draft={draft} errors={errors} onChange={update} />}
                {tab === 'rules' && <RulesTab draft={draft} errors={errors} onChange={update} />}
                {tab === 'reason' && <ReasonTab draft={draft} errors={errors} onChange={update} />}
                {tab === 'words' && <WordsTab draft={draft} errors={errors} onChange={update} />}
                {tab === 'learn' && <LearnTab draft={draft} errors={errors} onChange={update} flashId={flashLearn} limit={limitHit} />}
              </ReadOnlyFields>
            )}
            {tab === 'codes' && <CodesTab draft={draft} saved={saved ?? draft} errors={errors} onChange={update} days={catalog.days} state={catalog.state} today={today} onRetry={catalog.retry} />}
            {tab === 'try' && <TryTab draft={draft} text={tryText} onText={setTryText} />}
          </div>
          {confirm && <SaveDiff rows={confirm.rows} busy={saving} onConfirm={() => void save(confirm.value)} onCancel={() => setConfirm(null)} />}
          {errors.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className={ds.fieldError}>틀린 칸이 {errors.length}개 있어요. 칸 아래 글을 보고 고쳐 주세요.</p>
              <ErrorList errors={unplaced} />
            </div>
          )}
          {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
          <WriteOnly>
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={askSave}>
                {saveFailed ? '다시 저장' : '저장'}
              </button>
              {nothing && <span role="status" className="text-small text-ink-2">바뀐 것이 없어요</span>}
              {savedNote && <span role="status" className="text-small text-ink-2">저장했어요. 다음에 만드는 메모부터 바뀌어요.</span>}
            </div>
          </WriteOnly>
        </>
      )}
    </section>
  )
}
