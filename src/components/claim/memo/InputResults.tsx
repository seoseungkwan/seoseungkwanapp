'use client'

import { ClaimError, ExcelError, SetupLink } from '../ClaimError'
import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'
import type { InputResultView } from '@/types/precheck'
import { InputResultRows } from '../rows/InputResultRows'

// 입력 결과(AC-018.4·AC-018.15·AC-018.21·AC-018.22, 입력 쪽 승인 목업). 결과가 보이는 동안 입력 방식 칸과 목록은 접힌다.
// 어색한 곳(이어서 하기와 이어서 입력의 이름 등)은 tasks.md대로 그대로 둔다

function Tile({ chip, label, count, foot }: { chip: string; label: string; count: number; foot?: string }) {
  return (
    <div className={`${ds.panel} flex flex-col gap-1 p-4`}>
      <span className={chip}>{label}</span>
      <b className="text-title font-semibold text-ink">
        {count}
        <small className="text-small font-normal">명</small>
      </b>
      {foot && <span className={ds.help}>{foot}</span>}
    </div>
  )
}

/** onDates: [날짜 목록으로](claim-learn AC-9314.2) — 다음 날을 고르러 날짜 칸으로 간다 */
export type InputResultsProps = { result: InputResultView; busy: boolean; excelBusy: boolean; excelError: string | null; onRetry(): void; onResume(): void; onBack(): void; onExcel(): void; onDates(): void }

export function InputResults({ result, busy, excelBusy, excelError, onRetry, onResume, onBack, onExcel, onDates }: InputResultsProps) {
  const { status, code, reason, fields, done, check, skipped, uncounted, retry, entered, left, firstNoAsk } = result
  const replaced = done.filter((line) => line.previousMemo !== undefined).length
  const info = code && isErrorCode(code) ? errorInfo(code) : null
  return (
    <div className="flex flex-col gap-3">
      {firstNoAsk !== null && (
        <p role="status" className="rounded-control bg-warning-soft px-4 py-3 text-small font-semibold text-ink">
          {firstNoAsk > 0 ? `이제부터 묻지 않아요. 불러온 뒤에 비트에 메모가 생긴 ${firstNoAsk}명은 아직 바꾸지 않았어요. [비트에 입력]을 다시 누르면 원래 메모를 남기고 바꿔요` : '이제부터 묻지 않아요.'}
        </p>
      )}
      {status === 'stopped' && (
        <div role="alert" className="flex flex-col gap-1 rounded-control border border-l-2 border-line border-l-warning bg-surface px-4 py-3">
          <b className="text-small font-semibold text-ink">중간에 멈췄어요</b>
          {info && (
            <p className="text-small text-ink-2">
              {info.what} {info.fix}
            </p>
          )}
          {reason && <p className="text-small text-ink-2">{reason}</p>}
          {fields.length > 0 && <p className="text-small text-ink-2 break-all">칸 이름: {fields.join(', ')}</p>}
          <p className="text-small text-ink-2">
            넣은 {entered}명은 그대로 두고, 남은 {left}명은 넣지 않았어요.
          </p>
          {code && <p className="text-caption text-ink-2 tabular-nums">오류 번호 {code}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {left > 0 && (
              <button type="button" className={ds.button.primarySmall} disabled={busy} onClick={onResume}>
                이어서 하기
              </button>
            )}
            {code && <SetupLink code={code} />}
          </div>
        </div>
      )}
      {status !== 'stopped' && code && (
        <div className="flex flex-col items-start gap-2">
          <ClaimError code={code} />
          <SetupLink code={code} />
        </div>
      )}
      <p className="text-small text-ink-2">
        <b className="font-semibold text-ink">입력 결과</b>
        {uncounted > 0 && ` · 이미 입력된 사람과 메모 없는 사람 ${uncounted}명은 세지 않았어요`}
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        <Tile chip={ds.chip.positive} label="완료" count={done.length} foot={replaced > 0 ? `그중 메모 바꿈 ${replaced}명` : undefined} />
        <Tile chip={ds.chip.negative} label="확인 필요" count={check.length} />
        <Tile chip={ds.chip.neutral} label="건너뜀" count={skipped.length} foot={retry > 0 ? `다시 할 수 있음 ${retry}명` : undefined} />
      </div>
      {check.length > 0 && (
        <section aria-label="확인 필요" className={`${ds.panel} flex flex-col gap-2 p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={ds.panelTitle}>확인 필요</h3>
            <span className={ds.count}>비트에서 열어 봐 주세요</span>
          </div>
          <InputResultRows lines={check} />
        </section>
      )}
      {skipped.length > 0 && (
        <section aria-label="건너뜀" className={`${ds.panel} flex flex-col gap-2 p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={ds.panelTitle}>건너뜀</h3>
            <span className={ds.count}>이유와 함께</span>
          </div>
          <InputResultRows lines={skipped} />
          {retry > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={ds.button.primarySmall} disabled={busy} onClick={onRetry}>
                다시 하기 ({retry}명)
              </button>
              <span className={ds.help}>이미 있음과 직접 입력은 다시 넣지 않아요.</span>
            </div>
          )}
        </section>
      )}
      {done.length > 0 && (
        <section aria-label="완료" className={`${ds.panel} flex flex-col gap-2 p-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className={ds.panelTitle}>완료</h3>
            <span className={ds.count}>비트에 넣고 다시 읽어 맞는지 봤어요</span>
          </div>
          <InputResultRows lines={done} />
        </section>
      )}
      {excelError && <ExcelError code={excelError} />}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={ds.button.primary} onClick={onBack}>
          입력 방식으로 돌아가기
        </button>
        <button type="button" className={ds.button.secondary} onClick={onDates}>
          날짜 목록으로
        </button>
        <button type="button" className={ds.button.secondary} aria-busy={excelBusy || undefined} onClick={onExcel}>
          {excelBusy ? '만드는 중…' : '엑셀로 저장'}
        </button>
      </div>
    </div>
  )
}
