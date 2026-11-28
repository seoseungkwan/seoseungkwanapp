'use client'

import { useId, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { DEFAULT_MAIN_CENTRAL_CODES, TS_WORDS_FALLBACK, type PhraseTemplates } from '@/lib/precheck/memo'
import { ProcedureDrugs } from '../ProcedureDrugs'
import { FIXED_MAX, fixedOf, REGIONS } from './constants'
import { ErrorList, errorOf, errorsUnder, Group, withRule, withTpl, type TabProps } from './fields'
import { DefaultedField, withTplOrDefault } from './ReasonTab'
import { TemplateField } from './TemplateField'

// '시술별 문구와 약' 묶음(memo-settings AC-3007.3, 시안 #proc): 시술 문구 11칸·시술 이름별 문구(byProc)·부위별 문구(byRegion 12칸)·고정 멘트(fixedPhrases, 30개까지)·시술별 약.
// 틀 글 칸은 모두 TemplateField다. 고정 멘트를 고치면 draft가 바뀌어 모든 칸의 '자동 채움 넣기' 단추가 바로 바뀐다.
// 'Central 시술 문구' 바로 아래에 숨어 있던 'Central 시술 처방코드'(mainCentralCodes, clinic-profile AC-6613.2). 엔진이 읽지 않는 lidoCodes·mainPeripheralCodes는 꺼내지 않는다.
// '건초내주사' 바로 아래에 '건초내주사로 알아볼 차트 말'(TPL.tsWords, claim-learn AC-9308.4). 비우면 칸을 지워 엔진이 지금 말(TS_WORDS_FALLBACK, 흐린 글)을 쓴다

type Key = keyof PhraseTemplates
type Fixed = NonNullable<PhraseTemplates['fixedPhrases']>

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

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 first:pl-0 last:pr-0 text-ink'

function ByProc({ draft, errors, onChange }: TabProps) {
  const map = draft.TPL.byProc ?? {}
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const nameId = useId()
  const set = (next: Record<string, string>) => onChange(withTpl(draft, 'byProc', next))
  function add() {
    const key = name.trim()
    if (!key) return
    if (Object.keys(map).some((existing) => existing.toUpperCase() === key.toUpperCase())) {
      setNote('이미 있는 이름이에요')
      return
    }
    setNote('')
    setName('')
    // 빈 문구는 그 시술 줄을 비우므로 기본 시술 문구로 시작한다
    set({ ...map, [key]: String(draft.TPL.main || '{시술}') })
  }
  return (
    <Group title="시술 이름별 문구" note="— 차트의 시술 이름과 맞으면 이 문구를 써요. 이름이 긴 것부터 먼저 맞춰요">
      {Object.entries(map).map(([key, value]) => (
        <div key={key} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TemplateField label={key} path={`TPL.byProc.${key}`} value={value} draft={draft} error={errorOf(errors, `TPL.byProc.${key}`)} onChange={(text) => set({ ...map, [key]: text })} />
          </div>
          <button
            type="button"
            className={`${ds.button.secondarySmall} mt-6`}
            aria-label={`${key} 지우기`}
            onClick={() => {
              const next = { ...map }
              delete next[key]
              set(next)
            }}
          >
            지우기
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <div className={ds.field}>
          <label className={ds.label} htmlFor={nameId}>
            더할 시술 이름
          </label>
          <input id={nameId} className={ds.input} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <button type="button" className={ds.button.secondary} onClick={add}>
          + 이름 더하기
        </button>
      </div>
      {note && <p className={ds.fieldError}>{note}</p>}
      <ErrorList errors={errors.filter((error) => error.path === 'TPL.byProc')} />
    </Group>
  )
}

function ByRegion({ draft, errors, onChange }: TabProps) {
  const map = draft.TPL.byRegion ?? {}
  const set = (key: string, text: string) => {
    const next = { ...map, [key]: text }
    if (text === '') delete next[key]
    onChange(withTpl(draft, 'byRegion', next))
  }
  return (
    <Group title="부위별 문구" note="— 비워 두면 기본 시술 문구">
      <div className="grid gap-4 md:grid-cols-2">
        {REGIONS.map(({ key, ko }) => (
          <TemplateField key={key} label={ko} path={`TPL.byRegion.${key}`} value={map[key] ?? ''} draft={draft} error={errorOf(errors, `TPL.byRegion.${key}`)} onChange={(text) => set(key, text)} />
        ))}
      </div>
      <ErrorList errors={errors.filter((error) => error.path === 'TPL.byRegion')} />
    </Group>
  )
}

function FixedPhrases({ draft, errors, onChange }: TabProps) {
  const list = fixedOf(draft.TPL)
  const set = (next: Fixed) => onChange(withTpl(draft, 'fixedPhrases', next))
  const edit = (index: number, change: Partial<Fixed[number]>) => set(list.map((row, at) => (at === index ? { ...row, ...change } : row)))
  function add() {
    let n = list.length + 1
    while (list.some((row) => row.token === `멘트${n}`)) n += 1
    set([...list, { token: `멘트${n}`, text: '', on: true }])
  }
  return (
    <Group title="고정 멘트" note="— 내가 만드는 {항목}. 문구 칸에 {단추 이름}을 넣으면 이 글이 그대로 들어가요. 끄면 빈칸이 돼요">
      <div className={ds.table.wrap}>
        <table aria-label="고정 멘트" className={ds.table.table}>
          <thead>
            <tr>
              <th className={th}>켜기</th>
              <th className={th}>단추 이름</th>
              <th className={th}>들어갈 글</th>
              <th className={th}>
                <span className="sr-only">지우기</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((row, index) => {
              const label = `고정 멘트 ${index + 1}`
              const error = errorOf(errors, `TPL.fixedPhrases.${index}`)
              return (
                <tr key={index}>
                  <td className={td}>
                    <input type="checkbox" aria-label={`${label} 켜기`} checked={row.on !== false} onChange={(event) => edit(index, { on: event.target.checked })} />
                  </td>
                  <td className={td}>
                    <input aria-label={`${label} 단추 이름`} className={ds.input} autoComplete="off" value={row.token} aria-invalid={error ? true : undefined} onChange={(event) => edit(index, { token: event.target.value })} />
                    {error && <p className={ds.fieldError}>{error}</p>}
                  </td>
                  <td className={td}>
                    <input aria-label={`${label} 글`} className={ds.input} autoComplete="off" value={row.text} onChange={(event) => edit(index, { text: event.target.value })} />
                  </td>
                  <td className={td}>
                    <button type="button" className={ds.button.secondarySmall} aria-label={`${label} 지우기`} onClick={() => set(list.filter((_, at) => at !== index))}>
                      지우기
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.secondarySmall} disabled={list.length >= FIXED_MAX} onClick={add}>
          + 멘트 더하기
        </button>
        <span className={ds.help}>더하거나 이름을 바꾸면 위 모든 칸의 &apos;자동 채움 넣기&apos; 단추에 바로 생겨요 ({FIXED_MAX}개까지)</span>
      </div>
      <ErrorList errors={errors.filter((error) => error.path === 'TPL.fixedPhrases')} />
    </Group>
  )
}

export function ProcTab({ draft, errors, onChange }: TabProps) {
  return (
    <div className="flex flex-col gap-4">
      <Group title="시술 문구">
        <div className="grid gap-4 md:grid-cols-2">
          {PROC_TEXTS.map(({ key, label }) => {
            const text = <TemplateField key={key} label={label} path={`TPL.${key}`} value={String(draft.TPL[key] ?? '')} draft={draft} error={errorOf(errors, `TPL.${key}`)} onChange={(value) => onChange(withTpl(draft, key, value))} />
            if (key === 'ts') {
              return (
                <div key={key} className="flex flex-col gap-3">
                  {text}
                  <DefaultedField
                    label="건초내주사로 알아볼 차트 말"
                    help="차트 줄에 이 말이 있으면 건초내주사 부위로 봐요. 쉼표로 나눠 적어요."
                    value={String(draft.TPL.tsWords ?? '')}
                    placeholder={TS_WORDS_FALLBACK}
                    error={errorOf(errors, 'TPL.tsWords')}
                    onChange={(value) => onChange(withTplOrDefault(draft, 'tsWords', value))}
                  />
                </div>
              )
            }
            if (key !== 'mainCentral') return text
            return (
              <div key={key} className="flex flex-col gap-3">
                {text}
                <DefaultedField
                  label="Central 시술 처방코드"
                  help="쉼표로 나눠 적어요. 비워 두면 흐린 글의 기본값을 써요."
                  value={String(draft.TPL.mainCentralCodes ?? '')}
                  placeholder={DEFAULT_MAIN_CENTRAL_CODES}
                  error={errorOf(errors, 'TPL.mainCentralCodes')}
                  onChange={(value) => onChange(withTplOrDefault(draft, 'mainCentralCodes', value))}
                />
              </div>
            )
          })}
        </div>
        <p className={ds.help}>글을 직접 고쳐도 되고, 단추를 누르면 글쓰기 표시가 있는 자리에 들어가요. ◀ ▶로 {'{항목}'} 자리를 바꿔요.</p>
      </Group>
      <ByProc draft={draft} errors={errors} onChange={onChange} />
      <ByRegion draft={draft} errors={errors} onChange={onChange} />
      <FixedPhrases draft={draft} errors={errors} onChange={onChange} />
      <Group title="시술별 약">
        <ProcedureDrugs
          codes={draft.CODEMAP}
          value={draft.procedureDrugs}
          errors={errorsUnder(errors, 'procedureDrugs')}
          singleOwnerDrug={draft.memoRules?.singleOwnerDrug !== false}
          onSingleOwnerDrugChange={(on) => onChange(withRule(draft, 'singleOwnerDrug', on))}
          onChange={(next) => onChange({ ...draft, procedureDrugs: next })}
        />
      </Group>
    </div>
  )
}
