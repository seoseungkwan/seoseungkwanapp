'use client'

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { kindsText } from '@/lib/notices/askCheck'
import { checkKeyword, KEYWORD_LEN, KEYWORD_MAX, normKeyword, RECOMMENDED_KEYWORDS } from '@/lib/notices/keywords'
import { addKeyword, NOTICES_CHANGED, readKeywords, removeKeyword } from '@/lib/storage/notices'
import type { PrivateKind } from '@/types/notices'
import { InfoIcon, PlusIcon, StopIcon, TagIcon, XIcon } from './icons'

// 내 낱말 단추와 펼친 칸(specs/notices REQ-7424 · AC-7424.8 · AC-7424.9, design 15절, 시안 ?s=keywords · ?s=keywords-empty).
// 쪽 파일이 <NoticesScreen keywords={<KeywordsControl />} />로 '별표만' 바로 뒤에 감싸지 않고 넣는다. 그래서 단추와 칸을 조각(Fragment)으로
// 돌려준다: 칸은 고르기 첫 줄(flex-wrap)의 형제가 되어 basis-full order-last로 그 줄 바로 아래(출처 칩 위)에 꽉 차게 내려온다.
// 낱말은 혼자 읽는다(그릴 때 한 번 + notices:changed마다). 넣기 전에 checkKeyword를 거치고 ok일 때만 저장소를 부른다.
// 저장소는 성공/실패만 준다(DB의 겹침 23505·한도 23514도 false) → 실패는 모두 E-NOTICE-WORDS 상자다. 모든 글은 글자 노드로만 그린다

type Problem = 'dup' | { private: PrivateKind[] } | null

const LEDE =
  '고른 낱말이 제목·본문·붙임 파일·AI 요약에 들어 있으면 ‘꼭 볼 글’로 표시해요. 꼭 볼 글은 관련 글만 보기에 늘 나오고, 탭 옆 숫자와 대시보드에도 들어가요.'
const SPACE_HELP = '띄어쓰기와 영문 대소문자는 가리지 않아요. ‘관절강내 주사’로 적어도 ‘관절강내주사’가 든 글을 찾아요. 낱말마다 20자까지예요.'

// 고르기 줄 단추(시안 .tog): 펼치면 accent 테두리·옅은 파랑
const TOGGLE = `inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-small transition ${ds.focusRing}`
const TOGGLE_OPEN = 'border-accent bg-accent-soft font-semibold text-accent-strong'
const TOGGLE_SHUT = 'border-line-strong bg-surface font-medium text-ink-2 hover:bg-canvas'
// 칸 머리 줄(시안 .kwcol h3)과 그 옆 작은 글
const COL_HEAD = 'flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body font-semibold text-ink'
const COL_HINT = 'text-caption font-normal text-muted'
// 고른 낱말 칩의 빼기 단추(시안 .kwlist button, 26px 동그라미)
const REMOVE = `grid size-6.5 cursor-pointer place-items-center rounded-full text-accent-strong transition hover:bg-surface ${ds.focusRing}`
// 더할 칸(시안 .kwadd .input, 36px)
const INPUT =
  'h-9 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative disabled:cursor-not-allowed disabled:opacity-40'
// 추천 칩(시안 .kwr)
const RECOMMEND = `inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-full border border-line-strong bg-surface pr-3 pl-2 text-small font-medium text-ink-2 transition not-disabled:hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`

/** 고르기 줄 단추 글자: 읽기 전·읽지 못함이면 개수를 몰라 `내 낱말`(기본값 23), 0개면 `내 낱말 고르기`, 아니면 `내 낱말 {n}개` */
function buttonText(words: string[] | 'failed' | null): string {
  if (!Array.isArray(words)) return '내 낱말'
  return words.length > 0 ? `내 낱말 ${words.length}개` : '내 낱말 고르기'
}

export function KeywordsControl() {
  const [words, setWords] = useState<string[] | 'failed' | null>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<Problem>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  // 저장을 기다리는 동안 다시 누름은 무시한다(상태 갱신 전 두 번 눌러도 한 번만)
  const busyRef = useRef(false)
  // 읽기마다 번호를 올려, 늦게 온 앞 읽기의 답(과 떠난 뒤의 답)은 버린다
  const seq = useRef(0)
  const panelId = useId()
  const headId = useId()
  const problemId = useId()

  const load = useCallback(async () => {
    const mine = ++seq.current
    const res = await readKeywords()
    if (mine === seq.current) setWords(res)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 낱말을 더하거나 빼면 저장소가 알린다(다른 화면에서 바뀌어도) → 다시 읽는다
  useEffect(() => {
    const reload = () => void load()
    window.addEventListener(NOTICES_CHANGED, reload)
    return () => {
      window.removeEventListener(NOTICES_CHANGED, reload)
      seq.current += 1
    }
  }, [load])

  const list = Array.isArray(words) ? words : []
  const count = list.length
  const full = count >= KEYWORD_MAX
  const chosen = new Set(list.map(normKeyword))
  const recommended = RECOMMENDED_KEYWORDS.filter((w) => !chosen.has(normKeyword(w)))

  const toggle = () => {
    setOpen((o) => !o)
    setProblem(null)
    setSaveFailed(false)
  }

  const close = () => {
    setOpen(false)
    setProblem(null)
    setSaveFailed(false)
  }

  // 저장소 부르기 하나를 감싼다: 기다리는 동안 막고, 실패면 E-NOTICE-WORDS(낱말 목록·적은 글은 그대로)
  const save = async (call: () => Promise<boolean>): Promise<boolean> => {
    busyRef.current = true
    setBusy(true)
    setProblem(null)
    setSaveFailed(false)
    const ok = await call()
    busyRef.current = false
    setBusy(false)
    if (!ok) setSaveFailed(true)
    return ok
  }

  // 더하기·Enter·추천 칩: 빈 글자·20자 넘음·30개는 아무것도 하지 않고(30개면 칸·단추가 이미 막혀 있다), 같은 낱말·환자 정보 모양은 칸 아래 글
  const tryAdd = async (raw: string) => {
    if (busyRef.current || !Array.isArray(words)) return
    const result = checkKeyword(raw, words)
    if (typeof result === 'string') {
      if (result === 'dup') setProblem('dup')
      return
    }
    if ('private' in result) {
      setProblem(result)
      return
    }
    const word = result.ok
    if (!(await save(() => addKeyword(word)))) return
    setWords((prev) => (Array.isArray(prev) && !prev.some((w) => normKeyword(w) === normKeyword(word)) ? [...prev, word] : prev))
    setText('')
  }

  const drop = async (word: string) => {
    if (busyRef.current) return
    if (!(await save(() => removeKeyword(word)))) return
    setWords((prev) => (Array.isArray(prev) ? prev.filter((w) => w !== word) : prev))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void tryAdd(text)
  }

  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={`${TOGGLE} ${open ? TOGGLE_OPEN : TOGGLE_SHUT}`}
      >
        <TagIcon className="shrink-0" />
        {buttonText(words)}
      </button>
      {open && (
        <section
          id={panelId}
          aria-labelledby={headId}
          aria-busy={busy}
          className={`${ds.panel} order-last mt-1 grid basis-full gap-3.5 p-5`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h2 id={headId} className="inline-flex items-center gap-1.5 text-subtitle font-semibold text-ink">
              <TagIcon className="shrink-0 text-accent" />
              내 낱말
            </h2>
            <button type="button" onClick={close} className={`${ds.button.ghostSmall} ml-auto`}>
              닫기
            </button>
          </div>
          <p className="text-body text-ink-2">{LEDE}</p>

          {words === 'failed' && (
            <div className="grid gap-3">
              <ErrorCard code="E-NOTICE-READ" />
              <button type="button" onClick={() => void load()} className={`${ds.button.secondary} justify-self-start`}>
                다시 읽기
              </button>
            </div>
          )}

          {Array.isArray(words) && (
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
              <div className="grid min-w-0 content-start gap-2.5">
                <h3 className={COL_HEAD}>
                  {`고른 낱말 ${count}개`}
                  <span className={COL_HINT}>{`${KEYWORD_MAX}개까지`}</span>
                </h3>
                {count > 0 ? (
                  <ul className="flex list-none flex-wrap gap-x-2 gap-y-1.5">
                    {list.map((w) => (
                      <li
                        key={w}
                        className="inline-flex h-8 items-center gap-0.5 whitespace-nowrap rounded-full bg-accent-soft pr-1 pl-3 text-small font-semibold text-accent-strong"
                      >
                        {w}
                        <button type="button" aria-label={`${w} 빼기`} onClick={() => void drop(w)} className={REMOVE}>
                          <XIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div role="status" className="grid gap-0.5 rounded-control bg-canvas px-3.5 py-3">
                    <b className="text-body font-semibold text-ink">아직 고른 낱말이 없어요</b>
                    <p className="text-small text-ink-2">추천 낱말을 누르거나 직접 적어 더해 주세요.</p>
                  </div>
                )}
                <form onSubmit={submit} className="flex max-w-110 gap-2">
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">더할 낱말</span>
                    <input
                      className={INPUT}
                      value={text}
                      maxLength={KEYWORD_LEN}
                      autoComplete="off"
                      placeholder="예: 실손보험"
                      disabled={full}
                      aria-invalid={problem !== null && !full ? true : undefined}
                      aria-describedby={problem !== null && !full ? problemId : undefined}
                      onChange={(e) => {
                        setText(e.target.value)
                        setProblem(null)
                      }}
                    />
                  </label>
                  <button type="submit" disabled={full} className={ds.button.secondary}>
                    <PlusIcon className="shrink-0" />
                    더하기
                  </button>
                </form>
                {full ? (
                  <div role="status" className="flex items-start gap-2.5 rounded-control bg-accent-soft px-4 py-3 text-small">
                    <InfoIcon className="mt-0.5 shrink-0 text-accent-strong" />
                    <p className="min-w-0 flex-1 text-ink-2">낱말은 30개까지 고를 수 있어요. 하나를 빼고 더해 주세요.</p>
                  </div>
                ) : problem === 'dup' ? (
                  <p id={problemId} role="alert" className="text-small font-medium text-negative">
                    이미 고른 낱말이에요
                  </p>
                ) : problem !== null ? (
                  <div id={problemId} role="alert" className="flex items-start gap-2.5 rounded-control bg-negative-soft px-4 py-3 text-small">
                    <StopIcon className="mt-0.5 shrink-0 text-negative" />
                    <div className="min-w-0 flex-1">
                      <b className="block text-body font-semibold text-ink">환자 정보로 보이는 글자가 있어 저장하지 않았어요</b>
                      <p className="text-ink-2">{`${kindsText(problem.private)}로 보이는 글자를 지우고 다시 눌러 주세요.`}</p>
                    </div>
                  </div>
                ) : null}
                {saveFailed && <ErrorCard code="E-NOTICE-WORDS" />}
                <p className="text-caption text-muted">{SPACE_HELP}</p>
              </div>

              {recommended.length > 0 && (
                <div className="grid min-w-0 content-start gap-2.5">
                  <h3 className={COL_HEAD}>
                    추천 낱말
                    <span className={COL_HINT}>눌러서 더해요</span>
                  </h3>
                  <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                    {recommended.map((w) => (
                      <button
                        key={w}
                        type="button"
                        aria-label={`${w} 더하기`}
                        disabled={full}
                        onClick={() => void tryAdd(w)}
                        className={RECOMMEND}
                      >
                        <PlusIcon className="shrink-0 text-accent" />
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  )
}
