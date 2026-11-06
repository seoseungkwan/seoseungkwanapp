'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FocusEvent } from 'react'
import { todayInKorea } from '@/lib/analytics/dates'
import { loadWorklogDay } from '@/lib/storage/worklogDays'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { SaveState } from '@/lib/worklog/autosave'
import { mergeBit, takeBitValue, type BitMerge, type BitValues } from '@/lib/worklog/bitFill'
import { hasCount, withFloatSnapshot } from '@/lib/worklog/cashFloat'
import { dayAfterRollover } from '@/lib/worklog/days'
import { stepMemoFont } from '@/lib/worklog/memoFont'
import { blockedCellKeys } from '@/lib/worklog/notes'
import type { WorklogCash, WorklogCellKey, WorklogDay, WorklogNumberKey } from '@/types/worklog'
import { BitNotice, BitSheetNotes } from './BitNotice'
import { CashFloatBox, type CashGuessMode } from './CashFloatBox'
import { useBitFill, type BitFillStatus } from './useBitFill'
import { useCashFloatSetting } from './useCashFloatSetting'
import { useWorklogDay, type WorklogDayStatus } from './useWorklogDay'
import { WorklogSheet } from './WorklogSheet'
import { statusText, WorklogToolbar, type ToolbarStatus } from './WorklogToolbar'
import { onWorklogSignedOut, startWorklogSession, worklogAutosave } from './worklogSession'

// 업무일지 화면 (specs/worklog REQ-010, design.md 11-3절). 날짜 줄과 양식을 잇고 읽기·자동 저장·다시 읽기·자정 넘김·로그아웃을 맞춘다.
// 자동 저장 제어는 화면 밖 모듈에 한 벌이다: 내려갈 때 flush만 하고 비우지 않는다(앱 안 이동 = 바로 저장).
// 친 값은 React 상태와 그 제어에만 있고 브라우저 저장소·console로 가지 않는다.
// 비트 PC가 연결된 의원 PC에서는 그날 비트 숫자(useBitFill)를 맞춰 넣는다(REQ-017, design.md 20절): 그날 읽기가 끝난(ready) 날에만, 그날 답일 때만
// mergeBit을 돌려 빈 칸을 채우고, 바뀌었으면 화면 값·비트 칸 목록을 바꿔 자동 저장으로 넘긴다(서버로는 바뀐 칸과 바뀐 목록만 간다).
// 저장에 넘기는 목록은 읽은 목록·mergeBit·takeBitValue·dropBitField가 돌려준 것뿐이다. 손으로 적은 칸은 덮지 않고 '다름'으로만 알린다.
// 업무사항 글씨 크기(specs/worklog-memo-font REQ-1508): 날짜 줄 아래 [가−]·[가+]를 누를 때만 그날 크기를 바꿔 changeMemoFont로 넘긴다(읽기가 끝난 날, PC만).
// 비트 채우기·칸 고치기는 크기를 넘기지 않는다. 잘림 안내는 양식이 잰 값(onMemoOverflow)으로 툴바가 그린다(터치 기기는 묶음·안내 없음)
// 현금 시재(specs/worklog-cash-float REQ-1609, design.md '화면 잇기'): 양식·비트 설명 줄 아래 상자(인쇄 숨김). 장수·확인란·이유·[이 날만 고치기]는 그날 읽기가 끝난 PC에서만
// 화면 시재를 바꿔 changeCash로 넘긴다(바뀐 시재 칸만 간다). 안 센 날 첫 장수에는 병원 설정 금액을 그날 시재로 붙이고, 설정을 모르면 세지 않는다.
// 다른 저장(칸·비트·글씨 크기)은 시재를 넘기지 않는다. 추측은 비트 '다름' 목록과 같은 때(그날 답·읽을 수 있는 상태·그날 읽기가 끝남)만 이 PC의 비트 현금으로 한다

const TOUCH_QUERY = '(hover: none) and (pointer: coarse)' // 보기만은 터치 기기로 정한다. 폭으로 정하면 반쪽 창·확대한 의원 PC가 막힌다
const TODAY_CHECK_MS = 30_000
const REFRESH_MS = 60_000
// 비트를 읽을 수 있는 화면의 상태(연결됨·터치 기기 아님). 이때만 '다름' 목록을 보인다
const BIT_READABLE: readonly BitFillStatus[] = ['reading', 'ready', 'unconfirmed', 'failed']
const BIT_ANSWERED: readonly BitFillStatus[] = ['ready', 'unconfirmed']

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

// 저장·불러오기 실패 > 끊김 > 저장 중 > 불러오는 중 > 막힌 칸 > 저장됨 > 아직 안 적음(터치 기기는 보기만, AC-010.17)
function toolbarStatus(save: SaveState, load: WorklogDayStatus, viewOnly: boolean): ToolbarStatus {
  if (save === 'failed') return 'failed'
  if (load === 'error') return 'load-failed'
  if (save === 'offline') return 'offline'
  if (save === 'saving') return 'saving'
  if (load === 'loading') return 'loading'
  if (save === 'blocked') return 'blocked'
  if (save === 'saved') return 'saved'
  return viewOnly ? 'view-only' : 'empty'
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
  const { status, day, bitFields, memoFontPt, cash, setCell, setMemoFont, setCash, editBit, refresh, reload, clear } = useWorklogDay(
    ymd,
    loadDay,
    focusKey,
  )
  const readOnly = viewOnly || status !== 'ready'
  const setting = useCashFloatSetting(!viewOnly) // 병원 시재 금액. 터치 기기는 읽지 않는다(그날 시재만 쓴다)
  const [memoOverflow, setMemoOverflow] = useState(false) // 업무사항 글이 칸을 넘는지(양식이 잰다)
  const bit = useBitFill({ ymd, today, readOnly: viewOnly })
  const bitHere = bit.ymd === ymd // 이 답이 고른 날의 것(날짜를 막 옮겼으면 아니다)
  const answered = bitHere && BIT_ANSWERED.includes(bit.status)
  const merged = useRef<BitValues | null>(null) // 마지막으로 합친 답. 같은 답을 두 번 합치지 않는다(사람이 비운 비트 칸은 다음 읽기에서 채운다)

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
    const next = setCell(key, value)
    autosave.change(ymd, next.day, next.bitFields)
  }

  // 화면 크기를 바로 바꾸고 자동 저장으로 넘긴다. 끝 크기·읽기가 끝나지 않은 날은 아무 일도 없다(AC-1508.2)
  function onMemoFont(step: -1 | 1) {
    if (readOnly) return
    const next = stepMemoFont(memoFontPt, step)
    if (next === memoFontPt || !setMemoFont(next)) return
    autosave.changeMemoFont(ymd, next)
  }

  // 화면 시재를 바로 바꾸고 자동 저장으로 넘긴다(읽기가 끝난 날, PC만). 안 센 날 첫 장수에는 설정 금액을 그날 시재로 붙여 같은 저장에 보낸다.
  // 설정을 모르는데 장수가 생기면(상자가 잠그지만) 시재 없이 센 날을 만들지 않는다(AC-1609.2)
  function onCash(next: WorklogCash) {
    if (readOnly) return
    const snap = setting.status === 'ready' ? withFloatSnapshot(next, setting.won) : next
    if (snap.floatWon === null && hasCount(snap)) return
    if (setCash(snap)) autosave.changeCash(ymd, snap)
  }

  // 맞춤을 그날 최신 값·목록에 돌려 바뀌었을 때만 화면 값·목록을 바꾸고 자동 저장으로 넘긴다(읽기가 끝난 날만, editBit이 막는다).
  // 돌려받은 하루·목록을 통째로 쓴다: takeBitValue는 다른 빈 칸도 다시 채울 수 있다
  const applyBit = useCallback(
    (fit: (day: WorklogDay, fields: readonly WorklogNumberKey[]) => BitMerge) => {
      const next = editBit((current, fields) => {
        const result = fit(current, fields)
        return result.changed ? result : null
      })
      if (next) autosave.change(ymd, next.day, next.bitFields)
    },
    [autosave, editBit, ymd],
  )

  // [비트 숫자로 바꾸기]: 사람이 누를 때만 적은 값을 덮는다(AC-017.3)
  function onTakeBit(key: WorklogNumberKey) {
    if (readOnly || !bitHere) return
    applyBit((current, fields) => takeBitValue(current, fields, key, bit.values))
  }

  // 비트 답 합치기(AC-017.1·AC-017.8): 답이 첫 읽기보다 먼저 오면 들고 있다가 ready 뒤에 합치고, 불러오기 실패한 날(error)은 합치지 않는다.
  // 초점 칸도 치기 전이면 새 값으로 보이고(REQ-008), 친 칸은 손으로 적은 칸이라 mergeBit이 바꾸지 않는다
  useEffect(() => {
    if (status !== 'ready' || !answered || merged.current === bit.values) return
    const values = bit.values
    merged.current = values
    applyBit((current, fields) => mergeBit(current, fields, values))
  }, [answered, applyBit, bit.values, status])

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

  // '다름' 목록은 그린 값으로 그때그때 맞춰 본다(사람이 고치면 바로 바뀐다). 읽기가 끝난 날, 비트를 읽을 수 있는 화면에서 그날 답이 있을 때만
  const differs =
    status === 'ready' && bitHere && bitFields !== undefined && BIT_READABLE.includes(bit.status) ? mergeBit(day, bitFields, bit.values).differs : []

  // 시재 추측(AC-1606.4): 비트를 읽을 수 있고 그날 읽기가 한 번이라도 끝났으면 이 PC의 비트 현금(확인 필요 날은 없음), 연결 안 됨·준비 전이면 다른 PC 줄
  const guess: CashGuessMode = viewOnly
    ? { kind: 'none' }
    : bitHere && BIT_READABLE.includes(bit.status) && bit.lastReadAt !== null
      ? { kind: 'bit', bitCashIn: bit.values.cashIn }
      : bit.status === 'not-connected' || bit.status === 'setup-needed'
        ? { kind: 'other-pc' }
        : { kind: 'none' }
  const toolbar = toolbarStatus(snapshot.state, status, viewOnly)

  return (
    <div className="mx-auto flex w-full max-w-184.25 flex-col gap-3">
      <WorklogToolbar
        ymd={ymd}
        today={today}
        status={toolbar}
        savedAt={snapshot.savedAt}
        blockedYmd={snapshot.blocked?.ymd ?? null}
        onDate={moveTo}
        onRetrySave={() => autosave.retry()}
        onReload={reload}
        onPrint={onPrint}
        memoFont={viewOnly ? null : { pt: memoFontPt, disabled: readOnly, overflow: memoOverflow, onStep: onMemoFont }}
      />
      <BitNotice status={bit.status} lastReadAt={bitHere ? bit.lastReadAt : null} onReload={bit.reload} />
      <div ref={sheetArea} onBlur={onSheetBlur}>
        <WorklogSheet
          ymd={ymd}
          day={day}
          readOnly={readOnly}
          blockedCells={blockedCellKeys(day)}
          bitFields={bitFields}
          memoFontPt={memoFontPt}
          onMemoOverflow={setMemoOverflow}
          onCell={onCell}
          onFocusCell={(key) => {
            focusCell.current = key
          }}
        />
      </div>
      <BitSheetNotes day={day} bitFields={bitFields ?? []} differs={differs} onTake={onTakeBit} />
      {/* 날짜마다 새로 그린다: 저장하지 않은 [이 날만 고치기] 칸이 다른 날로 넘어가지 않게(AC-1605.8) */}
      <CashFloatBox
        key={ymd}
        mode={viewOnly ? 'view' : readOnly ? 'locked' : 'edit'}
        day={day}
        cash={cash}
        floatWon={cash.floatWon ?? setting.won}
        floatSetting={setting.status}
        guess={guess}
        saveText={statusText(toolbar, snapshot.savedAt)}
        onCash={onCash}
        onTakeBitCash={() => onTakeBit('cashIn')}
        onReloadFloat={setting.reload}
      />
    </div>
  )
}
