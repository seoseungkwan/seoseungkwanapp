'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { emptyWorklogDay, type WorklogCellKey, type WorklogDay, type WorklogSavedDay } from '@/types/worklog'
import { worklogAutosave } from './worklogSession'

// 날짜별 화면 값과 읽기 상태 (specs/worklog/design.md 11-3절). 저장은 부르지 않는다: 받은 값을 화면에 두기만 하고 change는 화면이 부른다.
// 요청 번호 하나로 늦게 온 응답을 버린다(지금 보는 날의 마지막 읽기만 쓴다). load·focusKey는 바뀌지 않는 함수로 준다

export type WorklogDayStatus = 'loading' | 'ready' | 'error'
type Slot = { status: WorklogDayStatus; day: WorklogDay }
type Slots = ReadonlyMap<string, Slot>

// 읽기는 { day, bitFields }를 준다(AC-016.1). 비트 칸 목록은 비트 표시(TASK-17) 전까지 쓰지 않고 칸 값만 넘긴다
const dayOf = (saved: WorklogSavedDay | null): WorklogDay | null => (saved === null ? null : saved.day)

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
      const shown = latest.current.get(target)?.day ?? autosave.pendingDay(target) ?? emptyWorklogDay()
      put(target, { status: 'loading', day: shown })
      for (;;) {
        const revision = autosave.revision(target)
        let server: WorklogSavedDay | null
        try {
          server = await load(target)
        } catch {
          if (mine === request.current) put(target, { status: 'error', day: shown })
          return
        }
        if (mine !== request.current) return
        if (autosave.revision(target) === revision) {
          put(target, { status: 'ready', day: autosave.serverDay(target, dayOf(server), null) })
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
        put(ymd, { status: 'ready', day: autosave.serverDay(ymd, dayOf(server), focusKey()) })
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

  const setCell = useCallback(
    (key: WorklogCellKey, value: string): WorklogDay => {
      const slot = latest.current.get(ymd) ?? { status: 'loading' as const, day: emptyWorklogDay() }
      const day = { ...slot.day, [key]: value }
      put(ymd, { ...slot, day })
      return day
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
  const slot = slots.get(ymd) ?? { status: 'loading' as const, day: autosave.pendingDay(ymd) ?? emptyWorklogDay() }

  return { status: slot.status, day: slot.day, setCell, refresh, reload, clear }
}
