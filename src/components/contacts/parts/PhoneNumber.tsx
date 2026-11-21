'use client'

import { useSyncExternalStore } from 'react'
import { Icon } from '@/components/common/Icon'
import { phoneText, telHref } from '@/lib/contacts/fields'
import { look } from './look'
import { COPIED_MS, useCopied } from './useCopied'

export { COPIED_MS }

// 번호(spec contacts AC-6505.3, 시안 기본값 7 · numHtml). 기기로만 가른다(폭이 아니라):
// 손가락으로 누르는 기기는 tel: 링크(누르면 전화), 마우스 기기는 복사 단추(누르면 보이는 번호를 복사하고 1.6초 '복사했어요').
// big = 대표 전화(20px, '누르면 복사돼요'가 늘 보임), 아니면 담당자 번호(마우스를 올렸을 때만 보임). 번호 모양은 phoneText

/** 업무일지 TOUCH_QUERY와 같은 글. 폭 질문은 하지 않는다 */
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)'

const hasMatchMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
function subscribe(listener: () => void) {
  if (!hasMatchMedia()) return () => {}
  const query = window.matchMedia(TOUCH_QUERY)
  query.addEventListener?.('change', listener)
  return () => query.removeEventListener?.('change', listener)
}
const isTouch = () => hasMatchMedia() && window.matchMedia(TOUCH_QUERY).matches
const notTouchOnServer = () => false

/** 터치 기기인지(matchMedia가 없으면 마우스 기기로 본다) */
export function useTouchDevice() {
  return useSyncExternalStore(subscribe, isTouch, notTouchOnServer)
}

export function PhoneNumber({ value, big = false }: { value: string; big?: boolean }) {
  const touch = useTouchDevice()
  const { copied, copy } = useCopied()
  const shown = phoneText(value)
  const size = big ? 'text-title font-semibold' : 'text-body font-medium'
  const base = `group inline-flex items-center gap-2 whitespace-nowrap rounded-control text-ink tabular-nums ${size} ${look.focusRing}`
  const number = <span className="underline-offset-3 group-hover:underline">{shown}</span>

  if (touch) {
    const href = telHref(value)
    if (href === null) return <span className={base}>{shown}</span>
    return (
      <a href={href} className={`${base} no-underline`}>
        {number}
      </a>
    )
  }

  return (
    <button type="button" title="누르면 복사돼요" onClick={() => void copy(shown)} className={`${base} cursor-pointer`}>
      {number}
      {copied ? (
        <span className="inline-flex items-center gap-1 text-caption font-medium text-positive">
          <Icon name="check" size={14} />
          복사했어요
        </span>
      ) : (
        <span className={`items-center gap-1 text-caption font-normal text-muted ${big ? 'inline-flex' : 'hidden group-hover:inline-flex'}`}>누르면 복사돼요</span>
      )}
    </button>
  )
}
