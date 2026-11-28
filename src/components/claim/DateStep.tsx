'use client'

import { useId, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import type { DateRange } from '@/types/dates'
import { ClaimError, SetupLink } from './ClaimError'
import { checkPeriod, closablePeriodDates, dayLabel, inPeriod, periodSummary, statusOf, toggleDay, unfinishedPeriod, weekPeriod, type DateRow } from './dateList'
import { checkedAtText } from './setup/checkedAt'
import type { LoadStep } from './claimLoad'

// 1단계 날짜 고르기(AC-013.1·AC-013.2, 목업 화면 2). 날짜와 숫자뿐이다(환자 글자 없음).
// claim-learn(REQ-9311): 줄 끝 [이 날만] · 목록 밖 기간 글 · 보낼 날에 오늘이 들면 고르기 줄에 노란 경고
// 목업의 '이어서 하기'(쓰다 멈춘 사람)와 달마다 '진료가 없는 날' 줄은 그리지 않는다: 앞은 TASK-18의 자료이고 뒤는 진료 0건인 날을 빼면(AC-013.1) 알 수 없다

export type DatesState = { kind: 'loading' } | { kind: 'failed'; code: string } | { kind: 'ready'; rows: DateRow[]; countsFailed: boolean }
export type LoadingStep = LoadStep | 'check'

/** 끝난 날짜는 처음에 이만큼만 보인다(목업 [끝난 날짜 더 보기]) */
const FINISHED_SHOWN = 3
const STATUS_CHIP = { neutral: ds.chip.neutral, accent: ds.chip.accent, positive: ds.chip.positive } as const

/** 없으면 크롬 날짜 칸이 연도를 여섯 자리까지 받는다 */
const DATE_MAX = '9999-12-31'

const groupRow = 'h-10 border-b border-line bg-canvas px-5 text-small font-medium text-ink-2'
const numHead = `${ds.table.th} text-right`
const dayName = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8))}일`

/** 고른 기간의 날짜를 완료로(claim-day-done-pc). 상태는 ClaimScreen이 갖고 여기는 그리기만 한다. blocked: 불러오기·입력 중이라 막음(AC-2901.6) */
export type CloseState = { saving: boolean; reopening: ReadonlySet<string>; justSaved: readonly string[]; failed: boolean; blocked: boolean }

// 고르기 줄: 44px 이상, 저장 전은 옅은 파랑·저장 뒤 알림은 옅은 초록(시안 claim-day-done-pc 나)
const CLOSE_BAR = 'mx-5 mb-2 flex min-h-11 items-center justify-between gap-2 rounded-control px-3 py-1 text-small font-medium max-md:mx-4'

function CloseBar({ rows, period, readFailed, close, onCloseDates, onReopen }: { rows: readonly DateRow[]; period: DateRange; readFailed: boolean; close: CloseState; onCloseDates(dates: string[]): void; onReopen(dates: string[]): void }) {
  const dates = closablePeriodDates(rows, period)
  // 불러올 수 없는 기간(35일 넘음 등)이거나 건수·완료 표시를 못 읽어 끝난 날을 모를 때는 보내지 않는다
  const unsafe = checkPeriod(period) !== null || readFailed
  return (
    <>
      {close.justSaved.length > 0 ? (
        // role="status"는 진행 표시(LoadingBox)가 쓴다. 이 줄은 aria-live로만 읽힌다
        <div aria-live="polite" className={`${CLOSE_BAR} bg-positive-soft text-positive`}>
          <span>{close.justSaved.length}일을 완료로 바꿨어요</span>
          <button type="button" disabled={close.blocked || close.justSaved.some((date) => close.reopening.has(date))} onClick={() => onReopen([...close.justSaved])} className={ds.textButton}>
            되돌리기
          </button>
        </div>
      ) : (
        <div aria-live="polite" className={`${CLOSE_BAR} bg-accent-soft text-accent-strong`}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            고른 기간에서 아직 입력 안 된 날 {dates.length}일
            {/* 보낼 날짜에 오늘(한국 날짜)이 있으면 노란 경고(claim-learn AC-9311.3). 단추는 막지 않는다 */}
            {dates.includes(todayInKorea()) && <span className={ds.chip.warning}>오늘도 들어 있어요. 오늘 진료가 더 있을 수 있어요.</span>}
          </span>
          <button type="button" disabled={close.saving || close.blocked || unsafe || dates.length === 0} onClick={() => onCloseDates(dates)} className={ds.button.primarySmall}>
            {close.saving ? '저장 중…' : '고른 날 완료로 저장'}
          </button>
        </div>
      )}
      {close.failed && (
        <div className="px-5 pb-2 max-md:px-4">
          <ErrorCard code="E-DAYCLOSE-FAILED" />
        </div>
      )}
    </>
  )
}

type RowActions = { onToggle(date: string): void; onOnly(date: string): void; close: CloseState; onReopen(dates: string[]): void }

/** 줄 끝 [이 날만](claim-learn AC-9311.1): 기간을 그 하루로. 안내 칸 안 오른쪽 끝에 둔다(칸을 더하지 않는다) */
function OnlyButton({ date, onOnly }: { date: string; onOnly(date: string): void }) {
  return (
    <button type="button" aria-label={`${dayLabel(date)} 이 날만`} onClick={() => onOnly(date)} className={ds.button.secondarySmall}>
      이 날만
    </button>
  )
}

function DayRow({ row, period, onToggle, onOnly, close, onReopen }: { row: DateRow; period: DateRange } & RowActions) {
  const status = statusOf(row)
  return (
    <tr className={ds.table.row}>
      <td className={ds.table.check}>
        <span className={ds.checkboxWrap}>
          <input type="checkbox" aria-label={dayName(row.date)} checked={inPeriod(row.date, period)} onChange={() => onToggle(row.date)} className={ds.checkbox} />
          <Icon name="check" className={ds.checkboxMark} />
        </span>
      </td>
      <td className={row.done ? ds.table.tdSub : ds.table.td}>{dayLabel(row.date)}</td>
      <td className={ds.table.tdNum}>{row.visits}명</td>
      <td className={ds.table.tdNum}>{row.needMemo === null ? '—' : `${row.needMemo}명`}</td>
      <td className={ds.table.tdNum}>{row.entered === null ? '—' : `${row.entered}명`}</td>
      <td className={ds.table.td}>
        <span className={STATUS_CHIP[status.tone]}>{status.label}</span>
      </td>
      {row.closedAt ? (
        // 사람이 완료로 바꾼 날: 안내 칸에 바꾼 시각과 줄 끝 [되돌리기](AC-2902.1). 칸을 더하지 않고 안내 칸 안 오른쪽에 둔다
        <td className={ds.table.tdSub}>
          <span className="flex items-center justify-between gap-3">
            <span>완료로 바꿈 · {checkedAtText(new Date(row.closedAt))}</span>
            <span className="flex items-center gap-2">
              <button type="button" aria-label={`${dayLabel(row.date)} 되돌리기`} disabled={close.blocked || close.reopening.has(row.date)} onClick={() => onReopen([row.date])} className={ds.button.secondarySmall}>
                되돌리기
              </button>
              <OnlyButton date={row.date} onOnly={onOnly} />
            </span>
          </span>
        </td>
      ) : (
        <td className={ds.table.tdSub}>
          <span className="flex items-center justify-between gap-3">
            <span>{row.updatedAt ? `${checkedAtText(new Date(row.updatedAt))}에 바뀜` : row.memoInBit > 0 ? `비트 메모 ${row.memoInBit}건` : ''}</span>
            <OnlyButton date={row.date} onOnly={onOnly} />
          </span>
        </td>
      )}
    </tr>
  )
}

function DateTable({ rows, period, ...actions }: { rows: readonly DateRow[]; period: DateRange } & RowActions) {
  const [allFinished, setAllFinished] = useState(false)
  const unfinished = rows.filter((row) => !row.done)
  const finished = rows.filter((row) => row.done)
  const shownFinished = allFinished ? finished : finished.slice(0, FINISHED_SHOWN)
  return (
    <>
      <div className={ds.table.wrap}>
        <table aria-label="진료한 날짜" className={ds.table.table}>
          <thead>
            <tr>
              {/* 빈 머리 칸은 aria-label로 이름을 준다. sr-only는 absolute라 옆으로 밀리는 표 밖까지 나가 좁은 화면 전체를 민다 */}
              <th aria-label="기간에 넣기" className={ds.table.th} />
              <th className={ds.table.th}>날짜</th>
              <th className={numHead}>진료 환자</th>
              <th className={numHead}>메모 필요</th>
              <th className={numHead}>입력함</th>
              <th className={ds.table.th}>상태</th>
              <th aria-label="안내" className={ds.table.th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className={ds.table.emptyRow}>
                  진료한 날짜가 없어요.
                </td>
              </tr>
            )}
            {unfinished.length > 0 && (
              <tr>
                <td colSpan={7} className={groupRow}>
                  아직 입력 안 된 날짜
                </td>
              </tr>
            )}
            {unfinished.map((row) => (
              <DayRow key={row.date} row={row} period={period} {...actions} />
            ))}
            {finished.length > 0 && (
              <tr>
                <td colSpan={7} className={groupRow}>
                  입력이 끝난 날짜
                </td>
              </tr>
            )}
            {shownFinished.map((row) => (
              <DayRow key={row.date} row={row} period={period} {...actions} />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-3 max-md:px-4">
        {shownFinished.length < finished.length && (
          <button type="button" className={ds.textButton} onClick={() => setAllFinished(true)}>
            끝난 날짜 더 보기
          </button>
        )}
        <span className={ds.help}>일요일·휴진일처럼 진료가 없는 날은 목록에 나오지 않아요.</span>
      </div>
    </>
  )
}

const STEPS: { step: LoadingStep; label: string }[] = [
  { step: 'month', label: '이 기간 자료와 12개월 이력' },
  { step: 'memos', label: '비트 메모' },
  { step: 'store', label: '저장한 작업' },
  { step: 'check', label: '점검' },
]

/** 진행 상태(목업 '불러오는 중'). 비트에서 몇 달을 읽었는지는 도우미가 알리지 않아 단계로만 보인다 */
function LoadingBox({ step, onStop }: { step: LoadingStep; onStop(): void }) {
  const at = STEPS.findIndex((item) => item.step === step)
  return (
    <div role="status" className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className={ds.chip.accent}>진행중</span>
        <span className="text-small font-semibold text-ink">비트에서 읽는 중</span>
      </div>
      <ul className="flex list-none flex-col gap-0.5 text-small text-ink-2">
        {STEPS.map((item, index) => (
          <li key={item.step}>
            {item.label} <span className="font-medium text-ink">{index < at ? '다 받음' : index === at ? '하는 중' : '기다리는 중'}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.secondarySmall} onClick={onStop}>
          멈추기
        </button>
        <span className={ds.help}>다 받기 전에는 점검하지 않아요.</span>
      </div>
      <p className={ds.help}>다른 탭으로 옮기면 불러오기가 멈춰요</p>
    </div>
  )
}

function PeriodPanel({ rows, listed, period, onPeriod, loading, onLoad, onStop }: { rows: readonly DateRow[]; listed: boolean; period: DateRange; onPeriod(next: DateRange): void; loading: LoadingStep | null; onLoad(): void; onStop(): void }) {
  const fromId = useId()
  const toId = useId()
  const problem = checkPeriod(period)
  const summary = periodSummary(rows, period)
  const today = todayInKorea()
  const unfinished = unfinishedPeriod(rows)
  return (
    <section className={ds.panel}>
      <div className={ds.panelHead}>
        <h2 className={ds.panelTitle}>기간 고르기</h2>
      </div>
      <div className={`${ds.panelBody} flex flex-col gap-3`}>
        <div className="grid grid-cols-2 gap-2">
          <div className={ds.field}>
            <label className={ds.label} htmlFor={fromId}>
              시작
            </label>
            <input id={fromId} type="date" max={DATE_MAX} className={ds.input} value={period.from} aria-invalid={problem !== null || undefined} onChange={(event) => onPeriod({ ...period, from: event.target.value })} />
          </div>
          <div className={ds.field}>
            <label className={ds.label} htmlFor={toId}>
              끝
            </label>
            <input id={toId} type="date" max={DATE_MAX} className={ds.input} value={period.to} aria-invalid={problem !== null || undefined} onChange={(event) => onPeriod({ ...period, to: event.target.value })} />
          </div>
        </div>
        {problem && <p className={ds.fieldError}>{problem}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={ds.button.secondarySmall} disabled={!unfinished} onClick={() => unfinished && onPeriod(unfinished)}>
            입력 안 된 날짜 모두
          </button>
          <button type="button" className={ds.button.secondarySmall} onClick={() => onPeriod(weekPeriod(today, 0))}>
            이번 주
          </button>
          <button type="button" className={ds.button.secondarySmall} onClick={() => onPeriod(weekPeriod(today, -1))}>
            지난주
          </button>
        </div>
        {/* 목록을 읽었는데 기간의 날이 목록에 하나도 없으면 '진료한 날 0일' 대신 목록 밖 글(claim-learn AC-9311.2). 불러오기는 그대로 된다 */}
        {!problem && listed && summary.outside && <p className="rounded-control bg-warning-soft px-3 py-2 text-small text-ink">목록에 없는 날짜예요. [자료 불러오기]를 누르면 보여요.</p>}
        {!problem && !(listed && summary.outside) && (
          <div className="flex flex-col rounded-control bg-canvas px-3 py-2 text-small text-ink-2">
            <p>
              진료한 날 {summary.days}일 · 진료 환자 {summary.visits}명{summary.needMemo === null ? '' : ` · 메모 필요 ${summary.needMemo}명`}
            </p>
            {summary.months.length > 1 && (
              <p className="text-muted">{summary.months.map(({ month, days }) => `${month}월 ${days}일`).join(' + ')}이 함께 들어 있어요. 월말 마감은 달마다 따로 해요.</p>
            )}
          </div>
        )}
        {loading ? (
          <LoadingBox step={loading} onStop={onStop} />
        ) : (
          <div className="flex flex-col gap-2">
            <button type="button" className={ds.button.primary} disabled={problem !== null} onClick={onLoad}>
              자료 불러오기
            </button>
            <p className={ds.help}>도우미가 비트에서 이 기간 자료와 지난 12개월 이력을 읽어 와요. 다 읽은 뒤에 점검해요.</p>
          </div>
        )}
      </div>
    </section>
  )
}

export function DateStep({
  dates,
  period,
  onPeriod,
  loading,
  onLoad,
  onStop,
  onRetryDates,
  close,
  onCloseDates,
  onReopen,
}: {
  close: CloseState
  onCloseDates(dates: string[]): void
  onReopen(dates: string[]): void
  dates: DatesState
  period: DateRange
  onPeriod(next: DateRange): void
  loading: LoadingStep | null
  onLoad(): void
  onStop(): void
  onRetryDates(): void
}) {
  const rows = dates.kind === 'ready' ? dates.rows : []
  const left = rows.filter((row) => !row.done).length
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className={`${ds.panel} flex flex-col gap-4 max-md:gap-2`}>
        <div className={ds.panelHead}>
          <h2 className={ds.panelTitle}>진료한 날짜</h2>
          {dates.kind === 'ready' && <span className={ds.count}>아직 입력 안 된 날짜 {left}일</span>}
        </div>
        {dates.kind === 'loading' && <p className="px-5 pb-5 text-small text-muted max-md:px-4">날짜를 읽는 중이에요…</p>}
        {dates.kind === 'failed' && (
          <div className="flex flex-col items-start gap-2 px-5 pb-5 max-md:px-4">
            <ClaimError code={dates.code} />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={ds.button.secondarySmall} onClick={onRetryDates}>
                다시 불러오기
              </button>
              <SetupLink code={dates.code} />
            </div>
          </div>
        )}
        {dates.kind === 'ready' && (
          <div className="flex flex-col">
            {dates.countsFailed && <p className={`${ds.help} px-5 pb-2 max-md:px-4`}>입력 건수를 읽지 못해 비트 자료만으로 보여요.</p>}
            <CloseBar rows={rows} period={period} readFailed={dates.countsFailed} close={close} onCloseDates={onCloseDates} onReopen={onReopen} />
            <DateTable rows={rows} period={period} onToggle={(date) => onPeriod(toggleDay(period, date))} onOnly={(date) => onPeriod({ from: date, to: date })} close={close} onReopen={onReopen} />
          </div>
        )}
      </section>
      <PeriodPanel rows={rows} listed={dates.kind === 'ready'} period={period} onPeriod={onPeriod} loading={loading} onLoad={onLoad} onStop={onStop} />
    </div>
  )
}
