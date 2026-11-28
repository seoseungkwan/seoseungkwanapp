'use client'

import { useId, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { LearnConditions, LearnSentence } from '@/components/settings/phrases/LearnEditor'
import { ds } from '@/components/ui/classes'
import { learnName, personalHit, whenCount, type AutoRule, type LearnDraftLine, type StyleChange } from '@/lib/precheck/memo/learn'
import type { LearnWhen } from '@/lib/precheck/memo'
import type { LearnDraftMessage } from '@/types/precheck'

// 학습 창(claim-learn AC-9301.2~AC-9301.6·AC-9303, design.md 5절, 시안 ?s=learn, notes '학습 창' 글 그대로). '저절로 학습' 띠의 [조건 바꾸기]로 연다.
// 고친 줄(고르기·꼬리표·옛 줄·새 줄·처방 코드, 모양 고침이면 '전체에 적용' 물음) → 이럴 때 쓰기(조건, 설정의 LearnConditions) → 학습할 문장(줄마다 LearnSentence) → [취소]·[저장].
// 줄 차이·조건 칩은 Worker가 그 진료에서 만든 재료(learnDraft)다. 환자 글자가 있어 이 창은 네트워크·저장소 없이 그리고, [저장]은 고른 학습·모양 고침만 위로 올린다(저장은 memo/useLearned)

/** 학습 창 재료: Worker의 learnDraft 답 가운데 된 것 */
export type LearnDraft = Extract<LearnDraftMessage, { ok: true }>
/** [저장]으로 올리는 학습 하나: 저장할 학습 + 바탕이 된 학습 번호(줄 차이의 update, 없으면 null) */
export type DialogRule = AutoRule & { update: string | null }
export type DialogSave = { rules: DialogRule[]; styles: StyleChange[] }

const TAG: Record<LearnDraftLine['kind'], string> = { replace: '바꿈', add: '더함', remove: '뺌' }
/** 모양 고침 줄의 고름: 아직 · 모든 메모에 · 이 학습만 */
type StylePick = 'ask' | 'all' | 'line'
type LinePick = { on: boolean; text: string; style: StylePick }

/** 받침이 있는 한글로 끝나나(ㄹ 받침은 따로 본다). 한글이 아니면 받침 없음으로 본다 */
function finalOf(word: string): number {
  const code = word.trim().codePointAt(word.trim().length - 1) ?? 0
  return code >= 0xac00 && code <= 0xd7a3 ? (code - 0xac00) % 28 : -1
}
const objectMark = (word: string) => (finalOf(word) === 0 ? '를' : '을')
const toMark = (word: string) => (finalOf(word) > 0 && finalOf(word) !== 8 ? '으로' : '로')

/** '전체에 적용' 물음(notes 글): 시안 예처럼 옛 글·새 글의 받침에 맞춰 을/를·으로/로를 붙인다 */
export function styleQuestion(change: StyleChange): string {
  return `이 고침은 모든 메모의 ${change.label}예요. 모든 메모에서 ‘${change.from}’${objectMark(change.from)} ‘${change.to}’${toMark(change.to)} 바꿀까요?`
}

/** 학습 창에 보일 줄: 빈칸을 채운 줄·개인정보 줄·빈 줄은 학습하지 않으므로 없다 */
const shownLines = (diffs: readonly LearnDraftLine[]) => diffs.filter((line) => line.skip === null || line.skip === 'style')

export function LearnDialog({
  draft,
  saving,
  error,
  names = {},
  onCancel,
  onSave,
}: {
  draft: LearnDraft
  saving: boolean
  /** 저장 실패 번호(창은 그대로, AC-9301.6) */
  error: 'E-LEARN-SAVE' | 'E-LEARN-PERSONAL' | null
  /** 코드 → 칩에 보일 이름(함께 한 다른 시술) */
  names?: Readonly<Record<string, string>>
  onCancel(): void
  onSave(save: DialogSave): void
}) {
  const titleId = useId()
  const lines = shownLines(draft.diffs)
  const [picks, setPicks] = useState<LinePick[]>(() => lines.map((line) => ({ on: true, text: line.to, style: 'ask' })))
  const [when, setWhen] = useState<LearnWhen>(() => ({ codes: [...draft.codes], regions: [...draft.regions], chartWords: [], withCodes: [], doctors: [] }))
  const [personal, setPersonal] = useState(false)
  const codes = `처방 ${draft.codes.join(', ')}`
  const pick = (index: number, patch: Partial<LinePick>) => setPicks((now) => now.map((item, at) => (at === index ? { ...item, ...patch } : item)))
  /** 문장 칸이 있는 줄: 뺀 줄이 아니고, 모양 고침이면 [이 학습만]을 고른 줄 */
  const learnable = (line: LearnDraftLine, index: number) => line.kind !== 'remove' && (line.skip !== 'style' || picks[index].style === 'line')
  const noWhen = whenCount(when) === 0

  function save() {
    const rules: DialogRule[] = []
    const styles: StyleChange[] = []
    lines.forEach((line, index) => {
      const item = picks[index]
      if (!item.on) return
      if (line.skip === 'style') {
        if (item.style === 'all' && line.style) styles.push(line.style)
        if (item.style !== 'line') return
      }
      rules.push({
        name: learnName(when),
        kind: line.kind,
        from: line.kind === 'add' ? '' : line.from,
        to: line.kind === 'remove' ? '' : item.text.trim(),
        after: line.kind === 'add' ? line.after : '',
        when,
        on: true,
        left: 3,
        update: line.update,
      })
    })
    const texts = [...rules.flatMap((rule) => [rule.from, rule.to, rule.after]), ...when.chartWords]
    if (texts.some((text) => personalHit(text, draft.forbidden))) {
      setPersonal(true)
      return
    }
    setPersonal(false)
    onSave({ rules, styles })
  }

  const shownError = personal ? 'E-LEARN-PERSONAL' : error
  return (
    // 창은 화면 높이를 넘지 않는다(max-h-full): 머리와 [취소]·[저장] 줄(저장 실패 안내 포함)은 늘 보이고 가운데 내용만 세로로 스크롤된다(시안 ?s=learn)
    <div className="fixed inset-0 z-30 flex items-start justify-center bg-ink/36 p-4 pt-8" onKeyDown={(event) => event.key === 'Escape' && onCancel()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className={`${ds.layer} flex max-h-full w-215 max-w-full flex-col`}>
        <header className="flex shrink-0 flex-col gap-1 border-b border-line px-5 pt-4 pb-2">
          <h2 id={titleId} className="text-subtitle font-semibold text-ink">
            학습 고치기 — 다음에도 이렇게 쓸까요?
          </h2>
          <p className={ds.help}>고친 줄을 학습해 두면, 조건이 맞는 다음 진료에 저절로 이렇게 나와요.</p>
        </header>
        {/* 마지막 칸의 아랫줄은 단추 줄 윗줄과 겹치지 않게 뺀다 */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&>section:last-child]:border-b-0">
          <section className="flex flex-col gap-3 border-b border-line px-5 py-3">
            <h3 className="text-body font-semibold text-ink">고친 줄</h3>
            <div role="group" aria-label="고친 줄" className="grid grid-cols-[1.5rem_3.25rem_minmax(0,1fr)] items-start gap-x-2 gap-y-3">
              {lines.map((line, index) => (
                <div key={index} className="contents">
                  <input type="checkbox" aria-label={`${index + 1}번째 고친 줄 학습하기`} className="mt-1 size-4 accent-accent" checked={picks[index].on} onChange={(event) => pick(index, { on: event.target.checked })} />
                  <span className={ds.chip.accent}>{TAG[line.kind]}</span>
                  <div className="flex min-w-0 flex-col gap-0.5 text-small">
                    {line.kind !== 'add' && <span className="break-words text-muted line-through">{line.old}</span>}
                    {line.kind !== 'remove' && <span className="break-words text-ink">{line.new}</span>}
                    <span className={ds.help}>{codes}</span>
                    {line.skip === 'style' && line.style && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-control bg-accent-soft px-3 py-1.5 text-small text-ink">
                        <span>{styleQuestion(line.style)}</span>
                        <span className="flex-1" />
                        <button type="button" aria-pressed={picks[index].style === 'all'} className={ds.button.primarySmall} onClick={() => pick(index, { style: 'all' })}>
                          모든 메모에
                        </button>
                        <button type="button" aria-pressed={picks[index].style === 'line'} className={ds.button.secondarySmall} onClick={() => pick(index, { style: 'line' })}>
                          이 학습만
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="border-b border-line px-5 py-3">
            <LearnConditions
              when={when}
              chips={{ codes: draft.codes, regions: draft.regions, withCodes: draft.withCodes, doctors: draft.doctors.map((doctor) => ({ code: doctor.code, name: doctor.name ?? doctor.code })), names }}
              onChange={setWhen}
            />
          </section>
          {lines.some(learnable) && (
            <section className="flex flex-col gap-3 border-b border-line px-5 py-3">
              <h3 className="text-body font-semibold text-ink">학습할 문장</h3>
              {lines.map((line, index) =>
                learnable(line, index) ? <LearnSentence key={index} label={`학습할 문장 ${index + 1}`} caption={`${TAG[line.kind]} · ${codes}`} value={picks[index].text} words={draft.words} onChange={(text) => pick(index, { text })} /> : null,
              )}
            </section>
          )}
        </div>
        {shownError && (
          <div className="shrink-0 px-5 pt-3">
            <ErrorCard code={shownError} />
          </div>
        )}
        <footer className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" className={ds.button.secondary} onClick={onCancel}>
            취소
          </button>
          <button type="button" className={ds.button.primary} disabled={saving || noWhen} onClick={save}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </footer>
      </div>
    </div>
  )
}
