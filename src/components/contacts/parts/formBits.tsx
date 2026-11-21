'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { look } from './look'
import type { SaveResult } from './types'

// 칸·판이 같이 쓰는 조각(시안 .field·fld·.req·.help·.ferr): 칸 하나와 보내기(기다림·실패) 상태.
// 칸 아래 오류 글은 오류 번호가 아니라 부품 글이다(spec contacts design.md '오류 번호' 마지막 줄)

type TextFieldProps = {
  id: string
  label: string
  value: string
  onChange(next: string): void
  required?: boolean
  placeholder?: string
  maxLength?: number
  type?: 'text' | 'date' | 'password'
  inputMode?: 'text' | 'tel' | 'numeric'
  help?: string
  error?: string | null
  suffix?: string
  inputRef?: Ref<HTMLInputElement>
  className?: string
  after?: ReactNode // 칸 안 오른쪽 단추([보기])
}

export function TextField({ id, label, value, onChange, required, placeholder, maxLength, type = 'text', inputMode, help, error, suffix, inputRef, className, after }: TextFieldProps) {
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const described = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined
  const inputClass = className ?? (suffix ? look.suffixInput : after ? look.secretInput : look.input)
  const input = (
    <input
      ref={inputRef}
      id={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      inputMode={inputMode}
      autoComplete="off"
      aria-invalid={error ? true : undefined}
      aria-describedby={described}
      className={`${inputClass} ${inputMode === 'numeric' || inputMode === 'tel' ? 'tabular-nums' : ''}`}
    />
  )
  return (
    <div className={look.field}>
      <label htmlFor={id} className={look.label}>
        {label}
        {required && <span className={look.required}>필수</span>}
      </label>
      {suffix || after ? (
        <div className="relative">
          {input}
          {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body text-muted">{suffix}</span>}
          {after && <span className="absolute top-2 right-2">{after}</span>}
        </div>
      ) : (
        input
      )}
      {help && (
        <p id={helpId} className={look.help}>
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className={look.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

/** 보내기 상태: 기다리는 동안 다시 누름은 무시하고(null), 던지면 failed로 본다. failed면 칸·판이 E-CONTACTS-SAVE-FAILED 카드를 보인다 */
export function useSending() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sending = useRef(false)

  async function send(task: () => Promise<SaveResult>): Promise<SaveResult | null> {
    if (sending.current) return null
    sending.current = true
    setBusy(true)
    setFailed(false)
    let result: SaveResult
    try {
      result = await task()
    } catch {
      result = { ok: false, reason: 'failed' }
    }
    sending.current = false
    setBusy(false)
    if (!result.ok && result.reason === 'failed') setFailed(true)
    return result
  }

  return { busy, failed, send }
}

/** 열릴 때 누른 단추를 기억했다가 닫히면(부품이 빠지면) 그 단추로 초점을 돌린다. 그 단추가 이미 없으면 그대로 */
export function useReturnFocus() {
  useEffect(() => {
    const opener = document.activeElement
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 판·창 안에서만 Tab이 돈다(끝에서 Tab이면 처음으로, 처음에서 Shift+Tab이면 끝으로) */
export function keepTabInside(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return
  const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = document.activeElement
  if (event.shiftKey && (active === first || active === event.currentTarget)) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || active === event.currentTarget)) {
    event.preventDefault()
    first.focus()
  }
}
