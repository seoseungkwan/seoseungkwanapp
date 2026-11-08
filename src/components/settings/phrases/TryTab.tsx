'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import { createMemoEngine, validatePhrases, type Phrases } from '@/lib/precheck/memo'
import type { Visit } from '@/types/precheck'

// '메모 시험' 묶음(AC-018.7, memo-settings AC-3007.1): 저장하지 않은 지금 고친 값으로 가짜 진료 한 건의 메모를 만든다. 환자 자료가 아니다

/** 가짜 진료(AC-018.7). 환자 자료가 아니다 */
const FAKE_VISIT: Visit = {
  key: 'fake',
  chart: '1',
  date: '2026-01-05',
  month: '2026-01',
  name: '가짜 진료',
  lines: ['LBP', 'MBB L4,5 both'],
  hints: [null, null],
  rx: [{ code: 'LA358', name: 'LA358', qty: 2, benefit: true, pay: '급여' }],
  dx: [],
  memosInBit: [],
}

export function TryTab({ draft }: { draft: Phrases }) {
  const [memo, setMemo] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  function make() {
    const checked = validatePhrases(draft)
    if (!checked.ok) {
      setInvalid(true)
      setMemo(null)
      return
    }
    setInvalid(false)
    setMemo(createMemoEngine(checked.value, {}).fullText(FAKE_VISIT))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.primary} onClick={make}>
          메모 만들기
        </button>
        <span className={ds.help}>저장하지 않은 지금 고친 값으로 만들어요.</span>
      </div>
      {invalid && <p className={ds.fieldError}>틀린 칸이 있어 메모를 만들 수 없어요. [저장]을 눌러 틀린 칸을 확인해 주세요.</p>}
      {memo !== null && (
        <section aria-label="시험한 메모" className="flex flex-col gap-1 rounded-control bg-canvas px-3 py-2">
          <p className="text-caption text-muted">가짜 진료 한 건으로 만든 메모예요.</p>
          <p className="whitespace-pre-wrap break-words text-small text-ink">{memo}</p>
        </section>
      )}
    </div>
  )
}
