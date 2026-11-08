'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import { createMemoEngine, validatePhrases, type Phrases } from '@/lib/precheck/memo'
import { TextField } from './fields'
import { tryVisit, type TryText } from './tryVisit'

// '메모 시험' 묶음(AC-018.7, memo-settings AC-3007.4, 시안 #try): 차트 글과 처방("코드 수량")으로 만든 가짜 진료 한 건의 메모를,
// 저장하지 않은 지금 고친 값(draft)으로 만든다. 글(text)은 부르는 쪽 화면 상태에만 두고 저장하지 않는다. 환자 자료가 아니다

export function TryTab({ draft, text, onText }: { draft: Phrases; text: TryText; onText(next: TryText): void }) {
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
    setMemo(createMemoEngine(checked.value, {}).fullText(tryVisit(text.chart, text.rx, checked.value)))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="차트 글" hint="(한 줄에 하나)" rows={5} value={text.chart} onChange={(chart) => onText({ ...text, chart })} />
        <TextField label="처방" hint='(한 줄에 "코드 수량", 수량이 없으면 1)' rows={5} value={text.rx} onChange={(rx) => onText({ ...text, rx })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.primary} onClick={make}>
          메모 만들기
        </button>
        <span className={ds.help}>저장하지 않은 지금 고친 값으로 만들어요. 이 글은 저장하지 않아요.</span>
      </div>
      {invalid && <p className={ds.fieldError}>틀린 칸이 있어 메모를 만들 수 없어요. [저장]을 눌러 틀린 칸을 확인해 주세요.</p>}
      {memo !== null && (
        <section aria-label="시험한 메모" className="flex flex-col gap-1 rounded-control bg-canvas px-3 py-2">
          <p className="text-caption text-muted">위 차트 글과 처방으로 만든 메모예요.</p>
          <p className="whitespace-pre-wrap break-words text-small text-ink">{memo}</p>
        </section>
      )}
    </div>
  )
}
