'use client'

import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { useDesk } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import type { BitDiffer } from '@/lib/worklog/bitFill'
import { cellKindOf, cellShownText } from '@/lib/worklog/cellText'
import { savedTimeText } from '@/lib/worklog/days'
import { WORKLOG_DEFAULT_NAMES, WORKLOG_LABELS, WORKLOG_NAME_OF, type WorklogDay, type WorklogNumberKey, type WorklogWonKey } from '@/types/worklog'
import type { BitFillStatus } from './useBitFill'
import { BIT_LEGEND_ID, BitMark } from './WorklogSheet'

// 업무일지 비트 안내 (specs/worklog REQ-017 AC-017.2~017.5·017.9, design.md 20-5절, 승인 시안 docs/mockups/worklog/bitfill.html v2). 그리기만 한다.
// 날짜 줄 아래 한 줄(BitNotice)과 양식 아래 설명 줄·'다름' 목록(BitSheetNotes). 오류 카드가 아니라 안내 한 줄이고, 손으로 적기를 막지 않는다.
// 모두 인쇄에서 숨는다(AC-011.3 "양식만 나온다", 시안 상황 6). 양식 밖이라 앱 규칙(ds·토큰)이다
// 데스크 계정은 비트 PC 연결 화면(/claim/setup)을 못 연다 → '연결하러 가기' 링크만 그리지 않는다(desk-feedback AC-6306.4)

export { BIT_LEGEND_ID }

const SETUP_HREF = '/claim/setup'
const DIFFERS_TITLE_ID = 'worklog-bit-differs'
const COMMAS = new Intl.NumberFormat('ko-KR')

// 상태마다 왼쪽 글(design.md 20-5절 표). ready는 불러온 시각을 넣는다
const NOTICE_TEXT: Record<Exclude<BitFillStatus, 'off' | 'ready'>, string> = {
  'not-connected': '비트 PC가 연결되지 않아 직접 적어요',
  'setup-needed': '비트 PC 연결을 마치면 숫자를 저절로 채워요',
  reading: '비트 숫자를 불러오는 중이에요',
  unconfirmed: '이 날은 비트 금액을 채우지 못했어요. 금액은 직접 적어 주세요', // 금액 칸을 하나도 못 채운 날(bit-total AC-6910.2)
  failed: '비트 숫자를 불러오지 못했어요. 직접 적어도 돼요',
}
// 비트를 읽을 수 있는 상태는 오른쪽에 [지금 불러오기]가 있다(읽는 중에는 눌리지 않는다)
const WITH_BUTTON: readonly BitFillStatus[] = ['reading', 'ready', 'unconfirmed', 'failed']

function noticeText(status: Exclude<BitFillStatus, 'off'>, lastReadAt: Date | null): string {
  if (status !== 'ready') return NOTICE_TEXT[status]
  return lastReadAt ? `비트 숫자를 ${savedTimeText(lastReadAt)}에 불러왔어요` : '비트 숫자를 불러왔어요'
}

function NoticeText({ text, setup, className }: { text: string; setup: boolean; className?: string }) {
  return (
    <p className={`flex min-w-0 items-start gap-1.5 text-small text-ink-2${className ? ` ${className}` : ''}`}>
      <Icon name="info" className="mt-0.5 shrink-0 text-muted" />
      <span>
        {text}
        {setup && (
          <Link href={SETUP_HREF} className={`ml-1 rounded-control font-medium text-accent underline-offset-3 hover:underline ${ds.focusRing}`}>
            연결하러 가기
          </Link>
        )}
      </span>
    </p>
  )
}

/** 날짜 줄 아래 한 줄. 터치 기기(off)면 그리지 않는다(휴대폰은 툴바의 "휴대폰에서는 보기만 할 수 있어요"만, AC-017.5) */
export function BitNotice({ status, lastReadAt, onReload }: { status: BitFillStatus; lastReadAt: Date | null; onReload(): void }) {
  const desk = useDesk()
  if (status === 'off') return null
  const text = noticeText(status, lastReadAt)
  const setup = status === 'setup-needed' && !desk
  if (!WITH_BUTTON.includes(status)) return <NoticeText text={text} setup={setup} className="print:hidden" />
  const reading = status === 'reading'
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 print:hidden">
      <NoticeText text={text} setup={false} />
      <button type="button" className={ds.button.secondarySmall} disabled={reading} onClick={onReload}>
        <Icon name="reload" />
        {reading ? '불러오는 중' : '지금 불러오기'}
      </button>
    </div>
  )
}

// 칸 이름은 그날 항목 이름(비면 기본 이름). 신환·재진은 이름 칸이 없다
function dayName(day: WorklogDay, key: WorklogNumberKey): string {
  if (key === 'newPatients' || key === 'returnPatients') return WORKLOG_LABELS[key]
  const nameKey = WORKLOG_NAME_OF[key as WorklogWonKey]
  return day[nameKey].trim() || WORKLOG_DEFAULT_NAMES[nameKey]
}

// 적은 값은 칸의 화면 글자. 0처럼 칸에 빈 글자로 보이는 숫자는 친 글자를 보인다
const typedText = (key: WorklogNumberKey, typed: string) => cellShownText(cellKindOf(key), typed, false) || typed.trim()
// 비트 값: 신환·재진은 칸처럼 숫자만, 금액은 쉼표와 원(0은 0원)
const bitText = (key: WorklogNumberKey, bit: number) => (cellKindOf(key) === 'count' ? String(bit) : `${COMMAS.format(bit)}원`)

/** 양식 아래: 비트 칸 설명 줄 + 비트 숫자와 다른 칸 목록([비트 숫자로 바꾸기]는 사람이 누를 때만 그 칸을 바꾼다) */
export function BitSheetNotes({
  day,
  bitFields,
  differs,
  onTake,
}: {
  day: WorklogDay
  bitFields: readonly WorklogNumberKey[]
  differs: readonly BitDiffer[]
  onTake(key: WorklogNumberKey): void
}) {
  if (bitFields.length === 0 && differs.length === 0) return null
  return (
    <div className="flex flex-col gap-3 print:hidden">
      {bitFields.length > 0 && (
        <p id={BIT_LEGEND_ID} className="-mt-0.5 flex items-center gap-2 text-small text-ink-2">
          <BitMark />
          표시한 칸은 비트에서 불러온 숫자예요
        </p>
      )}
      {differs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p id={DIFFERS_TITLE_ID} className="text-small font-semibold text-ink">
            비트 숫자와 다른 칸이 있어요
          </p>
          <ul aria-labelledby={DIFFERS_TITLE_ID} className="rounded-control border border-line bg-surface">
            {differs.map(({ key, typed, bit }) => {
              const name = dayName(day, key)
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line px-3 py-2 text-small text-ink-2 tabular-nums first:border-t-0"
                >
                  <span className="min-w-0 wrap-anywhere">
                    <span className="font-semibold text-ink">{name}</span>
                    {` · 적은 값 ${typedText(key, typed)} · 비트 ${bitText(key, bit)}`}
                  </span>
                  <button type="button" aria-label={`${name} 칸을 비트 숫자로 바꾸기`} className={ds.button.secondarySmall} onClick={() => onTake(key)}>
                    비트 숫자로 바꾸기
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
