import Link from 'next/link'
import { ds } from '@/components/ui/classes'
import { mustSeeText } from '@/lib/notices/keywords'
import { attachmentsOf, dateText, numberSlot, sourcesText } from '@/lib/notices/view'
import type { NoticeView } from '@/types/notices'
import { FlagIcon, StarIcon } from './icons'

// 글 목록 한 줄(specs/notices AC-7419.2·AC-7419.3·AC-7424.10, 시안 .item). 줄을 누르면 /notices?id=<id>로 글을 연다.
// 제목·요약은 바깥 글과 AI 글이라 글자 노드로만 그린다(HTML로 해석하지 않음).
// 줄 링크는 밑줄 없이(no-underline) ink로 두고 안의 글마다 시안 색을 준다 — 앱에는 a 밑줄·파랑을 지우는 바탕 규칙이 없다(시안 a { color: inherit; text-decoration: none })

const WAIT_LINE = '요약을 만드는 중이에요.'
const FAILED_LINE = '요약을 만들지 못했어요. 원문에서 확인해 주세요.' // 기본값 6

// 꼭 볼 글 칩: 진한 파랑 · 깃발 아이콘(design 15절). 칩 모양은 ds.chip과 같고 색·굵기만 다르다
const MUST_CHIP =
  'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border border-transparent bg-accent-strong px-1.5 text-caption font-semibold text-surface'

type Chip = { text: string; className: string; flag?: boolean }

// 칩 차례(시안 chips): 꼭 볼 글 → 요약 만드는 중 → 정형외과 의원 관련 → 점검 규칙 확인 필요·확인함 → 붙임 파일 {n}개
function chipsOf(n: NoticeView): Chip[] {
  const chips: Chip[] = []
  const must = mustSeeText(n.keywords, 2)
  if (must) chips.push({ text: must, className: MUST_CHIP, flag: true })
  if (n.summary === null && n.state !== 'failed') chips.push({ text: '요약 만드는 중', className: ds.chip.neutral })
  if (n.related === true) chips.push({ text: '정형외과 의원 관련', className: ds.chip.accent })
  if (n.ruleHits.length > 0) {
    chips.push(n.mark.rulesCheckedAt ? { text: '점검 규칙 확인함', className: ds.chip.neutral } : { text: '점검 규칙 확인 필요', className: ds.chip.warning })
  }
  const files = attachmentsOf(n.posts).length
  if (files > 0) chips.push({ text: `붙임 파일 ${files}개`, className: ds.chip.neutral })
  return chips
}

// '무엇이 바뀌나' 한 줄. 요약 전이면 만드는 중, 3번 실패면 기본값 6
function lineOf(n: NoticeView): { text: string; waiting: boolean } {
  if (n.summary) return { text: n.summary.what, waiting: false }
  return { text: n.state === 'failed' ? FAILED_LINE : WAIT_LINE, waiting: true }
}

// 날짜 글자가 틀린 줄이 와도 화면 전체가 멈추지 않게 빈 글자로 둔다
function safeText(make: () => string): string {
  try {
    return make()
  } catch {
    return ''
  }
}

export function NoticeRow({ n, onStar }: { n: NoticeView; onStar: (id: string, starred: boolean) => void }) {
  const starred = n.mark.starred
  const line = lineOf(n)
  const slot = numberSlot(n)
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_44px] items-start border-b border-line transition hover:bg-canvas">
      <Link
        href={`/notices?id=${encodeURIComponent(n.id)}`}
        prefetch={false}
        className={`grid min-w-0 grid-cols-[120px_minmax(0,1fr)] gap-x-3 py-3.5 pl-2 text-ink no-underline ${ds.focusRing}`}
      >
        <span className="whitespace-nowrap text-small leading-6 text-muted">{safeText(() => dateText(n.postedOn))}</span>
        <span className="relative grid min-w-0 gap-1">
          <span data-testid="notice-title" className={n.unread ? 'block text-lead font-semibold text-ink' : 'block text-lead text-ink'}>
            {n.unread && <span data-testid="unread-dot" aria-hidden="true" className="absolute top-2 -left-3.5 size-2 rounded-full bg-accent" />}
            {n.unread && <span className="sr-only">안 읽음 </span>}
            {n.title}
          </span>
          <span className={line.waiting ? 'block truncate text-small text-muted' : 'block truncate text-small text-ink-2'}>{line.text}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
            <span className="font-medium text-ink-2">{sourcesText(n.posts)}</span>
            {slot && <span>{slot}</span>}
            {chipsOf(n).map((chip) => (
              <span key={chip.text} data-testid="notice-chip" className={chip.className}>
                {chip.flag && <FlagIcon />}
                {chip.text}
              </span>
            ))}
          </span>
        </span>
      </Link>
      <button
        type="button"
        aria-pressed={starred}
        aria-label={starred ? '별표 빼기' : '별표 하기'}
        onClick={() => onStar(n.id, !starred)}
        className={`grid h-13 cursor-pointer place-items-center rounded-control transition hover:text-warning ${starred ? 'text-warning' : 'text-faint'} ${ds.focusRing}`}
      >
        <StarIcon on={starred} />
      </button>
    </li>
  )
}
