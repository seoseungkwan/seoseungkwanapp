'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { checkQuestion, kindsText } from '@/lib/notices/askCheck'
import { askLeft } from '@/lib/storage/notices'
import type { PrivateKind, ReadMode } from '@/types/notices'
import { askNotice } from './askClient'
import { ClockIcon, InfoIcon, ShieldIcon, StopIcon } from './icons'
import { BlockedNote, helpText, PlainNote, sectionTitle, textareaClass } from './parts'

// AI에게 묻기 칸 (specs/notices REQ-7420 AC-7420.6~AC-7420.10, design 10절, 승인 시안 ?s=ask·ask-blocked·ask-answer·ask-limit).
// 처음엔 접혀 있다. 보내기 전에 checkQuestion으로 보고, 환자 정보 모양이면 서버를 부르지 않는다(서버가 E-NOTICE-PRIVATE로 답해도 같은 막힘).
// 질문·답은 이 칸의 상태에만 둔다(저장·브라우저 저장소 없음) → 새로 고침하면 사라진다. [메모에 옮기기]는 답을 부모에게 넘기기만 한다.
// 남은 수는 열 때 askLeft로 한 번 읽고, 답이 오면 답의 left로 바꾼다. 읽지 못하면 남은 수 줄을 그리지 않는다

const QUESTION_MAX = 300
const LEDE = '이 글과 붙임 파일 내용을 바탕으로 답해요.'
const LEDE_BODY = '이 글 본문을 바탕으로 답해요.'
const BLOCKED_TITLE = '환자 정보로 보이는 글자가 있어 보내지 않았어요'
const FAILED = '답을 받지 못했어요. 잠시 뒤 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.'
const LIMIT = '오늘 물어볼 수 있는 20번을 다 썼어요. 내일 다시 쓸 수 있어요.'

type Problem = { kind: 'blocked'; kinds: PrivateKind[] } | { kind: 'failed' } | null
type Answered = { question: string; answer: string }

// '오늘 **{n}번** 남음 (하루 20번)'
function LeftLine({ n, className }: { n: number; className: string }) {
  return (
    <span className={`whitespace-nowrap text-small ${className}`}>
      오늘 <b className="font-semibold text-ink">{`${n}번`}</b> 남음 (하루 20번)
    </span>
  )
}

export type AskBoxProps = {
  noticeId: string
  readMode: ReadMode | null
  onToMemo: (answer: string) => void
}

export function AskBox({ noticeId, readMode, onToMemo }: AskBoxProps) {
  const headId = useId()
  const [left, setLeft] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const sending = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    void askLeft().then((n) => {
      if (alive.current) setLeft(n === 'failed' ? null : n)
    })
    return () => {
      alive.current = false
    }
  }, [])

  const limit = left === 0
  const lede = readMode === 'body' ? LEDE_BODY : LEDE

  const send = async () => {
    if (sending.current || limit) return
    const check = checkQuestion(question)
    if (check === 'empty') return
    if (typeof check === 'object') {
      setProblem({ kind: 'blocked', kinds: check.private })
      return
    }
    // 300자 넘음·제어 문자: 서버도 받지 않는 질문이라 보내지 않고 실패 글
    if (check !== 'ok') {
      setProblem({ kind: 'failed' })
      return
    }
    // 칸 글 그대로(보낸 때). 답을 기다리는 동안 새로 적은 글은 답이 와도 지우지 않는다
    const typed = question
    const asked = typed.trim()
    sending.current = true
    setWaiting(true)
    setProblem(null)
    const reply = await askNotice(noticeId, asked)
    sending.current = false
    if (!alive.current) return
    setWaiting(false)
    if (reply.ok) {
      setAnswered({ question: asked, answer: reply.answer })
      setLeft(reply.left)
      setQuestion((now) => (now === typed ? '' : now))
    } else if (reply.kind === 'private') {
      setProblem({ kind: 'blocked', kinds: reply.kinds })
    } else if (reply.kind === 'limit') {
      setLeft(0)
    } else {
      setProblem({ kind: 'failed' })
    }
  }

  const close = () => {
    setOpen(false)
    setProblem(null)
  }

  return (
    <section aria-labelledby={headId} className={`${ds.panel} grid gap-3 p-5`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h2 id={headId} className={sectionTitle}>
          AI에게 묻기
        </h2>
        {!open && left !== null && <LeftLine n={left} className="ml-auto text-muted" />}
      </div>
      <p className="text-body text-ink-2">{lede}</p>

      {!open ? (
        <div>
          <button type="button" className={ds.button.accentOutlineSmall} onClick={() => setOpen(true)}>
            AI에게 묻기
          </button>
        </div>
      ) : (
        <>
          {answered && (
            <div className="grid gap-3">
              <div className="rounded-control bg-canvas px-3 py-2.5">
                <p className="text-caption font-semibold text-muted">물어본 것</p>
                <p className="whitespace-pre-wrap break-words text-body text-ink">{answered.question}</p>
              </div>
              <div role="status" className="grid gap-2 rounded-r-control border-l-3 border-accent bg-surface p-3 ring-1 ring-line ring-inset">
                <p className="text-caption font-semibold text-muted">AI 답</p>
                <p className="whitespace-pre-wrap break-words text-body text-ink">{answered.answer}</p>
                <p className="flex items-start gap-1.5 text-caption text-muted">
                  <InfoIcon className="mt-px" />
                  <span>AI 답이라 틀릴 수 있어요. 원문에서 꼭 확인해 주세요.</span>
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <button type="button" className={ds.button.secondarySmall} onClick={() => onToMemo(answered.answer)}>
                    메모에 옮기기
                  </button>
                  <span className={helpText}>답은 저장되지 않아요. 남기려면 메모에 옮겨 두세요.</span>
                </div>
              </div>
            </div>
          )}
          <p className="flex items-start gap-2 rounded-control bg-warning-soft px-3 py-2 text-small font-semibold text-warning">
            <ShieldIcon className="mt-0.5" />
            <span>환자 이름·주민번호·전화번호·차트번호는 쓰지 마세요.</span>
          </p>
          <label className="block">
            <span className="sr-only">물어볼 것</span>
            <textarea
              className={`${textareaClass} min-h-22`}
              placeholder="예: 어깨 관절 주사도 횟수가 줄어드나요?"
              maxLength={QUESTION_MAX}
              value={question}
              disabled={limit}
              aria-invalid={problem?.kind === 'blocked' ? true : undefined}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          {problem?.kind === 'blocked' && (
            <BlockedNote
              title={BLOCKED_TITLE}
              body={`${kindsText(problem.kinds)}로 보이는 글자를 지우고 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.`}
            />
          )}
          {problem?.kind === 'failed' && (
            <PlainNote tone="negative" role="alert" icon={<StopIcon className="text-negative" />}>
              {FAILED}
            </PlainNote>
          )}
          {waiting && (
            <PlainNote tone="info" role="status" icon={<ClockIcon className="mt-1 text-accent-strong" />}>
              AI가 답을 쓰는 중이에요
            </PlainNote>
          )}
          {limit && (
            <PlainNote tone="info" role="status" icon={<ClockIcon className="mt-1 text-accent-strong" />}>
              {LIMIT}
            </PlainNote>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              className={ds.button.primary}
              disabled={limit}
              aria-busy={waiting ? true : undefined}
              onClick={() => void send()}
            >
              묻기
            </button>
            <button type="button" className={ds.button.ghost} onClick={close}>
              닫기
            </button>
            {left !== null && <LeftLine n={left} className="ml-auto text-ink-2" />}
          </div>
          <p className={helpText}>우리 병원 계정이 함께 하루 20번까지 쓸 수 있어요.</p>
        </>
      )}
    </section>
  )
}
