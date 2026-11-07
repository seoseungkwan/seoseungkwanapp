'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { bucketRange, countsText, LAPSED_BUCKETS, rangeText } from '@/lib/patients/lapsed'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import type { FilteredLapsed, LapsedBucket, LapsedGroup, LapsedListFilters, LapsedRxPick } from '@/types/patients'
import { CopyButton, CopyNoticeLine, type CopyNotice } from './CopyButton'
import {
  ACTION_GROUP,
  ACTIONS,
  DATE_FIELD,
  FIELD,
  FIELD_NAME,
  FILTER_BAR,
  HELP,
  marksBlockedText,
  RANGE,
  ReadSummary,
  Segments,
  SMALL_TEXT_BUTTON,
  useMarkWaits,
} from './ReservationTool'
import { ErrorLine } from './rows/FollowupRows'
import { LapsedRows } from './rows/LapsedRows'
import type { LapsedRead } from './useBitList'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// 장기 미방문 명단 도구(spec patients-bit-lists AC-2804.2~2804.7·2802.4, 시안 toolLapsed). FollowupTool과 같은 방식이다:
// 화면은 거르지 않고 복사 글도 만들지 않는다. 고른 묶음·마지막 진료를 filter로 보내 Worker가 거른 줄·건수·복사 글을 받는다.
// 마지막 진료 묶음은 통계 탭 '처방 추세' 묶음(stats_rx_groups)을 읽기만 해서 이름·코드를 filter에 싣는다(AC-2804.6). 못 읽으면 처방 이름으로만 보인다.
// 환자 값(이름·전화·처방 이름)은 rows/LapsedRows가 props로만 그린다. 연락함 표시는 Worker → 도우미 저장(contact.marks, 열쇠 l|…)으로만 간다

const EMPTY = '이 기간에 마지막으로 오신 분이 없어요.'
const NO_PHONES = '복사할 명단이 없어요. 모두 번호 없는 분이에요.'
const RX_HELP = '마지막 진료는 통계 탭 ‘처방 추세’에서 만든 묶음 이름이에요. 묶음에 없는 처방은 이름을 두 개까지 흐리게 보여요.'
const COPY_HELP = '명단 넷째 칸은 마지막 내원 날짜예요. 번호 없는 분은 복사에서 빠져요.'
const VISITS_NOTE = '내원 횟수는 진료 받은 날 수예요(같은 날 두 번 접수해도 한 번). 예약 대기·취소한 접수는 세지 않아요.'
const MARKS_BLOCKED = '연락 표시를 불러오지 못해 [연락함]을 쓸 수 없어요.'
// 처음에 10명까지 보인다(AC-2804.3. rows/LapsedRows와 같은 수)
const SHOWN = 10

const BUCKETS: readonly (readonly [LapsedBucket, string])[] = LAPSED_BUCKETS.map(({ id, label }) => [id, label] as const)

// 마지막 진료 고르기 값. 묶음 이름은 앞에 'group:'을 붙여 전체·묶음 없음과 겹치지 않게 한다
const ALL = 'all'
const NONE = 'none'
const GROUP = 'group:'
const pickValue = (pick: LapsedRxPick) => (pick.kind === 'group' ? `${GROUP}${pick.name}` : pick.kind)
const pickOf = (value: string): LapsedRxPick => (value.startsWith(GROUP) ? { kind: 'group', name: value.slice(GROUP.length) } : value === NONE ? { kind: 'none' } : { kind: 'all' })

type Listed = Omit<FilteredLapsed, 'type' | 'tool'>
// 그 읽기 때 읽은 처방 추세 묶음(못 읽었으면 null)
type Groups = { read: LapsedRead; groups: LapsedGroup[] | null }

/** 읽을 때마다(처음·다시 불러오기) 처방 추세 묶음을 다시 읽는다. 그 읽기의 묶음이 오기 전에는 null(아직 묻지 않는다) */
function useRxGroups(read: LapsedRead): Groups | null {
  const [loaded, setLoaded] = useState<Groups | null>(null)
  useEffect(() => {
    let live = true
    // listStatsRxGroups가 던져도 같은 실패다. 실패 글은 버리고 묶음 없이 묻는다
    Promise.resolve()
      .then(() => listStatsRxGroups())
      .then(
        (rows) => {
          if (live) setLoaded({ read, groups: rows.map(({ name, codes }) => ({ name, codes: [...codes] })) })
        },
        () => {
          if (live) setLoaded({ read, groups: null })
        },
      )
    return () => {
      live = false
    }
  }, [read])
  return loaded?.read === read ? loaded : null
}

export function LapsedTool({
  read,
  storeCode,
  active,
  post,
  listen,
  reload,
  reloadStore,
  head,
}: {
  /** 다 읽은 결과(useBitList). 바뀌면(다시 읽음) 묶음을 다시 읽고 고른 것 그대로 다시 묻는다 */
  read: LapsedRead
  /** 표시 저장을 못 불러온 번호. 모르면(아직 불러오는 중) 없다 */
  storeCode?: string | null
  /** 지금 보이는 도구인가. 다른 도구로 가도 살아 있어 고른 값·저장 답을 잃지 않는다 */
  active: boolean
  post(message: ToolRequest): void
  listen(listener: (message: ToolReply) => void): () => void
  /** 머리 [다시 불러오기]: 이 도구만 다시 읽는다 */
  reload(): void
  /** 표시를 못 불러왔을 때 줄의 [다시 불러오기]: 저장을 다시 불러온다(F/U [다시 불러오기]와 같다) */
  reloadStore(): void
  /** 도구 머리. 오른쪽에 놓을 요약을 받는다 */
  head(summary: ReactNode): ReactNode
}) {
  // 이 명단을 읽은 날. 묶음 기간·연락한 날의 기준이다
  const { today } = read
  const rxId = useId()
  const [bucket, setBucket] = useState<LapsedBucket>(LAPSED_BUCKETS[0].id)
  const [rx, setRx] = useState<LapsedRxPick>({ kind: 'all' })
  const [expanded, setExpanded] = useState(false)
  const groups = useRxGroups(read)

  const filters = useMemo<LapsedListFilters | null>(() => (groups ? { bucket, rx, groups: groups.groups } : null), [bucket, rx, groups])

  const [listed, setListed] = useState<Listed | null>(null)
  // 답을 기다리는 filter 수(ReservationTool과 같다)
  const askedFilters = useRef(0)
  const askedRead = useRef<LapsedRead | null>(null)
  const [waiting, setWaiting] = useState(true)
  const { busyKeys, markErrors, begin, settle } = useMarkWaits()
  const [notice, setNotice] = useState<CopyNotice>(null)

  useEffect(
    () =>
      listen((message) => {
        if (message.type === 'filtered') {
          if (message.tool !== 'lapsed') return
          askedFilters.current = Math.max(0, askedFilters.current - 1)
          const { rows, counts, range, groupNames, copy, marksLoaded } = message
          setListed({ rows, counts, range, groupNames, copy, marksLoaded })
          setWaiting(askedFilters.current > 0)
          return
        }
        const on = settle(message)
        // 다시 오는 filtered 전까지 줄이 잠깐 되돌아 보이지 않게 한다
        if (on !== undefined && message.ok) setListed((prev) => prev && { ...prev, rows: prev.rows.map((row) => (row.key === message.key ? { ...row, contacted: on } : row)) })
      }),
    [listen, settle],
  )

  // 고르기가 바뀌거나 새로 읽어 묶음이 오면 Worker에 묻는다. 새로 읽었으면 앞 읽기에서 답 없이 남은 물음은 세지 않는다
  useEffect(() => {
    if (!filters) return
    askedFilters.current = askedRead.current === read ? askedFilters.current + 1 : 1
    askedRead.current = read
    setWaiting(true)
    post({ type: 'filter', tool: 'lapsed', filters })
  }, [post, filters, read])

  // 다른 도구로 가면 결과 줄을 지운다(시안 setTool). 고른 것이 바뀌거나 새로 읽어도 지운다(시안: 묶음을 바꾸면 lapsedNote·lapsedAll을 지운다)
  useEffect(() => {
    if (!active) setNotice(null)
  }, [active])
  useEffect(() => {
    setNotice(null)
    setExpanded(false)
  }, [bucket, rx, read])

  const mark = useCallback(
    (key: string, on: boolean) => {
      if (begin([key], on).length) post({ type: 'mark', key, on, today })
    },
    [begin, post, today],
  )

  const rows = listed?.rows ?? []
  const marksBlocked = !listed?.marksLoaded
  const listText = listed?.copy.list ?? ''
  // 고른 묶음이 이 기간 줄에 없어도 고르기에 남긴다(고른 것이 사라지지 않게)
  const groupNames = listed?.groupNames ?? []
  const names = rx.kind === 'group' && !groupNames.includes(rx.name) ? [...groupNames, rx.name] : groupNames

  const summary = listed && (
    <ReadSummary readAt={read.readAt} onReload={reload}>
      <b className="font-semibold text-ink">{formatCount(rows.length)}명</b>
      {/* 표시를 못 불러오면 연락했는지 모른다 */}
      {!marksBlocked && ` · 아직 연락 안 한 분 ${formatCount(rows.filter((row) => !row.contacted).length)}명`}
    </ReadSummary>
  )

  return (
    <>
      {head(summary)}

      <div className={FILTER_BAR}>
        <div className={FIELD}>
          <span className={FIELD_NAME}>마지막 내원</span>
          <Segments<LapsedBucket> label="마지막 내원" options={BUCKETS} value={bucket} onChange={setBucket} />
          <span className={RANGE}>{rangeText(bucketRange(bucket, today), today)}</span>
        </div>
        <div className={FIELD}>
          <label className={FIELD_NAME} htmlFor={rxId}>
            마지막 진료
          </label>
          <span className={DATE_FIELD}>
            <select id={rxId} className={ds.input} value={pickValue(rx)} onChange={(event) => setRx(pickOf(event.target.value))}>
              <option value={ALL}>전체</option>
              {names.map((name) => (
                <option key={name} value={`${GROUP}${name}`}>
                  {name}
                </option>
              ))}
              <option value={NONE}>묶음 없음</option>
            </select>
          </span>
        </div>
      </div>
      {listed && <p className="mt-2 text-caption text-muted">{countsText(listed.counts)}</p>}
      <p className={HELP}>{RX_HELP}</p>

      {listed && marksBlocked && storeCode && (
        <div className="mt-3">
          <ErrorLine text={marksBlockedText(MARKS_BLOCKED, storeCode)} code={storeCode} onReload={reloadStore} />
        </div>
      )}

      <div className={ACTIONS}>
        <div className={ACTION_GROUP}>
          <CopyButton
            text={listText}
            label="명단 복사"
            disabled={waiting || rows.length === 0}
            doneText={`복사했어요 · ${listed?.copy.count ?? 0}명`}
            // 줄은 있는데 복사 글이 비었으면 모두 번호 없는 분이다. 빈 글로 클립보드를 덮어쓰지 않는다
            unavailable={listText ? undefined : NO_PHONES}
            onResult={setNotice}
          />
        </div>
      </div>
      <CopyNoticeLine notice={notice} />
      <p className={HELP}>{COPY_HELP}</p>

      {listed && <LapsedRows rows={rows} onMark={mark} busyKeys={busyKeys} markErrors={markErrors} marksBlocked={marksBlocked} emptyText={EMPTY} expanded={expanded} />}
      {rows.length > SHOWN && (
        <p className="mt-2">
          <button type="button" className={SMALL_TEXT_BUTTON} aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
            {expanded ? '10명만 보기' : `모두 보기 (${formatCount(rows.length)}명)`}
          </button>
        </p>
      )}
      <p className={HELP}>{VISITS_NOTE}</p>
    </>
  )
}
