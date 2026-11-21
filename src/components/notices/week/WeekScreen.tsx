'use client'

import Link from 'next/link'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { addDays, compareYmd, isYmd, weekdayOf, weekStartOf } from '@/lib/analytics/dates'
import { dateText, dayText, sourcesText, weekPeriodText, ymdOf } from '@/lib/notices/view'
import { readWeek } from '@/lib/storage/notices'
import type { NoticeSummary, NoticeWeek, WeekItem } from '@/types/notices'
import { InfoIcon, LeftIcon, PrintIcon, RightIcon } from './icons'

// 고시·공지 주간 모음 /notices/week (specs/notices REQ-7421 · 기본값 15, design 10절, 시안 docs/mockups/notices ?s=weekly).
// 자료는 lib/storage/notices readWeek로만 읽는다. 주는 주소 ?w=<월요일>(쪽 파일이 week로 넘김)이고, 없거나 월요일 날짜가 아니거나
// 월요일이어도 그 주(월~일)를 그릴 수 없는 날짜(예: 9999-12-27 → 일요일이 10000년)면 가장 최근 모음이다(기본값 24).
// [지난주]·[다음 주]는 주소를 바꾸는 링크다 → 쪽 파일이 새 week로 다시 그리면 그 주를 읽는다. 가장 최근 주 = 모으기가 모음을 만드는
// 지난주 월요일(오늘 주 월요일 − 7일)이고 거기서 [다음 주]는 막힌다. [인쇄]는 window.print() — 앱 틀(위쪽 띠·탭 줄)은 AppShell이,
// 쪽 머리·작은 탭·주 옮기기 줄은 이 화면이 print:hidden으로 숨긴다(A4 한 장, 시안 @media print). 종이 여백(@page)은 이 화면이 붙어 있을 때만
// 쓰이게 부품 안 <style>로 둔다(서식 화면과 같은 방식, globals.css는 고치지 않는다, 기본값 24).
// 앱에는 링크 밑줄·목록 점을 지우는 초기화가 없다 → 링크마다 no-underline, 목록마다 list-none을 직접 준다(시안에 밑줄·점 없음)
// 관련 글 = related 참인 글. 관련 아님·관련 여부 모름(요약 전·실패)은 '그 밖의 글'에 제목만 적는다. 모든 글은 글자 노드로만 그린다(HTML 해석 없음)

type Props = {
  /** 내 병원 이름(문지기가 읽은 줄). 비면 ' · {병원 이름}'을 뺀다(기본값 15) */
  hospitalName: string
  /** 요청 때의 한국 날짜 'YYYY-MM-DD' */
  today: string
  /** 주소 ?w 글자. 월요일 날짜가 아니거나 그릴 수 없는 주면 가장 최근 모음 */
  week?: string
}

type Got = { key: string; value: NoticeWeek | null | 'failed' }

const SUBTAB = 'relative inline-flex h-10 items-center px-3 whitespace-nowrap no-underline'
// 인쇄 종이: A4 한 장, 시안 @media print의 @page 여백 14mm
const PRINT_PAGE = '@media print { @page { size: A4 portrait; margin: 14mm } }'
const SUMMARY_LINES: readonly [keyof Omit<NoticeSummary, 'related' | 'amends'>, string][] = [
  ['what', '무엇이 바뀌나'],
  ['when', '언제부터'],
  ['who', '누구 대상'],
  ['forUs', '우리 의원에는'],
]

const isMonday = (s: string | undefined): s is string => s !== undefined && isYmd(s) && weekdayOf(s) === 1
const weekHref = (monday: string) => `/notices/week?w=${monday}`

// 저장소는 날짜 칸이 비지 않았는지만 본다 → 모양이 틀린 날짜 하나로 화면 전체가 깨지지 않게 빈 글자로 그린다
function safeText(make: () => string): string {
  try {
    return make()
  } catch {
    return ''
  }
}

// 그릴 수 있는 주: 월요일이고 그 주 기간 글(월~일)을 만들 수 있다
const isWeek = (s: string | undefined): s is string => isMonday(s) && safeText(() => weekPeriodText(s)) !== ''

export function WeekScreen({ hospitalName, today, week }: Props) {
  const target = isWeek(week) ? week : 'latest'
  const [got, setGot] = useState<Got | null>(null)
  const [tries, setTries] = useState(0)

  // 주가 바뀌면 그 주를 읽는다. 떠난 주(늦게 온 앞 주)의 답은 버린다
  useEffect(() => {
    let live = true
    void readWeek(target).then((value) => {
      if (live) setGot({ key: target, value })
    })
    return () => {
      live = false
    }
  }, [target, tries])

  const retry = () => {
    setGot(null)
    setTries((n) => n + 1)
  }

  const value = got?.key === target ? got.value : undefined
  // 모으기가 모음을 만드는 가장 최근 주(collector와 같은 셈)
  const newest = addDays(weekStartOf(today), -7)
  const shown = value && value !== 'failed' ? value.weekStart : target === 'latest' ? newest : target

  return (
    <div>
      <style>{PRINT_PAGE}</style>
      <div className="print:hidden">
        <h1 className="text-heading-m font-semibold text-ink">고시·공지</h1>
        <p className="mt-1 text-body text-ink-2">심평원·보건복지부 새 글을 매일 아침 모아 AI가 요약해요.</p>
      </div>
      <nav aria-label="고시·공지" className="mt-4 flex gap-1 border-b border-line print:hidden">
        <Link href="/notices" className={`${SUBTAB} -ml-3 font-medium text-ink-2 hover:text-ink ${ds.focusRing}`}>
          글 목록
        </Link>
        <Link
          href="/notices/week"
          aria-current="page"
          className={`${SUBTAB} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent ${ds.focusRing}`}
        >
          주간 모음
        </Link>
      </nav>

      {value === 'failed' && (
        <div className="mt-5 grid max-w-220 gap-3">
          <ErrorCard code="E-NOTICE-READ" />
          <button type="button" onClick={retry} className={`${ds.button.secondary} justify-self-start`}>
            다시 읽기
          </button>
        </div>
      )}
      {value !== undefined && value !== 'failed' && (
        <>
          <WeekTools shown={shown} newest={newest} printable={value !== null} />
          {value === null ? (
            <p role="status" className={`${ds.panel} mt-4 max-w-220 px-8 py-12 text-center text-body text-ink-2`}>
              이번 주 모음은 월요일 아침에 나와요.
            </p>
          ) : (
            <WeekSheet week={value} hospitalName={hospitalName} />
          )}
        </>
      )}
    </div>
  )
}

// 주 옮기기 줄(시안 .wtool): [지난주] 기간 [다음 주] … [인쇄]. 인쇄 때 숨긴다
function WeekTools({ shown, newest, printable }: { shown: string; newest: string; printable: boolean }) {
  const canNext = compareYmd(shown, newest) < 0
  return (
    <div role="group" aria-label="주 옮기기" className="mt-4 flex max-w-220 flex-wrap items-center gap-x-3 gap-y-2 print:hidden">
      <Link href={weekHref(addDays(shown, -7))} className={`${ds.button.secondarySmall} no-underline`}>
        <LeftIcon />
        지난주
      </Link>
      <span className="text-body font-semibold whitespace-nowrap text-ink">{weekPeriodText(shown)}</span>
      {canNext ? (
        <Link href={weekHref(addDays(shown, 7))} className={`${ds.button.secondarySmall} no-underline`}>
          다음 주
          <RightIcon />
        </Link>
      ) : (
        <button type="button" disabled className={ds.button.secondarySmall}>
          다음 주
          <RightIcon />
        </button>
      )}
      <span className="flex-1" />
      {printable && (
        <button type="button" onClick={() => window.print()} className={ds.button.secondary}>
          <PrintIcon />
          인쇄
        </button>
      )}
    </div>
  )
}

// 모음 종이(시안 .sheet): 머리 → 꼭 알 것 3가지 → 글별 요약 → 그 밖의 글 → 주의. 인쇄 때는 테두리·안쪽 여백 없이 종이 한 장
function WeekSheet({ week, hospitalName }: { week: NoticeWeek; hospitalName: string }) {
  const related = week.items.filter((n) => n.related === true)
  const others = week.items.filter((n) => n.related !== true)
  const name = hospitalName.trim()
  const made = safeText(() => dateText(ymdOf(week.createdAt)))
  return (
    <article
      className={`${ds.panel} mt-4 grid max-w-220 gap-6 p-8 print:mt-0 print:max-w-none print:gap-4 print:border-0 print:p-0`}
    >
      <header className="grid gap-1 border-b-2 border-ink pb-4">
        <h2 className="text-title font-semibold text-ink">고시·공지 주간 모음</h2>
        <p className="text-small text-ink-2">
          <b className="font-semibold text-ink">{weekPeriodText(week.weekStart)}</b>
          {` · 새 글 ${week.items.length}건 · 정형외과 의원 관련 ${related.length}건`}
        </p>
        <p className="text-small text-muted">{`${made} 아침에 AI가 정리했어요${name ? ` · ${name}` : ''}`}</p>
      </header>

      {related.length > 0 && week.top3.length > 0 && (
        <Section title="이번 주 꼭 알 것 3가지">
          <ol className="grid list-none gap-2 print:gap-1.5">
            {week.top3.map((t, i) => (
              <li
                key={i}
                className="grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 gap-y-0.5 rounded-control bg-canvas px-4 py-3 print:border print:border-line-strong print:bg-surface print:px-3 print:py-2"
              >
                <span className="row-span-2 grid size-7 place-items-center rounded-full bg-ink text-body font-semibold text-surface print:border print:border-ink print:bg-surface print:text-ink">
                  {i + 1}
                </span>
                <b className="text-lead font-semibold whitespace-pre-wrap text-ink print:text-small">{t.head}</b>
                <p className="text-body whitespace-pre-wrap text-ink-2 print:text-caption">{t.body}</p>
              </li>
            ))}
          </ol>
        </Section>
      )}

      <Section
        title={
          <>
            글별 요약 <small className="text-small font-medium text-muted">{`정형외과 의원 관련 ${related.length}건`}</small>
          </>
        }
      >
        <ul className="list-none">
          {related.map((n) => (
            <EachItem key={n.id} n={n} />
          ))}
        </ul>
      </Section>

      <Section title={`그 밖의 글 ${others.length}건`}>
        <ul className="list-none columns-2 gap-x-6 text-small text-ink-2 print:text-caption">
          {others.map((n) => (
            <li key={n.id} className="break-inside-avoid py-1 print:py-px">
              <span className="mr-1.5 text-muted">{safeText(() => dayText(n.postedOn))}</span>
              <span className="whitespace-pre-wrap">{n.title}</span>
            </li>
          ))}
        </ul>
      </Section>

      <p className="flex items-start gap-1.5 text-caption text-muted">
        <InfoIcon />
        <span>AI가 만든 정리라 틀릴 수 있어요. 중요한 내용은 원문에서 꼭 확인해 주세요.</span>
      </p>
    </article>
  )
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="mb-2 text-lead font-semibold text-ink print:mb-1.5 print:text-body">
        {title}
      </h3>
      {children}
    </section>
  )
}

// 글별 요약의 글 하나(시안 .wlist li): 날짜·출처 → 제목 → 세 줄 + 우리 의원에는(빈 줄은 뺀다)
function EachItem({ n }: { n: WeekItem }) {
  const lines = n.summary ? SUMMARY_LINES.filter(([key]) => n.summary![key].trim() !== '') : []
  return (
    <li className="grid gap-0.5 border-b border-line py-3 last:border-b-0 print:py-1.5">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
        <span>{safeText(() => dateText(n.postedOn))}</span>
        <b className="font-medium text-ink-2">{sourcesText(n.posts)}</b>
      </span>
      <span className="text-body font-semibold whitespace-pre-wrap text-ink print:text-small">{n.title}</span>
      {lines.length > 0 && (
        <dl className="mt-0.5 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-small print:text-caption">
          {lines.map(([key, label]) => (
            <div key={key} className="contents">
              <dt className="text-muted">{label}</dt>
              <dd className={`whitespace-pre-wrap ${key === 'forUs' ? 'font-medium text-ink' : 'text-ink-2'}`}>{n.summary![key]}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  )
}
