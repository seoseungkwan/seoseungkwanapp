'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { neutralPhrases, validatePhrases, type Phrases } from '@/lib/precheck/memo'
import { applyAnswers, answersOf, type Answers } from '@/lib/precheck/memo/onboarding/answers'
import { NONE_PRESET, PRESETS } from '@/lib/precheck/memo/onboarding/presets'
import { previewMemos } from '@/lib/precheck/memo/onboarding/preview'
import type { MemoReading } from '@/lib/precheck/memo/onboarding/readMemo'
import { SAMPLE_LABELS } from '@/lib/precheck/memo/onboarding/sampleVisits'
import { readHospitalSettings, writeHospitalSettings } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { ConfirmPage } from './ConfirmPage'
import { ExampleAside, SampleMemo } from './ExampleAside'
import { PasteBox } from './paste/PasteBox'
import { PAGE_COUNT, QuestionPage, type Key } from './QuestionPage'

// 처음 질문 화면(clinic-profile REQ-6614, design.md 16절): 시작 → [예전 메모 붙여 넣기] / [예시에서 고르기] / [비슷한 게 없어요] → 질문 네 쪽(보기 메모 칸) → 확인 → 저장.
// 단계·답은 이 화면 상태에만 둔다(브라우저 저장소 안 씀, 중간에 나가면 처음부터). 붙인 글은 PasteBox 안에만 있고 여기에는 readMemo 결과만 온다.
// 답의 바탕: 지금 맞는 병원 문구가 있으면 그것, 없으면 neutralPhrases(). 보기 메모는 진짜 메모 엔진으로 메인 스레드에서 만든다(메모 시험 탭과 같다).
// 시작 값: [비슷한 게 없어요] = 보기 2, [예시에서 고르기] = 고른 보기, 붙여 넣기 = 읽은 값 + 못 읽은 칸은 보기 2(다시 할 때는 지금 문구의 답).
// 저장은 그때 다시 읽은 병원 문구(맞으면 그것, 아니면 neutralPhrases())에 답을 넣어 검사한 뒤 쓰고, 상병 연결표는 읽은 그대로 보낸다(없으면 [])

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; current: Phrases | null }
type Step = 'start' | 'paste' | 'pick' | 'page' | 'confirm' | 'saved'
type Entry = 'start' | 'paste' | 'pick'

const LEAD = '똑같지 않아도 괜찮아요. 고른 뒤 쪽마다 바꿀 수 있어요. 예시는 가짜 진료예요.'
const SAVED = '저장했어요. 다음에 만드는 메모부터 이 모양이에요.'
const panel = `${ds.panel} flex min-w-0 flex-col gap-4 p-5 max-md:p-4`
const actions = 'flex flex-wrap items-center gap-2'

/** 붙여 넣기 결과로 시작 값: 읽은 칸은 읽은 값, 나머지('섞여 있어요'·'못 찾았어요')는 fallback 값이고 '골라 주세요' 표시를 단다 */
function fromReading(reading: MemoReading, fallback: Readonly<Answers>): { answers: Answers; unsure: Key[] } {
  const answers: Record<Key, unknown> = { ...fallback }
  const unsure: Key[] = []
  for (const key of Object.keys(fallback) as Key[]) {
    const found = reading[key]
    if (found !== null && found !== 'mixed') answers[key] = found.value
    else unsure.push(key)
  }
  return { answers: answers as Answers, unsure }
}

/** [예시에서 고르기]: 보기 4개 카드(카드마다 가짜 진료 3건 메모) · [이 모양으로 시작] · [비슷한 게 없어요] */
function PickStep({ base, onStart, onNone, onPrev }: { base: Phrases; onStart(at: number): void; onNone(): void; onPrev(): void }) {
  const [chosen, setChosen] = useState<number | null>(null)
  const memos = useMemo(() => PRESETS.map((preset) => previewMemos(applyAnswers(base, preset.answers))), [base])
  const name = useId()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={panel}>
      <h2 id={titleId} className={ds.panelTitle}>
        예시에서 고르기
      </h2>
      <div role="radiogroup" aria-label="보기">
        <ul className="grid gap-3 md:grid-cols-2">
          {PRESETS.map((preset, at) => (
            <li
              key={preset.name}
              onClick={() => setChosen(at)}
              className="flex min-w-0 cursor-pointer flex-col gap-3 rounded-control border border-line-strong bg-surface p-4 has-checked:border-accent has-checked:bg-accent-soft"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input type="radio" name={name} aria-label={preset.name} className="accent-accent" checked={chosen === at} onChange={() => setChosen(at)} />
                <span className="text-body font-semibold text-ink">{preset.name}</span>
              </label>
              {memos[at].map((memo, i) => (
                <SampleMemo key={SAMPLE_LABELS[i] ?? i} label={SAMPLE_LABELS[i] ?? ''} memo={memo} />
              ))}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${actions} border-t border-line pt-4`}>
        <button type="button" className={ds.button.secondary} onClick={onPrev}>
          이전
        </button>
        <button type="button" className={ds.button.primary} disabled={chosen === null} onClick={() => chosen !== null && onStart(chosen)}>
          이 모양으로 시작
        </button>
        <button type="button" className={ds.button.secondary} onClick={onNone}>
          비슷한 게 없어요
        </button>
      </div>
    </section>
  )
}

export function FirstRunScreen() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [step, setStep] = useState<Step>('start')
  const [entry, setEntry] = useState<Entry>('start')
  const [page, setPage] = useState(0)
  const [answers, setAnswers] = useState<Answers | null>(null)
  const [unsure, setUnsure] = useState<ReadonlySet<Key>>(() => new Set())
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  const read = useCallback(async () => {
    setLoad({ kind: 'loading' })
    try {
      const row = await readHospitalSettings(supabaseBrowser())
      const checked = validatePhrases(row?.phrases)
      setLoad({ kind: 'ready', current: checked.ok ? checked.value : null })
    } catch {
      setLoad({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  const current = load.kind === 'ready' ? load.current : null
  const base = useMemo(() => current ?? neutralPhrases(), [current])
  const next = useMemo(() => (answers ? applyAnswers(base, answers) : null), [base, answers])
  const memos = useMemo(() => (next ? previewMemos(next) : []), [next])

  function begin(start: Readonly<Answers>, marks: readonly Key[], from: Entry) {
    setAnswers({ ...start })
    setUnsure(new Set(marks))
    setEntry(from)
    setPage(0)
    setSaveFailed(false)
    setStep('page')
  }

  function change<K extends Key>(key: K, value: Answers[K]) {
    setAnswers((before) => (before ? { ...before, [key]: value } : before))
    setUnsure((before) => {
      if (!before.has(key)) return before
      const after = new Set(before)
      after.delete(key)
      return after
    })
  }

  async function save() {
    if (!answers || saving) return
    setSaving(true)
    setSaveFailed(false)
    try {
      const sb = supabaseBrowser()
      // 그때 다시 읽는다: 다른 창이 고친 문구·상병 연결표를 덮지 않게
      const now = await readHospitalSettings(sb)
      const latest = validatePhrases(now?.phrases)
      const checked = validatePhrases(applyAnswers(latest.ok ? latest.value : neutralPhrases(), answers))
      if (!checked.ok) {
        setSaveFailed(true)
        return
      }
      await writeHospitalSettings(sb, { phrases: checked.value, dxLinks: now?.dxLinks ?? [] })
      setStep('saved')
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const none = () => begin(PRESETS[NONE_PRESET].answers, [], 'start')

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <h1 className="text-title font-semibold text-ink">우리 병원 메모 모양 맞추기</h1>

      {load.kind === 'loading' && <p className="text-small text-muted">병원 문구를 읽는 중이에요…</p>}
      {load.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-SETTINGS-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={() => void read()}>
            다시 불러오기
          </button>
        </div>
      )}

      {load.kind === 'ready' && step === 'start' && (
        <section aria-label="시작" className={panel}>
          <p className="text-body text-ink-2">{LEAD}</p>
          <div className={actions}>
            <button type="button" className={ds.button.primary} onClick={() => setStep('paste')}>
              예전 메모 붙여 넣기
            </button>
            <button type="button" className={ds.button.secondary} onClick={() => setStep('pick')}>
              예시에서 고르기
            </button>
            <button type="button" className={ds.button.secondary} onClick={none}>
              비슷한 게 없어요
            </button>
          </div>
        </section>
      )}

      {load.kind === 'ready' && step === 'paste' && (
        <section aria-label="예전 메모 붙여 넣기" className={panel}>
          <h2 className={ds.panelTitle}>예전 메모 붙여 넣기</h2>
          <PasteBox
            onStart={(reading) => {
              const start = fromReading(reading, current ? answersOf(current) : PRESETS[NONE_PRESET].answers)
              begin(start.answers, start.unsure, 'paste')
            }}
          />
          <div className={`${actions} border-t border-line pt-4`}>
            <button type="button" className={ds.button.secondary} onClick={() => setStep('start')}>
              이전
            </button>
          </div>
        </section>
      )}

      {load.kind === 'ready' && step === 'pick' && (
        <PickStep base={base} onStart={(at) => begin(PRESETS[at].answers, [], 'pick')} onNone={none} onPrev={() => setStep('start')} />
      )}

      {load.kind === 'ready' && (step === 'page' || step === 'confirm') && answers && next && (
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          {step === 'page' ? (
            <QuestionPage
              key={page}
              page={page}
              answers={answers}
              unsure={unsure}
              onChange={change}
              onPrev={() => (page === 0 ? setStep(entry) : setPage(page - 1))}
              onNext={() => (page === PAGE_COUNT - 1 ? setStep('confirm') : setPage(page + 1))}
            />
          ) : (
            <ConfirmPage current={current} next={next} saving={saving} failed={saveFailed} onPrev={() => setStep('page')} onSave={() => void save()} />
          )}
          <ExampleAside memos={memos} />
        </div>
      )}

      {load.kind === 'ready' && step === 'saved' && (
        <section aria-label="저장했어요" className={panel}>
          <p role="status" className="text-body text-ink">
            {SAVED}
          </p>
          <div className={actions}>
            <Link href="/settings" className={`${ds.button.primary} no-underline max-md:w-full`}>
              병원 문구로 가기
            </Link>
          </div>
        </section>
      )}
    </div>
  )
}
