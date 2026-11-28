'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import { Icon } from '@/components/common/Icon'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { diffDays } from '@/lib/analytics/dates'
import { compareVersions } from '@/lib/bridge/handshake'
import { APPEND_HELPER } from '@/lib/bridge/versions'
import { errorInfo } from '@/lib/errors'
import { explainLines, matchPattern, neutralPhrases, slotWords, validatePhrases, type WhyLine } from '@/lib/precheck/memo'
import type { DateRange } from '@/types/dates'
import type { HandStats, InputResultView, InputSelection, InputWhat, MemoScreenView, TargetRow } from '@/types/precheck'
import { ClaimError, SetupLink } from '../ClaimError'
import { runInputExcel, whileWorking, type ClaimChannel, type ClaimStream, type MemoViewAnswer } from '../claimLoad'
import { BitMemoCard } from '../rows/BitMemoCard'
import { FirstLearn } from '../rows/FirstLearn'
import { LearnDialog, styleQuestion } from '../rows/LearnDialog'
import { MemoDetail } from '../rows/MemoDetail'
import { MemoList, type Show } from '../rows/MemoList'
import { StuckBand } from '../rows/StuckBand'
import { WhyTable } from '../rows/WhyTable'
import type { UseBridge } from '../useBridge'
import { BitMemoButton, useBitMemo } from './BitMemoButton'
import { copyText } from './copyMemo'
import { defaultSelection, InputMode } from './InputMode'
import { InputResults } from './InputResults'
import { canCopy, copyStatus, keepOrFirst, listGroups, neighbor, positionOf, showCounts } from './memoSplit'
import { useFitHeight } from './useFitHeight'
import { useMemoDrafts } from './useMemoDrafts'
import { useLearned, type LearnBand } from './useLearned'
import { useSplitKeys } from './useSplitKeys'

// 3~5단계 메모 칸(REQ-018, memo-split 승인 시안 4): 위 도구 줄(요약 · [비트 메모 전체 불러오기] · [비트에 입력 (N명)] · 입력 방식 한 줄) + 두 칸(왼쪽 환자 목록 | 오른쪽 고른 환자 상세)
// → [비트에 입력] → 확인 기다리는 중 → 입력 중 → 입력 결과. 아래 메모 표는 없앴다(AC-3106.4). 그 표의 고치기·상태는 오른쪽 상세가 한 사람씩 대신한다.
// 묶음 글자와 대상 고르기는 Worker가 한다(AC-004.11). 여기는 일만 시키고, 고른 사람·보기·복사 상태만 쥔다. 고친 글·복사로 한 완료는 Worker를 거쳐 도우미가 그 PC에 저장한다.
// 복사(완료)는 우리 메모를 그 PC의 복사 칸에 넣고(copyMemo), 된 때만 Worker에 memoCopied를 보낸다(AC-3103.1~AC-3103.3). 환자 글은 화면 메모리와 Worker 밖으로 나가지 않는다.
// 설정 변경 띠와 기관기호 안내는 ClaimScreen이 화면 맨 위에 둔다(design.md 6-5, AC-018.17). 다른 탭에 다녀오면 비트 메모 읽기 상태와 입력 결과를 ClaimChannel에 맡겨 둔 것으로 되살린다
// claim-learn(AC-9314.2·AC-9315.1): 입력 결과의 [날짜 목록으로]는 onDates. 비트 메모 읽기·입력 중에 도우미가 사라지면(E-HELPER-MISSING) E-HELPER-STOPPED 안내와
// [다시 불러오기](onReload)·[비트 PC 연결 확인]을 그 자리에 보이고, 받은 입력 결과는 그대로 둔다. 비트 메모를 읽는 동안은 onBitReading으로 위에 알린다(일하는 중)
// claim-learn(시안 ?s=memo·learn·why·first·default): 고쳐 저장하면 [학습하기] 없이 저절로 학습 띠(useLearned가 저장, 된 뒤 onLearned로 다시 점검) · [조건 바꾸기] 학습 창 ·
// 빈칸 후보 단추(고친 글과 같은 길) · [왜 이렇게?] 출처 표 · 도구 줄 [처음 학습]·손 간 정도 · 기본 문구 띠 · 설정 바뀜 띠가 떠 있으면 [복사(완료)]도 막음(AC-9314.1)

export type InputStage = 'pick' | 'wait' | 'run' | 'result'

const HELPER_STOPPED = 'E-HELPER-STOPPED'

const WAIT_NOTE = '[취소]를 누르거나 창을 닫거나 5분이 지나면 아무것도 넣지 않아요.'
/** 메모 표가 없어져 끝은 '환자 목록에 보여요.'다(AC-3107.1) */
const LEAVE_NOTE = '다른 탭으로 옮겨도 입력은 PC에서 계속돼요. 결과는 끝난 뒤 [자료 불러오기]를 누르면 환자 목록에 보여요.'
const BAND = 'flex flex-col gap-1 rounded-control bg-warning-soft px-4 py-3'
/** 저절로 학습 띠(notes '저절로 학습'): 파란 띠 · '이번만'은 회색 · 개인정보 줄은 노란 덧붙임 */
const LEARN_BLUE = 'flex flex-wrap items-center gap-2 rounded-control bg-accent-soft px-3 py-1.5 text-small text-ink'
/** 학습 창 [저장] 뒤 알림(시안 ?s=errors의 band ok): 초록 성공 */
const LEARN_SAVED = 'rounded-control bg-positive-soft px-3 py-1.5 text-small text-positive'
const LEARNED_TEXT = '학습했어요. 다음에 같은 처방·부위면 이렇게 써요. 처음 3번은 ‘확인 필요’로 보여 드려요.'
/** 처음 학습 '한 달 불러오기'(AC-9305.4): 불러온 기간이 이 날 수보다 짧으면 */
const MONTH_HINT_DAYS = 7
/** 보일 사람이 없을 때 왼쪽 글(AC-3101.7). 조건 안내가 있으면 그 글이 먼저다 */
const EMPTY: Record<Show, string> = { all: '이 조건에 맞는 진료가 없어요.', todo: '모두 완료했어요.', done: '완료한 환자가 없어요.' }
/**
 * 두 칸(AC-3101.1). lg(64rem, 보통 1024px) 이상의 높이는 useFitHeight가 두 칸 위 끝을 재어 정한다(창 높이 − 위 끝 − 16px, 가장 작게 20rem).
 * 잴 수 없을 때만 이 class의 예전 높이(화면 높이 − 위에 붙는 띠·탭 줄과 아래 여백)다. 각 칸이 따로 스크롤되어 페이지가 목록 길이만큼 늘지 않는다
 */
const SPLIT = 'grid min-w-0 overflow-clip rounded-control border border-line bg-surface lg:h-[max(30rem,calc(100dvh-8.5rem))] lg:grid-cols-[272px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]'

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
  /** [메모 확인에서 고치기]로 온 사람: 골라 두고 고치는 칸을 연다(AC-3105.6) */
  focusKey?: string | null
  /** 병원 설정 줄에 기억한 입력 방식(clinic-profile AC-6610.1). ClaimScreen이 읽어 넘긴다. 없으면 날짜별로 시작한다 */
  savedMode?: InputSelection['mode'] | null
  /** 사람이 입력 방식을 바꿨다(AC-6610.2). ClaimScreen이 저장한다: 이 칸은 저장소를 부르지 않는다 */
  onModeChange?(mode: InputSelection['mode']): void
  /** 연결된 도우미 판(hello.helperVersion). APPEND_HELPER보다 낮거나 모르면 [뒤에 붙이기]를 보이지 않는다(AC-6611.1) */
  helperVersion?: string
  /** 입력 결과의 [날짜 목록으로](AC-9314.2). ClaimScreen이 날짜 칸으로 가고 목록을 다시 읽는다 */
  onDates?(): void
  /** 비트 메모를 읽는 중인가(AC-9315.1의 일하는 중). ClaimScreen이 위로 알린다 */
  onBitReading?(reading: boolean): void
  /** 점검에 쓴 병원 문구([왜 이렇게?] 출처 찾기, claim-learn AC-9306.1). 없으면(줄 없음) 기본 문구로 본다 */
  phrases?: unknown
  /** 학습·모양 고침을 저장했다(AC-9301.1). ClaimScreen이 새 설정으로 다시 점검한다 */
  onLearned?(): void
  /** 처음 학습 [지난 30일 불러오기](AC-9305.4). ClaimScreen이 오늘−29일~오늘을 불러온 뒤 openFirst로 처음 학습을 다시 연다 */
  onLoadMonth?(): void
  /** 이 칸을 열면서 처음 학습을 연다(한 달을 불러온 뒤, AC-9305.4) */
  openFirst?: boolean
  onFirstOpened?(): void
}

/** 손 간 정도(claim-learn AC-9318.1, notes 글): p = k ÷ n 반올림 정수. n이 0이면 없다 */
function handText(stats: HandStats | undefined): string | null {
  if (!stats || stats.need <= 0) return null
  return `이 기간 메모 ${stats.need}건 · 학습이 쓴 메모 ${stats.learned}건 · 사람이 고친 메모 ${stats.edited}건 (${Math.round((stats.edited * 100) / stats.need)}%)`
}

/**
 * 메모 줄마다 출처(AC-9306.1, design.md 8절). 학습이 쓴 줄은 그 진료에 쓰인 학습(learned 꼬리표)의 문장 틀과 줄 전체가 맞는 줄이다.
 * 병원 문구가 검사를 지나지 못하거나 없으면 기본 문구로 본다(메모 엔진과 같다)
 */
function whyLinesOf(row: TargetRow, phrases: unknown): WhyLine[] {
  const checked = phrases === null || phrases === undefined ? null : validatePhrases(phrases)
  const base = checked?.ok ? checked.value : neutralPhrases()
  const words = slotWords(base)
  const rules = Array.isArray(base.learned) ? base.learned : []
  const lines = row.text.split('\n').filter((line) => line.trim())
  const used = (row.learned ?? []).flatMap((tag) => {
    const rule = rules.find((item) => item.id === tag.id)
    if (!rule || rule.kind === 'remove' || !rule.to.trim()) return []
    return lines.filter((line) => matchPattern(rule.to, line, words) !== null).map((line) => ({ id: tag.id, name: tag.name, line }))
  })
  const visit = { rx: row.rxRows.map((item) => ({ code: item.code, name: item.name, qty: item.qty, benefit: item.benefit, pay: '' })), lines: row.chartLines.map((line) => line.text) }
  return explainLines(row.text, used, visit, base)
}

/** 저절로 학습 띠(AC-9301.1·AC-9301.2·AC-9301.5·AC-9301.6·AC-9303.1, notes '저절로 학습' 글 그대로). 상세의 메모 칸 아래에 선다 */
function LearnBandView({ band, onOnce, onConditions, onRetry, onStyleAll, onStyleLine }: { band: LearnBand; onOnce(): void; onConditions(): void; onRetry(): void; onStyleAll(index: number): void; onStyleLine(index: number): void }) {
  if (band.phase === 'saving') return null
  return (
    <div role="region" aria-label="저절로 학습" className="flex flex-col gap-1.5">
      {band.phase === 'learned' && (
        <div className={LEARN_BLUE}>
          <p>{LEARNED_TEXT}</p>
          <span className="flex-1" />
          <button type="button" className={ds.button.secondarySmall} onClick={onOnce}>
            이번만 고친 거예요
          </button>
          <button type="button" className={ds.button.secondarySmall} onClick={onConditions}>
            조건 바꾸기
          </button>
        </div>
      )}
      {band.phase === 'once' && <p className="rounded-control bg-canvas px-3 py-1.5 text-small text-ink-2">이번 고침만 저장했어요. 학습은 하지 않았어요.</p>}
      {band.phase === 'saved' && <p className={LEARN_SAVED}>학습했어요. 처음 3번은 ‘확인 필요’로 보여 드려요.</p>}
      {band.phase === 'failed' && (
        <div className="flex flex-col items-start gap-1.5">
          <ErrorCard code={band.code} />
          <button type="button" className={ds.button.primarySmall} onClick={onRetry}>
            다시 저장
          </button>
        </div>
      )}
      {'personal' in band && band.personal > 0 && <p className="rounded-control bg-warning-soft px-3 py-1.5 text-small text-warning">{`전화번호·주민번호 같은 글이 있는 줄 ${band.personal}개는 학습하지 않았어요.`}</p>}
      {'styles' in band &&
        band.styles.map((item, index) =>
          item.state === 'ask' || item.state === 'failed' ? (
            <div key={index} className="flex flex-col gap-1.5">
              <div className={LEARN_BLUE}>
                <p>{styleQuestion(item.change)}</p>
                <span className="flex-1" />
                <button type="button" className={ds.button.primarySmall} onClick={() => onStyleAll(index)}>
                  모든 메모에
                </button>
                <button type="button" className={ds.button.secondarySmall} onClick={() => onStyleLine(index)}>
                  이 학습만
                </button>
              </div>
              {item.state === 'failed' && <ErrorCard code="E-LEARN-SAVE" />}
            </div>
          ) : null,
        )}
    </div>
  )
}

/**
 * 병원 문구가 없는 병원의 잠금 칸(AC-018.18, clinic-profile AC-6607.4): 오류처럼 빨갛게 하지 않고 파란 안내이고 오류 번호가 없다.
 * 글은 E-MEMO-NO-SETTINGS 글 그대로이고 설정(병원 문구 칸이 있는 곳)으로 가는 [설정으로 가기]가 있다(설정의 상병 연결표 잠금 칸과 같은 모양)
 */
function NoPhrases() {
  const info = errorInfo('E-MEMO-NO-SETTINGS')
  return (
    <section className={`${ds.panel} flex flex-col gap-2 p-4`}>
      <h3 className={ds.panelTitle}>메모</h3>
      <div role="status" aria-label="병원 문구 없음" className="flex flex-col items-start gap-2 rounded-control bg-accent-soft px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-small font-semibold text-accent-strong">{info.what}</p>
          <p className="text-small text-ink-2">{info.fix}</p>
        </div>
        <Link href="/settings" className={ds.button.secondarySmall}>
          설정으로 가기
        </Link>
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

const without = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
  if (!set.has(key)) return set
  const next = new Set(set)
  next.delete(key)
  return next
}

export function MemoPanel(props: MemoPanelProps) {
  if (props.memoBlocked) return <NoPhrases />
  return <Panel {...props} />
}

function Panel(props: MemoPanelProps) {
  const { channel, stream, onProgress, load, check, visible, loadedAt, settingsStale, storeStuck, onStoreStuck, checkFresh, onLoadRange, onReload, onStage, flushRef, focusKey, savedMode, onModeChange, helperVersion, onDates, onBitReading } = props
  const { phrases, onLearned, onLoadMonth, openFirst = false, onFirstOpened } = props
  const kept = useRef(channel.keptMemo())
  const [selection, setSelection] = useState<InputSelection>(() => defaultSelection(visible, savedMode))
  const [view, setView] = useState<MemoScreenView | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  const [stage, setStage] = useState<InputStage>(kept.current?.result ? 'result' : 'pick')
  const [result, setResult] = useState<InputResultView | null>(kept.current?.result ?? null)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [notice, setNotice] = useState(false)
  const [inputError, setInputError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [dialog, setDialog] = useState(false)
  const [flash, setFlash] = useState(0)
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  // 두 칸 보기(design.md memo-split MemoPanel): 고른 사람 · 보기 · 머물 사람(보기로 걸러져도 고른 채 남김, AC-3101.6) · 복사 상태
  const [selectedKey, setSelectedKey] = useState<string | null>(focusKey ?? null)
  const [show, setShow] = useState<Show>('all')
  const [stayKey, setStayKey] = useState<string | null>(focusKey ?? null)
  const [editing, setEditing] = useState<string | null>(focusKey ?? null)
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set())
  const [copying, setCopying] = useState<string | null>(null)
  const [justCopied, setJustCopied] = useState<string | null>(null)
  const [reopened, setReopened] = useState<string | null>(null)
  /** 사람이 처음 골랐나: 그때 한 번만 비트 메모를 저절로 읽는다(AC-3102.5) */
  const picked = useRef(false)
  const copyingRef = useRef(false)
  const shownRef = useRef<string | null>(null)
  const detailRef = useRef<HTMLElement>(null)
  const splitRef = useRef<HTMLDivElement>(null)
  /** 두 칸 높이(AC-3101.1): 두 칸이 보이는 동안(보기가 왔고 결과 화면이 아님) lg(64rem) 이상이면 위 끝을 재어 정한다 */
  const fitHeight = useFitHeight(splitRef, view !== null && stage !== 'result')
  const selectionRef = useRef(selection)
  selectionRef.current = selection
  /** 사람이 이 칸에서 입력 방식을 골랐나: 그 뒤로는 늦게 온 저장된 방식으로 바꾸지 않는다 */
  const modeTouched = useRef(false)
  /** [뒤에 붙이기]는 도우미가 appends를 알 때만(APPEND_HELPER 이상, AC-6611.1). 판을 모르거나 읽을 수 없으면 옛 판으로 본다 */
  const canAppend = helperVersion !== undefined && compareVersions(helperVersion, APPEND_HELPER) >= 0
  // 청구 메모 학습(claim-learn): 저장은 useLearned가 하고, 된 뒤 ClaimScreen이 다시 점검한다(onLearned)
  const onLearnedRef = useRef(onLearned)
  onLearnedRef.current = onLearned
  const learned = useLearned({ worker: channel.worker, onSaved: () => onLearnedRef.current?.() })
  const [whyOpen, setWhyOpen] = useState(false)
  const [firstOpen, setFirstOpen] = useState(false)
  /** 이 칸을 연 뒤 [맞아요]로 확인한 처음 학습 종류(AC-9305.2) */
  const [confirmedKinds, setConfirmedKinds] = useState<ReadonlySet<string>>(() => new Set())
  const { askFirst } = learned
  /** [처음 학습](AC-9305.1): Worker에 종류를 묻고 처음 학습 칸을 연다 */
  const openFirstLearn = useCallback(() => {
    askFirst()
    setFirstOpen(true)
  }, [askFirst])
  // 한 달을 불러온 뒤 처음 학습을 다시 연다(AC-9305.4)
  const firstAsked = useRef(false)
  useEffect(() => {
    if (!openFirst || firstAsked.current) return
    firstAsked.current = true
    openFirstLearn()
    onFirstOpened?.()
  }, [openFirst, openFirstLearn, onFirstOpened])

  // 저장된 방식이 이 칸이 열린 뒤에 왔으면(읽기가 늦음) 아직 고르지 않았을 때만 그 방식으로 바꾼다(AC-6610.1)
  useEffect(() => {
    if (modeTouched.current || (savedMode !== 'code' && savedMode !== 'date')) return
    setSelection((now) => (now.mode === savedMode ? now : { ...now, mode: savedMode }))
  }, [savedMode])

  /** 고른 조건을 바꾼다. 입력 방식이 바뀌었을 때만 ClaimScreen에 알려 저장하게 한다(AC-6610.2) */
  const changeSelection = (next: InputSelection) => {
    if (next.mode !== selectionRef.current.mode) {
      modeTouched.current = true
      onModeChange?.(next.mode)
    }
    setSelection(next)
  }
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
  useEffect(() => {
    onBitReading?.(reading)
  }, [onBitReading, reading])
  useEffect(() => () => onBitReading?.(false), [onBitReading])
  /** 비트 메모 읽기 중에 도우미가 멈췄다(AC-9315.1, runMemoReload가 번호를 바꾼다) */
  const bitStopped = bit.state.status === 'failed' && bit.state.code === HELPER_STOPPED
  /** 입력 오류, 없으면 비트 메모 읽기 멈춤(AC-9315.1) */
  const shownError = inputError ?? (bitStopped ? HELPER_STOPPED : null)

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
        setInputError(whileWorking(begin.code))
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
        // 입력 중에 도우미가 사라지면 그 자리 멈춤 안내다(AC-9315.1)
        setInputError(whileWorking(end.code))
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

  // ── 두 칸 보기: 목록 묶음과 고른 사람(AC-3101.5·AC-3101.6·AC-3101.8). 묶음·차례는 Worker가 정했고 memoSplit이 펼친다
  const targets = view?.targets ?? null
  const groups = targets ? listGroups(targets, show, stayKey) : []
  /** 지금 고른 사람: 목록에 있으면 그대로, 없으면 맨 위(AC-3101.8). 아직 보기가 없으면 처음 값(focusKey) 그대로다 */
  const shownKey = targets ? keepOrFirst(groups, selectedKey) : selectedKey
  shownRef.current = shownKey
  const shownRow = shownKey === null ? null : (groups.flatMap((group) => group.rows).find((item) => item.key === shownKey) ?? null)

  /** 잠깐 글(복사했고 완료했어요 · 완료가 풀렸어요)과 고치는 칸은 사람을 바꾸면 지운다. 복사 실패는 그 사람에게 남는다(AC-3103.7) */
  const choose = (key: string | null) => {
    if (key === shownKey) return
    setSelectedKey(key)
    setStayKey(key)
    setJustCopied(null)
    setReopened(null)
    setEditing(null)
    learned.clearBand() // 다른 사람을 고르면 띠는 사라진다(학습은 남는다, design.md 5-1절)
  }

  // 새 목록이 와서 고른 사람이 바뀌면(없어져 맨 위로) 그 사람을 고른 것으로 둔다. 보기를 바꾼 뒤 남은 사람은 머물 사람이 된다
  useEffect(() => {
    if (!targets) return
    if (shownKey !== selectedKey) {
      setSelectedKey(shownKey)
      setStayKey(shownKey)
      setJustCopied(null)
      setReopened(null)
      setEditing(null)
    } else if (stayKey !== shownKey) setStayKey(shownKey)
  }, [targets, shownKey, selectedKey, stayKey])

  // 사람이 바뀌면 오른쪽 상세는 맨 위로 간다(AC-3102.1). 같은 사람의 보기를 다시 받을 때는 그대로다
  useEffect(() => {
    if (detailRef.current) detailRef.current.scrollTop = 0
  }, [shownKey])

  /** 사람이 고른다(줄 누름·↑↓·앞뒤 단추). 처음 한 번은 비트 메모를 저절로 읽는다. 입력 중에는 읽지 않는다(AC-3102.5) */
  const pick = (key: string) => {
    if (!picked.current && !locked) {
      picked.current = true
      bit.readOnce()
    }
    choose(key)
  }
  const move = (step: 1 | -1) => {
    if (shownKey === null) return
    const next = neighbor(groups, shownKey, step)
    if (next !== null) pick(next)
  }
  /** [전체 · 미완료 · 완료]: 그 줄만 남긴다. 고른 사람이 남으면 그대로, 아니면 맨 위(AC-3101.5) */
  const changeShow = (next: Show) => {
    setShow(next)
    setStayKey(null)
  }

  /** 우리 메모(고친 글이 있으면 그 글) */
  const textOf = (row: TargetRow) => drafts.valueOf(row.key, row.text)

  /**
   * 복사(완료)(AC-3103.1~AC-3103.4). 확인 창 없이 복사하고, 된 때만 Worker에 그 글을 보내 완료로 둔다. 안 되면 아무것도 보내지 않는다.
   * 결과는 누른 사람에게 붙는다: 그새 다른 사람으로 옮겨도 그 사람의 완료·복사 못 함이다. 복사하는 동안은 또 누를 수 없다
   */
  const copy = async () => {
    const row = shownRow
    if (row === null || copyingRef.current || locked || storeStuck || settingsStale || editing === row.key) return
    const key = row.key
    const text = textOf(row)
    if (!canCopy({ ...row, text })) return
    copyingRef.current = true
    setCopying(key)
    const ok = await copyText(text)
    copyingRef.current = false
    if (ok) {
      drafts.flush(key) // 남은 고친 글이 먼저 간다: Worker는 차례대로 받고 같은 글일 때만 완료한다
      channel.tell({ type: 'memoCopied', visitKey: key, text })
    }
    if (!mounted.current) return
    setCopying(null)
    if (ok) {
      setFailed((now) => without(now, key))
      setReopened((now) => (now === key ? null : now))
      if (shownRef.current === key) setJustCopied(key)
      void refreshRef.current()
    } else {
      setFailed((now) => new Set(now).add(key))
      setJustCopied((now) => (now === key ? null : now))
    }
  }

  useSplitKeys({ enabled: stage === 'pick' && !dialog && learned.dialog === null && view !== null, onMove: move, onCopy: () => void copy() })

  const batch = targets?.batch ?? []
  const marks = targets?.left.find((group) => group.reason === 'mark')?.rows ?? []
  /** [비트에 입력 (N명)]: 입력할 사람 가운데 완료를 뺀 수(AC-3104.5) */
  const doneCount = batch.filter((item) => item.done).length
  const batchCount = batch.length - doneCount

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

  const viewFailed = viewError && (
    <div className="flex flex-col items-start gap-2">
      <ClaimError code={viewError} />
      <button type="button" className={ds.button.primarySmall} onClick={onReload}>
        다시 불러오기
      </button>
    </div>
  )
  if (!view || !targets) return viewFailed || <p className="text-small text-muted">메모를 준비하는 중이에요…</p>
  const { stuck, noAsk } = view
  const leftCount = targets.left.reduce((sum, group) => sum + group.rows.length, 0)
  const replacingText = targets.replacing > 0 ? ` 다른 메모 ${targets.replacing}명은 우리 메모로 바뀌고, 원래 메모는 기록에 남아요.` : ''
  const sideText = storeStuck
    ? '저장이 막혀 있는 동안에는 입력할 수 없어요.'
    : stuck
      ? '쓰다 멈춘 사람을 먼저 확인해 주세요.'
      : settingsStale
        ? '[다시 점검]을 누른 뒤에 눌러 주세요.'
        : `${noAsk ? '누르면 PC 확인 창 없이 바로 시작해요.' : '누르면 PC 화면에 확인 창이 떠요. 거기서 [확인]을 눌러야 들어가요.'}${replacingText}`

  /** 오른쪽 상세 하나(REQ-3105). 우리 메모는 고친 글이 있으면 그 글이다 */
  const detail = (() => {
    if (shownRow === null) return <p className="text-small text-muted">목록에 보여 줄 환자가 없어요.</p>
    const key = shownRow.key
    const row: TargetRow = { ...shownRow, text: textOf(shownRow) }
    const place = positionOf(targets, key)
    const tableRow = view.table.find((item) => item.key === key)
    // 우리 메모가 있는 사람이면 글이 비어도 고치는 칸을 연다(AC-3105.2). 복사는 canCopy가 빈 글이면 막는다
    const isEditing = editing === key && row.hasMemo
    const before = row.text
    return (
      <MemoDetail
        key={key}
        row={row}
        group={place?.id ?? 'batch'}
        groupName={place?.name ?? ''}
        position={{ index: place?.index ?? 1, total: place?.total ?? 1 }}
        tableRow={tableRow}
        canPrev={neighbor(groups, key, -1) !== null}
        canNext={neighbor(groups, key, 1) !== null}
        onPrev={() => move(-1)}
        onNext={() => move(1)}
        status={copyStatus({ row, editing: isEditing, failed: failed.has(key), reopened: reopened === key, justCopied: justCopied === key, locked, storeStuck, stale: settingsStale })}
        copying={copying === key}
        failed={failed.has(key)}
        copyDisabled={isEditing || locked || storeStuck || settingsStale || copying !== null || !canCopy(row)}
        undoDisabled={locked || storeStuck}
        editing={isEditing}
        locked={locked}
        reading={reading}
        startBlocked={startBlocked}
        showUnsaved={storeStuck || saveError !== null}
        heldCount={targets.left.find((group) => group.reason === 'held')?.rows.length ?? 0}
        card={<BitMemoCard row={row} state={bit.state} afterEntry={tableRow?.afterEntry ?? false} locked={locked} />}
        canAppend={canAppend}
        onCopy={() => void copy()}
        onUndone={() => {
          if (locked || storeStuck) return
          channel.tell({ type: 'memoUndone', visitKey: key })
          setJustCopied(null)
          void refreshRef.current()
        }}
        onEdit={() => {
          setEditing(key)
          setJustCopied(null)
        }}
        onEditDone={(text) => {
          setEditing(null)
          if (text === before) return // 같은 글이면 보내지 않는다(AC-3105.4)
          drafts.change(key, text)
          drafts.flush(key)
          setJustCopied(null)
          // 완료한 사람을 고치면 Worker가 완료를 푼다(AC-2202.1). 그 사람의 상태 줄이 알린다(AC-3104.6)
          if (row.done) setReopened(key)
        }}
        onApprove={(approved) => {
          channel.tell({ type: 'memoApprove', visitKey: key, approved })
          void refreshRef.current()
        }}
        onHeldRetry={() => void start('held')}
        onFill={(text) => {
          // 빈칸 후보 단추(AC-9307.3): [메모 고치기] 저장과 같은 길(고친 글)로 보낸다
          if (locked || text === before) return
          drafts.change(key, text)
          drafts.flush(key)
          setJustCopied(null)
          if (row.done) setReopened(key)
        }}
        onWhy={() => setWhyOpen((now) => !now)}
        why={whyOpen ? <WhyTable lines={whyLinesOf(row, phrases)} /> : undefined}
        learnBand={
          learned.band && learned.band.visitKey === key ? (
            <LearnBandView
              band={learned.band}
              onOnce={() => void learned.once()}
              onConditions={() => learned.openDialog(key)}
              onRetry={() => void learned.retry()}
              onStyleAll={(index) => void learned.styleAll(index)}
              onStyleLine={(index) => learned.styleLine(index)}
            />
          ) : undefined
        }
      />
    )
  })()

  const hand = handText(view.handStats)
  const first = firstOpen ? learned.first : null
  /** 학습 창 칩의 함께 한 다른 시술 이름: 그 진료 처방의 짧은 이름(없으면 처방명) */
  const dialogRow = learned.dialog ? (groups.flatMap((group) => group.rows).find((item) => item.key === learned.dialog!.draft.visitKey) ?? null) : null
  const dialogNames = Object.fromEntries((dialogRow?.rxRows ?? []).map((item) => [item.code, item.short.trim() || item.name]))

  return (
    // data-wide-page(claim-memo-fit AC-4801.1): 이 칸이 있는 동안 앱 틀(AppShell·TabBar)이 1024px 이상에서 1280 폭 제한을 푼다
    <div data-wide-page="" className="flex flex-col gap-3">
      {viewFailed}
      {view.defaultPhrases && (
        // 병원 문구가 없어 기본 문구로 만들었다(AC-9310.1): 잠그지 않고 메모 단계 위에 파란 띠
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-control bg-accent-soft px-4 py-3">
          <p className="text-small text-ink">아직 우리 병원 문구가 없어 기본 문구로 만들었어요. 처음 학습을 하면 우리 병원 메모 모양에 맞춰져요.</p>
          <span className="flex-1" />
          <button type="button" className={ds.button.primarySmall} disabled={locked} onClick={openFirstLearn}>
            처음 학습
          </button>
          <Link href="/settings?ptab=basic" className={ds.button.secondarySmall}>
            병원 문구 설정
          </Link>
        </div>
      )}
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
      {shownError && (
        <div className="flex flex-col items-start gap-2">
          <ClaimError code={shownError} />
          <div className="flex flex-wrap items-center gap-2">
            {(shownError === 'E-CLAIM-PARTIAL' || shownError === HELPER_STOPPED) && (
              <button type="button" className={ds.button.primarySmall} onClick={onReload}>
                다시 불러오기
              </button>
            )}
            <SetupLink code={shownError} />
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
          onDates={() => onDates?.()}
        />
      ) : (
        <>
          {/* 위 도구 줄(AC-3106.1): 첫 줄 요약 · [비트 메모 전체 불러오기] · 흰 [비트에 입력 (N명)], 그 아래 입력 방식 한 줄 */}
          <section aria-label="입력 도구" className="flex min-w-0 flex-col gap-2 rounded-control border border-line bg-canvas px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-2">
              <p className="self-center text-small text-ink-2">
                <b className="text-subtitle font-semibold text-ink">{batch.length}명</b> 입력해요 · 그중{' '}
                <span className="inline-flex items-center gap-0.5 font-semibold text-positive">
                  <Icon name="check" size={12} />
                  완료 {doneCount}명
                </span>{' '}
                · 빠지는 사람 {leftCount}명
              </p>
              {hand && <span className={`${ds.chip.accent} self-center`}>{hand}</span>}
              <span className="flex-1" />
              {/* 단추 아래 선은 예전 입력 방식 칸 안에서 나누던 것이라 도구 줄에서는 뺀다 */}
              <div className="min-w-0 *:border-b-0 *:pb-0">
                <BitMemoButton state={bit.state} blocked={locked} onRead={bit.read} />
              </div>
              {stage === 'pick' && (
                <button type="button" className={ds.button.secondary} onClick={openFirstLearn}>
                  처음 학습
                </button>
              )}
              {stage === 'pick' && (
                <button type="button" className={ds.button.secondary} disabled={storeStuck || stuck !== null || settingsStale || reading} aria-disabled={batchCount === 0 || undefined} onClick={press}>
                  비트에 입력 ({batchCount}명)
                </button>
              )}
            </div>
            {stage === 'pick' && <p className="text-right text-small text-ink-2 max-md:text-left">{sideText}</p>}
            {stage === 'pick' && flash > 0 && batchCount === 0 && targets.problem && (
              <p key={flash} role="status" className="text-small font-medium text-ink">
                {targets.problem}
              </p>
            )}
            <InputMode visible={visible} selection={selection} onSelection={changeSelection} problem={targets.problem} chips={targets.chips} typedOverChip={targets.typedOverChip} locked={locked} />
          </section>
          {first && (
            <FirstLearn
              total={first.total}
              kinds={first.kinds}
              confirmed={confirmedKinds}
              short={first.total === 0 || diffDays(visible.from, visible.to) + 1 < MONTH_HINT_DAYS}
              onRight={(kind) => {
                learned.confirmKinds([kind.key])
                setConfirmedKinds((now) => new Set(now).add(kind.key))
              }}
              onFix={(kind) => {
                // 그 예시 진료를 골라 고치기 칸을 연다. 고쳐 저장하면 저절로 학습 띠(AC-9305.2)
                setFirstOpen(false)
                pick(kind.example.visitKey)
                setEditing(kind.example.visitKey)
              }}
              onStop={() => {
                setFirstOpen(false)
                learned.closeFirst()
              }}
              onLoadMonth={() => onLoadMonth?.()}
            />
          )}
          {/* 두 칸(AC-3101.1): lg(64rem) 이상 나란히(왼쪽 272px, claim-memo-fit AC-4802.1)이고 잰 높이(없으면 class의 예전 높이), 좁으면 위아래(목록 화면 높이 40%까지). 각자 스크롤된다 */}
          <div ref={splitRef} className={SPLIT} style={fitHeight === undefined ? undefined : { height: fitHeight }}>
            <div className="flex min-h-0 min-w-0 flex-col border-line max-lg:max-h-[40dvh] max-lg:border-b lg:border-r">
              {/* 맞춘 높이를 주면 높이가 맞춰진 뒤 고른 줄이 보이게 목록을 한 번 더 움직인다(AC-3101.4: 점검 결과에서 온 아래쪽 사람이 숨지 않는다) */}
              <MemoList groups={groups} counts={showCounts(targets)} show={show} selectedKey={shownKey} failed={failed} empty={targets.problem ?? EMPTY[show]} fitHeight={fitHeight} onShow={changeShow} onPick={pick} />
            </div>
            {/* lg 이상은 세로 flex라 상세(머리 한 줄 + 세 칸)가 이 높이를 채우고 칸마다 스크롤된다. 넘치면 예전처럼 이 칸이 스크롤된다(AC-4803.7) */}
            <section ref={detailRef} aria-label="고른 환자 메모" className="min-h-0 min-w-0 overflow-y-auto overscroll-contain px-5 py-4 max-md:px-4 lg:flex lg:flex-col lg:py-3">
              {detail}
            </section>
          </div>
        </>
      )}
      {learned.dialog && (
        <LearnDialog
          key={learned.dialog.draft.visitKey}
          draft={learned.dialog.draft}
          saving={learned.dialog.saving}
          error={learned.dialog.error}
          names={dialogNames}
          onCancel={learned.closeDialog}
          onSave={(save) => void learned.saveDialog(save)}
        />
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
                  // 첫 사람을 골라 그 사람의 고치는 칸을 연다(AC-3107.1)
                  const first = marks[0]?.key
                  if (first === undefined) return
                  choose(first)
                  setEditing(first)
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
