'use client'

import { useId, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import type { MemoRules, PhraseError, Phrases, PhraseTemplates } from '@/lib/precheck/memo'

// '병원 문구' 묶음들이 같이 쓰는 칸(글·고르기·켜기). 틀 글 칸은 TemplateField다

export const errorOf = (errors: readonly PhraseError[], path: string): string | undefined => errors.find((error) => error.path === path)?.message
/** 경로가 prefix이거나 그 아래 칸인 오류들 */
export const errorsUnder = (errors: readonly PhraseError[], prefix: string): PhraseError[] => errors.filter((error) => error.path === prefix || error.path.startsWith(`${prefix}.`))

export function ErrorList({ errors }: { errors: readonly PhraseError[] }) {
  return errors.map((error, index) => (
    <p key={`${error.path}-${index}`} className={ds.fieldError}>
      {error.message}
    </p>
  ))
}

export function TextField({ label, hint, value, error, rows, onChange }: { label: string; hint?: string; value: string; error?: string; rows?: number; onChange(value: string): void }) {
  const id = useId()
  return (
    <div className={ds.field}>
      <label className={ds.label} htmlFor={id}>
        {label}
        {hint && <span className={ds.labelHint}>{hint}</span>}
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

export function SelectField({ label, value, options, error, onChange }: { label: string; value: string; options: readonly { value: string; label: string }[]; error?: string; onChange(value: string): void }) {
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

/** 켜기 칸: 이름은 label, 안내(help)는 aria-describedby로 잇는다 */
export function CheckField({ label, help, checked, error, onChange }: { label: string; help?: ReactNode; checked: boolean; error?: string; onChange(checked: boolean): void }) {
  const helpId = useId()
  return (
    <div className="flex flex-col gap-1">
      <label className="inline-flex cursor-pointer items-start gap-2 text-small text-ink">
        <input type="checkbox" className="mt-1" checked={checked} aria-invalid={error ? true : undefined} aria-describedby={help ? helpId : undefined} onChange={(event) => onChange(event.target.checked)} />
        <span>{label}</span>
      </label>
      {help && (
        <p id={helpId} className={`${ds.help} pl-6`}>
          {help}
        </p>
      )}
      {error && <p className={`${ds.fieldError} pl-6`}>{error}</p>}
    </div>
  )
}

/** 묶음 안의 작은 무리(시안 .group): 제목 + 안내 */
export function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section role="group" aria-labelledby={id} className="flex flex-col gap-3 rounded-control border border-line px-4 py-3">
      <h3 className="text-body font-semibold text-ink">
        <span id={id}>{title}</span>
        {note && <span className="ml-2 text-caption font-normal text-muted">{note}</span>}
      </h3>
      {children}
    </section>
  )
}

/** 묶음 하나가 받는 것: 고치는 값(draft), 검사 오류, 고친 값 알리기 */
export type TabProps = { draft: Phrases; errors: readonly PhraseError[]; onChange(next: Phrases): void }

export const withTpl = (draft: Phrases, key: keyof PhraseTemplates, value: unknown): Phrases => ({ ...draft, TPL: { ...draft.TPL, [key]: value } })
export const withRule = (draft: Phrases, key: keyof MemoRules, value: unknown): Phrases => ({ ...draft, memoRules: { ...draft.memoRules, [key]: value } })
