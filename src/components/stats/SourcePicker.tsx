'use client'

import Link from 'next/link'
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { mergeRanges } from '@/lib/analytics/coverage'
import { addDays, compareYmd } from '@/lib/analytics/dates'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { toDayPayloads } from '@/lib/payload/toDayPayloads'
import { toMonthPayload } from '@/lib/payload/toMonthPayload'
import type { FileReport } from '@/types/analyze'
import type { BridgeState } from '@/types/bridge'
import type { DateRange } from '@/types/dates'
import type { ErrorCode } from '@/types/errors'
import { runAnalysis } from '@/workers/runAnalysis'
import { longDate } from './sections/parts'
import type { SaveInput } from './useStatsData'

// 자료 고르기 (stats REQ-514 AC-514.3·514.4·514.5·514.8, 시안 notes.md §3 '자료 고르기').
// 왼쪽 비트 칸은 연결 상태마다 다르고, 오른쪽 파일 칸은 언제나 있다. 파일 이름은 화면에만 보이고 Worker·서버로 가지 않는다

// 파일 길의 덮은 기간 상한. stats_coverage 제약(양 끝을 합쳐 800일)을 넘으면 saveStats가 아무것도 보내지 않아 [다시 저장]도 끝없이 실패한다
const MAX_COVERED_DAYS = 800

// 화면의 일은 한 번에 하나다: 비트 불러오기 · 파일 읽기 · [다시 저장]
export type StatsJob = 'bit' | 'file' | 'save'
export type FileFailure = { name: string; code: ErrorCode }
export type FileIncomplete = { failedFiles: number; skippedRows: number }
export type FileOutcome = { failures: FileFailure[]; save: SaveInput | null; incomplete: FileIncomplete | null }

// 성공한 파일의 기간 줄·받아들인 줄 범위를 합친 것 가운데 가장 최근 이어진 구간. 끝은 어제 이하다(파일 길에는 "오늘 진료 끝"이 없다).
// 800일을 넘으면 앞을 줄인다. 일 숫자는 전부 저장하고, 잘린 옛날 날은 0이 아니라 '덮이지 않음'이 된다(화면이 읽는 범위는 731일 이하다)
export function fileCovered(reports: readonly FileReport[], today: string): DateRange | null {
  const yesterday = addDays(today, -1)
  const ranges = reports.flatMap((report) => (report.ok ? (report.period === null ? [report.range] : [report.period, report.range]) : []))
  const finished = ranges.flatMap(({ from, to }) => (compareYmd(from, yesterday) > 0 ? [] : [{ from, to: compareYmd(to, yesterday) > 0 ? yesterday : to }]))
  const latest = mergeRanges(finished).at(-1)
  if (latest === undefined) return null
  const earliest = addDays(latest.to, 1 - MAX_COVERED_DAYS)
  return { from: compareYmd(latest.from, earliest) < 0 ? earliest : latest.from, to: latest.to }
}

// 지금 runAnalysis 길 그대로다. 품질이 incomplete면 저장 모양이 null이라 저장하지 않는다(AC-514.6)
export async function readFiles(files: File[], today: string): Promise<FileOutcome> {
  const { files: reports, result } = await runAnalysis(files, { today })
  const failures = reports.flatMap((report) => (report.ok ? [] : [{ name: files[report.index]?.name ?? '', code: report.code }]))
  if (result === null) return { failures, save: null, incomplete: null }
  const months = toMonthPayload(result)
  const days = toDayPayloads(result)
  if (months === null || days === null) return { failures, save: null, incomplete: { failedFiles: failures.length, skippedRows: result.skippedInvalidRows } }
  return { failures, save: { months, days, covered: fileCovered(reports, today), source: 'file' }, incomplete: null }
}

const BAND = 'mt-4 flex flex-wrap items-start gap-x-8 gap-y-4 rounded-control bg-canvas px-5 py-4 max-md:flex-col max-md:gap-y-3 max-md:px-4 max-md:py-3'
const BIT_CELL = 'flex min-w-0 flex-[1_1_420px] flex-wrap items-center gap-x-4 gap-y-2 max-md:w-full max-md:flex-none'
const FILE_CELL =
  'flex min-w-0 flex-[1_1_320px] flex-wrap items-center gap-x-3 gap-y-2 border-l border-line-strong pl-8 max-md:w-full max-md:flex-none max-md:border-t max-md:border-l-0 max-md:pt-3 max-md:pl-0'
const HINT = 'text-small text-ink-2'
const NO_BIT = '이 PC에서는 아직 비트에서 불러올 수 없어요'
const NO_BIT_LINE: Partial<Record<BridgeState, string>> = {
  'no-helper': '도우미 프로그램이 없어요. 비트 PC 연결 화면에서 설치하면 [비트에서 불러오기]가 생겨요.',
  'update-helper': '도우미 프로그램을 업데이트해야 해요. 비트 PC 연결 화면에서 업데이트하면 [비트에서 불러오기]가 다시 생겨요.',
  'update-extension': '크롬 확장 프로그램을 업데이트해야 해요. 비트 PC 연결 화면에서 업데이트하면 [비트에서 불러오기]가 다시 생겨요.',
}
const WORKING = { bit: '비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.', file: '파일을 이 PC 안에서 읽는 중이에요.' } as const

function Message({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 flex-[1_1_280px] gap-0.5 text-small text-ink-2">
      <p className="text-body font-semibold text-ink">{title}</p>
      {children}
    </div>
  )
}

// 연결이 멈춘 상태: 글은 lib/errors.ts 한 곳에서 가져오고 번호를 함께 보인다. [다시 확인]은 새로 묻는다
function ConnectionStopped({ code, onRetry }: { code: ErrorCode; onRetry(): void }) {
  const info = errorInfo(code)
  return (
    <>
      <Message title={info.what}>
        <p>{info.fix}</p>
        <p className="text-caption tabular-nums">오류 번호 {code}</p>
      </Message>
      <button type="button" className={ds.button.secondary} onClick={onRetry}>
        다시 확인
      </button>
    </>
  )
}

function BitLoad({ today, job, onLoad }: { today: string; job: Props['job']; onLoad(closeToday: boolean): void }) {
  const [closeToday, setCloseToday] = useState(false)
  const date = longDate(today)
  return (
    <>
      <button type="button" aria-disabled={job !== null || undefined} className={ds.button.primary} onClick={job === null ? () => onLoad(closeToday) : undefined}>
        <Icon name="monitor" />
        {job === 'bit' ? '불러오는 중' : '비트에서 불러오기'}
      </button>
      <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 text-body font-medium text-ink max-md:min-h-11">
        <span className={ds.checkboxWrap}>
          <input type="checkbox" checked={closeToday} disabled={job !== null} onChange={(event) => setCloseToday(event.target.checked)} className={ds.checkbox} />
          <svg aria-hidden="true" className={ds.checkboxMark} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </span>
        오늘 진료 끝
      </label>
      <p className={`basis-full ${HINT}`}>
        {closeToday ? `켜고 불러오면 오늘(${date}) 숫자도 끝난 날로 저장해요. 진료가 다 끝난 뒤에 켜 주세요.` : `꺼 두면 오늘(${date})은 진료 중이라, 어제까지만 끝난 날로 저장해요.`}
      </p>
    </>
  )
}

function BitCell({ state, helloError, today, job, onRetry, onLoad }: Omit<Props, 'onFiles'>) {
  if (state === 'ready') return <BitLoad today={today} job={job} onLoad={onLoad} />
  if (state === 'no-extension') {
    return (
      <Message title="비트 PC의 크롬에서 불러올 수 있어요">
        <p>이 기기에서는 저장된 숫자만 보여요. 처방별 신환·재진과 보고 문장은 비트 PC에서 볼 수 있어요.</p>
      </Message>
    )
  }
  const line = NO_BIT_LINE[state]
  if (line !== undefined) {
    return (
      <>
        <Message title={NO_BIT}>
          <p>{line}</p>
        </Message>
        <Link href="/claim/setup" className={`${ds.button.secondary} no-underline`}>
          비트 PC 연결
          <Icon name="arrow" />
        </Link>
      </>
    )
  }
  if (state === 'busy') return <ConnectionStopped code="E-BRIDGE-BUSY" onRetry={onRetry} />
  if (state === 'disconnected') return <ConnectionStopped code="E-BRIDGE-DISCONNECTED" onRetry={onRetry} />
  // 연결 확인 중. hello가 번호로 끝나면 상태는 그대로이고 그 번호와 [다시 확인]을 보인다
  if (helloError !== null) return <ConnectionStopped code={isErrorCode(helloError) ? helloError : 'E-BRIDGE-BAD-REPLY'} onRetry={onRetry} />
  return <p className={HINT}>비트 PC 연결을 확인하는 중이에요.</p>
}

type Props = {
  state: BridgeState
  helloError: string | null
  today: string
  job: StatsJob | null // 다른 일을 하는 동안 불러오기·파일을 막는다
  onRetry(): void
  onLoad(closeToday: boolean): void
  onFiles(files: File[]): void
}

export function SourcePicker({ onFiles, ...rest }: Props) {
  const { job } = rest
  const input = useRef<HTMLInputElement>(null)

  const take = (list: FileList | readonly File[] | null) => {
    const files = Array.from(list ?? [])
    if (job === null && files.length > 0) onFiles(files)
  }
  // 칸 밖에 놓아도 브라우저가 파일을 열지 않게 띠 전체가 받는다
  const drop = (event: DragEvent) => {
    event.preventDefault()
    take(event.dataTransfer.files)
  }

  return (
    <>
      <div className={BAND} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
        <div className={BIT_CELL}>
          <BitCell {...rest} />
        </div>
        <div className={FILE_CELL}>
          <button type="button" aria-disabled={job !== null || undefined} className={`${ds.button.secondary} max-md:w-full`} onClick={job === null ? () => input.current?.click() : undefined}>
            <Icon name="upload" />
            파일 고르기
          </button>
          <span className={HINT}>또는 비트에서 내보낸 파일을 여기에 끌어다 놓아요</span>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            accept=".xlsx,.xls,.csv"
            onChange={(event) => {
              take(event.target.files)
              event.target.value = '' // 같은 파일을 다시 고를 수 있게
            }}
          />
        </div>
      </div>
      {(job === 'bit' || job === 'file') && (
        <p className="mt-3 flex items-center gap-2 text-body text-ink-2">
          <Icon name="clock" className="shrink-0 text-accent" />
          <span>{WORKING[job]}</span>
        </p>
      )}
    </>
  )
}
