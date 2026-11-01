'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { DayPayload } from '@/types/payload'
import { longDate, reportSentence, todayView } from './view'

// 원장님 보고 문장 + [복사] — 연결 뒤 대시보드 큰 문장 자리 (tab-frame REQ-317, design.md '원장님 보고 문장'·'복사',
// 시안 docs/mockups/dashboard-home/index.html 화면 3 + 메모 §3 '원장님 보고 문장', 문구는 메모 §4 그대로).
// 문장은 view.ts의 reportSentence(오늘 줄의 totals만)로 만든다 — 환자 이름·차트번호·처방 이름은 쓰지 않는다.
// 첫 문장이 이 화면의 h1이다(연결 뒤에는 대시보드 짜임이 h1을 그리지 않는다).
// 복사 결과 문구는 이 파일 안에 둔다(로그인 화면 [주소 복사]와 같은 방식, 오류 번호가 없는 안내라 lib/errors.ts 틀에 맞지 않는다).
// selected(bit-dashboard AC-605.2·AC-605.4)는 고른 날이다. 없으면 오늘이고, 지난 날짜면 문장의 "오늘"이 그 날 글자로 바뀐다

const NO_TODAY = { first: '오늘 받은 진료 자료가 아직 없어요', rest: '오늘 자료가 들어오면 이 자리에 보고 문장이 올라와요.' }
const NO_PAST_DAY = { first: '이 날은 진료 자료가 없어요', rest: '진료가 없었거나 비트에 접수 기록이 없는 날이에요.' }
const COPIED = '복사했어요'
const COPY_FAILED = '복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요.'
const COPIED_MS = 2000

// 막힌 [복사]의 툴팁: 올림·초점에 보인다. 나타날 때만 투명 → 보임 + 아래 2px에서 제자리(150ms), 닫힐 때는 바로
const TOOLTIP = `${ds.layer} pointer-events-none invisible absolute right-0 bottom-full z-10 mb-1.5 translate-y-0.5 whitespace-nowrap px-2 py-1.5 text-caption font-medium text-ink opacity-0 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-hover:transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:transition`

export function ReportBlock({ today, days, selected = today }: { today: string; days: readonly DayPayload[]; selected?: string }) {
  const past = selected !== today
  const sentence = reportSentence(todayView(selected, days), past ? longDate(selected) : undefined)
  const shown = sentence ?? (past ? NO_PAST_DAY : NO_TODAY)
  const [status, setStatus] = useState<'idle' | 'done' | 'failed'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(false)
  const tipId = useId()

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  // 성공 뒤 2초 되돌림 타이머. 새 결과(성공·실패)가 오면 먼저 지운다 — 남은 타이머가 실패 안내를 지우지 않게
  function clearTimer() {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }

  async function copy(text: string) {
    try {
      if (!navigator.clipboard) throw new Error('clipboard')
      await navigator.clipboard.writeText(text)
    } catch {
      if (!alive.current) return
      clearTimer()
      setStatus('failed')
      return
    }
    if (!alive.current) return
    clearTimer()
    setStatus('done')
    timer.current = setTimeout(() => {
      timer.current = null
      setStatus('idle')
    }, COPIED_MS)
  }

  const blocked = sentence === null
  // 지난 날은 앞으로 문장이 생기는 날이 아니라 툴팁 없이 단추만 막는다(시안 applyDay)
  const tip = blocked && !past

  return (
    <div>
      <div className="mt-3 flex items-center justify-between gap-3 border-b border-line pb-2">
        <p className="text-small font-semibold text-ink">원장님 보고 문장</p>
        <span className="group relative inline-flex shrink-0">
          <button
            type="button"
            aria-disabled={blocked || undefined}
            aria-describedby={tip ? tipId : undefined}
            onClick={sentence === null ? undefined : () => void copy(sentence.full)}
            className={`${ds.button.secondarySmall} min-w-28 transition not-disabled:not-aria-disabled:active:translate-y-px`}
          >
            {status === 'done' ? (
              <>
                <Icon name="check" size={14} className="text-positive" />
                <span>{COPIED}</span>
              </>
            ) : (
              <>
                <Icon name="copy" size={14} className="text-ink-2" />
                <span>복사</span>
              </>
            )}
          </button>
          {tip && (
            <span id={tipId} role="tooltip" className={TOOLTIP}>
              문장이 생기면 복사할 수 있어요
            </span>
          )}
        </span>
      </div>

      <h1 className="mt-2 text-display-m font-semibold text-balance text-ink max-md:text-heading-m">
        {shown.first}
      </h1>
      <p className="mt-2 max-w-128 text-lead text-ink-2">{shown.rest}</p>

      <p className="mt-4 flex items-start gap-1.5 text-caption text-muted">
        <Icon name="shield" size={14} className="mt-px shrink-0 text-positive" />
        <span>보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.</span>
      </p>

      {/* 복사 결과: 성공은 화면 읽기에만(단추 글자가 보인다), 실패·클립보드 없음은 보이는 안내 */}
      <p aria-live="polite" className="text-caption text-ink-2">
        {status === 'done' && <span className="sr-only">{COPIED}</span>}
        {status === 'failed' && <span className="mt-2 block">{COPY_FAILED}</span>}
      </p>
    </div>
  )
}
