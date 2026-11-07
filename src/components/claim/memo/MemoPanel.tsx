'use client'

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { DateRange } from '@/types/dates'
import type { InputResultView, InputSelection, InputWhat, MemoScreenView, TargetRow } from '@/types/precheck'
import { ClaimError, SetupLink } from '../ClaimError'
import { runInputExcel, type ClaimChannel, type ClaimStream, type MemoViewAnswer } from '../claimLoad'
import { BitMemoCard } from '../rows/BitMemoCard'
import { MemoRows } from '../rows/MemoRows'
import { MemoTable } from '../rows/MemoTable'
import { StuckBand } from '../rows/StuckBand'
import type { UseBridge } from '../useBridge'
import { BitMemoButton, useBitMemo } from './BitMemoButton'
import { defaultSelection, InputMode } from './InputMode'
import { InputResults } from './InputResults'
import { useMemoDrafts } from './useMemoDrafts'

// 3~5단계 메모 칸(REQ-018, 입력 쪽·빠진 화면 승인 목업): 입력 방식 → 입력할 사람·빠지는 사람 → 메모 표 → [비트에 입력] → 확인 기다리는 중 → 입력 중 → 입력 결과.
// 묶음 글자와 대상 고르기는 Worker가 한다(AC-004.11). 여기는 일만 시키고 보기 모양을 그린다. 고친 글은 Worker를 거쳐 도우미가 그 PC에 저장한다.
// 설정 변경 띠와 기관기호 안내는 ClaimScreen이 화면 맨 위에 둔다(design.md 6-5, AC-018.17). 다른 탭에 다녀오면 비트 메모 읽기 상태와 입력 결과를 ClaimChannel에 맡겨 둔 것으로 되살린다

export type InputStage = 'pick' | 'wait' | 'run' | 'result'

const WAIT_NOTE = '[취소]를 누르거나 창을 닫거나 5분이 지나면 아무것도 넣지 않아요.'
const LEAVE_NOTE = '다른 탭으로 옮겨도 입력은 PC에서 계속돼요. 결과는 끝난 뒤 [자료 불러오기]를 누르면 메모 표에 보여요.'
const BAND = 'flex flex-col gap-1 rounded-control bg-warning-soft px-4 py-3'

export type MemoPanelProps = {
  channel: ClaimChannel
  stream: ClaimStream
  onProgress?: UseBridge['onProgress']
  load: number
  /** 점검 번호: [다시 점검] 뒤 다시 묻는다 */
  check: number
  visible: DateRange
  loadedAt: string
  memoBlocked: MemoScreenView['memoBlocked']
  settingsStale: boolean
  storeStuck: boolean
  onStoreStuck(): void
  /** [비트에 입력] 직전에 서버 설정을 다시 읽는다(design.md 6-5). 바뀌었으면 false이고 띠가 뜬다 */
  checkFresh(): Promise<boolean>
  onLoadRange(range: DateRange): void
  onReload(): void
  onStage?(stage: InputStage): void
  /** 남은 고친 글을 Worker에 보낸다([다시 점검] 앞, AC-014.11) */
  flushRef?: MutableRefObject<(() => void) | null>
  /** [메모 확인에서 고치기]로 온 사람 */
  focusKey?: string | null
}

/** 처음 질문(AC-018.18): 오류처럼 빨갛게 하지 않고 파란 안내이고 오류 번호가 없다. 그 화면이 아직 없어 가는 단추도 없다 */
function FirstQuestion() {
  const info = errorInfo('E-MEMO-NO-SETTINGS')
  return (
    <section className={`${ds.panel} flex flex-col gap-2 p-4`}>
      <h3 className={ds.panelTitle}>메모</h3>
      <div role="status" aria-label="처음 질문" className="flex flex-col gap-0.5 rounded-control bg-accent-soft px-4 py-3">
        <p className="text-small font-semibold text-accent-strong">{info.what}</p>
        <p className="text-small text-ink-2">{info.fix}</p>
      </div>
    </section>
  )
}

function saveFile(bytes: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function MemoPanel(props: MemoPanelProps) {
  if (props.memoBlocked) return <FirstQuestion />
  return <Panel {...props} />
}

function Panel({ channel, stream, onProgress, load, check, visible, loadedAt, settingsStale, storeStuck, onStoreStuck, checkFresh, onLoadRange, onReload, onStage, flushRef, focusKey }: MemoPanelProps) {
  const kept = useRef(channel.keptMemo())
  const [selection, setSelection] = useState<InputSelection>(() => defaultSelection(visible))
  const [view, setView] = useState<MemoScreenView | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [stage, setStage] = useState<InputStage>(kept.current?.result ? 'result' : 'pick')
  const [result, setResult] = useState<InputResultView | null>(kept.current?.result ?? null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [notice, setNotice] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const [flash, setFlash] = useState(0)
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  const latestAsk = useRef(0)
  const mounted = useRef(true)
  const asked = useRef(false)
  const starting = useRef(false)

  const onStageRef = useRef(onStage)
  onStageRef.current = onStage
  useEffect(() => {
    onStageRef.current?.(stage)
    return () => onStageRef.current?.('pick')
  }, [stage])

  const refresh = useCallback(async () => {
    const ask = channel.nextAsk()
    latestAsk.current = ask
    const answer = await channel.ask<MemoViewAnswer>({ type: 'memoView', ask, selection: selectionRef.current })
    if (!mounted.current || latestAsk.current !== ask) return
    if (!answer.ok) {
      setViewError(answer.code)
      return
    }
    setViewError(null)
    setView(answer.view)
    // 다녀오는 사이 저장 답을 못 받은 고친 글을 다시 보낸다(통로가 바뀌어 답이 오지 않는다)
    if (!asked.current) {
      asked.current = true
      if (answer.view.table.some((row) => row.unsaved)) channel.tell({ type: 'memoSaveRetry' })
    }
  }, [channel])
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh, selection, check])

  useEffect(
    () =>
      channel.onSave((answer) => {
        if (!mounted.current) return
        if (answer.ok) setSaveError(null)
        else if (answer.blocked) onStoreStuck()
        else setSaveError(answer.code)
        void refreshRef.current()
      }),
    [channel, onStoreStuck],
  )

  useEffect(() => {
    if (!onProgress) return
    return onProgress(({ done, total }) => {
      setProgress({ done, total })
      setStage((now) => (now === 'wait' ? 'run' : now))
    })
  }, [onProgress])

  const drafts = useMemoDrafts((visitKey, text) => {
    channel.tell({ type: 'editMemo', visitKey, text })
    if (mounted.current) void refreshRef.current()
  })
  if (flushRef) flushRef.current = drafts.flushAll
  const { resetSettled } = drafts
  // 새 점검 뒤에는 Worker의 글을 보인다: 이미 보낸 글을 칸이 쥐고 있으면 새 자동 메모 대신 들어가지 않을 옛 글이 보인다(AC-014.11)
  useEffect(() => resetSettled(), [check, resetSettled])

  const keepMemo = useCallback((next: InputResultView | null, bit = keptBit.current) => channel.keepMemo({ result: next, bit }), [channel])
  const keptBit = useRef(kept.current?.bit ?? null)
  const onBitState = useCallback(
    (state: typeof keptBit.current) => {
      keptBit.current = state
      channel.keepMemo({ result: channel.keptMemo()?.result ?? null, bit: state })
    },
    [channel],
  )
  const bit = useBitMemo({
    channel,
    stream,
    load,
    visible,
    loadedAt: view?.bit.has ? loadedAt : null,
    got: view?.bit ?? { has: false, count: 0, period: null },
    onChanged: () => void refreshRef.current(),
    initial: kept.current?.bit ?? null,
    onState: onBitState,
  })

  const locked = stage === 'wait' || stage === 'run'
  const reading = bit.state.status === 'reading'
  const startBlocked = storeStuck || reading

  /** 입력을 시작하는 단추 하나(AC-018.3·AC-018.16·AC-018.20·AC-018.21) */
  const start = useCallback(
    async (what: InputWhat) => {
      // 설정을 다시 읽는 사이에 또 누른 것도 막는다: 지나가면 Worker가 거절하고 진행 중인데 busy가 꺼진다
      if (starting.current || channel.inputBusy()) return
      starting.current = true
      setNotice(false)
      setInputError(null)
      setDialog(false)
      setEditing(null)
      drafts.flushAll()
      const fresh = await checkFresh()
      starting.current = false
      if (!fresh) return // 설정이 바뀌었다: 띠가 뜨고 [다시 점검] 전까지 보내지 않는다(design.md 6-5)
      if (!mounted.current) return
      const run = channel.nextAsk()
      channel.setInputBusy(true) // 보내는 순간부터다: 그 사이 떠나도 맡긴 결과를 버려야 한다(AC-013.6)
      const { started, finished } = channel.startInput(run, what, selectionRef.current)
      const begin = await started
      if (!begin.ok) channel.setInputBusy(false)
      if (!mounted.current) return
      if (!begin.ok) {
        setInputError(begin.code)
        return
      }
      setResult(null)
      keepMemo(null)
      setProgress({ done: 0, total: begin.count })
      setStage(begin.askPc ? 'wait' : 'run')
      const end = await finished
      channel.setInputBusy(false)
      if (!mounted.current) return
      await refreshRef.current()
      if (!end.ok) {
        setInputError(end.code)
        setStage('pick')
        return
      }
      if (end.result.status === 'cancelled') {
        setNotice(true)
        setStage('pick')
        return
      }
      setResult(end.result)
      keepMemo(end.result)
      setStage('result')
    },
    [channel, checkFresh, drafts, keepMemo],
  )

  const marks = view?.targets.left.find((group) => group.reason === 'mark')?.rows ?? []
  const batchCount = view?.targets.batch.length ?? 0

  function press() {
    if (storeStuck || view?.stuck || settingsStale || reading || locked) return
    drafts.flushAll()
    if (marks.length > 0) {
      setDialog(true)
      return
    }
    if (batchCount === 0) {
      setFlash((n) => n + 1) // 안내를 다시 보인다
      return
    }
    void start('selection')
  }

  async function saveExcel() {
    if (excelBusy) return
    setExcelBusy(true)
    setExcelError(null)
    const answer = await runInputExcel(channel)
    setExcelBusy(false)
    if (answer.ok) saveFile(answer.bytes, answer.fileName)
    else setExcelError(answer.code)
  }

  const openRow = (key: string) => {
    if (open.has(key)) return
    setOpen(new Set(open).add(key))
    if (!locked) bit.readOnce() // 처음 열 때 저절로 읽는다(AC-018.27)
  }

  const toggle = (key: string) => {
    if (!open.has(key)) return openRow(key)
    const next = new Set(open)
    next.delete(key)
    setOpen(next)
  }

  /** [메모 고치기]는 그 줄도 열어 증상·처방내역을 보며 고치게 한다(AC-2602.5). 열린 줄은 그대로 둔다 */
  const editRow = (key: string) => {
    setEditing(key)
    openRow(key)
  }

  const card = (row: TargetRow) => {
    const tableRow = view?.table.find((item) => item.key === row.key)
    return <BitMemoCard row={row} state={bit.state} afterEntry={tableRow?.afterEntry ?? false} locked={locked} />
  }

  const viewFailed = viewError && (
    <div className="flex flex-col items-start gap-2">
      <ClaimError code={viewError} />
      <button type="button" className={ds.button.primarySmall} onClick={onReload}>
        다시 불러오기
      </button>
    </div>
  )
  if (!view) return viewFailed || <p className="text-small text-muted">메모를 준비하는 중이에요…</p>
  const { targets, stuck, noAsk } = view
  const replacingText = targets.replacing > 0 ? ` 다른 메모 ${targets.replacing}명은 우리 메모로 바뀌고, 원래 메모는 기록에 남아요.` : ''
  const sideText = storeStuck
    ? '저장이 막혀 있는 동안에는 입력할 수 없어요.'
    : stuck
      ? '쓰다 멈춘 사람을 먼저 확인해 주세요.'
      : settingsStale
        ? '[다시 점검]을 누른 뒤에 눌러 주세요.'
        : `${noAsk ? '누르면 PC 확인 창 없이 바로 시작해요.' : '누르면 PC 화면에 확인 창이 떠요. 거기서 [확인]을 눌러야 들어가요.'}${replacingText}`

  return (
    <div className="flex flex-col gap-3">
      {viewFailed}
      {noAsk && (
        <div role="status" className={BAND}>
          <b className="text-small font-semibold text-ink">묻지 않기 켜짐: PC 확인 창 없이 바로 시작해요</b>
          <span className="text-small text-ink-2">[비트에 입력]을 누르면 아래 목록 그대로 들어가요. [바꾸지 않기]를 누른 사람과 확인 표시가 남은 메모는 넣지 않아요. 끄려면 청구 창을 닫았다가 다시 여세요.</span>
        </div>
      )}
      {notice && (
        <div role="status" className="flex flex-col gap-1 rounded-control border border-line bg-surface px-4 py-3">
          <b className="text-small font-semibold text-ink">입력하지 않았어요</b>
          <span className="text-small text-ink-2">비트에는 아무것도 들어가지 않았어요.</span>
        </div>
      )}
      {inputError && (
        <div className="flex flex-col items-start gap-2">
          <ClaimError code={inputError} />
          <div className="flex flex-wrap items-center gap-2">
            {inputError === 'E-CLAIM-PARTIAL' && (
              <button type="button" className={ds.button.primarySmall} onClick={onReload}>
                다시 불러오기
              </button>
            )}
            <SetupLink code={inputError} />
          </div>
        </div>
      )}
      {saveError && (
        <div className="flex flex-col items-start gap-2">
          <ClaimError code={saveError} />
          <button type="button" className={ds.button.primarySmall} onClick={() => channel.tell({ type: 'memoSaveRetry' })}>
            다시 저장
          </button>
        </div>
      )}
      {stuck && !locked && <StuckBand stuck={stuck} blocked={startBlocked} reading={reading} onContinue={() => void start('continueStuck')} onByHand={() => void start('byHand')} onLoad={() => stuck.loadRange && onLoadRange(stuck.loadRange)} />}
      {locked && (
        <section role="status" aria-label="입력 진행" className={`${ds.panel} flex flex-col gap-2 p-4`}>
          <div>
            <span className={ds.chip.accent}>{stage === 'wait' ? '확인 기다리는 중' : '입력 중'}</span>
          </div>
          {stage === 'wait' && <p className="text-subtitle font-semibold text-ink">PC 화면의 확인 창에서 [확인]을 눌러 주세요</p>}
          <p className="text-title font-semibold text-ink tabular-nums">
            {progress.done} / {progress.total}명
          </p>
          {stage === 'wait' && <p className={ds.help}>{WAIT_NOTE}</p>}
          <p className={ds.help}>{LEAVE_NOTE}</p>
        </section>
      )}
      {stage === 'result' && result ? (
        <InputResults
          result={result}
          busy={startBlocked}
          excelBusy={excelBusy}
          excelError={excelError}
          onRetry={() => void start('retry')}
          onResume={() => void start('resume')}
          onBack={() => {
            setResult(null)
            keepMemo(null)
            setStage('pick')
            void refreshRef.current()
          }}
          onExcel={() => void saveExcel()}
        />
      ) : (
        <>
          <div className="grid min-w-0 items-start gap-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
            <InputMode visible={visible} selection={selection} onSelection={setSelection} problem={targets.problem} chips={targets.chips} typedOverChip={targets.typedOverChip} locked={locked}>
              <BitMemoButton state={bit.state} blocked={locked} onRead={bit.read} />
            </InputMode>
            <MemoRows
              targets={targets}
              locked={locked}
              reading={reading}
              startBlocked={startBlocked}
              open={open}
              editing={editing}
              card={card}
              onToggle={toggle}
              onApprove={(visitKey, approved) => {
                channel.tell({ type: 'memoApprove', visitKey, approved })
                void refreshRef.current()
              }}
              onEdit={editRow}
              onEditDone={(key, text) => {
                setEditing(null)
                drafts.change(key, text)
                drafts.flush(key)
              }}
              onHeldRetry={() => void start('held')}
            />
          </div>
          <MemoTable rows={view.table} valueOf={drafts.valueOf} onChange={drafts.change} onBlur={drafts.flush} locked={locked} showUnsaved={storeStuck || saveError !== null} focusKey={focusKey} />
          {stage === 'pick' && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3">
              <button
                type="button"
                className={ds.button.primary}
                disabled={storeStuck || stuck !== null || settingsStale || reading}
                aria-disabled={batchCount === 0 || undefined}
                onClick={press}
              >
                비트에 입력 ({batchCount}명)
              </button>
              <span className="text-small text-ink-2">{sideText}</span>
              {flash > 0 && batchCount === 0 && targets.problem && (
                <p key={flash} role="status" className="basis-full text-small font-medium text-ink">
                  {targets.problem}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {dialog && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4" onKeyDown={(event) => event.key === 'Escape' && setDialog(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="mark-title" className={`${ds.layer} flex w-100 max-w-full flex-col gap-2 p-6`}>
            <h3 id="mark-title" className="text-subtitle font-semibold text-ink">
              메모에 확인 표시가 남은 사람이 {marks.length}명 있어요
            </h3>
            <p className="text-small text-ink-2">
              {marks
                .slice(0, 8)
                .map((row) => row.name)
                .join(', ')}
              {marks.length > 8 ? ` 외 ${marks.length - 8}명` : ''}
            </p>
            <p className={ds.help}>메모에 확인 표시가 남아 있으면 비트에 넣지 않아요. 고치면 다시 들어가요.</p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {batchCount > 0 && (
                <button type="button" autoFocus className={ds.button.primary} onClick={() => void start('selection')}>
                  빼고 {batchCount}명 입력
                </button>
              )}
              <button
                type="button"
                autoFocus={batchCount === 0}
                className={ds.button.secondary}
                onClick={() => {
                  setDialog(false)
                  setEditing(marks[0]?.key ?? null)
                }}
              >
                먼저 고치기
              </button>
              <button type="button" className={ds.button.secondary} onClick={() => setDialog(false)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
