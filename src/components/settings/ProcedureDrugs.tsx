'use client'

import { useId, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { DrugPlace, MemoCode, PhraseError, ProcedureDrugs as Value } from '@/lib/precheck/memo'

// 설정의 '시술별 약' 칸(AC-018.19, 설정 쪽 승인 목업 '시술별 문구와 약'). 시술마다 약 이름으로 넣기·빼기와 자리를 고른다. 국소마취제·연골주사약도 같다. 환자 자료가 아니다.
// 값의 모양은 AC-014.9 그대로다: 시술(대문자 코드) → 약 이름 → {use, place?, label?}. 없는 칸은 아직 정하지 않은 것이다

const PLACES: { value: DrugPlace; label: string }[] = [
  { value: 'afterProc', label: '시술 뒤' },
  { value: 'afterEnding', label: '끝맺음 뒤' },
  { value: 'ownLine', label: '따로 한 줄' },
]

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 first:pl-0 last:pr-0 text-ink'

export function ProcedureDrugs({ codes, value, errors, disabled = false, onChange }: { codes: Readonly<Record<string, MemoCode>>; value: Value; errors: readonly PhraseError[]; disabled?: boolean; onChange(next: Value): void }) {
  const procedures = Object.entries(codes).filter(([, row]) => row.k === 'proc')
  const drugNames = [...new Set(Object.values(codes).filter((row) => row.k === 'drug').map((row) => row.n))]
  const [picked, setPicked] = useState(procedures[0]?.[0] ?? '')
  const procKey = picked.toUpperCase()
  const name = codes[picked]?.n ?? picked
  const choices = value[procKey] ?? {}
  const names = [...new Set([...drugNames, ...Object.keys(choices)])]
  const selectId = useId()

  const set = (drug: string, next: Value[string][string]) => onChange({ ...value, [procKey]: { ...choices, [drug]: next } })
  const listed = errors.filter((error) => error.path.startsWith('procedureDrugs'))

  return (
    <div className="flex flex-col gap-2">
      <div className={ds.field}>
        <label className={ds.label} htmlFor={selectId}>
          고칠 시술
        </label>
        <select id={selectId} className={ds.input} value={picked} disabled={disabled} onChange={(event) => setPicked(event.target.value)}>
          {procedures.map(([code, row]) => (
            <option key={code} value={code}>
              {row.n} ({code})
            </option>
          ))}
        </select>
      </div>
      <div className={ds.table.wrap}>
        <table aria-label={`${name}에 넣을 약`} className={ds.table.table}>
          <thead>
            <tr>
              <th className={th}>약 이름</th>
              <th className={th}>넣기·빼기</th>
              <th className={th}>자리</th>
            </tr>
          </thead>
          <tbody>
            {names.map((drug) => {
              const choice = choices[drug]
              const fieldName = `${procKey}-${drug}`
              return (
                <tr key={drug}>
                  <td className={td}>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {drug}
                      {!choice && <span className={ds.chip.warning}>아직 안 정함</span>}
                    </span>
                  </td>
                  <td className={td}>
                    <span role="radiogroup" aria-label={`${drug} 넣기·빼기`} className="flex flex-wrap gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input type="radio" name={fieldName} aria-label={`${drug} 넣기`} checked={choice?.use === 'include'} disabled={disabled} onChange={() => set(drug, { ...(choice?.label ? { label: choice.label } : {}), use: 'include', place: choice?.place ?? 'afterProc' })} />
                        넣기
                      </label>
                      <label className="inline-flex cursor-pointer items-center gap-1.5">
                        <input type="radio" name={fieldName} aria-label={`${drug} 빼기`} checked={choice?.use === 'exclude'} disabled={disabled} onChange={() => set(drug, { ...(choice?.label ? { label: choice.label } : {}), use: 'exclude' })} />
                        빼기
                      </label>
                    </span>
                  </td>
                  <td className={td}>
                    <select aria-label={`${drug} 자리`} className={ds.input} value={choice?.place ?? 'afterProc'} disabled={disabled || choice?.use !== 'include'} onChange={(event) => choice && set(drug, { ...choice, place: event.target.value as DrugPlace })}>
                      {PLACES.map((place) => (
                        <option key={place.value} value={place.value}>
                          {place.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {listed.map((error) => (
        <p key={error.path} className={ds.fieldError}>
          {error.message}
        </p>
      ))}
      <p className={ds.help}>병원 설정과 실제로 쓴 시술이 다른 날에는 메모가 틀릴 수 있어요</p>
      <p className={ds.help}>바꾸면 다음에 만드는 메모부터 바뀌어요</p>
      <p className={ds.help}>같은 날 시술이 2개 이상이면 약을 자동으로 넣지 않아요. [약 확인]을 남겨 어느 시술에 쓴 약인지 사람이 확인해요. 그날 모든 시술에서 빼기로 정한 약만 그대로 빼요.</p>
    </div>
  )
}
