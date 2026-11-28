'use client'

import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { LEARN_MAX, overLearnLimit, slotWords, type LearnRule } from '@/lib/precheck/memo'
import { ErrorList, errorsUnder, type TabProps } from './fields'
import { LearnEditor } from './LearnEditor'
import { LEARN_KIND_LABELS, learnWhenText, REMOVED_LINE } from './saveDiffRows'

// 설정 › 병원 문구 › 학습 탭(claim-learn AC-9304.1~.3·AC-9306.2, design.md 12절, 시안 ?s=list, notes '설정 › 병원 문구 › 학습 탭').
// 표: 이름 · 할 일 · 조건 · 문장 · 남은 확인 · 만든 날 · [켜짐/꺼짐]·[고치기]·[지우기]. draft만 고치고 저장은 아래 [저장] → 바뀐 부분 표 흐름이다.
// [고치기]는 그 줄 아래에 학습 창과 같은 칸(LearnEditor — 이 탭에는 진료가 없어 칩은 그 학습의 조건 값뿐)을 연다. [지우기]는 묻고 지운다.
// 주소로 학습을 열면(flashId) 그 줄로 내려가 2초 강조한다. 학습이 한도를 넘거나 저장이 한도로 막히면(limit) notes '한도' 글

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 align-top first:pl-0 last:pr-0 text-ink'
const HEADS = ['이름', '할 일', '조건', '문장', '남은 확인', '만든 날']
/** 강조 시간(design.md 8절 '2초 강조') */
const FLASH_MS = 2000

/** 만든 날 'YYYY-MM-DD' → 'M/d'(시안 '11/28') */
const madeShown = (made: string) => {
  const [, month, day] = made.split('-')
  return month && day ? `${Number(month)}/${Number(day)}` : made
}

/** 학습 문장: 바뀌는 칸({좌우}·{레벨}·{부위})은 파란 조각으로(시안 .tok) */
function Sentence({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\{(?:좌우|레벨|부위)\})/).map((part, index) =>
        index % 2 ? (
          <span key={index} className="rounded-control bg-accent-soft px-0.5 font-semibold text-accent-strong">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  )
}

/** 켜짐/꺼짐 단추(시안 .toggle): 알약 + 글자. 이름은 '학습 {n} 켜기', 상태는 aria-checked */
function Toggle({ n, on, onToggle }: { n: number; on: boolean; onToggle(): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={`학습 ${n} 켜기`} onClick={onToggle} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control text-caption text-ink-2 ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40`}>
      <span aria-hidden="true" className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line-strong'}`}>
        <span className={`absolute top-0.5 size-3 rounded-full bg-surface ${on ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {on ? '켜짐' : '꺼짐'}
    </button>
  )
}

export function LearnTab({ draft, errors, onChange, flashId = null, limit = false }: TabProps & { flashId?: string | null; limit?: boolean }) {
  const list = draft.learned ?? []
  const [editing, setEditing] = useState<string | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [lit, setLit] = useState<string | null>(null)
  const rows = useRef<Record<string, HTMLTableRowElement | null>>({})
  const askId = useId()
  const words = slotWords(draft)
  const over = limit || overLearnLimit(draft)
  const target = list.find((rule) => rule.id === asking) ?? null

  // 주소로 연 학습(AC-9306.2): 그 줄로 내려가 2초 강조
  useEffect(() => {
    const row = flashId ? rows.current[flashId] : null
    if (!flashId || !row) return
    row.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    setLit(flashId)
    const timer = setTimeout(() => setLit(null), FLASH_MS)
    return () => clearTimeout(timer)
  }, [flashId])

  const withList = (next: LearnRule[]) => onChange({ ...draft, learned: next })
  const edit = (next: LearnRule) => withList(list.map((rule) => (rule.id === next.id ? next : rule)))
  function remove(id: string) {
    setAsking(null)
    if (editing === id) setEditing(null)
    withList(list.filter((rule) => rule.id !== id))
  }

  return (
    <div className="flex flex-col gap-3">
      {over && <p className="rounded-control bg-warning-soft px-3 py-2 text-small text-warning">{`학습은 ${LEARN_MAX}개까지 둘 수 있어요. 쓰지 않는 학습을 지운 뒤 더해 주세요.`}</p>}
      {list.length === 0 ? (
        <p className="text-small text-ink-2">아직 학습이 없어요. 청구 메모를 고쳐 저장하면 저절로 학습해요. 청구 화면에서 [처음 학습]을 해 보세요.</p>
      ) : (
        <div className={ds.table.wrap}>
          <table aria-label="학습 목록" className={ds.table.table}>
            <thead>
              <tr>
                {HEADS.map((head) => (
                  <th key={head} className={th}>
                    {head}
                  </th>
                ))}
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {list.map((rule, index) => {
                const n = index + 1
                const open = editing === rule.id
                const rowErrors = errorsUnder(errors, `learned.${index}`)
                return (
                  <Fragment key={rule.id}>
                    <tr
                      ref={(element) => {
                        rows.current[rule.id] = element
                      }}
                      className={lit === rule.id ? 'bg-accent-soft transition-colors' : 'transition-colors'}
                    >
                      <td className={`${td} font-medium`}>
                        {rule.name}
                        {rowErrors.length > 0 && <ErrorList errors={rowErrors} />}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>{LEARN_KIND_LABELS[rule.kind] ?? rule.kind}</td>
                      <td className={td}>{learnWhenText(rule.when)}</td>
                      <td className={td}>{rule.kind === 'remove' ? <span className={ds.help}>{REMOVED_LINE}</span> : <Sentence text={rule.to} />}</td>
                      <td className={`${td} tabular-nums`}>{String(rule.left)}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{madeShown(rule.made)}</td>
                      <td className={td}>
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Toggle n={n} on={rule.on} onToggle={() => edit({ ...rule, on: !rule.on })} />
                          <button type="button" className={ds.button.secondarySmall} aria-label={`학습 ${n} 고치기`} aria-expanded={open} onClick={() => setEditing(open ? null : rule.id)}>
                            고치기
                          </button>
                          <button type="button" className={ds.button.secondarySmall} aria-label={`학습 ${n} 지우기`} onClick={() => setAsking(rule.id)}>
                            지우기
                          </button>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={HEADS.length + 1} className="border-b border-line py-3">
                          <section aria-label={`${rule.name} 고치기`} className="rounded-control border border-line bg-canvas px-4 py-3">
                            <LearnEditor rule={rule} words={words} onChange={edit} />
                          </section>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <ErrorList errors={errors.filter((error) => error.path === 'learned')} />
      {target && (
        <div role="group" aria-labelledby={askId} className="flex max-w-105 flex-col gap-2 rounded-control border border-line bg-surface px-4 py-3">
          <p id={askId} className="text-body font-semibold text-ink">{`‘${target.name}’ 학습을 지울까요?`}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.danger} onClick={() => remove(target.id)}>
              지우기
            </button>
            <button type="button" className={ds.button.secondary} onClick={() => setAsking(null)}>
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
