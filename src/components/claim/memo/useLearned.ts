'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LearnRule } from '@/lib/precheck/memo'
import { learnName, type StyleChange } from '@/lib/precheck/memo/learn'
import { addLearnKinds, applyStyleChange, revertLearned, saveLearned, tickLearned, type LearnedChange, type LearnedPatch, type LearnedResult } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { FirstLearnKind, PrecheckFromScreen, PrecheckToScreen } from '@/types/precheck'
import type { ClaimWorker } from '../claimLoad'
import type { DialogSave, LearnDraft } from '../rows/LearnDialog'

// 메모 단계의 학습 저장(claim-learn design.md 5-1·6·7절). Worker가 보낸 learnAuto·learnDraft·firstLearn·learnUsed를 듣고 TASK-5 저장 함수(lib/storage/claimSettings)를 부른다.
// 환자 줄 화면(components/claim/rows)은 저장 함수를 부르지 않는다: 학습 창·처음 학습은 고른 것만 올리고 여기가 저장한다.
// 저장한 학습은 서버 병원 문구의 learned 칸뿐이다(환자 이름·차트번호·날짜·차트 원문은 학습 모양에 없다). 된 뒤 onSaved로 위(ClaimScreen)가 새 설정으로 다시 점검한다

/** 모양 고침 물음 하나의 고름(AC-9303.2): 아직 · 모든 메모에 됨 · 이 학습만 됨 · 저장 못 함 */
export type StyleState = { change: StyleChange; state: 'ask' | 'all' | 'line' | 'failed' }
/**
 * 저절로 학습 띠(AC-9301.1·AC-9301.2·AC-9301.5·AC-9301.6). 그 진료(visitKey)의 상세에만 보인다.
 * saving 저장 중 · learned 학습함 · note 학습할 것은 없고 개인정보 줄·모양 고침 물음만 · failed 저장 못 함 · once [이번만 고친 거예요] 됨 · saved 학습 창 [저장] 됨
 */
export type LearnBand =
  | { visitKey: string; phase: 'saving' | 'learned' | 'note'; personal: number; styles: StyleState[] }
  | { visitKey: string; phase: 'failed'; personal: number; styles: StyleState[]; code: 'E-LEARN-SAVE' | 'E-LEARN-PERSONAL' }
  | { visitKey: string; phase: 'once' | 'saved' }
export type LearnDialogState = { draft: LearnDraft; saving: boolean; error: 'E-LEARN-SAVE' | 'E-LEARN-PERSONAL' | null }
export type FirstLearnState = { total: number; kinds: FirstLearnKind[] }

type Listener = (data: PrecheckToScreen) => void
type LearnWorker = Pick<ClaimWorker, 'postMessage' | 'addEventListener'>

/** Worker 하나에 message 듣기 하나(ClaimChannel이 이 메시지들을 나르지 않는다). 그 위에서 화면마다 듣고 그만 듣는다 */
const hubs = new WeakMap<object, Set<Listener>>()
function listen(worker: LearnWorker, fn: Listener): () => void {
  let hub = hubs.get(worker)
  if (!hub) {
    const listeners = new Set<Listener>()
    hub = listeners
    hubs.set(worker, listeners)
    worker.addEventListener('message', (event) => {
      const data = (event as MessageEvent<PrecheckToScreen>).data
      for (const each of [...listeners]) each(data)
    })
  }
  hub.add(fn)
  return () => {
    hub.delete(fn)
  }
}

/** 마지막 저절로 학습 저장(되돌리기·학습 창 재료): 더한 학습 번호와 바꾸기 전 학습 */
type Saved = { visitKey: string; added: string[]; before: LearnRule[] }
const sameStyle = (a: StyleChange, b: StyleChange) => a.field === b.field && a.from === b.from && a.to === b.to

/**
 * 모양 고침 [모든 메모에](AC-9303.2): 그 설정 칸 하나만 저장한다. 서버 값을 다시 읽어 그 칸만 바꾸는 일은 학습 저장과 같은 줄에 서는 applyStyleChange가 한다
 * (학습 저장·남은 확인 바꿈과 겹쳐도 서로 바꾼 칸을 덮지 않는다, 다른 칸·상병 연결표는 그대로)
 */
const applyStyle = async (change: StyleChange): Promise<boolean> => (await applyStyleChange(supabaseBrowser(), change)) === 'ok'

export function useLearned({ worker, onSaved }: { worker: LearnWorker; onSaved(): void }) {
  const [band, setBand] = useState<LearnBand | null>(null)
  const [dialog, setDialog] = useState<LearnDialogState | null>(null)
  const [first, setFirst] = useState<FirstLearnState | null>(null)
  const mounted = useRef(true)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved
  const saved = useRef<Saved | null>(null)
  /** [다시 저장]이 다시 할 일(마지막 저절로 학습 저장 또는 되돌리기) */
  const again = useRef<(() => Promise<void>) | null>(null)
  /** 학습 창 재료를 물은 진료 · 모양 고침 [이 학습만]으로 재료를 물은 진료와 그 물음 */
  const draftFor = useRef<string | null>(null)
  const styleFor = useRef<{ visitKey: string; change: StyleChange } | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const post = useCallback((message: Extract<PrecheckFromScreen, { type: 'learnDraft' | 'firstLearn' }>) => worker.postMessage(message, []), [worker])

  /** 띠의 모양 고침 한 줄의 고름을 바꾼다(그 진료 띠일 때만) */
  const setStyle = (visitKey: string, change: StyleChange, state: StyleState['state']) =>
    setBand((now) => (now && now.visitKey === visitKey && 'styles' in now ? { ...now, styles: now.styles.map((item) => (sameStyle(item.change, change) ? { ...item, state } : item)) } : now))

  /** 저절로 학습 저장 하나(AC-9301.1). 된 뒤 되돌리기 재료를 쥔다 */
  const runSave = useCallback(async (visitKey: string, change: LearnedChange, personal: number) => {
    again.current = () => runSave(visitKey, change, personal)
    const keep = (now: LearnBand | null) => (now && now.visitKey === visitKey && 'styles' in now ? now.styles : [])
    setBand((now) => ({ visitKey, phase: 'saving', personal, styles: keep(now) }))
    const result = await saveLearned(supabaseBrowser(), change)
    if (!mounted.current) return
    if (!result.ok) {
      setBand((now) => ({ visitKey, phase: 'failed', personal, styles: keep(now), code: result.code }))
      return
    }
    saved.current = { visitKey, added: result.added, before: result.before }
    again.current = null
    setBand((now) => ({ visitKey, phase: 'learned', personal, styles: keep(now) }))
    onSavedRef.current()
  }, [])

  /** [이번만 고친 거예요](AC-9301.2): 방금 더한 학습은 지우고 바꾼 학습은 그 전으로 */
  const runOnce = useCallback(async (last: Saved) => {
    again.current = () => runOnce(last)
    const result = await revertLearned(supabaseBrowser(), { added: last.added, before: last.before })
    if (!mounted.current) return
    if (!result.ok) {
      setBand((now) => (now && 'styles' in now ? { ...now, phase: 'failed', code: result.code } : now))
      return
    }
    saved.current = null
    again.current = null
    setBand({ visitKey: last.visitKey, phase: 'once' })
    onSavedRef.current()
  }, [])

  /** 모양 고침 [이 학습만](AC-9303.2): 학습 창 재료의 그 모양 고침 줄을 다른 줄처럼 학습한다(조건은 그 진료 처방 코드 + 부위) */
  const learnStyleLine = useCallback(async (draft: LearnDraft, change: StyleChange) => {
    const line = draft.diffs.find((item) => item.skip === 'style' && item.style && sameStyle(item.style, change))
    if (!line) {
      setStyle(draft.visitKey, change, 'failed')
      return
    }
    const when = { codes: [...draft.codes], regions: [...draft.regions], chartWords: [], withCodes: [], doctors: [] }
    const rule = { kind: line.kind, from: line.kind === 'add' ? '' : line.from, to: line.kind === 'remove' ? '' : line.to, after: line.kind === 'add' ? line.after : '', when, on: true, left: 3 }
    // 기존 학습을 고칠 때는 이름 칸을 보내지 않아 그 학습의 지금 이름이 남는다. 새 학습만 조건 이름
    const result = await saveLearned(supabaseBrowser(), line.update ? { update: [{ ...rule, id: line.update }] } : { add: [{ ...rule, name: learnName(when) }] })
    if (!mounted.current) return
    setStyle(draft.visitKey, change, result.ok ? 'line' : 'failed')
    if (result.ok) onSavedRef.current()
  }, [])

  useEffect(
    () =>
      listen(worker, (data) => {
        if (!mounted.current) return
        switch (data.type) {
          case 'learnAuto': {
            const styles: StyleState[] = data.style.map((change) => ({ change, state: 'ask' }))
            const update = data.update.map((item) => ({ id: item.id, to: item.to, left: 3 }))
            saved.current = null
            again.current = null
            if (data.add.length === 0 && update.length === 0) {
              setBand({ visitKey: data.visitKey, phase: 'note', personal: data.personal, styles })
              return
            }
            setBand({ visitKey: data.visitKey, phase: 'saving', personal: data.personal, styles })
            void runSave(data.visitKey, { add: data.add, update }, data.personal)
            return
          }
          case 'learnDraft': {
            const style = styleFor.current
            if (style && style.visitKey === data.visitKey) {
              styleFor.current = null
              if (data.ok) void learnStyleLine(data, style.change)
              else setStyle(data.visitKey, style.change, 'failed')
              return
            }
            if (draftFor.current !== data.visitKey) return
            draftFor.current = null
            if (data.ok) setDialog({ draft: data, saving: false, error: null })
            return
          }
          case 'learnUsed':
            // 남은 확인 바꾸기는 실패해도 메모 일을 막지 않는다(다음에 다시, design.md 6절)
            void tickLearned(supabaseBrowser(), data.ids, data.how)
            return
          case 'firstLearn':
            setFirst({ total: data.total, kinds: data.kinds })
            return
          default:
            return
        }
      }),
    [worker, runSave, learnStyleLine],
  )

  /** [다시 저장](AC-9301.6) */
  const retry = useCallback(async () => {
    await again.current?.()
  }, [])

  const once = useCallback(async () => {
    const last = saved.current
    if (last) await runOnce(last)
  }, [runOnce])

  /** [조건 바꾸기](AC-9301.2): 그 진료의 학습 창 재료를 묻는다. 답이 오면 dialog가 생긴다 */
  const openDialog = useCallback(
    (visitKey: string) => {
      draftFor.current = visitKey
      post({ type: 'learnDraft', visitKey })
    },
    [post],
  )
  const closeDialog = useCallback(() => {
    draftFor.current = null
    setDialog(null)
  }, [])

  /**
   * 학습 창 [저장](AC-9301.5): 방금 저절로 만든 학습을 창에서 고른 것으로 바꾼다. 더한 학습은 지우고 고른 것을 새로 더하고, 바꾼 학습은 그 번호를 고친다.
   * 새 학습만 창의 조건 이름을 쓰고, 기존 학습을 고칠 때는 그 학습의 지금 이름을 그대로 둔다(바꾸기 전 학습에서 알면 그 이름, 모르면 이름 칸을 보내지 않아 서버 값이 남는다).
   * 창에서 고르지 않은 바꾼 학습은 바꾸기 전으로 되돌린다. [모든 메모에]를 고른 모양 고침은 그 설정 칸만 저장한다
   */
  const saveDialog = useCallback(async ({ rules, styles }: DialogSave) => {
    const now = dialog
    if (!now || now.saving) return
    const visitKey = now.draft.visitKey
    setDialog({ ...now, saving: true, error: null })
    const last = saved.current?.visitKey === visitKey ? saved.current : null
    const added = last?.added ?? []
    const add: Omit<LearnRule, 'id' | 'made'>[] = []
    const update: LearnedPatch[] = []
    const names = new Map((last?.before ?? []).map((old) => [old.id, old.name]))
    for (const { update: base, name, ...rule } of rules) {
      if (base === null || added.includes(base)) add.push({ ...rule, name })
      else {
        const kept = names.get(base)
        update.push({ ...rule, ...(kept === undefined ? {} : { name: kept }), id: base, left: 3 })
      }
    }
    for (const old of last?.before ?? []) if (!rules.some((rule) => rule.update === old.id)) update.push(old)
    let result: LearnedResult | null = null
    if (added.length > 0 || add.length > 0 || update.length > 0) result = await saveLearned(supabaseBrowser(), { remove: added, add, update })
    let styled = true
    if (!result || result.ok) for (const change of styles) styled = (await applyStyle(change)) && styled
    if (!mounted.current) return
    if (result && !result.ok) {
      setDialog({ ...now, saving: false, error: result.code })
      return
    }
    if (result) saved.current = null
    if (!styled) {
      setDialog({ ...now, saving: false, error: 'E-LEARN-SAVE' })
      if (result) onSavedRef.current()
      return
    }
    setDialog(null)
    setBand({ visitKey, phase: 'saved' })
    onSavedRef.current()
  }, [dialog])

  /** 띠의 모양 고침 [모든 메모에](AC-9303.2): 그 설정 칸만 저장한다(학습은 만들지 않는다) */
  const styleAll = useCallback(async (index: number) => {
    const now = band && 'styles' in band ? band : null
    const item = now?.styles[index]
    if (!now || !item) return
    const ok = await applyStyle(item.change)
    if (!mounted.current) return
    setStyle(now.visitKey, item.change, ok ? 'all' : 'failed')
    if (ok) onSavedRef.current()
  }, [band])

  /** 띠의 모양 고침 [이 학습만]: 그 진료의 학습 창 재료를 물어 그 줄을 학습한다 */
  const styleLine = useCallback(
    (index: number) => {
      const now = band && 'styles' in band ? band : null
      const item = now?.styles[index]
      if (!now || !item) return
      styleFor.current = { visitKey: now.visitKey, change: item.change }
      post({ type: 'learnDraft', visitKey: now.visitKey })
    },
    [band, post],
  )

  /** 다른 사람을 고르면 띠는 사라진다(학습은 남는다, design.md 5-1절) */
  const clearBand = useCallback(() => setBand(null), [])

  /** [처음 학습](AC-9305.1): 불러온 진료의 종류를 묻는다 */
  const askFirst = useCallback(() => post({ type: 'firstLearn' }), [post])
  const closeFirst = useCallback(() => setFirst(null), [])
  /** [맞아요](AC-9305.3): 확인한 종류 열쇠를 저장한다(실패해도 이 칸에서는 확인한 것으로 센다) */
  const confirmKinds = useCallback((keys: string[]) => {
    void addLearnKinds(supabaseBrowser(), keys)
  }, [])

  return { band, dialog, first, retry, once, openDialog, closeDialog, saveDialog, styleAll, styleLine, clearBand, askFirst, closeFirst, confirmKinds }
}
