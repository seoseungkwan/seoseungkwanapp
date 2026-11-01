import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { NOTE } from '@/components/dashboard/briefing/layout'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'

// 대시보드 큰 문장 자리의 읽는 중·실패 블록과 읽은 시각 줄 (bit-dashboard AC-601.2~601.7·AC-601.16·AC-601.17, design.md '### 화면',
// 시안 docs/mockups/bit-dashboard/gen.py left_reading·left_fail·left_busy·read_line·left_reread_fail). 오류 문구·번호는 lib/errors.ts에서만 가져온다.
// 움직이는 것은 막대와 도는 표시 둘뿐이고 움직임은 globals.css의 .bit-read-bar·.bit-read-spin이 맡는다(AC-601.17, UI_GUIDE '움직임 › 비트 읽는 표시'). Tailwind animate-*는 쓰지 않는다

export const BIT_IN_USE: ErrorCode = 'E-BIT-IN-USE'

const H1 = 'mt-3 max-w-120 text-display-m font-semibold text-balance text-ink max-md:mt-2 max-md:text-heading-m'
const LEAD = 'mt-4 max-w-128 text-lead text-ink-2'
const CONNECT_CHECK = '/claim/setup?next=dashboard'
// 오류 번호가 없는 안내라 lib/errors.ts 틀(무엇이·고치기·번호)에 맞지 않아 여기 둔다(AC-601.16)
const UNREADABLE = '이 PC에서 비트를 읽을 수 없어요. 연결을 확인해 주세요.'

// 읽은 시각 "오후 3:42": 그 PC 시간대·언어와 상관없다(위쪽 띠 시계 kstNow와 같은 방식). 언어 자료가 모자라면 ko-KR은 "PM"을 준다
const KOREA_TIME = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function timeText(at: number): string {
  const parts = Object.fromEntries(KOREA_TIME.formatToParts(at).map((p) => [p.type, p.value]))
  const hour = Number(parts.hour)
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${parts.minute}`
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
          // 보조 큰 단추: ds에 이름이 따로 없어 같은 값(보조 색 × 큰 크기)인 googleLarge 묶음을 쓴다(NotFoundScreen과 같다)
          <Link href={CONNECT_CHECK} className={`${ds.button.googleLarge} no-underline`}>
            연결 확인
          </Link>
        )}
      </div>
      <Safe />
    </div>
  )
}

/** 보고 문장 아래 읽은 시각·[다시 읽기]. 읽은 적이 없으면(저장 숫자) 시각을 지어내지 않고, 읽는 중도 아니면 줄이 없다. 다시 읽기 실패면 단추를 뺀다 */
export function ReadLine({ readAt, reading, failed, onReread }: { readAt: number | null; reading: boolean; failed: boolean; onReread(): void }) {
  if (readAt === null && !reading) return null
  return (
    <div className="mt-4 flex max-w-130 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line pt-3">
      {readAt !== null && (
        <p className="flex items-center gap-1.5 text-small text-ink-2">
          <Icon name="clock" size={14} className="shrink-0 text-muted" />
          <span>{`오늘 ${timeText(readAt)}에 읽었어요`}</span>
        </p>
      )}
      {!failed && (
        <button type="button" className={ds.button.secondarySmall} disabled={reading} onClick={onReread}>
          {reading && <span aria-hidden="true" className="bit-read-spin" />}
          {reading ? '다시 읽는 중' : '다시 읽기'}
        </button>
      )}
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

/** 숫자가 있는 상태에서 다시 읽기 실패: 그 아래 오류 상자. 저장 숫자에는 읽은 시각이 없어 "저장해 둔 그대로"라고 한다 */
export function RereadAlert({ code, readAt, onRetry }: { code: ErrorCode; readAt: number | null; onRetry(): void }) {
  const { what, fix } = errorInfo(code)
  const kept = readAt === null ? '아래 숫자는 저장해 둔 그대로예요.' : `아래 숫자는 ${timeText(readAt)}에 읽은 그대로예요.`
  return (
    <div role="alert" className="mt-3 flex max-w-130 items-start gap-2 rounded-control bg-negative-soft px-4 py-3">
      <Icon name="stop" className="mt-0.5 shrink-0 text-negative" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="text-body font-semibold text-negative">{what}</p>
        <p className="mt-0.5 text-body text-ink-2">{`${kept} ${fix}`}</p>
        <p className="mt-1 text-caption text-ink-2">오류 번호 {code}</p>
        <div className="mt-3 flex flex-wrap gap-2 max-md:grid">
          <button type="button" className={ds.button.primary} onClick={onRetry}>
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
