'use client'

import { useId, useMemo } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { diffPhrases, type PhraseDiffRow, type Phrases } from '@/lib/precheck/memo'
import { answersOf, KLG_TEMPLATES, type KlgStyle } from '@/lib/precheck/memo/onboarding/answers'
import { answerText, ITEM_LABELS, type Key } from './QuestionPage'

// 처음 질문 확인 쪽(clinic-profile AC-6614.8, design.md 16절): '바뀌는 것' 표(지금 병원 문구와 견준 칸 · 전 · 후, 처음이면 '처음 만들어요')와 [저장].
// 표 줄은 diffPhrases 위에서 만든다: 답 칸(좌우 넷·가이드·끝맺음·레벨·K-L·기호·줄 나눔)은 질문 이름과 고르는 글로 보이고,
// 고정 멘트(JSON)는 C-arm·Sono·시행함 답마다 한 줄로 바꾼다. 문구 앞뒤 토큰이 바뀐 시술 문구 줄은 diffPhrases 그대로다

const ORDER: readonly Key[] = ['sideStyle', 'cartilageSideLang', 'sideMode', 'sideSpread', 'carm', 'sono', 'ending', 'levelSep', 'klg', 'mark', 'lineJoin']
/** 답 칸 줄로 대신 보이는 diffPhrases 경로 */
const ANSWER_PATHS = new Set(['TPL.sideStyle', 'TPL.cartilageSideLang', 'TPL.sideMode', 'TPL.sideSpread', 'TPL.levelSep', 'TPL.klg', 'TPL.mark', 'TPL.lineJoin', 'TPL.fixedPhrases'])

/** K-L 문장: 고르는 글 셋 가운데 하나면 그 이름, 아니면 문구 그대로 */
function klgText(phrases: Phrases): string {
  const template = phrases.TPL.klg
  if (typeof template !== 'string') return '(없음)'
  const style = (Object.keys(KLG_TEMPLATES) as KlgStyle[]).find((key) => KLG_TEMPLATES[key] === template)
  return style ? answerText('klg', style) : template
}

/** '바뀌는 것' 줄: 답 칸(질문 차례) → 그 밖의 바뀐 칸(diffPhrases 차례). 전·후가 같은 줄은 없다 */
export function changeRows(before: Phrases, after: Phrases): PhraseDiffRow[] {
  const was = answersOf(before)
  const now = answersOf(after)
  const rows: PhraseDiffRow[] = []
  for (const key of ORDER) {
    const a = key === 'klg' ? klgText(before) : answerText(key, was[key])
    const b = key === 'klg' ? klgText(after) : answerText(key, now[key])
    if (a !== b) rows.push({ path: `answers.${key}`, label: ITEM_LABELS[key], before: a, after: b })
  }
  for (const row of diffPhrases(before, after)) {
    if (ANSWER_PATHS.has(row.path) || row.path.startsWith('TPL.fixedPhrases.')) continue
    if (row.before !== row.after) rows.push(row)
  }
  return rows
}

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-2 align-top break-words text-ink first:pl-0 last:pr-0'

export type ConfirmPageProps = {
  /** 지금 맞는 병원 문구. 없으면(처음) null */
  current: Phrases | null
  /** 답을 넣은 문구 */
  next: Phrases
  saving: boolean
  failed: boolean
  onPrev(): void
  onSave(): void
}

export function ConfirmPage({ current, next, saving, failed, onPrev, onSave }: ConfirmPageProps) {
  const titleId = useId()
  const tableId = useId()
  const rows = useMemo(() => (current ? changeRows(current, next) : null), [current, next])
  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex min-w-0 flex-1 flex-col gap-4 p-5 max-md:p-4`}>
      <h2 id={titleId} className={ds.panelTitle}>
        확인
      </h2>
      <div className="flex flex-col gap-2">
        <h3 id={tableId} className="text-body font-semibold text-ink">
          바뀌는 것
        </h3>
        {rows === null ? (
          <p className="text-small text-ink-2">처음 만들어요</p>
        ) : rows.length === 0 ? (
          <p className="text-small text-ink-2">바뀌는 것이 없어요</p>
        ) : (
          <div className={ds.table.wrap}>
            <table aria-labelledby={tableId} className={ds.table.table}>
              <thead>
                <tr>
                  <th className={th}>칸</th>
                  <th className={th}>전</th>
                  <th className={th}>후</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.path}>
                    <td className={td}>{row.label}</td>
                    <td className={`${td} whitespace-pre-wrap text-ink-2`}>{row.before}</td>
                    <td className={`${td} whitespace-pre-wrap`}>{row.after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {failed && <ErrorCard code="E-FIRST-RUN-SAVE-FAILED" />}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <button type="button" className={ds.button.secondary} onClick={onPrev}>
          이전
        </button>
        <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={onSave}>
          {failed ? '다시 저장' : '저장'}
        </button>
      </div>
    </section>
  )
}
