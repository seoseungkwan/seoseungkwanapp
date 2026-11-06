'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { loadCashFloatSetting, saveCashFloatSetting } from '@/lib/storage/worklogSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { parseFloatSetting, wonText } from '@/lib/worklog/cashFloat'
import { CASH_FLOAT_MAX } from '@/types/worklog'

// 설정 탭 '현금 시재' 칸 (specs/worklog-cash-float REQ-1608, design.md '설정 칸', 시안 '설정 · 시재 금액').
// 병원 시재 금액 하나를 읽고 쓴다(worklogSettings.ts, RLS). 바꾸면 그 뒤에 세는 날부터 쓰고, 이미 센 날은 그날 일지의 금액 그대로다.
// 읽기는 효과에서만 한다(서버 그리기에서 부르지 않는다). 실패는 종류와 상관없이 E-SETTINGS-FAILED 카드, 읽기 실패에는 [다시 불러오기]

type Load = 'loading' | 'failed' | 'ready'
// 칸 아래 한 줄: 평소 안내 → 틀린 값 안내 또는 저장 끝 안내로 바뀐다(시안 그대로)
type Line = { kind: 'note' } | { kind: 'invalid' | 'too-big' } | { kind: 'saved'; won: number }

const COMMAS = new Intl.NumberFormat('ko-KR')
const NOTE = '이미 센 날은 그때 금액 그대로예요.'
const INVALID = '금액을 숫자로 적어 주세요.'
const TOO_BIG = `시재 금액은 ${wonText(CASH_FLOAT_MAX)}까지 적을 수 있어요.`
// 칸: ds.input을 시안 폭(140px 안팎)·단추 높이 36px로 좁히고 오른쪽 맞춤. 휴대폰은 44px(ds.input의 h-11·w-full보다 이겨야 해서 !)
const FLOAT_INPUT = `${ds.input} h-9! w-36! text-right tabular-nums max-md:h-11!`

export function CashFloatSetting() {
  const [load, setLoad] = useState<Load>('loading')
  const [text, setText] = useState('')
  const [line, setLine] = useState<Line>({ kind: 'note' })
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const lineId = useId()

  const read = useCallback(async () => {
    setLoad('loading')
    try {
      const won = await loadCashFloatSetting(supabaseBrowser())
      setText(COMMAS.format(won))
      setLine({ kind: 'note' })
      setSaveFailed(false)
      setLoad('ready')
    } catch {
      setLoad('failed')
    }
  }, [])

  useEffect(() => {
    void read()
  }, [read])

  async function save() {
    if (saving) return
    const won = parseFloatSetting(text)
    if (won === 'invalid' || won === 'too-big') {
      setLine({ kind: won })
      return
    }
    setSaving(true)
    setSaveFailed(false)
    try {
      await saveCashFloatSetting(supabaseBrowser(), won)
      setText(COMMAS.format(won))
      setLine({ kind: 'saved', won })
    } catch {
      // 적은 값은 칸에 그대로 둔다(AC-1608.3)
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const wrong = line.kind === 'invalid' || line.kind === 'too-big'

  return (
    <section aria-labelledby="cash-float-setting-title" className={`${ds.panel} flex flex-col gap-3 p-5 max-md:p-4`}>
      <h2 id="cash-float-setting-title" className={ds.panelTitle}>
        현금 시재
      </h2>
      <p className="text-small text-ink-2">마감 때 서랍에 남겨 두는 돈이에요. 업무일지의 시재 칸이 이 금액으로 계산해요.</p>
      {load === 'loading' && <p className="text-small text-muted">시재 금액을 읽는 중이에요…</p>}
      {load === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-SETTINGS-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={() => void read()}>
            다시 불러오기
          </button>
        </div>
      )}
      {load === 'ready' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label="시재 금액"
              aria-invalid={wrong || undefined}
              aria-describedby={lineId}
              className={FLOAT_INPUT}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setLine({ kind: 'note' })
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save()
              }}
            />
            <span className="text-body text-ink-2">원</span>
            <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={() => void save()}>
              저장
            </button>
          </div>
          {line.kind === 'saved' ? (
            <p id={lineId} role="status" className="text-small text-ink-2">
              {`저장했어요. 이제부터 세는 날은 ${wonText(line.won)}으로 계산해요.`}
            </p>
          ) : wrong ? (
            <p id={lineId} className={ds.fieldError}>
              {line.kind === 'invalid' ? INVALID : TOO_BIG}
            </p>
          ) : (
            <p id={lineId} className="text-small text-ink-2">
              {NOTE}
            </p>
          )}
          {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
        </>
      )}
    </section>
  )
}
