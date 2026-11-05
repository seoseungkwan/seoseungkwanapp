'use client'

import { useMemo, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { rxCatalog, rxPeriodCounts, rxPickTotal } from '@/components/stats/rxPickView'
import { isSavableLine, useRxCatalog } from '@/components/stats/useRxCatalog'
import { useRxPicks } from '@/components/stats/useRxPicks'
import { codeKey, rxPickRows, type RxLine, type RxPickRow, type StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import type { ErrorCode } from '@/types/errors'
import { EmptyNote, hasRows, NO_RANGE_DATA, Section, todayOf } from './parts'
import { RxPickDetail, type RxPickMode } from './RxPickDetail'
import { RxPickSearch } from './RxPickSearch'
import { RxPickTable } from './RxPickTable'

// 처방 골라 보기 칸 (rx-picker REQ-801·803·806·812, 시안 docs/mockups/rx-picker). 찾기·표·그래프와 두 훅을 잇고, 그래프 열림·모양을 든다.
// 고른 처방·그래프 열림은 React 상태와 서버 표에만 있다(AC-812.6). 기간별 key를 주지 않는다: 기간을 바꿔도 열린 줄과 모양이 그대로여야 한다(AC-806.5).
// 훅과 상태는 빈 상태보다 위에 둔다: 기간을 읽지 못하면 saved가 잠깐 false가 되는데, 그때도 열린 줄과 모양을 잊지 않으려고

const TITLE = '처방 골라 보기'
const DESC = '고른 처방만 건수와 신환율·재진율을 봐요'
const EMPTY = '불러오면 처방을 골라 볼 수 있어요.'
const READING = '고른 처방을 읽는 중이에요'
const SAVE_KEPT = '고른 처방은 이 화면에 그대로 있어요.'

// 오류 카드 + 카드 밖 단추. 모양은 통계 화면의 같은 묶음과 같다(그 파일은 이 칸을 그리는 쪽이라 불러오지 않는다)
function ErrorWithAction({ code, action, onAction, note }: { code: ErrorCode; action: string; onAction: () => void; note?: string }) {
  return (
    <div className="mt-4">
      <ErrorCard code={code} />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={onAction} className={`${ds.button.secondarySmall} max-md:w-full`}>
          {action}
        </button>
        {note && <span className="text-small text-ink-2">{note}</span>}
      </div>
    </div>
  )
}

export function RxPickerSection({ input, saved, hospitalName, revision, className }: { input: StatsInput; saved: boolean; hospitalName: string; revision: number; className?: string }) {
  const { picks, state, saveFailed, toggle, remove, clear, reread, retrySave } = useRxPicks()
  const catalog = useRxCatalog(todayOf(input.range), revision)
  // 그래프 열림·모양. 열쇠는 대문자 코드다: 표는 저장된 글자, 목록은 날 줄의 글자를 준다
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set())
  const [modes, setModes] = useState<ReadonlyMap<string, RxPickMode>>(new Map())

  // 일 줄 셈과 고른 처방을 나눈다. 넓은 범위는 최대 731일이라, 고를 때마다 모든 줄을 다시 검사하지 않게 한다.
  // 같은 날은 뒤의 것이 이겨서 화면의 날 숫자를 뒤에 둔다(방금 만든 숫자가 표와 같은 이름을 보인다)
  const dayLines = useMemo(() => rxCatalog([...catalog.days, ...input.days], [], isSavableLine), [catalog.days, input.days])
  // 앞의 줄이 이긴다: 날 줄에 있으면 날 줄의 글자·이름이고, 날 줄에 없는 고른 처방은 저장한 글자·이름이다
  const lines = useMemo(() => rxCatalog([], [...dayLines, ...picks], isSavableLine), [dayLines, picks])
  const counts = useMemo(() => rxPeriodCounts(input), [input])
  const anyRows = useMemo(() => hasRows(input), [input])
  const rows = useMemo(() => rxPickRows(input, picks), [input, picks])
  const total = useMemo(() => rxPickTotal(rows), [rows])
  // 칩 이름은 그 처방 표 줄의 이름이다(AC-803.1). 코드는 저장된 글자 그대로다
  const shownPicks = useMemo<RxLine[]>(() => rows.map(({ code, name }) => ({ code, name })), [rows])

  if (!saved) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{EMPTY}</EmptyNote>
      </Section>
    )
  }

  const toggleOpened = (code: string) => {
    const key = codeKey(code)
    setOpened((now) => {
      const next = new Set(now)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }
  // 어느 길로 빠지든 잊는다(AC-802.8): 목록 줄을 다시 누름, 칩, [모두 지우기]
  const forget = (code: string) => {
    const key = codeKey(code)
    setOpened((now) => {
      const next = new Set(now)
      next.delete(key)
      return next
    })
    setModes((now) => {
      const next = new Map(now)
      next.delete(key)
      return next
    })
  }
  const forgetAll = () => {
    setOpened(new Set())
    setModes(new Map())
  }
  const renderPanel = (row: RxPickRow) => {
    const key = codeKey(row.code)
    return (
      <RxPickDetail
        line={{ code: row.code, name: row.name.trim() || row.code }}
        input={input}
        mode={modes.get(key) ?? 'total'}
        onMode={(mode) => setModes((now) => new Map(now).set(key, mode))}
      />
    )
  }

  return (
    <Section title={TITLE} desc={DESC} className={className}>
      <RxPickSearch
        catalog={lines}
        picks={shownPicks}
        counts={counts}
        catalogState={catalog.state}
        disabled={state !== 'ready'}
        onToggle={(line) => {
          if (rows.some((row) => codeKey(row.code) === codeKey(line.code))) forget(line.code)
          toggle(line)
        }}
        onRemove={(code) => {
          forget(code)
          remove(code)
        }}
        onClear={() => {
          forgetAll()
          clear()
        }}
        onOpen={catalog.open}
        onRetryCatalog={catalog.retry}
      />
      {state === 'reading' && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-body text-muted">
          <Icon name="clock" size={14} className="shrink-0" />
          {READING}
        </p>
      )}
      {state === 'read-failed' && <ErrorWithAction code="E-STATS-PICK-READ-FAILED" action="다시 읽기" onAction={reread} />}
      {saveFailed && <ErrorWithAction code="E-STATS-PICK-SAVE-FAILED" action="다시 저장" onAction={retrySave} note={SAVE_KEPT} />}
      {rows.length > 0 &&
        (anyRows ? (
          <RxPickTable input={input} rows={rows} total={total} hospitalName={hospitalName} opened={opened} onToggle={toggleOpened} renderPanel={renderPanel} />
        ) : (
          <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
        ))}
    </Section>
  )
}
