'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { monthText, SOURCES, sourceName } from '@/lib/notices/view'
import { fillProgress, listNotices, NOTICES_CHANGED, setStar, sourceStates } from '@/lib/storage/notices'
import type { FillProgress, NoticeFilter, NoticeSource, NoticeView, SourceView } from '@/types/notices'
import { CheckIcon, SearchIcon, StarIcon } from './icons'
import { NoticeRow } from './NoticeRow'
import { BackfillBand, CheckedLine, filling, StoppedBand } from './SourceBands'

// 고시·공지 글 목록 /notices (specs/notices REQ-7419 · AC-7424.10, design 10절·15절, 시안 docs/mockups/notices ?s=list).
// 자료는 lib/storage/notices로만 읽고 쓴다. 받은 줄을 related로 다시 거르지 않는다 — 꼭 볼 글(내 낱말)은 DB가 관련 글만 보기에 넣는다.
// 내 낱말 단추·칸은 쪽 파일이 keywords로 넣는다(이 폴더는 components/notices/keywords를 import하지 않는다). 그 칸은 고르기 첫 줄(flex-wrap)의
// 바로 아래로 펼쳐지므로 감싸지 않고 '별표만' 바로 뒤에 그대로 둔다. 모든 글은 글자 노드로만 그린다(HTML 해석 없음)

type Choice = Omit<NoticeFilter, 'offset'>
// read: 이 쪽을 만든 읽기 번호, choice: 이 쪽의 고르기. 지난 글 더 보기는 이 둘에 묶는다(다시 읽는 동안 남은 앞 쪽의 줄 수로 새 고르기를 읽지 않게)
type Loaded = { total: number; unread: number; rows: NoticeView[]; read: number; choice: Choice }

const SEARCH_MAX = 50 // 기본값 16: 찾는 말은 앞뒤 공백을 뗀 1~50자
const FIRST_CHOICE: Choice = { related: true, sources: [...SOURCES], starred: false, q: '' }

const countText = (n: number) => n.toLocaleString('ko-KR')
const monthKey = (n: NoticeView) => n.postedOn.slice(0, 7)

function monthHead(n: NoticeView): string {
  try {
    return monthText(n.postedOn)
  } catch {
    return ''
  }
}

// 관련 글만·전체 묶음(시안 .seg): 묶음 36px(단추 34px + 1px 테두리)·4px·1px line-strong, 단추 좌우 14px·small. 눌린 것은 ds.segment.on 그대로.
// ds.segment.group·button은 쓰지 않는다 — 그 둘의 휴대폰 전체 폭 칸 나눔(max-md:)이 PC 배치 하나 규칙(2026-11-21)에 어긋난다
const SEGMENT_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface'
const SEGMENT_BUTTON =
  'h-8.5 cursor-pointer border-l border-line-strong px-3.5 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
// 고르기 줄 모양(시안 .tog·.src·.search). 눌린 별표만은 노랑, 켜진 출처는 옅은 파랑
const TOGGLE = `inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-small transition ${ds.focusRing}`
const TOGGLE_ON = 'border-warning bg-warning-soft font-semibold text-warning'
const TOGGLE_OFF = 'border-line-strong bg-surface font-medium text-ink-2 hover:bg-canvas'
const SOURCE_CHIP = `inline-flex h-7.5 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border px-2.5 text-small transition ${ds.focusRing}`
const SOURCE_ON = 'border-transparent bg-accent-soft font-semibold text-accent-strong'
const SOURCE_OFF = 'border-line-strong bg-surface font-medium text-ink-2 hover:bg-canvas'
const SEARCH_INPUT =
  'h-9 w-full min-w-0 rounded-control border border-line-strong bg-surface pr-3 pl-9 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden'
// 시안 .btn.outline(기본 크기): 테두리·글자 accent, 600
const OUTLINE_BUTTON = `inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-accent bg-surface px-4 text-body font-semibold text-accent transition hover:bg-accent-soft ${ds.focusRing}`
// 작은 탭(시안 .subtabs a). 앱에는 a 밑줄을 지우는 바탕 규칙이 없어 링크마다 no-underline을 준다(목록은 list-none)
const SUBTAB = 'relative inline-flex h-10 items-center px-3 whitespace-nowrap no-underline'

export function NoticesScreen({ keywords }: { keywords?: ReactNode }) {
  const [choice, setChoice] = useState<Choice>(FIRST_CHOICE)
  const [text, setText] = useState('')
  const [page, setPage] = useState<Loaded | 'failed' | null>(null)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState<'idle' | 'busy' | 'failed'>('idle')
  const [saveFailed, setSaveFailed] = useState(false)
  const [sources, setSources] = useState<SourceView[] | 'failed' | null>(null)
  const [fill, setFill] = useState<FillProgress | 'failed' | null>(null)
  // 읽기마다 번호를 올려, 늦게 온 앞 고르기의 답(과 떠난 뒤의 답)은 버린다
  const seq = useRef(0)
  const choiceRef = useRef(choice)

  const load = useCallback(async (c: Choice) => {
    const mine = ++seq.current
    setBusy(true)
    setMore('idle')
    setSaveFailed(false)
    const res = await listNotices({ ...c, sources: [...c.sources], offset: 0 })
    if (mine !== seq.current) return
    setBusy(false)
    setPage(res === 'failed' ? 'failed' : { total: res.total, unread: res.unread, rows: res.rows, read: mine, choice: c })
  }, [])

  useEffect(() => {
    choiceRef.current = choice
    void load(choice)
  }, [choice, load])

  // 낱말을 더하거나 빼면(그리고 읽음을 적으면) 저장소가 알린다 → 지금 고르기로 다시 읽는다(AC-7424.10)
  useEffect(() => {
    const reload = () => void load(choiceRef.current)
    window.addEventListener(NOTICES_CHANGED, reload)
    return () => window.removeEventListener(NOTICES_CHANGED, reload)
  }, [load])

  useEffect(() => {
    let live = true
    void sourceStates().then((r) => live && setSources(r))
    void fillProgress().then((r) => live && setFill(r))
    return () => {
      live = false
      seq.current += 1
    }
  }, [])

  // 바뀐 값이 없으면 같은 고르기 그대로(다시 읽지 않는다)
  const pick = (next: Partial<Choice>) =>
    setChoice((c) => ((Object.keys(next) as (keyof Choice)[]).every((k) => c[k] === next[k]) ? c : { ...c, ...next }))

  // 출처는 여러 개 고르고, 마지막 하나는 끌 수 없다. 차례는 출처 칩 차례
  const toggleSource = (source: NoticeSource) =>
    setChoice((c) => {
      const on = c.sources.includes(source)
      if (on && c.sources.length === 1) return c
      const picked = new Set(on ? c.sources.filter((s) => s !== source) : [...c.sources, source])
      return { ...c, sources: SOURCES.filter((s) => picked.has(s)) }
    })

  const search = (e: FormEvent) => {
    e.preventDefault()
    pick({ q: text.trim() })
  }

  const clearSearch = () => {
    setText('')
    pick({ q: '' })
  }

  const starIn = (id: string, starred: boolean) =>
    setPage((p) => (p && p !== 'failed' ? { ...p, rows: p.rows.map((r) => (r.id === id ? { ...r, mark: { ...r.mark, starred } } : r)) } : p))

  // 별은 바로 바꾸고 저장한다. 실패면 되돌리고 E-NOTICE-SAVE(기본값 12)
  const toggleStar = async (id: string, starred: boolean) => {
    setSaveFailed(false)
    starIn(id, starred)
    if (!(await setStar(id, starred))) {
      starIn(id, !starred)
      setSaveFailed(true)
    }
  }

  // 다음 50개는 화면의 쪽(그 쪽의 고르기 · 줄 수)에 묶는다. 그 뒤 다시 읽기가 시작됐으면(고르기를 바꿈 · notices:changed)
  // 그 쪽은 곧 바뀌므로 누름을 무시하고, 늦게 온 답도 버린다. 번호는 ref라 그리기 전 누름에서도 바로 맞다
  const loadMore = async () => {
    if (page === null || page === 'failed' || more === 'busy') return
    const mine = page.read
    if (mine !== seq.current) return
    const offset = page.rows.length
    setMore('busy')
    const res = await listNotices({ ...page.choice, sources: [...page.choice.sources], offset })
    if (mine !== seq.current) return
    if (res === 'failed') {
      setMore('failed')
      return
    }
    setMore('idle')
    setPage((p) => {
      if (!p || p === 'failed' || p.read !== mine) return p
      const seen = new Set(p.rows.map((r) => r.id))
      const rows = [...p.rows, ...res.rows.filter((r) => !seen.has(r.id))]
      // 더 받은 줄이 없으면 끝으로 본다(단추가 남지 않게)
      return { ...p, total: res.rows.length === 0 ? rows.length : res.total, unread: res.unread, rows }
    })
  }

  const now = new Date()
  const sourceRows = Array.isArray(sources) ? sources : null

  return (
    <div>
      <div>
        <h1 className="text-heading-m font-semibold text-ink">고시·공지</h1>
        <p className="mt-1 text-body text-ink-2">심평원·보건복지부 새 글을 매일 아침 모아 AI가 요약해요.</p>
      </div>
      <nav aria-label="고시·공지" className="mt-4 flex gap-1 border-b border-line">
        <Link
          href="/notices"
          aria-current="page"
          className={`${SUBTAB} -ml-3 font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent ${ds.focusRing}`}
        >
          글 목록
        </Link>
        <Link href="/notices/week" className={`${SUBTAB} font-medium text-ink-2 hover:text-ink ${ds.focusRing}`}>
          주간 모음
        </Link>
      </nav>

      <div className="mt-4 grid gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="보기" className={SEGMENT_GROUP}>
            <button
              type="button"
              aria-pressed={choice.related}
              onClick={() => pick({ related: true })}
              className={`${SEGMENT_BUTTON} ${choice.related ? ds.segment.on : ds.segment.off}`}
            >
              관련 글만
            </button>
            <button
              type="button"
              aria-pressed={!choice.related}
              onClick={() => pick({ related: false })}
              className={`${SEGMENT_BUTTON} ${choice.related ? ds.segment.off : ds.segment.on}`}
            >
              전체
            </button>
          </div>
          <button
            type="button"
            aria-pressed={choice.starred}
            onClick={() => pick({ starred: !choice.starred })}
            className={`${TOGGLE} ${choice.starred ? TOGGLE_ON : TOGGLE_OFF}`}
          >
            <StarIcon on={choice.starred} />
            별표만
          </button>
          {keywords}
          <form role="search" onSubmit={search} className="ml-auto flex max-w-115 min-w-0 flex-[1_1_360px] gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">글 찾기</span>
              <SearchIcon className="pointer-events-none absolute top-2.5 left-3 text-muted" />
              <input
                className={SEARCH_INPUT}
                value={text}
                maxLength={SEARCH_MAX}
                placeholder="제목·본문·붙임 파일 글자로 찾기"
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <button type="submit" className={ds.button.secondary}>
              찾기
            </button>
          </form>
        </div>
        <div role="group" aria-label="출처" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="mr-1 text-small font-semibold text-ink-2">출처</span>
          {SOURCES.map((source) => {
            const on = choice.sources.includes(source)
            return (
              <button
                key={source}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSource(source)}
                className={`${SOURCE_CHIP} ${on ? SOURCE_ON : SOURCE_OFF}`}
              >
                {on && <CheckIcon className="shrink-0" />}
                {sourceName(source)}
              </button>
            )
          })}
        </div>
        {sourceRows && <CheckedLine rows={sourceRows} now={now} />}
      </div>

      {sourceRows?.filter((row) => row.state === 'stopped').map((row) => <StoppedBand key={row.source} row={row} rows={sourceRows} now={now} />)}
      {fill && fill !== 'failed' && filling(sourceRows, fill) && <BackfillBand fill={fill} />}
      {saveFailed && (
        <div className="mt-4">
          <ErrorCard code="E-NOTICE-SAVE" />
        </div>
      )}

      {page === 'failed' && (
        <div className="mt-5 grid gap-3">
          <ErrorCard code="E-NOTICE-READ" />
          <button
            type="button"
            aria-busy={busy}
            onClick={() => !busy && void load(choice)}
            className={`${ds.button.secondary} justify-self-start`}
          >
            다시 읽기
          </button>
        </div>
      )}
      {page && page !== 'failed' && (
        <div aria-busy={busy}>
          <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-strong pb-2">
            <p className="text-small text-ink-2">
              {choice.q !== '' ? (
                <>
                  찾은 글 <b className="font-semibold text-ink">{`${countText(page.total)}건`}</b>
                </>
              ) : (
                <>
                  {choice.related ? '관련 글 ' : '전체 '}
                  <b className="font-semibold text-ink">{`${countText(page.total)}건`}</b>
                  {' · 안 읽은 글 '}
                  <b className="font-semibold text-ink">{`${countText(page.unread)}건`}</b>
                </>
              )}
            </p>
            {choice.q === '' && (
              <p className="max-w-[52ch] text-caption text-muted">
                {choice.related ? '관련 여부는 AI가 정해요. 빠진 글이 걱정되면 [전체]로 보세요.' : '정형외과 의원과 관련 적은 글도 함께 보여요.'}
              </p>
            )}
          </div>
          <ListBody
            page={page}
            choice={choice}
            more={busy ? 'busy' : more}
            onStar={(id, starred) => void toggleStar(id, starred)}
            onMore={() => void loadMore()}
            onAll={() => pick({ related: false })}
            onClear={clearSearch}
          />
        </div>
      )}
    </div>
  )
}

type BodyProps = {
  page: Loaded
  choice: Choice
  more: 'idle' | 'busy' | 'failed'
  onStar: (id: string, starred: boolean) => void
  onMore: () => void
  onAll: () => void
  onClear: () => void
}

const EMPTY_BOX = 'grid justify-items-center gap-2 border-b border-line px-4 py-10 text-center'

function ListBody({ page, choice, more, onStar, onMore, onAll, onClear }: BodyProps) {
  const searching = choice.q !== ''
  if (page.rows.length === 0 && searching) {
    return (
      <div role="status" className={EMPTY_BOX}>
        <b className="text-lead font-semibold text-ink">{`‘${choice.q}’와 맞는 글이 없어요`}</b>
        <p className="max-w-[46ch] text-body text-ink-2">
          {`제목·본문·붙임 파일 글자에서 찾았어요. 낱말을 더 짧게 하거나 띄어쓰기를 바꿔 보세요.${choice.related ? ' 지금은 관련 글만 보고 있어요.' : ''}`}
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {choice.related && (
            <button type="button" onClick={onAll} className={OUTLINE_BUTTON}>
              전체에서 찾기
            </button>
          )}
          <button type="button" onClick={onClear} className={ds.button.secondary}>
            찾기 지우기
          </button>
        </div>
      </div>
    )
  }
  if (page.rows.length === 0 && choice.starred) {
    return (
      <div role="status" className={EMPTY_BOX}>
        <b className="text-lead font-semibold text-ink">별표한 글이 없어요</b>
        <p className="max-w-[46ch] text-body text-ink-2">글 오른쪽 별을 누르면 여기에 모여요.</p>
      </div>
    )
  }
  const hasMore = page.rows.length < page.total
  const showFoot = !searching && !choice.starred
  return (
    <>
      <ul className="list-none">
        {page.rows.map((n, i) => (
          <Fragment key={n.id}>
            {(i === 0 || monthKey(page.rows[i - 1]) !== monthKey(n)) && (
              <li aria-hidden="true" className="border-b border-line pt-3.5 pb-1.5 text-caption font-semibold text-muted">
                {monthHead(n)}
              </li>
            )}
            <NoticeRow n={n} onStar={onStar} />
          </Fragment>
        ))}
      </ul>
      {more === 'failed' ? (
        <div className="mt-4 grid gap-3">
          <ErrorCard code="E-NOTICE-READ" />
          <button type="button" onClick={onMore} className={`${ds.button.secondary} justify-self-start`}>
            다시 읽기
          </button>
        </div>
      ) : (
        page.rows.length > 0 &&
        (hasMore || showFoot) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            {hasMore && (
              <button type="button" aria-busy={more === 'busy'} onClick={onMore} className={ds.button.secondary}>
                지난 글 더 보기
              </button>
            )}
            {showFoot && <span className="text-caption text-muted">2026년 1월 1일부터 모은 글이에요.</span>}
          </div>
        )
      )}
    </>
  )
}
