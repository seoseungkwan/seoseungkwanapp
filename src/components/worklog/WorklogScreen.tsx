'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { loadWorklogDay } from '@/lib/storage/worklogDays'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { SaveState } from '@/lib/worklog/autosave'
import { dayAfterRollover } from '@/lib/worklog/days'
import { blockedCellKeys } from '@/lib/worklog/notes'
import type { WorklogCellKey } from '@/types/worklog'
import { useWorklogDay, type WorklogDayStatus } from './useWorklogDay'
import { WorklogSheet } from './WorklogSheet'
import { WorklogToolbar, type ToolbarStatus } from './WorklogToolbar'
import { onWorklogSignedOut, startWorklogSession, worklogAutosave } from './worklogSession'

// 업무일지 화면 (specs/worklog REQ-010, design.md 11-3절). 날짜 줄과 양식을 잇고 읽기·자동 저장·다시 읽기·자정 넘김·로그아웃을 맞춘다.
// 자동 저장 제어는 화면 밖 모듈에 한 벌이다: 내려갈 때 flush만 하고 비우지 않는다(앱 안 이동 = 바로 저장).
// 친 값은 React 상태와 그 제어에만 있고 브라우저 저장소·console로 가지 않는다

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)' // 보기만은 터치 기기로 정한다. 폭으로 정하면 반쪽 창·확대한 의원 PC가 막힌다
const TODAY_CHECK_MS = 30_000
const REFRESH_MS = 60_000

// async로 감싼다: 클라이언트를 만들다 바로 던져도 읽기 실패로 다루려고(다시 읽기는 조용히 넘긴다)
async function loadDay(ymd: string) {
  return loadWorklogDay(supabaseBrowser(), ymd)
}

function subscribeTouch(listener: () => void) {
  const query = window.matchMedia(TOUCH_QUERY)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
const isTouchDevice = () => window.matchMedia(TOUCH_QUERY).matches
const notTouchOnServer = () => false

// 저장·불러오기 실패 > 끊김 > 저장 중 > 불러오는 중 > 막힌 칸 > 저장됨 > 아직 안 적음
function toolbarStatus(save: SaveState, load: WorklogDayStatus): ToolbarStatus {
  if (save === 'failed') return 'failed'
  if (load === 'error') return 'load-failed'
  if (save === 'offline') return 'offline'
  if (save === 'saving') return 'saving'
  if (load === 'loading') return 'loading'
  if (save === 'blocked') return 'blocked'
  if (save === 'saved') return 'saved'
  return 'empty'
}

export function WorklogScreen({ initialToday }: { initialToday: string }) {
  const autosave = worklogAutosave()
  const [today, setToday] = useState(initialToday)
  const [ymd, setYmd] = useState(initialToday)
  const [snapshot, setSnapshot] = useState(() => autosave.snapshot())
  const viewOnly = useSyncExternalStore(subscribeTouch, isTouchDevice, notTouchOnServer)
  const sheetArea = useRef<HTMLDivElement>(null)
  const focusCell = useRef<WorklogCellKey | null>(null)
  const rolloverFrom = useRef<string | null>(null) // 초점이 나가기를 기다리는 자정 넘김의 옛 오늘
  const focusKey = useCallback(() => focusCell.current, [])
  const { status, day, setCell, refresh, reload, clear } = useWorklogDay(ymd, loadDay, focusKey)
  const readOnly = viewOnly || status !== 'ready'

  const sheetHasFocus = useCallback(() => sheetArea.current?.contains(document.activeElement) === true, [])

  // 초점 칸은 친 글자를 들고 있어, 값을 바꾸기 전에 내보내야 그 글자가 다음 날로 넘어가거나 화면에 남지 않는다.
  // blur가 친 글자와 초점 표시(focusCell)를 함께 지우고 저장은 부르지 않는다(시안 moveTo)
  const leaveSheet = useCallback(() => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && sheetHasFocus()) focused.blur()
  }, [sheetHasFocus])

  const moveTo = useCallback(
    (next: string) => {
      leaveSheet()
      autosave.flush()
      setYmd(next)
    },
    [autosave, leaveSheet],
  )

  // 날짜를 옮겼으면 참이다(옮기면 그 날을 읽으므로 다시 읽기가 필요 없다). 입력 중이면 치던 칸을 빼앗지 않고 초점이 나간 뒤로 미룬다
  const checkToday = useCallback((): boolean => {
    const now = todayInKorea()
    if (now === today) return false
    setToday(now)
    if (sheetHasFocus()) {
      rolloverFrom.current ??= today
      return false
    }
    const next = dayAfterRollover(ymd, rolloverFrom.current ?? today, now)
    rolloverFrom.current = null
    if (next === ymd) return false
    moveTo(next)
    return true
  }, [moveTo, sheetHasFocus, today, ymd])

  function onSheetBlur(event: FocusEvent<HTMLDivElement>) {
    const from = rolloverFrom.current
    if (from === null || event.currentTarget.contains(event.relatedTarget as Node | null)) return
    rolloverFrom.current = null
    const next = dayAfterRollover(ymd, from, today)
    if (next !== ymd) moveTo(next)
  }

  function onCell(key: WorklogCellKey, value: string) {
    if (readOnly) return
    autosave.change(ymd, setCell(key, value))
  }

  function onPrint() {
    autosave.flush()
    window.print()
  }

  // dispose하지 않는다: 내려간 뒤에도 저장·다시 하기가 이어지고, 돌아오면 저장 안 된 값이 그대로 보인다(AC-010.11)
  useEffect(() => {
    startWorklogSession()
    setSnapshot(autosave.snapshot())
    const unsubscribe = autosave.subscribe(setSnapshot)
    return () => {
      unsubscribe()
      autosave.flush()
    }
  }, [autosave])

  useEffect(
    () =>
      onWorklogSignedOut(() => {
        rolloverFrom.current = null
        leaveSheet()
        clear()
      }),
    [clear, leaveSheet],
  )

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') autosave.flush()
      else if (!checkToday()) refresh()
    }
    const todayTimer = setInterval(checkToday, TODAY_CHECK_MS)
    const refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(todayTimer)
      clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [autosave, checkToday, refresh])

  return (
    <div className="mx-auto flex w-full max-w-184.25 flex-col gap-3">
      <WorklogToolbar
        ymd={ymd}
        today={today}
        status={toolbarStatus(snapshot.state, status)}
        savedAt={snapshot.savedAt}
        blockedYmd={snapshot.blocked?.ymd ?? null}
        onDate={moveTo}
        onRetrySave={() => autosave.retry()}
        onReload={reload}
        onPrint={onPrint}
      />
      <div ref={sheetArea} onBlur={onSheetBlur}>
        <WorklogSheet
          ymd={ymd}
          day={day}
          readOnly={readOnly}
          blockedCells={blockedCellKeys(day)}
          onCell={onCell}
          onFocusCell={(key) => {
            focusCell.current = key
          }}
        />
      </div>
    </div>
  )
}
