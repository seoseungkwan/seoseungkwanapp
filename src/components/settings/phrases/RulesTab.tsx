'use client'

import { useId, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { REGIONS, SITE_FALLBACK } from './constants'
import { CheckField, ErrorList, errorOf, errorsUnder, Group, SelectField, TextField, withRule, withTpl, type TabProps } from './fields'

// '표기 규칙' 묶음(memo-settings AC-3007.2, 시안 #rules): 좌우 기본 표기·앞 좌우 적용·켜고 끄기(원본 칸 + memoRules 두 칸)·코드별 좌우·부위 영어 표기 12칸·표기 바꾸기.
// 켜기 칸의 처음 값은 지금 엔진 동작이다(splitCpb·splitSnb·kneeSetSkipIa는 칸이 없으면 켬, memoRules 두 칸은 없으면 끔)

const SIDE_MODES = [
  { value: 'quantity', label: '총투여량 1.5 이상만 both' },
  { value: 'chart', label: '차트 Lt/Rt/both 그대로' },
]
const SIDE_SPREADS = [
  { value: 'all', label: '뒤 시술 모두에 적용' },
  { value: 'adjacent', label: '바로 옆 시술만' },
]
const SIDE_POLICIES = [
  { value: 'omit', label: '좌우 안 씀' },
  { value: 'quantity', label: '1.5 이상만 both' },
  { value: 'keep', label: '차트 그대로' },
]

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 first:pl-0 last:pr-0 text-ink'

function SideByCode({ draft, errors, onChange }: TabProps) {
  const map = draft.TPL.sideByCode ?? {}
  const [code, setCode] = useState('')
  const [policy, setPolicy] = useState('omit')
  const [note, setNote] = useState('')
  const codeId = useId()
  const policyId = useId()
  const set = (next: Record<string, string>) => onChange(withTpl(draft, 'sideByCode', next))
  function add() {
    const key = code.trim().toUpperCase()
    if (!key) return
    if (Object.keys(map).some((existing) => existing.toUpperCase() === key)) {
      setNote('이미 있는 코드예요')
      return
    }
    setNote('')
    setCode('')
    set({ ...map, [key]: policy })
  }
  return (
    <Group title="코드별 좌우">
      {Object.keys(map).length > 0 && (
        <div className={ds.table.wrap}>
          <table aria-label="코드별 좌우" className={ds.table.table}>
            <thead>
              <tr>
                <th className={th}>코드</th>
                <th className={th}>좌우</th>
                <th className={th}>
                  <span className="sr-only">지우기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(map).map(([key, value]) => (
                <tr key={key}>
                  <td className={td}>{key}</td>
                  <td className={td}>
                    <select aria-label={`${key} 좌우`} className={ds.input} value={value} onChange={(event) => set({ ...map, [key]: event.target.value })}>
                      {SIDE_POLICIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className={td}>
                    <button
                      type="button"
                      className={ds.button.secondarySmall}
                      aria-label={`${key} 지우기`}
                      onClick={() => {
                        const next = { ...map }
                        delete next[key]
                        set(next)
                      }}
                    >
                      지우기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className={ds.field}>
          <label className={ds.label} htmlFor={codeId}>
            더할 코드
          </label>
          <input id={codeId} className={ds.input} autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} />
        </div>
        <div className={ds.field}>
          <label className={ds.label} htmlFor={policyId}>
            더할 코드의 좌우
          </label>
          <select id={policyId} className={ds.input} value={policy} onChange={(event) => setPolicy(event.target.value)}>
            {SIDE_POLICIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={ds.button.secondary} onClick={add}>
          + 코드 더하기
        </button>
      </div>
      {note && <p className={ds.fieldError}>{note}</p>}
      <ErrorList errors={errorsUnder(errors, 'TPL.sideByCode')} />
    </Group>
  )
}

export function RulesTab({ draft, errors, onChange }: TabProps) {
  const T = draft.TPL
  const R = draft.memoRules ?? {}
  const sites = T.siteNames && typeof T.siteNames === 'object' ? T.siteNames : SITE_FALLBACK
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-2">
        <SelectField label="좌우 기본 표기" value={T.sideMode ?? 'quantity'} options={SIDE_MODES} error={errorOf(errors, 'TPL.sideMode')} onChange={(value) => onChange(withTpl(draft, 'sideMode', value))} />
        <SelectField label="앞에 한 번 적힌 좌우" value={T.sideSpread ?? 'all'} options={SIDE_SPREADS} error={errorOf(errors, 'TPL.sideSpread')} onChange={(value) => onChange(withTpl(draft, 'sideSpread', value))} />
      </div>
      <Group title="켜고 끄기">
        <CheckField label="경추 CPB 따로 쓰기" checked={T.splitCpb !== false} error={errorOf(errors, 'TPL.splitCpb')} onChange={(on) => onChange(withTpl(draft, 'splitCpb', on))} />
        <CheckField label="요추 SNB 따로 쓰기" checked={T.splitSnb !== false} error={errorOf(errors, 'TPL.splitSnb')} onChange={(on) => onChange(withTpl(draft, 'splitSnb', on))} />
        <CheckField label="시술 줄 나누기" checked={T.splitEach === true} error={errorOf(errors, 'TPL.splitEach')} onChange={(on) => onChange(withTpl(draft, 'splitEach', on))} />
        <CheckField label="무릎 세트(FNB·SNB + IA)면 IA 줄 생략" checked={T.kneeSetSkipIa !== false} error={errorOf(errors, 'TPL.kneeSetSkipIa')} onChange={(on) => onChange(withTpl(draft, 'kneeSetSkipIa', on))} />
        <CheckField
          label="무릎 세트 날에 트리암·덱사가 있으면 IA 줄 쓰기"
          help="끄면 지금처럼 IA 줄을 생략하고 [약 확인]을 남겨요"
          checked={R.kneeSetIaWithDrug === true}
          error={errorOf(errors, 'memoRules.kneeSetIaWithDrug')}
          onChange={(on) => onChange(withRule(draft, 'kneeSetIaWithDrug', on))}
        />
        <CheckField
          label="IA·건초내주사 줄에 좌우 넣기"
          help={
            <>
              켜면 IA injection of - <b>Rt</b> knee(triam)
            </>
          }
          checked={R.iaSide === true}
          error={errorOf(errors, 'memoRules.iaSide')}
          onChange={(on) => onChange(withRule(draft, 'iaSide', on))}
        />
        <ErrorList errors={errors.filter((error) => error.path === 'memoRules' || error.path === 'memoRules.singleOwnerDrug')} />
      </Group>
      <SideByCode draft={draft} errors={errors} onChange={onChange} />
      <Group title="부위 영어 표기">
        <div className="grid gap-3 md:grid-cols-3">
          {REGIONS.map(({ key, ko }) => (
            <TextField
              key={key}
              label={ko}
              value={String(sites[key] ?? '')}
              error={errorOf(errors, `TPL.siteNames.${key}`)}
              onChange={(value) => onChange(withTpl(draft, 'siteNames', { ...SITE_FALLBACK, ...sites, [key]: value }))}
            />
          ))}
        </div>
        <ErrorList errors={errors.filter((error) => error.path === 'TPL.siteNames')} />
      </Group>
      <TextField label="표기 바꾸기" hint="(한 줄에 하나: 찾을 표기 > 바꿀 표기)" rows={2} value={String(T.rename ?? '')} error={errorOf(errors, 'TPL.rename')} onChange={(value) => onChange(withTpl(draft, 'rename', value))} />
    </div>
  )
}
