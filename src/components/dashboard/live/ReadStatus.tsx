import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { NOTE } from '@/components/dashboard/briefing/layout'
import { longDate } from '@/components/dashboard/summary/view'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'

// 대시보드 맨 위 자리의 읽는 중·실패 블록과 머리 줄(StatusHeader, dashboard-ux AC-2701.3) (bit-dashboard AC-601.2~601.7·AC-601.16·AC-601.17, design.md '### 화면',
// 시안 docs/mockups/bit-dashboard/gen.py left_reading·left_fail·left_busy·read_line·left_reread_fail). 오류 문구·번호는 lib/errors.ts에서만 가져온다.
// 움직이는 것은 막대와 도는 표시 둘뿐이고 움직임은 globals.css의 .bit-read-bar·.bit-read-spin이 맡는다(AC-601.17, UI_GUIDE '움직임 › 비트 읽는 표시'). Tailwind animate-*는 쓰지 않는다

export const BIT_IN_USE: ErrorCode = 'E-BIT-IN-USE'

const H1 = 'mt-3 max-w-120 text-display-m font-semibold text-balance text-ink max-md:mt-2 max-md:text-heading-m'
const LEAD = 'mt-4 max-w-128 text-lead text-ink-2'
const CONNECT_CHECK = '/claim/setup?next=dashboard'
// 오류 번호가 없는 안내라 lib/errors.ts 틀(무엇이·고치기·번호)에 맞지 않아 여기 둔다(AC-601.16)
const UNREADABLE = '이 PC에서 비트를 읽을 수 없어요. 연결을 확인해 주세요.'

// 읽은 시각 "오후 3:42"·저장 시각 "11월 2일 오후 12:05": 그 PC 시간대·언어와 상관없다(위쪽 띠 시계 kstNow와 같은 방식). 언어 자료가 모자라면 ko-KR은 "PM"을 준다
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function koreaParts(at: number): Record<string, string> {
  return Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
}

function clockText(parts: Record<string, string>): string {
  const hour = Number(parts.hour)
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${parts.minute}`
}

function timeText(at: number): string {
  return clockText(koreaParts(at))
}

/** 서버 저장 시각(readDays latest.at, ISO 글자) → "11월 2일 오후 12:05". 읽을 수 없는 값이면 null(시각을 지어내지 않는다) */
function savedTimeText(at: string): string | null {
  const time = Date.parse(at)
  if (Number.isNaN(time)) return null
  const parts = koreaParts(time)
  return `${Number(parts.month)}월 ${Number(parts.day)}일 ${clockText(parts)}`
}

function Safe() {
  return (
    <p className={`mt-4 flex items-start gap-1.5 ${NOTE}`}>
      <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-positive" />
      <span>환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.</span>
    </p>
  )
}

/** 저장 숫자 없이 처음 읽는 중. 값이 없는 진행 막대라 진행률을 지어내지 않는다 */
export function ReadingBlock() {
  return (
    <>
      <h1 className={H1}>비트에서 오늘 숫자를 읽고 있어요</h1>
      <p className={LEAD}>최근 100일 자료를 읽어요. 길면 3분쯤 걸려요. 다 읽을 때까지 이 화면을 열어 두세요.</p>
      <div role="progressbar" aria-label="비트 자료 읽는 중" className="bit-read-bar mt-5 max-w-130" />
      <Safe />
    </>
  )
}

/** 저장 숫자 없이 읽기 실패·다른 창 사용 중. 다른 창이 쓰는 중이면 연결은 문제가 아니라 [연결 확인]이 없다 */
export function ReadFailed({ code, onRetry }: { code: ErrorCode; onRetry(): void }) {
  const { what, fix } = errorInfo(code)
  return (
    <div role="alert">
      <h1 className={H1}>{what}</h1>
      <p className={LEAD}>{fix}</p>
      <p className="mt-2 text-caption text-ink-2">오류 번호 {code}</p>
      <div className="mt-6 flex flex-wrap gap-2 max-md:mt-5 max-md:grid">
        <button type="button" className={ds.button.primaryLarge} onClick={onRetry}>
          다시 확인
        </button>
        {code !== BIT_IN_USE && (
          // 보조 큰 단추(ds.button.secondaryLarge, dashboard-ux AC-2707.5)
          <Link href={CONNECT_CHECK} className={`${ds.button.secondaryLarge} no-underline`}>
            연결 확인
          </Link>
        )}
      </div>
      <Safe />
    </div>
  )
}

// 머리 줄 상태 표시(dashboard-ux AC-2701.3). "비트 연결됨"처럼 지금 연결돼 있다는 글은 쓰지 않는다: 실시간 연결 확인이 없어
// 이 화면에서 비트 읽기가 성공했는지만 말한다(2026-11-07 사용자 결정). 색은 시안 head() 칩 그대로(보조·accent·positive·negative)
function chipOf(readAt: number | null, reading: boolean, failed: boolean): { text: string; className: string } {
  if (reading) return { text: '비트에서 다시 읽는 중', className: ds.chip.accent }
  if (failed) return { text: '비트 읽기 실패', className: ds.chip.negative }
  if (readAt !== null) return { text: '비트에서 읽은 숫자', className: ds.chip.positive }
  return { text: '서버에 저장된 숫자', className: ds.chip.neutral }
}

// 시각 글: 비트에서 읽었으면 그 시각만, 아니면 서버에 마지막으로 저장된 시각(latest.at)만. 둘을 함께 쓰지 않는다.
// latest.at은 가장 최근에 저장된 날 줄 하나의 시각이라 자료 전체가 그때 것이라고 하지 않는다("날짜마다 저장된 때가 달라요"). 둘 다 없으면 null
function whenText(readAt: number | null, savedAt: string | null): string | null {
  if (readAt !== null) return `비트에서 읽은 시각 오늘 ${timeText(readAt)}`
  const saved = savedAt === null ? null : savedTimeText(savedAt)
  return saved === null ? null : `서버에 마지막으로 저장된 시각 ${saved} · 날짜마다 저장된 때가 달라요`
}

// 의사랑 의원 머리 줄(uisarang-upload AC-8811.2, 시안 ?s=dash-data): 칩 하나(회색)와 "마지막으로 올린 때 {M}월 {D}일 {HH}:{mm} · {M}월 {D}일까지 있어요".
// 시각은 저장 숫자의 마지막 저장 시각(readDays latest.at = 마지막으로 올린 때, 한국 시각 24시간 두 자리), 끝 날은 손에 든 날 줄의 가장 늦은 날이다.
// 둘 가운데 하나라도 모르면 글을 그리지 않는다(시각을 지어내지 않는다)
const UIS_CHIP = { text: '의사랑 엑셀 숫자', className: ds.chip.neutral }

function uploadedText(savedAt: string | null, lastDay: string | null): string | null {
  if (savedAt === null || lastDay === null) return null
  const time = Date.parse(savedAt)
  if (Number.isNaN(time)) return null
  const parts = koreaParts(time)
  return `마지막으로 올린 때 ${Number(parts.month)}월 ${Number(parts.day)}일 ${parts.hour}:${parts.minute} · ${longDate(lastDay)}까지 있어요`
}

/** 저장 숫자 새로고침(dashboard-ux AC-2701.7·AC-2701.8): LiveDashboard가 저장 숫자를 다시 읽는 중인지·실패했는지와 누름 */
export type SavedRefresh = { refreshing: boolean; failed: boolean; onRefresh(): void }

/** 도는 표시 하나. .bit-read-* 클래스는 이 파일에만 둔다(AC-601.17) — 의사랑 올리기 칸(uisarang-upload)의 읽는 중 줄도 이것을 빌려 쓴다 */
export function ReadSpin() {
  return <span aria-hidden="true" className="bit-read-spin shrink-0" />
}

/** 머리 줄 읽기 단추 하나: 읽는 동안 도는 표시와 바뀐 글, 막힘 */
function ReadButton({ label, busyLabel, busy, disabled, onClick }: { label: string; busyLabel: string; busy: boolean; disabled: boolean; onClick(): void }) {
  return (
    <button type="button" className={`${ds.button.secondarySmall} max-md:w-full`} disabled={disabled} onClick={onClick}>
      {busy && <span aria-hidden="true" className="bit-read-spin" />}
      {busy ? busyLabel : label}
    </button>
  )
}

/**
 * 숫자가 있는 화면의 머리 줄(dashboard-ux AC-2701.3, 시안 docs/mockups/dashboard-ux/index.html head()): h1 "대시보드" · 상태 표시 · 시각 글 · 읽기 단추(AC-2701.7).
 * readAt: 이 화면에서 비트에서 읽은 시각(없으면 null). savedAt: 저장 숫자의 마지막 저장 시각(readDays latest.at, 없으면 null).
 * 읽기 단추는 두 일을 이름으로 나눈다(AC-2701.7): [저장된 숫자 새로고침](화면 숫자가 저장 숫자일 때, savedRefresh가 있을 때만)과
 * [비트에서 다시 읽기](bitReadable — 이 브라우저에 chrome.runtime이 있을 때). 비트를 읽을 수 없으면 실행 단추 대신 연결 안내 링크다.
 * 한쪽이 읽는 동안 둘 다 막힌다(AC-2701.8). 비트 다시 읽기 실패면 오류 상자(RereadAlert)의 [다시 확인]이, 저장 숫자 새로고침 실패면
 * 오류 상자(SavedRefreshAlert)의 [다시 읽기]가 그 단추를 맡아 머리 줄에서 뺀다.
 * variant 'uisarang'(uisarang-upload AC-8811.2): 의사랑 의원은 비트를 읽지 않아 칩 "의사랑 엑셀 숫자" · 마지막으로 올린 때 글(savedAt·lastDay) ·
 * [저장된 숫자 새로고침]만이다(비트 단추·연결 안내 없음). 주지 않으면 'bit'(지금 그대로)
 */
export function StatusHeader({
  readAt,
  savedAt,
  reading,
  failed,
  onReread,
  bitReadable,
  savedRefresh,
  variant = 'bit',
  lastDay = null,
}: {
  readAt: number | null
  savedAt: string | null
  reading: boolean
  failed: boolean
  onReread(): void
  bitReadable: boolean
  savedRefresh: SavedRefresh | null
  variant?: 'bit' | 'uisarang'
  /** 의사랑 모양의 끝 날(손에 든 날 줄의 가장 늦은 날 'YYYY-MM-DD'). 없으면 null */
  lastDay?: string | null
}) {
  const uis = variant === 'uisarang'
  const chip = uis ? UIS_CHIP : chipOf(readAt, reading, failed)
  const when = uis ? uploadedText(savedAt, lastDay) : whenText(readAt, savedAt)
  const refreshing = savedRefresh?.refreshing === true
  const busy = reading || refreshing
  const showSaved = savedRefresh !== null && readAt === null && !savedRefresh.failed
  // 다른 의원을 보는 중(admin-view AC-8008.3)이면 이 PC 비트 단추·연결 안내가 없고 [저장된 숫자 새로고침]만이다
  const readOnly = useReadOnly()
  const showBit = bitReadable && !failed && !readOnly && !uis
  const showConnect = !bitReadable && !readOnly && !uis
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="text-heading-m font-semibold text-ink max-md:text-title">대시보드</h1>
      <span className={chip.className}>{chip.text}</span>
      {when !== null && (
        <p className="flex min-w-0 items-center gap-1.5 text-small text-ink-2">
          <Icon name="clock" size={14} className="shrink-0 text-muted" />
          <span>{when}</span>
        </p>
      )}
      {(showSaved || showBit || showConnect) && (
        <div className="ml-auto flex flex-wrap gap-2 max-md:ml-0 max-md:grid max-md:w-full">
          {showSaved && (
            <ReadButton label="저장된 숫자 새로고침" busyLabel="저장된 숫자 읽는 중" busy={refreshing} disabled={busy} onClick={savedRefresh.onRefresh} />
          )}
          {showBit && <ReadButton label="비트에서 다시 읽기" busyLabel="비트에서 읽는 중" busy={reading} disabled={busy} onClick={onReread} />}
          {showConnect && (
            <Link href={CONNECT_CHECK} className={`${ds.button.secondarySmall} no-underline max-md:w-full`}>
              비트 PC 연결 안내
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * 저장 숫자 새로고침 실패(dashboard-ux AC-2701.8): 머리 줄 아래 오류 상자. 화면 숫자는 전에 읽어 둔 그대로라고 밝히고,
 * 글·번호는 lib/errors.ts의 E-STATS-READ-FAILED 그대로다(고치기 글이 말하는 [다시 읽기]가 이 상자의 단추). 누르기 전에는 다시 부르지 않는다
 */
export function SavedRefreshAlert({ refreshing, disabled, onRetry }: { refreshing: boolean; disabled: boolean; onRetry(): void }) {
  const code: ErrorCode = 'E-STATS-READ-FAILED'
  const { what, fix } = errorInfo(code)
  return (
    <div role="alert" className="mt-3 flex max-w-130 items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body font-semibold text-negative">{what}</p>
        <p className="mt-0.5 text-body text-ink-2">{`아래 숫자는 전에 읽어 둔 그대로예요. ${fix}`}</p>
        <p className="mt-1 text-caption text-ink-2">오류 번호 {code}</p>
        <div className="mt-3 flex flex-wrap gap-2 max-md:grid">
          <button type="button" className={ds.button.primary} disabled={disabled} onClick={onRetry}>
            {refreshing ? '다시 읽는 중' : '다시 읽기'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** 숫자가 있는 화면에서 직접 눌렀는데 이 PC에서 읽을 수 없음(AC-601.16): 오류가 아니라 안내다. 바탕은 앱 안 브라우저 안내 상자와 같다(canvas, 테두리 없음, UI_GUIDE '상자 안 상자 금지') */
export function UnreadableNote() {
  return (
    <div role="status" className="mt-3 flex max-w-130 flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-control bg-canvas px-4 py-3 max-md:grid">
      <p className="min-w-0 text-body text-ink-2">{UNREADABLE}</p>
      <Link href={CONNECT_CHECK} className={`${ds.button.secondary} no-underline`}>
        연결 확인
      </Link>
    </div>
  )
}

/** 읽은 적이 있는 상태에서 다시 읽기 실패: 그 아래 오류 상자. 저장 숫자에는 읽은 시각이 없어 "저장해 둔 그대로"라고 하고, 자료 없음 화면(빈 배열)에는 둘 숫자가 없어 그 문장을 뺀다 */
export function RereadAlert({
  code,
  readAt,
  hasNumbers,
  onRetry,
  disabled = false,
}: {
  code: ErrorCode
  readAt: number | null
  hasNumbers: boolean
  onRetry(): void
  /** 저장 숫자를 다시 읽는 동안 막는다(dashboard-ux AC-2701.8: 한쪽이 읽는 동안 다른 읽기를 시작하지 않는다) */
  disabled?: boolean
}) {
  const { what, fix } = errorInfo(code)
  const kept = readAt === null ? '아래 숫자는 저장해 둔 그대로예요.' : `아래 숫자는 ${timeText(readAt)}에 읽은 그대로예요.`
  return (
    <div role="alert" className="mt-3 flex max-w-130 items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body font-semibold text-negative">{what}</p>
        <p className="mt-0.5 text-body text-ink-2">{hasNumbers ? `${kept} ${fix}` : fix}</p>
        <p className="mt-1 text-caption text-ink-2">오류 번호 {code}</p>
        <div className="mt-3 flex flex-wrap gap-2 max-md:grid">
          <button type="button" className={ds.button.primary} disabled={disabled} onClick={onRetry}>
            다시 확인
          </button>
          <Link href={CONNECT_CHECK} className={`${ds.button.secondary} no-underline`}>
            연결 확인
          </Link>
        </div>
      </div>
    </div>
  )
}
