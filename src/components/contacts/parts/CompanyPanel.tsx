'use client'

import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { CONTACT_CATEGORIES } from '@/lib/contacts/categories'
import { cleanText, CONTACT_LIMITS, FIELD_LABELS } from '@/lib/contacts/fields'
import type { Company, CompanyFields, ContactCategory } from '@/types/contacts'
import { keepTabInside, TextField, useReturnFocus, useSending } from './formBits'
import { look } from './look'
import type { ChipValue, SaveResult } from './types'

// 업체 고치기·더하기 판(spec contacts AC-6505.4, 시안 기본값 9·11·12·13 · drawerHtml). 오른쪽에서 나오는 판(폭 520px)이고 업체 칸만 다룬다.
// 분류는 늘 하나(고치기 = 그 업체 것, 더하기 = 지금 칩, 전체면 거래처). 계좌·사이트 비밀번호는 가린 칸(password)으로 열리고 [보기]/[가리기].
// [저장]: 빈 업체 이름·같은 이름(손에 든 주소록, 앞뒤 빈칸 무시, 자기 줄 빼고)은 보내지 않는다 → onSave(업체 칸, id 없음).
// 되면 '저장했어요.' + onClose(새 업체 고르기는 화면이 onSave 답 id로 한다), duplicate면 겹침 글, failed면 바닥에 E-CONTACTS-SAVE-FAILED 카드(적은 값 그대로).
// [닫기]·[그만두기]·Esc·바탕 누름은 보내지 않고 onClose

type CompanyPanelProps = {
  mode: 'new' | 'edit'
  /** 고칠 업체(더하기면 null) */
  company: Company | null
  /** 지금 목록 칩(더하기 분류 기본값) */
  category: ChipValue
  /** 손에 든 주소록 업체(이름 겹침을 먼저 본다) */
  companies: readonly Company[]
  onSave(fields: CompanyFields): Promise<SaveResult>
  onClose(): void
  onNotice(text: string): void
}

const NAME_EMPTY = '업체 이름을 적어 주세요.'
const NAME_DUPLICATE = '같은 이름의 업체가 이미 있어요.'
const NEED = '업체 이름만 꼭 적어요. 나머지는 비워도 돼요.'
const NEED_NAME = '업체 이름을 적으면 저장할 수 있어요.'

type TextKey = Exclude<keyof CompanyFields, 'category'>
const EMPTY: Record<TextKey, string> = { name: '', phone: '', work: '', address: '', homepage: '', bizNo: '', account: '', siteId: '', sitePw: '', memo: '' }
const TEXT_KEYS = Object.keys(EMPTY) as TextKey[]

export function CompanyPanel({ mode, company, category, companies, onSave, onClose, onNotice }: CompanyPanelProps) {
  const id = useId()
  const titleId = `${id}-title`
  const nameRef = useRef<HTMLInputElement>(null)
  const [chosen, setChosen] = useState<ContactCategory>(company?.category ?? (category === 'all' ? 'supplier' : category))
  const [values, setValues] = useState<Record<TextKey, string>>(() => (company ? Object.fromEntries(TEXT_KEYS.map((key) => [key, company[key]])) as Record<TextKey, string> : EMPTY))
  const [shown, setShown] = useState({ account: false, sitePw: false })
  const [nameError, setNameError] = useState<string | null>(null)
  const [needName, setNeedName] = useState(false)
  const { busy, failed, send } = useSending()
  const labels = FIELD_LABELS.company
  const limits = CONTACT_LIMITS.company
  const title = mode === 'edit' ? '업체 고치기' : '업체 더하기'
  useReturnFocus()

  useEffect(() => {
    nameRef.current?.focus()
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key: TextKey) => (next: string) => {
    setValues((prev) => ({ ...prev, [key]: next }))
    if (key === 'name') {
      setNameError(null)
      setNeedName(false)
    }
  }
  const blockName = (text: string) => {
    setNameError(text)
    nameRef.current?.focus()
  }

  async function save() {
    if (busy) return
    const fields: CompanyFields = {
      category: chosen,
      name: cleanText(values.name),
      phone: cleanText(values.phone),
      work: cleanText(values.work),
      address: cleanText(values.address),
      homepage: cleanText(values.homepage),
      bizNo: cleanText(values.bizNo),
      account: cleanText(values.account),
      siteId: cleanText(values.siteId),
      sitePw: cleanText(values.sitePw),
      memo: cleanText(values.memo),
    }
    if (fields.name === '') {
      setNeedName(true)
      return blockName(NAME_EMPTY)
    }
    if (companies.some((other) => other.id !== company?.id && cleanText(other.name) === fields.name)) return blockName(NAME_DUPLICATE)
    const result = await send(() => onSave(fields))
    if (result?.ok) {
      onNotice('저장했어요.')
      onClose()
    } else if (result && result.reason === 'duplicate') blockName(NAME_DUPLICATE)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save()
  }

  const text = (key: Exclude<TextKey, 'memo'>, extra: { placeholder?: string; help?: string; required?: boolean; inputMode?: 'tel' | 'numeric' } = {}) => (
    <TextField
      id={`${id}-${key}`}
      label={labels[key]}
      value={values[key]}
      onChange={set(key)}
      maxLength={limits[key]}
      placeholder={extra.placeholder}
      help={extra.help}
      required={extra.required}
      inputMode={extra.inputMode}
      error={key === 'name' ? nameError : null}
      inputRef={key === 'name' ? nameRef : undefined}
    />
  )
  const secret = (key: 'account' | 'sitePw', placeholder?: string) => (
    <TextField
      id={`${id}-${key}`}
      label={labels[key]}
      type={shown[key] ? 'text' : 'password'}
      value={values[key]}
      onChange={set(key)}
      maxLength={limits[key]}
      placeholder={placeholder}
      after={
        <button type="button" aria-label={`${labels[key]} 보기`} aria-pressed={shown[key]} onClick={() => setShown((prev) => ({ ...prev, [key]: !prev[key] }))} className={look.mini}>
          {shown[key] ? '가리기' : '보기'}
        </button>
      }
    />
  )

  return (
    <>
      <div data-scrim aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-ink/18" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={keepTabInside}
        className="fixed inset-y-0 right-0 z-50 flex w-130 max-w-full flex-col border-l border-line-strong bg-surface shadow-float"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line py-2.5 pr-3 pl-6">
          <h2 id={titleId} className="text-subtitle font-semibold text-ink">
            {title}
          </h2>
          <button type="button" aria-label="닫기" onClick={onClose} className={look.iconButton}>
            <Icon name="x" />
          </button>
        </div>
        <form noValidate onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="grid flex-1 content-start gap-5 overflow-y-auto px-6 pt-5 pb-6">
            <div className={look.field}>
              <span className={look.label}>
                {labels.category}
                <span className={look.required}>필수</span>
              </span>
              <div role="group" aria-label={labels.category} className="flex flex-wrap gap-1.5">
                {CONTACT_CATEGORIES.map((option) => (
                  <button key={option.id} type="button" aria-pressed={option.id === chosen} onClick={() => setChosen(option.id)} className={option.id === chosen ? look.optionOn : look.option}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {text('name', { required: true, placeholder: '예: 예시메디칼', help: '엑셀로 고칠 때 업체 이름으로 찾아요. 같은 이름의 업체는 하나만 둘 수 있어요.' })}
            {text('phone', { placeholder: '02-000-0000', inputMode: 'tel', help: '숫자만 적어도 02-000-0000 모양으로 바꿔 보여 줘요.' })}
            {text('work', { placeholder: '예: 의료기기 판매·수리, 충격파 기계', help: '찾기에 쓰여요.' })}
            {text('address')}
            {text('homepage', { placeholder: '예: www.example.com' })}
            {text('bizNo', { placeholder: '000-00-00000', inputMode: 'numeric' })}
            {secret('account', '예: 예시은행 000-000000-00-000 (예금주)')}
            <div className="grid grid-cols-2 gap-x-3 gap-y-5">
              {text('siteId', { placeholder: '주문·수리 접수 사이트' })}
              {secret('sitePw')}
            </div>
            <div className={look.field}>
              <label htmlFor={`${id}-memo`} className={look.label}>
                {labels.memo}
              </label>
              <textarea
                id={`${id}-memo`}
                value={values.memo}
                onChange={(event) => set('memo')(event.target.value)}
                placeholder="예: 주문은 오후 3시 전에"
                maxLength={limits.memo}
                className={look.textarea}
              />
            </div>
            <p className={look.help}>{mode === 'edit' ? '담당자·장비·수리 기록은 자세히 화면에서 줄마다 바로 고쳐요.' : '담당자·장비는 저장한 뒤 자세히 화면에서 더해요.'}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3">
            {failed && (
              <div className="basis-full">
                <ErrorCard code="E-CONTACTS-SAVE-FAILED" />
              </div>
            )}
            <p className={needName ? 'flex-[1_1_160px] text-caption font-medium text-negative' : 'flex-[1_1_160px] text-caption text-muted'}>{needName ? NEED_NAME : NEED}</p>
            <button type="button" onClick={onClose} className={look.button}>
              그만두기
            </button>
            <button type="submit" aria-busy={busy || undefined} className={look.primary}>
              저장
            </button>
          </div>
        </form>
      </aside>
    </>
  )
}
