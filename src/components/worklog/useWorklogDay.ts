'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AutosaveDay } from '@/lib/worklog/autosave'
import { BIT_FILL_KEYS, dropBitField } from '@/lib/worklog/bitFill'
import {
  emptyWorklogDay,
  MEMO_FONT_DEFAULT,
  type MemoFontPt,
  type WorklogCellKey,
  type WorklogDay,
  type WorklogNumberKey,
  type WorklogSavedDay,
} from '@/types/worklog'
import { worklogAutosave } from './worklogSession'

// 날짜별 화면 값과 읽기 상태 (specs/worklog/design.md 11-3절). 저장은 부르지 않는다: 받은 값을 화면에 두기만 하고 change는 화면이 부른다.
// 요청 번호 하나로 늦게 온 응답을 버린다(지금 보는 날의 마지막 읽기만 쓴다). load·focusKey는 바뀌지 않는 함수로 준다.
// 비트 칸 목록(bitFields, design.md 20-4절)도 날짜마다 든다. 읽은 목록은 자동 저장의 serverDay를 거쳐 돌려받은 것으로 그리고(저장 안 된 목록은 그대로),
// 모르면(읽기 전이고 자동 저장에도 없음) undefined다 — 모르는 목록을 빈 목록으로 저장해 표시를 지우지 않게.
// 업무사항 글씨 크기(memoFontPt, specs/worklog-memo-font design.md '화면 잇기')도 날짜마다 든다. 읽은 크기는 serverDay 다섯째 인자로 넘기고(줄 없음·크기 없음 → 11)
// 돌려받은 크기를 그린다. 날짜 칸을 새로 만드는 곳(slotOf·setCell·editBit)은 모두 크기를 이어 간다: 비트 채우기·칸 고치기가 크기를 떨어뜨리지 않게(AC-1508.5)

export type WorklogDayStatus = 'loading' | 'ready' | 'error'
type Slot = { status: WorklogDayStatus; day: WorklogDay; bitFields?: WorklogNumberKey[]; memoFontPt?: MemoFontPt }
type Slots = ReadonlyMap<string, Slot>
/** 비트 맞춤(mergeBit·takeBitValue)이 돌려준 하루와 목록. null이면 바꾸지 않는다 */
export type BitEdit = (day: WorklogDay, bitFields: readonly WorklogNumberKey[]) => { day: WorklogDay; bitFields: WorklogNumberKey[] } | null

// 줄이 없는 날은 비트 칸도 없고(빈 목록) 크기는 11이다. 칸 값·목록·크기는 따로 serverDay에 넘긴다(AC-016.1·AC-1508.4)
const fromServer = (autosave: ReturnType<typeof worklogAutosave>, ymd: string, saved: WorklogSavedDay | null, focus: WorklogCellKey | null) =>
  autosave.serverDay(
    ymd,
    saved === null ? null : saved.day,
    focus,
    saved === null ? [] : saved.bitFields,
    saved?.memoFontPt ?? MEMO_FONT_DEFAULT,
  )

// 모르는 목록·크기는 칸을 두지 않는다
function slotOf(status: WorklogDayStatus, shown: AutosaveDay): Slot {
  const slot: Slot = { status, day: shown.day }
  if (shown.bitFields !== undefined) slot.bitFields = shown.bitFields
  if (shown.memoFontPt !== undefined) slot.memoFontPt = shown.memoFontPt
  return slot
}

const isBitKey = (key: WorklogCellKey): key is WorklogNumberKey => (BIT_FILL_KEYS as readonly string[]).includes(key)

export function useWorklogDay(
  ymd: string,
  load: (ymd: string) => Promise<WorklogSavedDay | null>,
  focusKey: () => WorklogCellKey | null,
) {
  const autosave = worklogAutosave()
  const [slots, setSlots] = useState<Slots>(() => new Map())
  const latest = useRef(slots) // 그린 값이 아니라 최신 값에서 이어 간다(한 번에 칸 둘이 바뀌어도 앞 칸을 잃지 않게)
  const request = useRef(0)
  const cleared = useRef(false) // 로그아웃 뒤에는 어떤 읽기도 시작하지 않는다

  const update = useCallback((edit: (next: Map<string, Slot>) => void) => {
    const next = new Map(latest.current)
    edit(next)
    latest.current = next
    setSlots(next)
  }, [])

  const put = useCallback(
    (target: string, slot: Slot) => {
      update((next) => next.set(target, slot))
    },
    [update],
  )

  // 처음 읽기·[다시 불러오기]. 칸은 끝날 때까지 잠겨 있으므로 초점 칸을 건너뛰지 않는다.
  // 읽는 사이 그 날 저장이 오갔으면 응답이 옛 값일 수 있어 serverDay에 넘기지 않고 잠근 채 다시 읽는다:
  // 넘기면 방금 저장한 칸이 되돌아가고, 그냥 버리면 불러오는 중에 갇힌다(AC-010.16)
  const readFirst = useCallback(
    async (target: string) => {
      const mine = ++request.current
      const before = latest.current.get(target)
      const shown: AutosaveDay = before ?? autosave.pendingDay(target) ?? { day: emptyWorklogDay() }
      put(target, slotOf('loading', shown))
      for (;;) {
        const revision = autosave.revision(target)
        let server: WorklogSavedDay | null
        try {
          server = await load(target)
        } catch {
          if (mine === request.current) put(target, slotOf('error', shown))
          return
        }
        if (mine !== request.current) return
        if (autosave.revision(target) === revision) {
          put(target, slotOf('ready', fromServer(autosave, target, server, null)))
          return
        }
      }
    },
    [autosave, load, put],
  )

  // 다시 읽기. ready인 날만, 칸을 잠그지 않는다. 실패는 조용히 넘기고 다음 때 다시 한다(AC-010.14)
  const refresh = useCallback(() => {
    if (latest.current.get(ymd)?.status !== 'ready') return
    const mine = ++request.current
    const revision = autosave.revision(ymd)
    load(ymd).then(
      (server) => {
        if (mine !== request.current || autosave.revision(ymd) !== revision) return
        put(ymd, slotOf('ready', fromServer(autosave, ymd, server, focusKey())))
      },
      () => {},
    )
  }, [autosave, focusKey, load, put, ymd])

  const reload = useCallback(() => {
    if (!cleared.current) void readFirst(ymd)
  }, [readFirst, ymd])

  // autosave.dispose() 뒤에 부른다. 그래야 비운 칸에 저장 안 된 값이 다시 보이지 않는다
  const clear = useCallback(() => {
    cleared.current = true
    request.current += 1
    update((next) => next.clear())
  }, [update])

  // 사람이 고친 숫자 칸은 비트 칸이 아니다(dropBitField, AC-014.6). 목록을 모르면 목록 없이 돌려준다.
  // 크기는 날짜 칸에 그대로 두고 돌려주지 않는다(칸 고치기 저장에는 크기가 없다, AC-1508.5)
  const setCell = useCallback(
    (key: WorklogCellKey, value: string): AutosaveDay => {
      const slot: Slot = latest.current.get(ymd) ?? { status: 'loading', day: emptyWorklogDay() }
      const day = { ...slot.day, [key]: value }
      const bitFields = slot.bitFields && isBitKey(key) && slot.bitFields.includes(key) ? dropBitField(slot.bitFields, key) : slot.bitFields
      put(ymd, slotOf(slot.status, { day, bitFields, memoFontPt: slot.memoFontPt }))
      return bitFields === undefined ? { day } : { day, bitFields }
    },
    [put, ymd],
  )

  // 업무사항 글씨 크기는 그날 읽기가 끝난(ready) 날에만 바꾼다. 바꿨으면 참이다(저장은 화면이 부른다, AC-1508.2)
  const setMemoFont = useCallback(
    (pt: MemoFontPt): boolean => {
      const slot = latest.current.get(ymd)
      if (slot?.status !== 'ready') return false
      put(ymd, { ...slot, memoFontPt: pt })
      return true
    },
    [put, ymd],
  )

  // 비트 맞춤은 그날 읽기가 끝난(ready) 날에만, 목록을 아는 때만 최신 값에 적용한다(AC-017.8: 읽기 전 known은 빈 하루라 서버 값을 덮는다)
  const editBit = useCallback(
    (edit: BitEdit) => {
      const slot = latest.current.get(ymd)
      if (slot?.status !== 'ready' || slot.bitFields === undefined) return null
      const next = edit(slot.day, slot.bitFields)
      if (next === null) return null
      put(ymd, slotOf('ready', { day: next.day, bitFields: next.bitFields, memoFontPt: slot.memoFontPt }))
      return next
    },
    [put, ymd],
  )

  // 그 날을 보기 시작할 때. 이미 연 날은 화면 값을 두고 다시 읽고, 아니면 잠근 채 읽는다.
  // 떠나거나 내려가면 응답을 버린다: 내려간 뒤 온 응답이 모듈의 자동 저장 제어에 들어가면 로그아웃 뒤에도 값이 남는다.
  // 다 못 읽은 날은 지워 둔다: 돌아오면 오류 카드 없이 잠근 채 처음부터 읽는다
  useEffect(() => {
    if (cleared.current) return
    if (latest.current.get(ymd)?.status === 'ready') refresh()
    else void readFirst(ymd)
    return () => {
      request.current += 1
      if (latest.current.get(ymd)?.status !== 'ready') update((next) => next.delete(ymd))
    }
  }, [readFirst, refresh, update, ymd])

  // 효과가 아직 돌지 않은 첫 그림. 다른 날의 값이 새 날짜 밑에 잠깐이라도 보이면 안 된다
  const slot = slots.get(ymd) ?? slotOf('loading', autosave.pendingDay(ymd) ?? { day: emptyWorklogDay() })

  return {
    status: slot.status,
    day: slot.day,
    bitFields: slot.bitFields,
    memoFontPt: slot.memoFontPt ?? MEMO_FONT_DEFAULT,
    setCell,
    setMemoFont,
    editBit,
    refresh,
    reload,
    clear,
  }
}
