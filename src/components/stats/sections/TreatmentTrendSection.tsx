'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { rxCatalog, rxPeriodCounts } from '@/components/stats/rxPickView'
import type { ChartMode } from '@/components/stats/treatmentChart'
import { savedNote } from '@/components/stats/treatmentEdit'
import { groupCond, groupOut, rowKey, staleNames, treatmentRows, uncomparedNames, type TreatmentRow } from '@/components/stats/treatmentView'
import { isSavableLine, useRxCatalog } from '@/components/stats/useRxCatalog'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { periodDesc, rxComparedCells, type RxLine, type StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import type { RxGroup, StatsRxGroup } from '@/types/rxGroups'
import { HowCounted } from './HowCounted'
import { EmptyNote, hasRows, NO_RANGE_DATA, Section, todayOf } from './parts'
import { useTabDesc } from './RxSection'
import { TreatmentDetail } from './TreatmentDetail'
import { TreatmentGroupEditor } from './TreatmentGroupEditor'
import { TreatmentTable, type ReadyTreatmentRow } from './TreatmentTable'
import { comparedNote } from './trendLabels'

// 처방별 추세 칸 (treatment-trend TASK-13, REQ-1201·1207·1208·1209·1210·1211, design.md '화면', 시안 docs/mockups/treatment-trend renderView()·startEdit()·save()).
// 묶음 훅 값(StatsRxGroupsView, 통계 화면이 한 번 부름)·찾기 목록 훅·표·열린 칸·고치기 화면을 잇는다. 칸이 드는 것: 고치기 열고 닫기, 열린 줄, 저장 글, 초점 옮기기.
// 상태 차례: 저장된 숫자 없음 → 고치는 중 → 묶음 읽는 중·실패 → 이 기간 자료 없음 → 안내 상자 + 표 + 아래 안내.
// 열린 줄은 기간마다 key를 주지 않고 이 칸의 React 상태에 둔다: 기간을 바꿔도 열린 채이고, 다시 불러와야 하는 기간에는 단추가 아니라 닫힌 것으로 보인다(AC-1209.5).
// 묶음·열린 줄·고치는 내용은 React 상태와 서버 표에만 있다(AC-1211.3).
// 통계 화면에서는 처방 칸 첫 탭 `묶음별 추세` 안이다(stats-pc-ux): 고치기 제목은 탭 이름을 쓰고(AC-4003.6), 늘 같은 네 글은 "어떻게 세나요?" 안에 접는다(AC-4004.2 ①).
// 따로 그릴 때의 h2 TITLE은 그대로다(앱에서는 탭 이름이 대신한다, design.md 표)
// 처방 카드 안(first90 AC-4413.1): [묶음 고치기]는 카드 머리 줄 오른쪽이고, 설명은 카드 옆 글(같은 글, AC-4411.3)이 대신해 따로 그리지 않는다

const TITLE = '처방별 추세'
const EDIT_TITLE = '묶음별 추세 · 묶음 고치기'
const DESC = '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건' // group-exclude AC-3708.7
const EMPTY = '불러오면 묶음마다 건수와 신환·재진이 보여요.'
const READING = '묶음을 읽는 중이에요'
const RELOAD = '비트 PC에서 다시 불러오거나, 파일을 다시 넣어 주세요.'
const ALL_STALE_HEAD = '한 번 다시 불러오면 숫자가 나와요'
const ALL_STALE_TEXT = `묶음별 숫자는 다시 불러온 기간부터 세요. ${RELOAD}`
const SOME_STALE_HEAD = '다시 불러와야 맞는 묶음이 있어요'
// 칸 아래 네 글(group-exclude AC-3708.6). "어떻게 세나요?" 안에 접는다(stats-pc-ux AC-4004.2 ①)
const NOTES = [
  '건 = 날마다 그 묶음 처방을 받은 환자 수를 더한 값이에요. 같은 날 같은 환자는 묶음 안 처방을 여러 개 받아도 1건이에요.',
  '빼는 처방이 있는 묶음은, 그날 빼는 처방을 하나라도 받은 환자를 그날 건수에서 빼요. * 표시 처방은 조건이 있어서, 조건 처방과 같은 날 받으면 그 처방으로는 세지 않아요.',
  '총환자 대비 = 묶음 건수 ÷ 총환자 · 신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수. 막대 안 회색 눈금은 비교 기간 건수예요.',
  '어느 묶음에도 넣지 않은 처방(진찰료, 먹는 약 등)은 여기 나오지 않아요. 줄을 누르면 날짜별 그래프와 추세선이 열려요.',
]
// Section의 머리 줄 오른쪽 칸(action을 감싸는 ml-auto 칸)을 휴대폰에서 폭 전체로 편다. 단추 자신의 폭 전체(max-md:w-full)와 짝이다(AC-1210.1, 시안 .head > .btn)
const PHONE_FULL_ACTION = 'max-md:[&>div>.ml-auto]:w-full'

const NO_LINES: readonly RxLine[] = []
const NO_COUNTS: ReadonlyMap<string, number> = new Map()
// 고치기 찾기 목록에 더하는 묶음 처방 줄(이름은 찾기 목록 줄이 채운다): 넣는 처방·빼는 처방·조건 처방. 그 기간 일 숫자에 없어도 이름·줄이 보인다(AC-3712.2)
const groupCodeLines = (group: StatsRxGroup): RxLine[] =>
  [...group.codes, ...groupOut(group), ...groupCond(group).flatMap((item) => item.unless)].map((code) => ({ code, name: '' }))

const joinNames = (names: readonly string[]) => names.join(', ')

// 다시 불러오기 안내(AC-1208.1·1208.2). 다시 불러와야 하는 묶음이 없으면 그리지 않는다(AC-1208.3)
function ReloadNotice({ rows }: { rows: readonly TreatmentRow[] }) {
  const { all, names } = staleNames(rows)
  if (names.length === 0) return null
  return (
    <div role="note" className="mt-3 bg-warning-soft px-4 py-3 text-small text-ink-2">
      <strong className="block font-semibold text-warning">{all ? ALL_STALE_HEAD : SOME_STALE_HEAD}</strong>
      {all ? ALL_STALE_TEXT : `${joinNames(names)} 묶음은 이 기간을 다시 불러와야 숫자가 나와요. ${RELOAD}`}
    </div>
  )
}

// 줄 아래 안내: 그대로 보이는 상황 안내 — 뺀 짝 글(처방 추세 AC-513.12와 같은 조건, 견주는 준비된 줄이 있을 때만) · 비교하지 않는 묶음(AC-1208.4) — 다음에
// 늘 같은 네 글(AC-3708.6)을 "어떻게 세나요?" 안에 접는다(stats-pc-ux AC-4004.2 ①·AC-4004.3). 상황 안내가 없으면 그 묶음도 없다
const NOTES_BOX = 'mt-3 grid max-w-182 gap-1'
function BottomNotes({ input, rows }: { input: StatsInput; rows: readonly TreatmentRow[] }) {
  const uncompared = uncomparedNames(rows)
  const anyCompared = rows.some((row) => row.kind === 'ready' && row.compared)
  const { kept, dropped } = anyCompared ? rxComparedCells(input) : { kept: 0, dropped: false }
  const comparedShown = dropped && kept >= 1
  return (
    <>
      {(comparedShown || uncompared.length > 0) && (
        <div className={NOTES_BOX}>
          {comparedShown && <p className="text-small text-muted">{comparedNote(input.range.grain, kept)}</p>}
          {uncompared.length > 0 && <p className="text-small text-muted">{`${joinNames(uncompared)} 묶음은 비교 기간을 다시 불러오면 지난 기간과 견줘요.`}</p>}
        </div>
      )}
      <HowCounted>
        <div className={NOTES_BOX}>
          {NOTES.map((note) => (
            <p key={note} className="text-small text-muted">
              {note}
            </p>
          ))}
        </div>
      </HowCounted>
    </>
  )
}

export function TreatmentTrendSection({
  input,
  saved,
  groups,
  revision = 0,
  className = '',
}: {
  input: StatsInput
  saved: boolean // 저장된 숫자가 하나라도 있음
  groups: StatsRxGroupsView // 묶음 훅 값(통계 화면이 부른다)
  revision?: number // 저장에 성공하거나 [다시 읽기]를 누를 때마다 는다. 찾기 목록이 넓은 범위를 다시 읽는 때를 안다
  className?: string
}) {
  const catalog = useRxCatalog(todayOf(input.range), revision)
  // 고치기를 연 때의 묶음(null = 보는 화면). 저장 글을 견줄 '전'이고 고치기 화면의 처음 초안이다
  const [editing, setEditing] = useState<readonly RxGroup[] | null>(null)
  // 이번 고치기에서 [저장]을 눌렀다: 그 뒤의 저장 실패만 오류 카드로 보인다(지난 고치기의 실패를 다시 보이지 않는다)
  const [triedSave, setTriedSave] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set()) // 열린 줄 열쇠(rowKey, 표가 같은 열쇠로 묻는다)
  // 줄 열쇠(rowKey)마다 고른 그래프 모양(group-exclude AC-3709.7·AC-3712.2). 없으면 [건수]. 화면을 연 동안 React 상태에만 있다(AC-3712.3)
  const [modes, setModes] = useState<Readonly<Record<string, ChartMode>>>({})
  const headingRef = useRef<HTMLHeadingElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  // 카드가 옆 글을 가졌으면 head는 없다. 패널 맨 위 줄(lead)도 그리지 않는다: 카드 옆 글이 이 칸 설명과 같은 글이다
  const { head: desc } = useTabDesc(periodDesc(DESC, input.range))
  const focusNext = useRef<'heading' | 'edit' | null>(null) // 다음 그림 뒤 초점을 줄 곳

  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    ;(target === 'heading' ? headingRef : editRef).current?.focus()
  })

  const rows = useMemo(() => treatmentRows(input, groups.groups), [input, groups.groups])
  // 찾기 목록(AC-1210.8): 넓은 범위 + 화면의 일 숫자 + 이미 묶음에 든 처방(넣는 처방·빼는 처방·조건 처방, AC-3712.2). 고치는 동안만 센다(넓은 범위는 최대 731일)
  const dayLines = useMemo(() => (editing ? rxCatalog([...catalog.days, ...input.days], [], isSavableLine) : NO_LINES), [editing, catalog.days, input.days])
  const lines = useMemo(
    () => (editing ? rxCatalog([], [...dayLines, ...editing.flatMap(groupCodeLines)], isSavableLine) : NO_LINES),
    [editing, dayLines],
  )
  const counts = useMemo(() => (editing ? rxPeriodCounts(input) : NO_COUNTS), [editing, input])

  if (!saved) {
    return (
      <Section title={TITLE} className={className}>
        <EmptyNote>{EMPTY}</EmptyNote>
      </Section>
    )
  }

  if (editing) {
    const close = () => {
      focusNext.current = 'edit'
      setEditing(null)
    }
    const save = async (after: RxGroup[]) => {
      setTriedSave(true)
      const ok = await groups.save(after)
      if (ok) {
        setNote(savedNote(editing, after))
        close()
      }
      return ok
    }
    return (
      <Section title={EDIT_TITLE} headingRef={headingRef} className={className}>
        <TreatmentGroupEditor
          groups={editing}
          lines={lines}
          counts={counts}
          periodName={input.range.name}
          catalogState={catalog.state}
          onOpenCatalog={catalog.open}
          onRetryCatalog={catalog.retry}
          saving={groups.saving}
          saveFailed={triedSave && groups.saveFailed}
          onSave={save}
          onCancel={close}
        />
      </Section>
    )
  }

  const ready = groups.state === 'ready'
  const openEditor = () => {
    if (!ready) return
    focusNext.current = 'heading'
    setNote(null)
    setTriedSave(false)
    setEditing(groups.groups)
  }
  const toggle = (key: string) =>
    setOpened((now) => {
      const next = new Set(now)
      if (!next.delete(key)) next.add(key)
      return next
    })
  const renderPanel = (item: ReadyTreatmentRow) => {
    const key = rowKey(item.group)
    return <TreatmentDetail input={input} item={item} mode={modes[key] ?? 'count'} onMode={(mode) => setModes((now) => ({ ...now, [key]: mode }))} />
  }

  const editButton = (
    <button type="button" ref={editRef} aria-disabled={!ready || undefined} onClick={openEditor} className={`${ds.button.secondarySmall} max-md:w-full`}>
      묶음 고치기
    </button>
  )

  return (
    <Section title={TITLE} desc={desc} action={editButton} className={`${className} ${PHONE_FULL_ACTION}`}>
      {note && (
        <p role="status" className="mt-2 text-small text-positive">
          {note}
        </p>
      )}
      {groups.state === 'reading' && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-body text-muted">
          <Icon name="clock" size={14} className="shrink-0" />
          {READING}
        </p>
      )}
      {groups.state === 'read-failed' && (
        <div className="mt-4">
          <ErrorCard code="E-STATS-GROUP-READ-FAILED" />
          <div className="mt-2">
            <button type="button" onClick={groups.reread} className={`${ds.button.secondarySmall} max-md:w-full`}>
              다시 읽기
            </button>
          </div>
        </div>
      )}
      {ready &&
        (hasRows(input) ? (
          <>
            <ReloadNotice rows={rows} />
            <TreatmentTable input={input} rows={rows} opened={opened} onToggle={toggle} renderPanel={renderPanel} />
            <BottomNotes input={input} rows={rows} />
          </>
        ) : (
          <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
        ))}
    </Section>
  )
}
