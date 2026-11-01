'use client'

import type { ChangeEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { clampToToday, nextDay, previousDay, savedTimeText, sheetDateText } from '@/lib/worklog/days'
import type { ErrorCode } from '@/types/errors'

// 업무일지 날짜 줄·저장 상태·오류 카드 (specs/worklog REQ-009, design.md 11-2절). 받은 상태를 그리기만 한다.
// 양식 밖이라 앱 규칙(ds·토큰·Pretendard)이다. 자동 저장만 있어서 [저장] 단추가 없다. 폭은 감싸는 화면이 정한다

export type ToolbarStatus = 'loading' | 'empty' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked' | 'load-failed'

function statusText(status: ToolbarStatus, savedAt: Date | null): string {
  const time = savedAt ? savedTimeText(savedAt) : null
  switch (status) {
    case 'loading':
      return '불러오는 중이에요'
    case 'empty':
      return '적으면 바로 저장돼요'
    case 'saving':
      return '저장하는 중이에요'
    case 'saved':
      return time ? `저장했어요 · ${time}` : '저장했어요'
    case 'blocked':
      return time ? `빨간 칸 빼고 저장했어요 · ${time}` : '빨간 칸은 저장하지 않았어요'
    case 'offline':
      return '인터넷이 끊겼어요. 다시 연결되면 저장해요'
    // 실패는 오류 카드가 말한다. 자리(role="status")는 남겨 다음 글을 읽어 주게 한다
    case 'failed':
    case 'load-failed':
      return ''
  }
}

function RetryCard({ code, action, onClick }: { code: ErrorCode; action: string; onClick(): void }) {
  return (
    <div className="flex flex-col gap-2">
      <ErrorCard code={code} />
      <button type="button" className={`${ds.button.secondary} self-start`} onClick={onClick}>
        {action}
      </button>
    </div>
  )
}

export function WorklogToolbar({
  ymd,
  today,
  status,
  savedAt,
  blockedYmd,
  onDate,
  onRetrySave,
  onReload,
  onPrint,
}: {
  ymd: string
  today: string
  status: ToolbarStatus
  savedAt: Date | null
  blockedYmd: string | null // 막힌 칸이 있는 날. null이면 막힌 칸이 없다
  onDate(ymd: string): void
  onRetrySave(): void
  onReload(): void
  onPrint(): void
}) {
  const next = nextDay(ymd, today)
  const offline = status === 'offline'

  // 미래·빈 값·날짜 아닌 값은 clampToToday가 다른 값을 돌려준다 → 무시(칸은 ymd로 돌아간다)
  function pickDate(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.value
    if (clampToToday(picked, today) === picked) onDate(picked)
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {/* PC 한 줄 / 768px 미만 두 줄(날짜 줄 · 상태 글과 [인쇄]) */}
      <div className="flex items-center justify-between gap-3 max-md:flex-col max-md:items-stretch">
        <div className="flex shrink-0 items-center gap-2">
          {/* 휴대폰은 한 줄에 날짜 칸까지 들어가도록 화살표만 보인다(이름은 aria-label) */}
          <button type="button" aria-label="전날" className={ds.button.secondary} onClick={() => onDate(previousDay(ymd))}>
            <Icon name="chev" className="rotate-90" />
            <span className="max-md:hidden">전날</span>
          </button>
          <div className="w-40 max-md:w-auto max-md:min-w-0 max-md:flex-1">
            <input type="date" aria-label="날짜 고르기" className={ds.input} max={today} value={ymd} onChange={pickDate} />
          </div>
          <button
            type="button"
            aria-label="다음 날"
            className={ds.button.secondary}
            disabled={next === null}
            onClick={() => {
              if (next !== null) onDate(next)
            }}
          >
            <span className="max-md:hidden">다음 날</span>
            <Icon name="chev" className="-rotate-90" />
          </button>
          {ymd !== today && (
            <button type="button" className={ds.button.secondary} onClick={() => onDate(today)}>
              오늘로
            </button>
          )}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-3 max-md:justify-between">
          <p
            role="status"
            className={offline ? 'flex min-w-0 items-center gap-1 text-small text-warning' : 'min-w-0 text-small text-ink-2'}
          >
            {offline && <Icon name="clock" className="shrink-0" />}
            {statusText(status, savedAt)}
          </p>
          <button type="button" className={`${ds.button.secondary} shrink-0`} onClick={onPrint}>
            인쇄
          </button>
        </div>
      </div>
      {status === 'failed' && <RetryCard code="E-WORKLOG-SAVE-FAILED" action="다시 저장" onClick={onRetrySave} />}
      {status === 'load-failed' && <RetryCard code="E-WORKLOG-LOAD-FAILED" action="다시 불러오기" onClick={onReload} />}
      {/* 전체 상태가 아니라 막힌 칸 목록으로 띄운다: 다른 날이 저장 중이거나 끊겨도 계속 보인다 */}
      {blockedYmd !== null && (
        <div className="flex flex-col gap-2">
          <ErrorCard code="E-WORKLOG-NOTE-PRIVATE" />
          {blockedYmd !== ymd && <p className="text-small text-ink-2">{`막힌 칸은 ${sheetDateText(blockedYmd)}에 있어요`}</p>}
        </div>
      )}
    </div>
  )
}
