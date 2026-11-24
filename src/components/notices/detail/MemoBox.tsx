'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useReadOnly, WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { kindsText } from '@/lib/notices/askCheck'
import { saveMemo } from '@/lib/storage/notices'
import type { PrivateKind } from '@/types/notices'
import { BlockedNote, helpText, safeDateTimeText, sectionTitle, textareaClass } from './parts'

// 우리 병원 메모 (specs/notices AC-7420.4, 승인 시안 .memo). 칸 값은 부모(NoticeDetail)가 쥔다 — [메모에 옮기기]가 붙이게(design 10절).
// [메모 저장]은 saveMemo 하나로 한다: 환자 정보 모양이면 saveMemo가 보내지 않고 그 종류를 돌려준다(기본값 13), 실패면 E-NOTICE-SAVE.
// 어느 경우에도 적은 값은 그대로 둔다. 다른 의원을 보는 중(읽기만, admin-view AC-8010.1)이면 칸은 읽기만이고 [메모 저장]이 없다

export const MEMO_MAX = 500

/** [메모에 옮기기]: 메모 칸 끝에 줄을 바꿔 답을 붙이고 500자(코드 포인트, DB char_length와 같다)에서 자른다. 빈 메모면 답만 */
export function appendAnswer(memo: string, answer: string): string {
  const joined = memo === '' ? answer : `${memo}\n${answer}`
  return Array.from(joined).slice(0, MEMO_MAX).join('')
}

type Problem = { kind: 'private'; kinds: PrivateKind[] } | { kind: 'failed' } | null

export type MemoBoxProps = {
  noticeId: string
  value: string
  onChange: (memo: string) => void
  savedAt: string | null
}

export function MemoBox({ noticeId, value, onChange, savedAt: firstSavedAt }: MemoBoxProps) {
  const headId = useId()
  const readOnly = useReadOnly()
  const [savedAt, setSavedAt] = useState(firstSavedAt)
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<Problem>(null)
  const busy = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const save = async () => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    setProblem(null)
    const result = await saveMemo(noticeId, value)
    busy.current = false
    if (!alive.current) return
    setSaving(false)
    if (result === true) setSavedAt(new Date().toISOString())
    else if (typeof result === 'object') setProblem({ kind: 'private', kinds: result.private })
    // false(저장 실패)와 보내지 않은 그 밖의 이유(500자 넘음·제어 문자)는 저장하지 못했다는 같은 안내
    else setProblem({ kind: 'failed' })
  }

  return (
    <section aria-labelledby={headId} className={`${ds.panel} grid gap-3 px-5 py-4`}>
      <h2 id={headId} className={sectionTitle}>
        우리 병원 메모
      </h2>
      <label className="block">
        <span className="sr-only">우리 병원 메모</span>
        <textarea
          className={`${textareaClass} min-h-26`}
          placeholder="예: 12월 회의 때 원장님들께 알리기"
          maxLength={MEMO_MAX}
          readOnly={readOnly}
          value={value}
          aria-invalid={problem?.kind === 'private' ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <p className={helpText}>우리 병원 계정만 봐요. 환자 정보는 쓰지 마세요.</p>
      {problem?.kind === 'private' && (
        <BlockedNote
          title="환자 정보로 보이는 글자가 있어 저장하지 않았어요"
          body={`${kindsText(problem.kinds)}로 보이는 글자를 지우고 다시 눌러 주세요.`}
        />
      )}
      {problem?.kind === 'failed' && <ErrorCard code="E-NOTICE-SAVE" />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <WriteOnly>
          <button type="button" className={ds.button.secondarySmall} aria-busy={saving ? true : undefined} onClick={() => void save()}>
            메모 저장
          </button>
        </WriteOnly>
        {savedAt !== null && <span className="text-caption text-muted">{`${safeDateTimeText(savedAt)} 저장됨`}</span>}
      </div>
    </section>
  )
}
