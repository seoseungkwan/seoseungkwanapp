'use client'

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { useClinicProfile } from '@/components/clinic/useClinicProfile'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { isYmd, todayInKorea } from '@/lib/analytics/dates'
import { DEFAULT_TEMPLATE_NOTE, DEFAULT_TEMPLATES, type TemplateKind } from '@/lib/patientMessages/defaults'
import { clinicInfoOf, dateLine, defaultSendDate, fillClinic, fillTemplate } from '@/lib/patientMessages/fill'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { CopyButton, CopyNoticeLine, type CopyNotice } from './CopyButton'
import { dayLabel } from './periods'
import { TEMPLATE_KIND_LABEL, useTemplates, type DraftRow, type TemplateField } from './useTemplates'

// 문자 문구 도구(AC-613.1~613.4·613.6, 목업 messagesTool). 문구만 다룬다: 환자 값이 없고 통로·Worker·store.load를 쓰지 않아 연결·기기와 상관없이 같은 화면이다(AC-613.5).
// 미리 보기는 문구의 [*1*]·[*2*] 자리를 그대로 보인다(문자 프로그램이 채운다). 채운 글은 화면과 [문구 복사]로 클립보드에만 가고 console·주소·브라우저 저장소에 두지 않는다.
// 읽기가 될 때까지는 고칠 것을 그리지 않는다(AC-613.6). 고르기 칸·단추 묶음은 F/U·정기 주사 도구 안의 것과 같은 모양이다(그 파일을 고치는 TASK가 아니라 여기 따로 둔다)
// 미리 보기·복사 글에는 병원 정보(이름·전화·진료시간)도 넣는다(AC-6605.1). 고치는 칸과 저장하는 글은 그대로다. 이 도구는 PatientsScreen 밖(PatientsEntry)에 있어 병원 정보를 스스로 읽는다

const TITLE = '문자 문구'
const DESC = '명단과 함께 문자 프로그램에 붙여 넣을 안내 글이에요. 여기서 고치면 다른 PC와 휴대폰에서도 같은 글을 써요.'
const HELP =
  '[*1*] 자리는 받는 분 이름, [*2*] 자리는 부위(정기 주사는 주사 종류, 예약 안내는 예약 시각)로 문자 프로그램이 바꿔요. ‘* 11월 5일 목요일 *’처럼 별표로 감싼 날짜 줄은 고른 내원 날짜로 바뀌어요. 병원 이름·전화·진료시간은 설정 → 병원 정보 값이 들어가요.'
const COPY_BLOCKED = '복사하지 못했어요. 미리 보기 글을 골라 두었어요. 골라 둔 글을 오른쪽 클릭해 [복사]를 눌러 주세요.'
const FIELD_ERROR: Record<TemplateField, string> = { name: '이름을 1~30자로 적어 주세요.', body: '내용을 1~2000자로 적어 주세요.' }
const ADD_KINDS: readonly (readonly [TemplateKind, string])[] = [
  ['injection', TEMPLATE_KIND_LABEL.injection],
  ['followup', TEMPLATE_KIND_LABEL.followup],
  ['reservation', TEMPLATE_KIND_LABEL.reservation],
]

// 입력란과 같은 모양인데 높이만 줄 수(rows)로 정한다(목업 textarea.inp)
const TEXTAREA = `${ds.input.replace('h-11 ', '')} resize-y py-2`
const AFTER_CARD = 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-2'
const SEG_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:auto-cols-fr max-md:grid-flow-col'
const SEG_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-2'
const SEG_ON = 'bg-accent-soft font-semibold text-accent-strong'
const SEG_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

/** 도구 머리(목업 head). right는 [저장] */
function Head({ right }: { right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div>
        <h2 className="text-subtitle font-semibold text-ink">{TITLE}</h2>
        <p className="mt-0.5 max-w-170 text-small text-muted">{DESC}</p>
      </div>
      {right}
    </div>
  )
}

function KindSegments({ value, onChange }: { value: TemplateKind; onChange(next: TemplateKind): void }) {
  return (
    <div role="group" aria-label="새 문구 종류" className={SEG_GROUP}>
      {ADD_KINDS.map(([kind, text]) => (
        <button key={kind} type="button" aria-pressed={kind === value} onClick={() => onChange(kind)} className={`${SEG_BUTTON} ${kind === value ? SEG_ON : SEG_OFF}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

/**
 * 날짜 칸 값 둘: 칸에 보이는 글자(text)와 쓰는 날짜(valid). dateLine·fillTemplate·defaultSendDate는 잘못된 날짜에 RangeError를 던지므로 valid만 넘긴다.
 * 크롬 날짜 칸은 연도 첫 자리를 치는 순간 0002-11-02 같은 값을 낸다. 글자만 두고 쓰지 않는다. 글자까지 되돌리면 연도를 칠 수 없다. 칸을 떠나면 쓰는 날짜로 맞춘다
 */
function useDayField(today: string) {
  const [valid, setValid] = useState(() => defaultSendDate(isYmd(today) ? today : todayInKorea()))
  const [text, setText] = useState(valid)
  const change = (next: string) => {
    setText(next)
    if (isYmd(next)) setValid(next)
  }
  return { text, valid, change, settle: () => setText(valid) }
}

function TemplateRowFields({
  row,
  index,
  last,
  saving,
  ids,
  errors,
  onEdit,
  onUp,
  onDown,
  onRemove,
  onDateLine,
}: {
  row: DraftRow
  index: number
  last: boolean
  saving: boolean
  ids: { name: string; body: string; up: string; down: string }
  /** 지금 알려 줄 칸 오류 */
  errors: { name: boolean; body: boolean }
  onEdit(field: TemplateField, value: string): void
  onUp(): void
  onDown(): void
  onRemove(): void
  onDateLine(): void
}) {
  const label = row.name || `${index + 1}번 문구`
  const nameError = `${ids.name}-error`
  const bodyError = `${ids.body}-error`
  return (
    <li className="grid gap-3 border-b border-line py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold text-muted">{index + 1}번</span>
        <span className={ds.chip.neutral}>{TEMPLATE_KIND_LABEL[row.kind]}</span>
        <div className="ml-auto flex gap-1">
          <button id={ids.up} type="button" className={ds.button.ghostSmall} aria-label={`${label} 위로`} aria-disabled={index === 0 || saving ? true : undefined} onClick={onUp}>
            <Icon name="arrowDown" size={14} className="rotate-180" />
            위로
          </button>
          <button id={ids.down} type="button" className={ds.button.ghostSmall} aria-label={`${label} 아래로`} aria-disabled={last || saving ? true : undefined} onClick={onDown}>
            <Icon name="arrowDown" size={14} />
            아래로
          </button>
          <button type="button" className={ds.button.ghostSmall} aria-label={`${label} 지우기`} aria-disabled={saving ? true : undefined} onClick={onRemove}>
            지우기
          </button>
        </div>
      </div>
      <div className={ds.field}>
        <label className={ds.label} htmlFor={ids.name}>
          이름 <span className={ds.labelHint}>1~30자</span>
        </label>
        <input
          id={ids.name}
          className={ds.input}
          value={row.name}
          readOnly={saving}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? nameError : undefined}
          onChange={(event) => onEdit('name', event.target.value)}
        />
        {errors.name && (
          <p id={nameError} className={ds.fieldError}>
            {FIELD_ERROR.name}
          </p>
        )}
      </div>
      <div className={ds.field}>
        <label className={ds.label} htmlFor={ids.body}>
          내용 <span className={ds.labelHint}>1~2000자</span>
        </label>
        <textarea
          id={ids.body}
          rows={6}
          className={TEXTAREA}
          value={row.body}
          readOnly={saving}
          aria-invalid={errors.body ? true : undefined}
          aria-describedby={errors.body ? bodyError : undefined}
          onChange={(event) => onEdit('body', event.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <button type="button" className={ds.textButton} aria-disabled={saving ? true : undefined} onClick={onDateLine}>
            날짜 줄 넣기
          </button>
          {/* 저장 검사처럼 코드포인트로 센다 */}
          <span className="whitespace-nowrap text-caption text-muted">{formatCount([...row.body].length)}/2,000자</span>
        </div>
        {errors.body && (
          <p id={bodyError} className={ds.fieldError}>
            {FIELD_ERROR.body}
          </p>
        )}
      </div>
    </li>
  )
}

export function MessagesTool({
  today,
  active,
}: {
  /** 처음 내원 날짜(내일)의 기준 */
  today: string
  /** 지금 보이는 도구인가. 다른 도구로 가도 살아 있어 고친 글을 잃지 않는다 */
  active: boolean
}) {
  const templates = useTemplates(supabaseBrowser)
  const { state, draft, saving, changed, tried, invalid, justSaved, usingDefaults, saveError } = templates
  const clinicView = useClinicProfile()
  const clinic = useMemo(() => clinicInfoOf(clinicView), [clinicView])

  const date = useDayField(today)
  const base = useId()
  const [addKind, setAddKind] = useState<TemplateKind>('injection')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<CopyNotice>(null)
  const previewBox = useRef<HTMLDivElement>(null)
  // 그린 뒤 초점을 줄 칸(줄을 옮기거나 더하면 칸이 새로 놓인다)
  const focusAfter = useRef<{ id: string; caret?: number } | null>(null)

  useEffect(() => {
    if (!focusAfter.current) return
    const { id, caret } = focusAfter.current
    focusAfter.current = null
    const box = document.getElementById(id)
    box?.focus()
    if (caret !== undefined && box instanceof HTMLTextAreaElement) box.setSelectionRange(caret, caret)
  })

  // 다른 도구로 가면 복사 결과 줄을 지운다(목업 setTool)
  useEffect(() => {
    if (!active) setNotice(null)
  }, [active])

  if (state === 'loading') {
    return (
      <>
        <Head />
        <div role="status" className="mt-4 border-t border-line pt-5">
          <p className="text-subtitle font-semibold text-ink">문자 문구를 불러오는 중이에요</p>
        </div>
      </>
    )
  }

  if (state === 'load-failed') {
    return (
      <>
        <Head />
        <div className="mt-4 max-w-180">
          <ErrorCard code="E-PATIENTS-TEMPLATES-READ" />
          <div className={AFTER_CARD}>
            <button type="button" className={`${ds.button.secondary} max-md:w-full`} onClick={templates.reload}>
              다시 불러오기
            </button>
          </div>
        </div>
      </>
    )
  }

  const nameId = (key: string) => `${base}-name-${key}`
  const bodyId = (key: string) => `${base}-body-${key}`
  const saveId = `${base}-save`
  const addId = `${base}-add`
  const selected = draft.find((row) => row.key === selectedKey) ?? draft[0] ?? null
  const fieldId = (field: TemplateField, key: string) => (field === 'name' ? nameId(key) : bodyId(key))

  function submit(): void {
    if (saving) return
    void templates.save()
    const first = invalid[0]
    const row = first && draft[first.index]
    if (first && row) document.getElementById(fieldId(first.field, row.key))?.focus()
  }

  function edit(index: number, row: DraftRow, field: TemplateField, value: string): void {
    if (saving) return
    templates.edit(index, { [field]: value })
    setTouched((prev) => new Set(prev).add(fieldId(field, row.key)))
  }

  function insertDateLine(index: number, row: DraftRow): void {
    const box = document.getElementById(bodyId(row.key))
    if (saving || !(box instanceof HTMLTextAreaElement)) return
    const before = row.body.slice(0, box.selectionStart)
    const after = row.body.slice(box.selectionStart)
    const inserted = `${before && !before.endsWith('\n') ? '\n' : ''}${dateLine(date.valid)}${after && !after.startsWith('\n') ? '\n' : ''}`
    edit(index, row, 'body', before + inserted + after)
    focusAfter.current = { id: bodyId(row.key), caret: (before + inserted).length }
  }

  function addRow(): void {
    const key = templates.add(addKind)
    if (key === null) return
    setSelectedKey(key)
    focusAfter.current = { id: bodyId(key) }
  }

  function moveRow(index: number, dir: -1 | 1, id: string): void {
    if (saving) return
    templates.move(index, dir)
    focusAfter.current = { id }
  }

  function removeRow(index: number): void {
    if (saving) return
    templates.remove(index)
    focusAfter.current = { id: addId }
  }

  function copied(result: CopyNotice): void {
    if (!result || result.ok) {
      setNotice(result)
      return
    }
    // 막히면 글을 골라 둔다: 오른쪽 클릭으로 복사할 수 있게
    setNotice({ ok: false, text: COPY_BLOCKED })
    const selection = window.getSelection()
    if (!selection || !previewBox.current) return
    const range = document.createRange()
    range.selectNodeContents(previewBox.current)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  // 목업 saveStatusHtml 차례
  let status: CopyNotice = null
  if (saving) status = { ok: false, text: '저장하는 중이에요…' }
  else if (tried && invalid.length > 0) status = { ok: false, text: '고칠 칸이 있어요. 칸 아래 안내를 확인해 주세요.' }
  else if (changed) status = { ok: false, text: '바뀐 것이 있어요. [저장]을 눌러야 다른 PC와 휴대폰에도 같은 글이 나와요.' }
  else if (justSaved) status = { ok: true, text: '저장했어요' }

  return (
    <>
      <Head
        right={
          <button
            id={saveId}
            type="button"
            className={`${ds.button.primary} max-md:w-full`}
            aria-disabled={changed ? undefined : true}
            aria-busy={saving ? true : undefined}
            onClick={() => {
              if (changed) submit()
            }}
          >
            {saving ? '저장하는 중…' : '저장'}
          </button>
        }
      />
      <CopyNoticeLine notice={status} />

      {saveError && (
        <div className="mt-2 max-w-180">
          <ErrorCard code="E-PATIENTS-TEMPLATES-SAVE" />
          <div className={AFTER_CARD}>
            <button
              type="button"
              className={`${ds.button.secondary} max-md:w-full`}
              onClick={() => {
                // 이 단추는 저장이 시작되면 사라진다. 초점이 사라지지 않게 [저장]으로 옮긴다(틀린 칸이 있으면 저장이 시작되지 않고 그 칸으로 간다)
                if (invalid.length === 0) focusAfter.current = { id: saveId }
                submit()
              }}
            >
              다시 저장
            </button>
          </div>
        </div>
      )}

      <p className="mt-2 max-w-170 text-small text-muted">{HELP}</p>

      <div className="mt-4 grid grid-cols-12 gap-x-6 max-md:grid-cols-1 max-md:gap-y-8">
        <div className="col-span-7 min-w-0 max-md:col-span-1">
          {usingDefaults && (
            <div className="mb-4 flex gap-2 rounded-control bg-accent-soft px-4 py-3 text-body text-ink">
              <Icon name="doc" className="mt-0.5 shrink-0 text-accent-strong" />
              <div>
                <p>
                  <b className="font-semibold">처음이라 기본 문구 {DEFAULT_TEMPLATES.length}개를 넣어 뒀어요.</b>
                </p>
                <p className="mt-0.5 text-small text-ink-2">{DEFAULT_TEMPLATE_NOTE}. [저장]을 누르면 우리 의원 문구로 남아요.</p>
              </div>
            </div>
          )}
          <ol aria-label="문구 목록" className="list-none border-t border-line">
            {draft.length === 0 && <li className="border-b border-line py-4 text-body text-muted">문구가 없어요. 아래에서 문구를 더해 주세요.</li>}
            {draft.map((row, index) => {
              const shows = (field: TemplateField) => invalid.some((bad) => bad.index === index && bad.field === field) && (tried || touched.has(fieldId(field, row.key)))
              const up = `${base}-up-${row.key}`
              const down = `${base}-down-${row.key}`
              return (
                <TemplateRowFields
                  key={row.key}
                  row={row}
                  index={index}
                  last={index === draft.length - 1}
                  saving={saving}
                  ids={{ name: nameId(row.key), body: bodyId(row.key), up, down }}
                  errors={{ name: shows('name'), body: shows('body') }}
                  onEdit={(field, value) => edit(index, row, field, value)}
                  onUp={() => {
                    if (index > 0) moveRow(index, -1, up)
                  }}
                  onDown={() => {
                    if (index < draft.length - 1) moveRow(index, 1, down)
                  }}
                  onRemove={() => removeRow(index)}
                  onDateLine={() => insertDateLine(index, row)}
                />
              )
            })}
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid">
            <span className="whitespace-nowrap text-small font-semibold text-ink">새 문구</span>
            <KindSegments value={addKind} onChange={setAddKind} />
            <button id={addId} type="button" className={`${ds.button.secondary} max-md:w-full`} aria-disabled={saving ? true : undefined} onClick={addRow}>
              문구 더하기
            </button>
          </div>
        </div>

        <div className="col-span-4 col-start-9 min-w-0 max-md:col-span-1 max-md:col-start-1">
          <div className={ds.field}>
            <label className={ds.label} htmlFor={`${base}-date`}>
              내원 날짜
            </label>
            <input id={`${base}-date`} type="date" className={ds.input} value={date.text} onChange={(event) => date.change(event.target.value)} onBlur={date.settle} />
            <p className={ds.help}>처음에는 내일이에요. 문자는 오시기 전날 보내요.</p>
          </div>
          <div className={`${ds.field} mt-4`}>
            <label className={ds.label} htmlFor={`${base}-select`}>
              미리 볼 문구
            </label>
            <select id={`${base}-select`} className={ds.input} value={selected?.key ?? ''} disabled={draft.length === 0} onChange={(event) => setSelectedKey(event.target.value)}>
              {draft.map((row, index) => (
                <option key={row.key} value={row.key}>
                  {index + 1}번 · {row.name || '이름 없음'}
                </option>
              ))}
            </select>
          </div>
          <p id={`${base}-preview`} className={`${ds.label} mt-4`}>
            미리 보기
          </p>
          <div ref={previewBox} role="region" aria-labelledby={`${base}-preview`} className={`mt-1.5 whitespace-pre-wrap break-words rounded-control bg-canvas p-4 text-body ${selected ? 'text-ink' : 'text-muted'}`}>
            {selected ? fillClinic(fillTemplate(selected.body, date.valid), clinic) : '미리 볼 문구가 없어요.'}
          </div>
          <div className="mt-3">
            <CopyButton
              text={() => fillClinic(fillTemplate(selected?.body ?? '', date.valid), clinic)}
              label="문구 복사"
              disabled={!selected}
              doneText={`복사했어요 · ${selected?.name ?? ''} · ${dayLabel(date.valid)}`}
              onResult={copied}
            />
          </div>
          <CopyNoticeLine notice={notice} />
        </div>
      </div>
    </>
  )
}
