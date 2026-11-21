'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { mustSeeText } from '@/lib/notices/keywords'
import { numberSlot, sourcesText } from '@/lib/notices/view'
import { markRead, openNotice, setStar } from '@/lib/storage/notices'
import type { NoticeView } from '@/types/notices'
import { AskBox } from './AskBox'
import { FlagIcon, LeftIcon, StarIcon } from './icons'
import { appendAnswer, MemoBox } from './MemoBox'
import { OriginBox } from './OriginBox'
import { safeDateText } from './parts'
import { RuleBox } from './RuleBox'
import { SummaryBox } from './SummaryBox'

// 글 화면 `/notices?id=` (specs/notices REQ-7420 · AC-7424.11, design 10절, 승인 시안 ?s=detail·detail-mohw).
// 쪽 파일이 id를 넘긴다. openNotice로 글 하나를 읽고, 읽으면 markRead로 읽음을 적는다(저장소가 notices:changed를 알린다).
// PC 배치 하나: 왼쪽 칸 규칙 상자 → 요약 → AI에게 묻기, 오른쪽 칸 메모 → 올라온 곳. 폰 전용 모양은 없다(2026-11-21 사용자 지시).
// 모든 글(제목·요약·답·메모)은 글자 노드로만 그린다. 글이 없거나 읽기 실패면 E-NOTICE-READ 상자와 [다시 읽기]

const BACK_TO = '/notices'

// '꼭 볼 글' 칩(design 15절): 진한 파랑·흰 글자·깃발. 글 화면은 모든 낱말이라 길면 줄을 바꾼다
const mustChip =
  'inline-flex min-h-5 items-center gap-1 rounded-control border border-transparent bg-accent-strong px-1.5 text-caption font-semibold text-surface'
// 별 단추: 눌림(별표함)은 warning 색
const starButton = `${ds.button.secondarySmall} aria-pressed:border-warning aria-pressed:bg-warning-soft aria-pressed:text-warning`

function BackLink() {
  return (
    <Link href={BACK_TO} className={`inline-flex h-8 items-center gap-1 rounded-control text-body font-medium text-ink-2 hover:text-ink ${ds.focusRing}`}>
      <LeftIcon />
      글 목록으로
    </Link>
  )
}

function Opened({ notice }: { notice: NoticeView }) {
  const [starred, setStarred] = useState(notice.mark.starred)
  const [starFailed, setStarFailed] = useState(false)
  const [memo, setMemo] = useState(notice.mark.memo)
  const starBusy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const toggleStar = async () => {
    if (starBusy.current) return
    starBusy.current = true
    setStarFailed(false)
    const next = !starred
    const ok = await setStar(notice.id, next)
    starBusy.current = false
    if (!alive.current) return
    if (ok) setStarred(next)
    else setStarFailed(true)
  }

  const number = numberSlot(notice)
  const must = mustSeeText(notice.keywords, Infinity)
  const related = notice.related === true

  return (
    <>
      <BackLink />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_340px] items-start gap-x-8 gap-y-6">
        <article className="grid min-w-0 gap-4">
          <header className="grid gap-2 border-b border-line-strong pb-4">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-muted">
              <span className="font-semibold text-ink-2">{sourcesText(notice.posts)}</span>
              <span>{`${safeDateText(notice.postedOn)} 올라옴`}</span>
            </p>
            <h1 className="whitespace-pre-wrap break-words text-title font-semibold text-ink">{notice.title}</h1>
            {(number !== '' || must !== '' || related) && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small text-ink-2">
                {number !== '' && <span>{number}</span>}
                {must !== '' && (
                  <span className={mustChip}>
                    <FlagIcon />
                    {must}
                  </span>
                )}
                {related && <span className={ds.chip.accent}>정형외과 의원 관련</span>}
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-2">
              <button type="button" aria-pressed={starred} className={starButton} onClick={() => void toggleStar()}>
                <StarIcon on={starred} />
                {starred ? '별표함' : '별표'}
              </button>
            </div>
            {starFailed && <ErrorCard code="E-NOTICE-SAVE" />}
          </header>
          {notice.ruleHits.length > 0 && <RuleBox noticeId={notice.id} rules={notice.ruleHits} checkedAt={notice.mark.rulesCheckedAt} />}
          <SummaryBox notice={notice} />
          <AskBox noticeId={notice.id} readMode={notice.readMode} onToMemo={(answer) => setMemo((now) => appendAnswer(now, answer))} />
        </article>
        <aside className="grid min-w-0 gap-4">
          <MemoBox noticeId={notice.id} value={memo} onChange={setMemo} savedAt={notice.mark.memoAt} />
          <OriginBox posts={notice.posts} />
        </aside>
      </div>
    </>
  )
}

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; notice: NoticeView }

export function NoticeDetail({ id }: { id: string }) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    openNotice(id)
      .catch(() => 'failed' as const)
      .then((found) => {
        if (!alive) return
        if (found === null || found === 'failed') {
          setLoaded({ kind: 'failed' })
          return
        }
        setLoaded({ kind: 'ready', notice: found })
        void markRead(found.id)
      })
    return () => {
      alive = false
    }
  }, [id, attempt])

  if (loaded.kind === 'ready') return <Opened key={`${loaded.notice.id}-${attempt}`} notice={loaded.notice} />

  if (loaded.kind === 'failed') {
    return (
      <>
        <BackLink />
        <div className="mt-2 grid justify-items-start gap-3">
          <ErrorCard code="E-NOTICE-READ" />
          <button
            type="button"
            className={ds.button.secondarySmall}
            onClick={() => {
              setLoaded({ kind: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            다시 읽기
          </button>
        </div>
      </>
    )
  }

  return (
    <>
      <BackLink />
      <div aria-busy="true" className="mt-2" />
    </>
  )
}
