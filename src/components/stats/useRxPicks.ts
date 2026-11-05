'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { validateRxPick } from '@/lib/payload/validate'
import { addRxPick, clearRxPicks, readRxPicks, removeRxPick } from '@/lib/storage/rxPicks'
import type { RxPick } from '@/types/rxPicks'
import { codeKey } from './view'

// 고른 처방 읽기·저장 (rx-picker REQ-812, design.md '훅'). 화면이 먼저 바뀌고 서버에는 누른 차례대로 하나씩 간다.
// 요청 줄은 React 상태 밖(ref)에 있어 칸이 내려가도 끝까지 간다. 내려간 뒤에는 상태를 고치지 않고, 실패하면 남은 줄을 버린다(AC-812.8).
// 줄을 찾는 것은 언제나 codeKey이고 서버에서 지우는 것은 언제나 저장된 글자다(AC-812.7)

export type RxPicksView = {
  picks: readonly RxPick[]
  state: 'reading' | 'ready' | 'read-failed'
  saveFailed: boolean
  toggle(line: RxPick): void
  remove(code: string): void
  clear(): void
  reread(): void
  retrySave(): void
}

// add의 pick은 toggle에서 validateRxPick이 돌려준 값뿐이다. 검사에 걸린 줄이 들어오면 addRxPick이 늘 실패해 [다시 저장]으로도 풀리지 않기 때문이다
type Step = { kind: 'add'; pick: RxPick } | { kind: 'remove'; key: string; shownCode: string } | { kind: 'clear' }

export function useRxPicks(): RxPicksView {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<RxPicksView['state']>('reading')
  const [picks, setPicks] = useState<readonly RxPick[]>([])
  const [saveFailed, setSaveFailed] = useState(false)

  const mounted = useRef(false)
  const canAct = useRef(false) // 읽기가 끝나야 고를 수 있다. 읽는 중에 고르면 읽은 답이 덮는다
  const shown = useRef<readonly RxPick[]>([]) // 화면 값. 한 틱에 두 번 눌러도 뒤의 누름이 앞의 누름을 본다
  const storedCode = useRef(new Map<string, string>()) // 대문자 코드 → 서버에 저장된 글자
  const steps = useRef<Step[]>([])
  const sending = useRef(false)

  const show = useCallback((next: readonly RxPick[]) => {
    shown.current = next
    if (mounted.current) setPicks(next)
  }, [])

  // 저장된 글자를 기억하고 화면에 그 줄이 있으면 맞춘다. 그새 뺀 줄을 되살리지 않는다
  const remember = useCallback(
    (key: string, line: RxPick) => {
      storedCode.current.set(key, line.code)
      const same = (pick: RxPick) => codeKey(pick.code) === key
      const on = shown.current.find(same)
      if (on === undefined || (on.code === line.code && on.name === line.name)) return
      show(shown.current.map((pick) => (same(pick) ? line : pick)))
    },
    [show],
  )

  const send = useCallback(
    async (step: Step) => {
      if (step.kind === 'clear') {
        await clearRxPicks()
        storedCode.current.clear()
        return
      }
      if (step.kind === 'remove') {
        // 앞 고르기의 되읽기가 끝난 지금 글자를 정한다(AC-812.7)
        await removeRxPick(storedCode.current.get(step.key) ?? step.shownCode)
        storedCode.current.delete(step.key)
        return
      }
      const key = codeKey(step.pick.code)
      if ((await addRxPick(step.pick)) === 'added') {
        remember(key, step.pick)
        return
      }
      // 되읽기도 이 요청 칸 안이다. 실패하면 이 칸에서 멈추고 고르기부터 다시 간다(두 번 보내도 결과가 같다).
      // 되읽기에 줄이 없으면(그새 다른 기기가 지움) 보낸 글자로 둔다. 실패로 치면 같은 일이 되풀이될 때 줄이 풀리지 않는다
      const rows = await readRxPicks()
      remember(key, rows.find((row) => codeKey(row.code) === key) ?? step.pick)
    },
    [remember],
  )

  const pump = useCallback(async () => {
    if (sending.current) return
    sending.current = true
    try {
      while (steps.current.length > 0) {
        await send(steps.current[0]) // 실패한 요청은 줄 맨 앞에 남는다
        steps.current.shift()
      }
      if (mounted.current) setSaveFailed(false)
    } catch {
      if (mounted.current) setSaveFailed(true)
      else steps.current = []
    } finally {
      sending.current = false
    }
  }, [send])

  const enqueue = useCallback(
    (step: Step) => {
      steps.current.push(step)
      void pump()
    },
    [pump],
  )

  const takeOut = useCallback(
    (key: string) => {
      const found = shown.current.find((pick) => codeKey(pick.code) === key)
      if (found === undefined) return
      show(shown.current.filter((pick) => pick !== found))
      enqueue({ kind: 'remove', key, shownCode: found.code })
    },
    [enqueue, show],
  )

  const toggle = useCallback(
    (line: RxPick) => {
      if (!canAct.current) return
      const key = codeKey(line.code)
      if (shown.current.some((pick) => codeKey(pick.code) === key)) {
        takeOut(key)
        return
      }
      const pick = validateRxPick({ code: line.code, name: line.name })
      if (pick === null) return
      show([...shown.current, pick])
      enqueue({ kind: 'add', pick })
    },
    [enqueue, show, takeOut],
  )

  const remove = useCallback(
    (code: string) => {
      if (canAct.current) takeOut(codeKey(code))
    },
    [takeOut],
  )

  const clear = useCallback(() => {
    if (!canAct.current || shown.current.length === 0) return
    show([])
    enqueue({ kind: 'clear' })
  }, [enqueue, show])

  const retrySave = useCallback(() => {
    void pump()
  }, [pump])

  const reread = useCallback(() => {
    if (state !== 'read-failed') return
    setState('reading')
    setAttempt((n) => n + 1)
  }, [state])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    let current = true
    readRxPicks().then(
      (rows) => {
        if (!current) return
        storedCode.current = new Map(rows.map((row) => [codeKey(row.code), row.code]))
        shown.current = rows
        canAct.current = true
        setPicks(rows)
        setState('ready')
      },
      () => {
        if (current) setState('read-failed')
      },
    )
    return () => {
      current = false
    }
  }, [attempt])

  return { picks, state, saveFailed, toggle, remove, clear, reread, retrySave }
}
