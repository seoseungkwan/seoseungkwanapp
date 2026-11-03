'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { createMemoEngine, validatePhrases, type PhraseError, type Phrases, type PhraseTemplates } from '@/lib/precheck/memo'
import { readHospitalSettings, writeHospitalSettings } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { Visit } from '@/types/precheck'
import { ProcedureDrugs } from './ProcedureDrugs'

// 설정의 '병원 문구' 칸(AC-018.7·AC-018.18·AC-018.19, 설정 쪽 승인 목업). 세 묶음: 메모 모양 · 시술별 문구와 약 · 사유 문장. 저장하는 값의 모양은 AC-014.3 그대로다(묶음은 화면 배치일 뿐이다).
// 목업의 '변경 기록'·'가입 보기 글'은 범위 밖이라 만들지 않는다. 목업의 보기(1·2·3) 고르기는 가입 질문의 보기가 아직 없어 만들지 않는다. 기능만 맞추고 모양은 다듬지 않았다.
// 병원 설정 줄이 없거나 검사를 지나지 못하면 파란 안내뿐이고 저장 단추가 없다(AC-018.18): 기본값으로 대신 저장하면 막음이 풀린다. Worker 답 없이 같은 판단을 한다. 환자 자료가 오지 않는다

type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'blocked' } | { kind: 'ready' }
type Key = keyof PhraseTemplates

/** [메모 시험해 보기]의 가짜 진료(AC-018.7). 환자 자료가 아니다 */
const FAKE_VISIT: Visit = {
  key: 'fake',
  chart: '1',
  date: '2026-01-05',
  month: '2026-01',
  name: '가짜 진료',
  lines: ['LBP', 'MBB L4,5 both'],
  hints: [null, null],
  rx: [{ code: 'LA358', name: 'LA358', qty: 2, benefit: true, pay: '급여' }],
  dx: [],
  memosInBit: [],
}

const SHAPE_SELECTS: { key: Key; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'sideStyle', label: '좌우 표기', options: [{ value: 'Rt', label: 'Rt·Lt·both' }, { value: 'upper', label: 'RT·LT·BOTH' }, { value: 'dot', label: 'Rt.·Lt.·Both' }, { value: 'bil', label: 'Rt·Lt·Bil' }, { value: 'ko', label: '우측·좌측·양측' }, { value: 'koShort', label: '우·좌·양' }] },
  { key: 'cartilageSideLang', label: '연골주사 좌우 표기', options: [{ value: 'ko', label: '한글' }, { value: 'en', label: '영어' }] },
  { key: 'levelSep', label: '레벨 이어 쓰기', options: [{ value: 'comma', label: '쉼표' }, { value: 'dash', label: '붙임표' }, { value: 'repeat', label: '글자 반복' }] },
  { key: 'lineJoin', label: '줄 나눔', options: [{ value: 'lines', label: '줄마다 나누기' }, { value: 'oneLine', label: '한 줄로 이어쓰기' }] },
  { key: 'drugWrap', label: '약 모양', options: [{ value: 'paren', label: '괄호' }, { value: 'plain', label: '괄호 없음' }] },
]
const PROC_TEXTS: { key: Key; label: string }[] = [
  { key: 'main', label: '기본 시술 문구' },
  { key: 'mainCentral', label: 'Central 시술 문구' },
  { key: 'mainPeripheral', label: 'Peripheral 시술 문구' },
  { key: 'cpb', label: '경부 CPB' },
  { key: 'snb', label: 'SNB 문구' },
  { key: 'icnb', label: 'ICNB' },
  { key: 'ara', label: '연골주사' },
  { key: 'klg', label: 'K-L grade' },
  { key: 'iaAra', label: '연골주사 포함 IA' },
  { key: 'iaEtc', label: '일반 IA' },
  { key: 'ts', label: '건초내주사' },
]
const REASON_TEXTS: { key: Key; label: string }[] = [
  { key: 'itv', label: '주사 간격 사유' },
  { key: 'ia2', label: '2부위 시술 사유' },
]

function TextField({ label, value, error, rows, onChange }: { label: string; value: string; error?: string; rows?: number; onChange(value: string): void }) {
  const id = useId()
  return (
    <div className={ds.field}>
      <label className={ds.label} htmlFor={id}>
        {label}
      </label>
      {rows ? (
        <textarea id={id} rows={rows} className={`${ds.input} h-auto py-2`} value={value} aria-invalid={error ? true : undefined} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input id={id} className={ds.input} autoComplete="off" value={value} aria-invalid={error ? true : undefined} onChange={(event) => onChange(event.target.value)} />
      )}
      {error && <p className={ds.fieldError}>{error}</p>}
    </div>
  )
}

function SelectField({ label, value, options, error, onChange }: { label: string; value: string; options: { value: string; label: string }[]; error?: string; onChange(value: string): void }) {
  const id = useId()
  return (
    <div className={ds.field}>
      <label className={ds.label} htmlFor={id}>
        {label}
      </label>
      <select id={id} className={ds.input} value={value} aria-invalid={error ? true : undefined} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className={ds.fieldError}>{error}</p>}
    </div>
  )
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** 표 하나에서 before와 after가 다른 칸만 base에 얹는다. 지운 칸은 지운다 */
function withChanges<T>(base: Readonly<Record<string, T>>, before: Readonly<Record<string, T>>, after: Readonly<Record<string, T>>): Record<string, T> {
  const merged = { ...base }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (same(before[key], after[key])) continue
    if (Object.hasOwn(after, key)) merged[key] = after[key]
    else delete merged[key]
  }
  return merged
}

/**
 * before → after로 고친 칸만 now에 얹는다(AC-018.7, 규칙 설정의 withRulesFrom과 같은 생각): 고칠 수 있는 칸은 문구(TPL)와 시술별 약(시술마다)뿐이고,
 * 나머지(코드 사전 등)와 고치지 않은 칸은 그때 읽은 값 그대로다. 그동안 다른 PC가 고친 문구를 덮지 않는다
 */
function withPhraseChanges(now: Phrases, before: Phrases, after: Phrases): Phrases {
  return {
    ...now,
    TPL: withChanges<unknown>(now.TPL, before.TPL, after.TPL) as PhraseTemplates,
    procedureDrugs: withChanges(now.procedureDrugs, before.procedureDrugs, after.procedureDrugs),
  }
}

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
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  /** 마지막으로 서버와 맞춘 값: 열 때 읽은 값, 저장한 뒤에는 저장한 값. 무엇을 고쳤는지 이것과 견준다 */
  const opened = useRef<Phrases | null>(null)

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

  const errorOf = (path: string) => errors.find((error) => error.path === path)?.message
  const setTpl = (key: Key, value: unknown) => {
    setSavedNote(false)
    setDraft((now) => (now ? { ...now, TPL: { ...now.TPL, [key]: value } } : now))
  }

  async function save() {
    if (!draft || !opened.current || saving) return
    const sent = draft
    const checked = validatePhrases(sent)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setErrors([])
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

  function tryMemo() {
    if (!draft) return
    const checked = validatePhrases(draft)
    if (!checked.ok) {
      setErrors(checked.errors)
      setPreview(null)
      return
    }
    setErrors([])
    setPreview(createMemoEngine(checked.value, {}).fullText(FAKE_VISIT))
  }

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
          <div role="group" aria-label="메모 모양" className="flex flex-col gap-3">
            <h3 className="text-body font-semibold text-ink">메모 모양</h3>
            <TextField label="줄 앞 기호" value={String(draft.TPL.mark ?? '')} error={errorOf('TPL.mark')} onChange={(value) => setTpl('mark', value)} />
            <div className="grid gap-3 md:grid-cols-2">
              {SHAPE_SELECTS.map(({ key, label, options }) => (
                <SelectField key={key} label={label} value={String(draft.TPL[key] ?? options[0].value)} options={options} error={errorOf(`TPL.${String(key)}`)} onChange={(value) => setTpl(key, value)} />
              ))}
              <TextField label="약 양 단위" value={String(draft.TPL.drugUnit ?? '')} error={errorOf('TPL.drugUnit')} onChange={(value) => setTpl('drugUnit', value)} />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 text-small text-ink">
              <input type="checkbox" checked={draft.TPL.drugQty === true} onChange={(event) => setTpl('drugQty', event.target.checked)} />
              양도 쓰기 (비트 처방의 투여량)
            </label>
          </div>
          <div role="group" aria-label="시술별 문구와 약" className="flex flex-col gap-3">
            <h3 className="text-body font-semibold text-ink">시술별 문구와 약</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {PROC_TEXTS.map(({ key, label }) => (
                <TextField key={key} label={label} value={String(draft.TPL[key] ?? '')} error={errorOf(`TPL.${String(key)}`)} onChange={(value) => setTpl(key, value)} />
              ))}
            </div>
            <ProcedureDrugs
              codes={draft.CODEMAP}
              value={draft.procedureDrugs}
              errors={errors}
              onChange={(next) => {
                setSavedNote(false)
                setDraft({ ...draft, procedureDrugs: next })
              }}
            />
          </div>
          <div role="group" aria-label="사유 문장" className="flex flex-col gap-3">
            <h3 className="text-body font-semibold text-ink">사유 문장</h3>
            {REASON_TEXTS.map(({ key, label }) => (
              <TextField key={key} rows={2} label={label} value={String(draft.TPL[key] ?? '')} error={errorOf(`TPL.${String(key)}`)} onChange={(value) => setTpl(key, value)} />
            ))}
            <TextField
              label="주사 간격 일수"
              value={draft.TPL.intervalDays === undefined || Number.isNaN(draft.TPL.intervalDays) ? '' : String(draft.TPL.intervalDays)}
              error={errorOf('TPL.intervalDays')}
              onChange={(value) => setTpl('intervalDays', value.trim() === '' ? undefined : Number(value))}
            />
          </div>
          {errors.length > 0 && <p className={ds.fieldError}>틀린 칸이 {errors.length}개 있어요. 칸 아래 글을 보고 고쳐 주세요.</p>}
          {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={() => void save()}>
              {saveFailed ? '다시 저장' : '저장'}
            </button>
            <button type="button" className={ds.button.secondary} onClick={tryMemo}>
              메모 시험해 보기
            </button>
            {savedNote && <span role="status" className="text-small text-ink-2">저장했어요. 다음에 만드는 메모부터 바뀌어요.</span>}
          </div>
          {preview !== null && (
            <section aria-label="시험한 메모" className="flex flex-col gap-1 rounded-control bg-canvas px-3 py-2">
              <p className="text-caption text-muted">가짜 진료 한 건으로 만든 메모예요.</p>
              <p className="whitespace-pre-wrap break-words text-small text-ink">{preview}</p>
            </section>
          )}
        </>
      )}
    </section>
  )
}
