'use client'

import { useId, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { readMemo, READ_KEYS, type MemoReading } from '@/lib/precheck/memo/onboarding/readMemo'
import { answerText, ITEM_LABELS } from '../QuestionPage'

// 처음 질문의 [예전 메모 붙여 넣기] 칸(clinic-profile AC-6614.2·AC-6614.3, design.md 16절). 붙인 글이 닿는 유일한 곳이라 울타리 안에 있다
// (eslint.config.mjs: 네트워크·console·브라우저 저장소·supabase·lib/storage·lib/auth·통로 금지, src/guardrails.test.ts가 증명).
// 글은 이 칸의 상태에만 두고, 위로는 readMemo 결과(정해 둔 값 목록 안의 값)만 올린다. 이 칸이 사라지면 글도 사라진다.
// 맞춤법 검사·자동 완성은 끈다(브라우저가 글을 맞춤법 서버로 보내지 않게)

const NOTE = '환자 이름·번호는 빼고 붙여 주세요. 이 글은 이 PC 밖으로 나가지 않아요.'
const RESULT = { read: '읽었어요', mixed: '섞여 있어요. 질문에서 골라요', none: '못 찾았어요' } as const

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 align-top text-ink first:pl-0 last:pr-0'

function ReadingTable({ reading }: { reading: MemoReading }) {
  return (
    <div className={ds.table.wrap}>
      <table className={ds.table.table}>
        <thead>
          <tr>
            <th className={th}>항목</th>
            <th className={th}>읽은 값</th>
            <th className={th}>결과</th>
          </tr>
        </thead>
        <tbody>
          {READ_KEYS.map((key) => {
            const found = reading[key]
            const known = found !== null && found !== 'mixed'
            return (
              <tr key={key}>
                <td className={td}>{ITEM_LABELS[key]}</td>
                <td className={`${td} whitespace-pre-wrap`}>{known ? answerText(key, found.value) : '—'}</td>
                <td className={`${td} ${known ? 'text-positive' : 'text-ink-2'}`}>{known ? RESULT.read : found === 'mixed' ? RESULT.mixed : RESULT.none}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function PasteBox({ onStart }: { onStart(reading: MemoReading): void }) {
  const [text, setText] = useState('')
  const [reading, setReading] = useState<MemoReading | null>(null)
  const boxId = useId()
  const noteId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className={ds.field}>
        <label htmlFor={boxId} className={ds.label}>
          예전 메모
        </label>
        <p id={noteId} className="text-small text-ink-2">
          {NOTE}
        </p>
        <textarea
          id={boxId}
          aria-describedby={noteId}
          rows={8}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          className="min-h-40 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden max-md:text-lead"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
            setReading(null)
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={reading ? ds.button.secondary : ds.button.primary} disabled={!text.trim()} onClick={() => setReading(readMemo(text))}>
          읽기
        </button>
      </div>
      {reading && (
        <>
          <ReadingTable reading={reading} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.primary} onClick={() => onStart(reading)}>
              이 답으로 시작
            </button>
          </div>
        </>
      )}
    </div>
  )
}
