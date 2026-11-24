'use client'

import type { ChangeEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { clampToToday, nextDay, previousDay, savedTimeText, sheetDateText } from '@/lib/worklog/days'
import { canStepMemoFont } from '@/lib/worklog/memoFont'
import type { ErrorCode } from '@/types/errors'
import type { MemoFontPt } from '@/types/worklog'

// 업무일지 날짜 줄·저장 상태·오류 카드 (specs/worklog REQ-009, design.md 11-2절). 받은 상태를 그리기만 한다.
// 양식 밖이라 앱 규칙(ds·토큰·Pretendard)이다. 자동 저장만 있어서 [저장] 단추가 없다. 폭은 감싸는 화면이 정한다.
// 날짜 줄 바로 아래 줄 오른쪽 끝에 업무사항 글씨 [가−] 숫자 [가+], 그 아래 잘림 안내 한 줄 (specs/worklog-memo-font REQ-1506·REQ-1507, design.md '날짜 줄').
// 자리는 시안(docs/mockups/worklog/memo-font.html)과 다르다: 날짜 줄에 [오늘로]·[인쇄]가 있어 한 줄에 다 들어가지 않는다(design.md '시안과 다른 곳')

// 'viewing' = 관리자가 다른 의원을 보는 중(admin-view AC-8009.1): 휴대폰 보기만 글이 맞지 않아 글을 비운다(새 글 없음)
export type ToolbarStatus = 'loading' | 'empty' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked' | 'load-failed' | 'view-only' | 'viewing'

/** 업무사항 글씨 크기 단추. disabled = 불러오는 중·불러오기 실패, overflow = 업무사항 글이 칸을 넘음(양식이 잰다) */
export type MemoFontControl = { pt: MemoFontPt; disabled: boolean; overflow: boolean; onStep(step: -1 | 1): void }

const CUT_TEXT = '업무사항 글이 칸보다 길어서 인쇄하면 아랫부분이 잘려요. 글씨를 줄이면 다 들어갈 수 있어요.'
// 보조 단추 정사각형(PC 36px, 768px 미만 44px). ds의 px-4·font-medium보다 이겨야 하므로 좌우 여백 0과 굵기(시안 600)는 !로 준다
const FONT_STEP_BUTTON = `${ds.button.secondary} w-9 px-0! font-semibold! max-md:w-11`

export function statusText(status: ToolbarStatus, savedAt: Date | null): string {
  const time = savedAt ? savedTimeText(savedAt) : null
  switch (status) {
    case 'loading':
      return '불러오는 중이에요'
    case 'empty':
      return '적으면 바로 저장돼요'
    case 'view-only':
      return '휴대폰에서는 보기만 할 수 있어요'
    case 'saving':
      return '저장하는 중이에요'
    case 'saved':
      return time ? `저장했어요 · ${time}` : '저장했어요'
    case 'blocked':
      return time ? `빨간 칸 빼고 저장했어요 · ${time}` : '빨간 칸은 저장하지 않았어요'
    case 'offline':
      return '인터넷이 끊겼어요. 다시 연결되면 저장해요'
    // 실패는 오류 카드가 말한다. 보는 중은 말할 저장 상태가 없다. 자리(role="status")는 남겨 다음 글을 읽어 주게 한다
    case 'failed':
    case 'load-failed':
    case 'viewing':
      return ''
  }
}

// 글씨 묶음: "업무사항 글씨" [가−] 숫자 [가+]. 끝 크기(8·16)에서는 그쪽 단추가, disabled면 둘 다 눌리지 않는다
function MemoFontStepper({ pt, disabled, onStep }: MemoFontControl) {
  // 보이는 글자는 "가" + 작은 −·+, 이름은 aria-label
  const stepButton = (step: -1 | 1, label: string, sign: string) => (
    <button
      type="button"
      aria-label={label}
      className={FONT_STEP_BUTTON}
      disabled={disabled || !canStepMemoFont(pt, step)}
      onClick={() => onStep(step)}
    >
      가<span className="text-caption">{sign}</span>
    </button>
  )
  return (
    <div role="group" aria-label="업무사항 글씨 크기" className="flex items-center gap-1.5">
      <span className="text-small whitespace-nowrap text-ink-2">업무사항 글씨</span>
      {stepButton(-1, '업무사항 글씨 작게', '−')}
      <output
        aria-live="polite"
        className="grid h-9 min-w-9 place-items-center rounded-control border border-line-strong bg-surface px-1 text-body font-semibold text-ink tabular-nums max-md:h-11 max-md:min-w-11"
      >
        {pt}
      </output>
      {stepButton(1, '업무사항 글씨 크게', '+')}
    </div>
  )
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
  memoFont,
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
  memoFont?: MemoFontControl | null // 없음 = 터치 기기(글씨 묶음·잘림 안내 없음)
}) {
  const next = nextDay(ymd, today)
  const offline = status === 'offline'

  // 미래·빈 값·날짜 아닌 값은 clampToToday가 다른 값을 돌려준다 → 무시(칸은 ymd로 돌아간다)
  function pickDate(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.value
    if (clampToToday(picked, today) === picked) onDate(picked)
  }

  return (
    <div className="flex w-full flex-col gap-3 print:hidden">
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
      {memoFont && (
        <div className="flex justify-end">
          <MemoFontStepper {...memoFont} />
        </div>
      )}
      {/* 잘림 안내: 오류 카드가 아니라 안내 한 줄이다(비트 안내 줄과 같은 모양). 불러오는 중·불러오기 실패인 날에는 없다 */}
      {memoFont?.overflow && !memoFont.disabled && (
        <p className="flex min-w-0 items-start gap-1.5 text-small text-ink-2">
          <Icon name="alert" className="mt-0.5 shrink-0 text-negative" />
          <span>{CUT_TEXT}</span>
        </p>
      )}
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
