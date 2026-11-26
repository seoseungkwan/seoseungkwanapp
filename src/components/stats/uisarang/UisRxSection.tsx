'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useReadOnly } from '@/components/shell/viewing'
import { rxCatalog } from '@/components/stats/rxPickView'
import { EmptyNote, NO_RANGE_DATA, Section, todayOf } from '@/components/stats/sections/parts'
import { RxSection, useTabDesc } from '@/components/stats/sections/RxSection'
import { TreatmentGroupEditor } from '@/components/stats/sections/TreatmentGroupEditor'
import { savedNote } from '@/components/stats/treatmentEdit'
import { groupCond, groupOut } from '@/components/stats/treatmentView'
import { isSavableLine } from '@/components/stats/useRxCatalog'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import type { RxLine, StatsInput } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { dayListText, formatQty, sumRxCodes, sumRxGroups, tileRx, type UisCodeSum, type UisTile } from '@/lib/analytics/uisarang'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { UisGroupDef } from '@/types/uisarang'
import { CELL, COVER, FOOT, LINE, NUM, ReadFailed, ReadingLine, TABLE, TABLE_WRAP, TD, TD_NUM, TH, TH_NUM, workedSet } from './parts'
import {
  UIS_CODE_HEAD,
  UIS_CODE_LEAD,
  UIS_COVER_UNIT,
  UIS_EDIT,
  UIS_EDIT_TITLE,
  UIS_GAP_TITLE,
  UIS_GROUP_HEAD,
  UIS_GROUP_LEAD,
  UIS_IGNORED,
  UIS_OTHER,
  UIS_RX_TABS,
  UIS_SUM,
  UIS_WHY,
  uisCoverText,
  uisGapText,
} from './texts'
import { UisNoteSection } from './UisNote'
import type { UisPeriodsView } from './useUisPeriods'

// 통계 처방 카드의 의사랑 탭 넷(specs/uisarang-upload AC-8812.4~AC-8812.7, 시안 rxCard·rxPanel ?s=stats·?s=stats-gap).
// 묶음별 처방량 · 처방 코드별(지금 기간을 tileRx로 처방 줄로 덮을 때만, 아니면 처방 엑셀이 모자라요 안내) · 처방별 신환·재진 · 몇 번까지 받나(셀 수 없음 안내).
// 처방량은 의사랑 총투여량의 합이라 환자 건수가 아니다: [묶음 고치기]는 지금 고치기 화면(TreatmentGroupEditor)을 건수 없이(counts null) 연다.
// 찾기 목록 = 이 기간에 읽은 의사랑 처방 줄의 코드(sumRxCodes, 처방명칭) + 지금 묶음에 든 코드(넣는·빼는·조건). useRxCatalog는 쓰지 않는다(design.md §10-3).
// [묶음 고치기]는 시안 그대로 표 아래(덮이지 않아도 있음), 다른 의원을 보는 중이면 없다

type Tiled = { tile: UisTile; codes: UisCodeSum[] }

const NO_LINES: readonly RxLine[] = []
const won = (amount: number) => `${formatCount(amount)}원`

// 고치기 찾기 목록에 더하는 묶음 처방 줄(이름은 의사랑 처방 줄이 채운다): 넣는 처방·빼는 처방·조건 처방
const groupCodeLines = (group: StatsRxGroup): RxLine[] =>
  [...group.codes, ...groupOut(group), ...groupCond(group).flatMap((item) => item.unless)].map((code) => ({ code, name: '' }))

// 셈에 넣는 묶음: 넣는 처방이 있는 묶음만, 받은 차례 그대로(월간 보고서 묶음별 처방량과 같다)
const groupDefs = (groups: readonly StatsRxGroup[]): { group: StatsRxGroup; def: UisGroupDef }[] =>
  groups.flatMap((group, i) => (group.codes.length === 0 ? [] : [{ group, def: { id: group.id ?? `new-${i}`, codes: group.codes, out: groupOut(group), cond: groupCond(group) } }]))

function coverParts(counts: { month: number; week: number; day: number }): string[] {
  return (['month', 'week', 'day'] as const).flatMap((unit) => (counts[unit] > 0 ? [`${UIS_COVER_UNIT[unit]} ${formatCount(counts[unit])}개`] : []))
}

/** 덮이지 않은 기간: 표 대신 처방 엑셀이 모자라요 안내 */
function GapNote({ gap, today }: { gap: readonly string[]; today: string }) {
  return <EmptyNote title={UIS_GAP_TITLE}>{uisGapText(formatCount(gap.length), dayListText(gap, today))}</EmptyNote>
}

/** 의사랑 숫자·덮기 상태 → 그 자리 줄(읽는 중·실패·모자람·자료 없음). 표를 그릴 수 있으면 null */
function blocked(periods: UisPeriodsView, tiled: Tiled | null, today: string) {
  if (periods.state === 'reading') return <ReadingLine />
  if (periods.state === 'failed' || tiled === null) return <ReadFailed />
  if (!tiled.tile.ok) return <GapNote gap={tiled.tile.gap} today={today} />
  if (tiled.tile.used.length === 0) return <EmptyNote>{NO_RANGE_DATA}</EmptyNote>
  return null
}

function GroupTable({ tiled, groups, periodName }: { tiled: Tiled; groups: readonly StatsRxGroup[]; periodName: string }) {
  const tile = tiled.tile
  const defs = useMemo(() => groupDefs(groups), [groups])
  const sums = useMemo(() => sumRxGroups(tiled.codes, defs.map((item) => item.def)), [tiled.codes, defs])
  if (!tile.ok) return null
  const parts = coverParts(tile.counts)
  return (
    <>
      {parts.length > 0 && <p className={COVER}>{uisCoverText(periodName, parts)}</p>}
      <div className={TABLE_WRAP}>
        <table aria-label={UIS_RX_TABS.groups} className={TABLE}>
          <thead>
            <tr>
              {UIS_GROUP_HEAD.map((head, i) => (
                <th key={head} scope="col" className={i === 0 ? TH : TH_NUM}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {defs.map(({ group }, i) => (
              <tr key={sums.groups[i]?.id ?? i}>
                <td className={TD}>{group.name}</td>
                <td className={TD_NUM}>{formatQty(sums.groups[i]?.qty ?? 0)}</td>
                <td className={TD_NUM}>{won(sums.groups[i]?.amount ?? 0)}</td>
              </tr>
            ))}
            <tr>
              <td className={`${CELL} ${LINE} text-st-ink-2`}>{UIS_OTHER}</td>
              <td className={`${CELL} ${LINE} ${NUM} text-st-muted`}>–</td>
              <td className={`${CELL} ${LINE} ${NUM} text-st-ink-2`}>{won(sums.other.amount)}</td>
            </tr>
            {/* 합계 줄: 굵게, 아래 선 없음(시안 tr.sum) */}
            <tr className="font-semibold">
              <td className={`${CELL} text-st-ink`}>{UIS_SUM}</td>
              <td className={`${CELL} ${NUM} text-st-muted`}>–</td>
              <td className={`${CELL} ${NUM} text-st-ink`}>{won(sums.total.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {sums.ignored && <p className={FOOT}>{UIS_IGNORED}</p>}
    </>
  )
}

function GroupsPanel({ periods, tiled, input, groups }: { periods: UisPeriodsView; tiled: Tiled | null; input: StatsInput; groups: StatsRxGroupsView }) {
  const readOnly = useReadOnly()
  // 고치기를 연 때의 묶음(null = 보는 화면). 저장 글을 견줄 '전'이고 고치기 화면의 처음 초안이다
  const [editing, setEditing] = useState<readonly StatsRxGroup[] | null>(null)
  const [triedSave, setTriedSave] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const focusNext = useRef<'heading' | 'edit' | null>(null)
  const { head, lead } = useTabDesc(UIS_GROUP_LEAD)

  useEffect(() => {
    const target = focusNext.current
    if (target === null) return
    focusNext.current = null
    ;(target === 'heading' ? headingRef : editRef).current?.focus()
  })

  // 찾기 목록: 이 기간에 읽은 의사랑 처방 코드(이름 있음) 먼저, 그다음 묶음에 든 코드. 코드 대소문자는 합친다(rxCatalog)
  const rows = periods.state === 'ready' ? periods.rx : null
  const lines = useMemo(() => {
    if (editing === null || rows === null) return NO_LINES
    const named = sumRxCodes(rows).map(({ code, name }) => ({ code, name }))
    return rxCatalog([], [...named, ...editing.flatMap(groupCodeLines)], isSavableLine)
  }, [editing, rows])

  if (editing) {
    const close = () => {
      focusNext.current = 'edit'
      setEditing(null)
    }
    const save = async (after: StatsRxGroup[]) => {
      setTriedSave(true)
      const ok = await groups.save(after)
      if (ok) {
        setNote(savedNote(editing, after))
        close()
      }
      return ok
    }
    return (
      <Section title={UIS_EDIT_TITLE} headingRef={headingRef}>
        <TreatmentGroupEditor
          groups={editing}
          lines={lines}
          counts={null}
          periodName={input.range.name}
          catalogState="ready"
          onOpenCatalog={() => undefined}
          onRetryCatalog={() => undefined}
          saving={groups.saving}
          saveFailed={triedSave && groups.saveFailed}
          onSave={save}
          onCancel={close}
        />
      </Section>
    )
  }

  const ready = groups.state === 'ready' && periods.state === 'ready'
  const openEditor = () => {
    if (!ready) return
    focusNext.current = 'heading'
    setNote(null)
    setTriedSave(false)
    setEditing(groups.groups)
  }
  const stop = blocked(periods, tiled, todayOf(input.range))
  return (
    <Section title={UIS_RX_TABS.groups} desc={head}>
      {lead}
      {note && (
        <p role="status" className="mt-2 text-small text-positive">
          {note}
        </p>
      )}
      {stop ??
        (groups.state === 'reading' ? (
          <ReadingLine>묶음을 읽는 중이에요</ReadingLine>
        ) : groups.state === 'read-failed' ? (
          <div className="mt-4">
            <ErrorCard code="E-STATS-GROUP-READ-FAILED" />
            <div className="mt-2">
              <button type="button" onClick={groups.reread} className={ds.button.secondarySmall}>
                다시 읽기
              </button>
            </div>
          </div>
        ) : (
          tiled !== null && <GroupTable tiled={tiled} groups={groups.groups} periodName={input.range.name} />
        ))}
      {!readOnly && (
        <div className="mt-3">
          <button type="button" ref={editRef} aria-disabled={!ready || undefined} onClick={openEditor} className={ds.button.secondarySmall}>
            {UIS_EDIT}
          </button>
        </div>
      )}
    </Section>
  )
}

function CodesPanel({ periods, tiled, input }: { periods: UisPeriodsView; tiled: Tiled | null; input: StatsInput }) {
  const { head, lead } = useTabDesc(UIS_CODE_LEAD)
  const stop = blocked(periods, tiled, todayOf(input.range))
  return (
    <Section title={UIS_RX_TABS.codes} desc={head}>
      {lead}
      {stop ?? (
        <div className={TABLE_WRAP}>
          <table aria-label={UIS_RX_TABS.codes} className={TABLE}>
            <thead>
              <tr>
                {UIS_CODE_HEAD.map((name, i) => (
                  <th key={name} scope="col" className={i < 2 ? TH : TH_NUM}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiled?.codes.map((line) => (
                <tr key={line.code}>
                  <td className={`${TD} font-semibold`}>{line.code}</td>
                  <td className={TD}>{line.name}</td>
                  <td className={TD_NUM}>{formatQty(line.qty)}</td>
                  <td className={TD_NUM}>{won(line.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}

export function UisRxSection({ periods, input, groups }: { periods: UisPeriodsView; input: StatsInput; groups: StatsRxGroupsView }) {
  const worked = useMemo(() => workedSet(input), [input])
  const tiled = useMemo((): Tiled | null => {
    if (periods.state !== 'ready') return null
    const tile = tileRx(input.range.current, periods.rx, { covered: input.covered, worked }, todayOf(input.range))
    return { tile, codes: tile.ok ? sumRxCodes(tile.used) : [] }
  }, [periods, input.range, input.covered, worked])
  return (
    <RxSection
      tabs={[
        { name: UIS_RX_TABS.groups, panel: <GroupsPanel periods={periods} tiled={tiled} input={input} groups={groups} /> },
        { name: UIS_RX_TABS.codes, panel: <CodesPanel periods={periods} tiled={tiled} input={input} /> },
        { name: UIS_RX_TABS.split, panel: <UisNoteSection title={UIS_RX_TABS.split} why={UIS_WHY.rxSplit} /> },
        { name: UIS_RX_TABS.dropoff, panel: <UisNoteSection title={UIS_RX_TABS.dropoff} why={UIS_WHY.revisit} /> },
      ]}
    />
  )
}

