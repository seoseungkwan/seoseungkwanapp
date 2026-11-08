'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { validatePhrases, type PhraseDiffRow, type PhraseError, type Phrases } from '@/lib/precheck/memo'
import { readHospitalSettings, writeHospitalSettings } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { BasicTab } from './phrases/BasicTab'
import { ErrorList } from './phrases/fields'
import { withPhraseChanges } from './phrases/merge'
import { ProcTab } from './phrases/ProcTab'
import { ReasonTab } from './phrases/ReasonTab'
import { RulesTab } from './phrases/RulesTab'
import { SaveDiff } from './phrases/SaveDiff'
import { saveDiffRows } from './phrases/saveDiffRows'
import { TryTab } from './phrases/TryTab'

// 설정의 '병원 문구' 칸(AC-018.7·AC-018.18·AC-018.19, memo-settings REQ-3007·시안 docs/mockups/memo-settings). 저장하는 값의 모양은 AC-014.3 + memoRules 그대로다(묶음은 화면 배치일 뿐이다).
// 묶음 단추 여섯 개(기본 · 시술별 문구와 약 · 처방코드 · 표기 규칙 · 사유 문장 · 메모 시험)와 아래 저장 줄 하나. 고치는 값(draft)·읽은 값(opened)·저장·비교 상태는 여기 하나에 둔다.
// [저장]은 바로 쓰지 않고 바뀐 부분 표를 보인 뒤 [이대로 저장]에 쓴다(AC-3007.5). 쓸 때는 고친 칸만 그때 읽은 값에 얹는다(AC-3007.6).
// 병원 설정 줄이 없거나 검사를 지나지 못하면 파란 안내뿐이고 저장 단추가 없다(AC-018.18): 기본값으로 대신 저장하면 막음이 풀린다. Worker 답 없이 같은 판단을 한다. 환자 자료가 오지 않는다

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'blocked' } | { kind: 'ready' }
type Tab = 'basic' | 'proc' | 'codes' | 'rules' | 'reason' | 'try'

const TABS: { key: Tab; label: string }[] = [
  { key: 'basic', label: '기본' },
  { key: 'proc', label: '시술별 문구와 약' },
  { key: 'codes', label: '처방코드' },
  { key: 'rules', label: '표기 규칙' },
  { key: 'reason', label: '사유 문장' },
  { key: 'try', label: '메모 시험' },
]

const BASIC_KEYS = ['mark', 'sideStyle', 'cartilageSideLang', 'levelSep', 'lineJoin', 'drugWrap', 'drugUnit', 'drugQty']
const PROC_KEYS = ['main', 'mainCentral', 'mainPeripheral', 'cpb', 'snb', 'icnb', 'ara', 'klg', 'iaAra', 'iaEtc', 'ts', 'byProc', 'byRegion', 'fixedPhrases']
const RULE_KEYS = ['sideMode', 'sideSpread', 'splitCpb', 'splitSnb', 'splitEach', 'kneeSetSkipIa', 'rename', 'sideByCode', 'siteNames']
const REASON_KEYS = ['itv', 'ia2', 'intervalDays']

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
  return null
}

// 화면 안 탭(관리자 화면과 같은 모양): 40px·body(휴대폰 44px), 탭 줄 아래 1px line. 지금 탭은 ink 600 + 아래 2px accent 밑줄
const tabBase =
  'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
const tabCurrent = `${tabBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

/** 처음 질문 안내(AC-018.18): 파란 안내이고 오류 번호가 없다. 설정의 칸은 목업대로 둘째 줄이 없다 */
function FirstQuestion({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="rounded-control bg-accent-soft px-4 py-3 text-small font-semibold text-accent-strong">
      처음 질문을 먼저 해 주세요
    </div>
  )
}

export function HospitalPhrases() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [draft, setDraft] = useState<Phrases | null>(null)
  const [errors, setErrors] = useState<PhraseError[]>([])
  const [tab, setTab] = useState<Tab>('basic')
  const [confirm, setConfirm] = useState<{ rows: PhraseDiffRow[]; value: Phrases } | null>(null)
  const [nothing, setNothing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  /** 마지막으로 서버와 맞춘 값: 열 때 읽은 값, 저장한 뒤에는 저장한 값. 무엇을 고쳤는지 이것과 견준다 */
  const opened = useRef<Phrases | null>(null)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const baseId = useId()
  const tabId = (key: Tab) => `${baseId}-tab-${key}`
  const panelId = `${baseId}-panel`

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
      setDraft(checked.value)
      setLoad({ kind: 'ready' })
    } catch {
      setLoad({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  /** 묶음이 고친 값. 열려 있던 비교 표는 옛 값이라 닫는다 */
  const update = (next: Phrases) => {
    setSavedNote(false)
    setNothing(false)
    setConfirm(null)
    setDraft(next)
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const at = TABS.findIndex((t) => t.key === tab)
    const last = TABS.length - 1
    const moves: Record<string, number> = { ArrowRight: at === last ? 0 : at + 1, ArrowLeft: at === 0 ? last : at - 1, Home: 0, End: last }
    if (!(event.key in moves)) return
    event.preventDefault()
    const key = TABS[moves[event.key]].key
    setTab(key)
    tabRefs.current[key]?.focus()
  }

  /** [저장]: 검사하고, 바뀐 칸이 있으면 비교 표를 연다(AC-3007.5) */
  function askSave() {
    if (!draft || !opened.current || saving) return
    setSavedNote(false)
    setNothing(false)
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
      const merged = validatePhrases(withPhraseChanges(latest.value, opened.current, checked.value))
      if (!merged.ok) {
        setErrors(merged.errors)
        return
      }
      await writeHospitalSettings(sb, { phrases: merged.value, dxLinks: now.dxLinks })
      opened.current = merged.value
      // 저장하는 동안 더 고친 것은 남긴다
      setDraft((current) => (current ? withPhraseChanges(merged.value, sent, current) : current))
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
      <div className="flex flex-col gap-1">
        <h2 id="hospital-phrases-title" className={ds.panelTitle}>
          병원 문구
        </h2>
        <p className="text-small text-ink-2">청구메모에 들어가는 말을 우리 병원에 맞게 고쳐요. 저장하기 전까지 실제 메모는 바뀌지 않아요.</p>
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
      {load.kind === 'blocked' && (
        <>
          <FirstQuestion label="처음 질문" />
          <h3 className="text-body font-semibold text-ink">시술별 약</h3>
          <FirstQuestion label="처음 질문(시술별 약)" />
        </>
      )}
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
                  onClick={() => setTab(t.key)}
                  className={on ? tabCurrent : tabIdle}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
          <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
            {tab === 'basic' && <BasicTab draft={draft} errors={errors} onChange={update} />}
            {tab === 'proc' && <ProcTab draft={draft} errors={errors} onChange={update} />}
            {tab === 'codes' && <p className={ds.help}>처방코드 목록은 다음 단계에서 이 자리에 생겨요.</p>}
            {tab === 'rules' && <RulesTab draft={draft} errors={errors} onChange={update} />}
            {tab === 'reason' && <ReasonTab draft={draft} errors={errors} onChange={update} />}
            {tab === 'try' && <TryTab draft={draft} />}
          </div>
          {confirm && <SaveDiff rows={confirm.rows} busy={saving} onConfirm={() => void save(confirm.value)} onCancel={() => setConfirm(null)} />}
          {errors.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className={ds.fieldError}>틀린 칸이 {errors.length}개 있어요. 칸 아래 글을 보고 고쳐 주세요.</p>
              <ErrorList errors={unplaced} />
            </div>
          )}
          {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={askSave}>
              {saveFailed ? '다시 저장' : '저장'}
            </button>
            {nothing && <span role="status" className="text-small text-ink-2">바뀐 것이 없어요</span>}
            {savedNote && <span role="status" className="text-small text-ink-2">저장했어요. 다음에 만드는 메모부터 바뀌어요.</span>}
          </div>
        </>
      )}
    </section>
  )
}
