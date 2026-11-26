'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useDesk } from '@/components/shell/role'
import { useReadOnly } from '@/components/shell/viewing'
import { ConfirmDialog } from '@/components/staff/roster/ConfirmDialog'
import { ds } from '@/components/ui/classes'
import { addMonthsToDay } from '@/lib/analytics/dates'
import { G_COLOR_NAME } from '@/lib/calendar/gshapes'
import { isErrorCode } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import type { GcalRules, GcalView } from '@/types/gcal'
import { GcalNotice, useGcalNotice } from '../frame/notice'
import { countText, hmOf, mdwOf, parseStamp } from '../frame/time'
import { RULES_TEXT as T } from './labels'

// 설정 › 구글 캘린더 › 맞춤 방법 (spec google-link REQ-8531 AC-8531.1~AC-8531.3, notes-calendar `rules`, 시안 calendar.html rulesHTML, design.md 2절 표 4).
// 위 이어짐 띠(이은 캘린더 · 이은 날 · 마지막 맞춤) + [지금 맞추기][연결 시험 · 캘린더 바꾸기][잇기 끊기] → '맞춤 방법' 열다섯 줄(왼쪽 제목 → 오른쪽 글) → [저장].
// 고를 수 있는 넷(받아 오는 간격 · 구글에서 지울 때 · 도착 · 예약 시행자가 아닌 직원)만 [저장]으로 saveRules에 보낸다. 나머지 줄은 정해진 규칙 글이다.
// 취소 색·변경 색 이름은 view.look(시행자·종류 화면에서 바꾼다). 이은 날은 날짜만 둔다(linked_on) → 띠는 '{M/d (요일)}부터'.
// [잇기 끊기]는 한 번 더 묻고 unlink를 부른다(캘린더 id·이은 날만 비우는 일은 저장 함수 unlinkGcal 몫, 그 뒤 화면을 다시 읽는 일은 묶음 몫).
// 저장·맞추기·끊기는 props로 받은 함수다(묶음 GcalSettingsScreen이 lib/storage/gcal·lib/gcal을 잇는다). 저장 실패는 E-SETTINGS-FAILED, 맞추기 실패는 그 오류 번호 카드.
// 데스크(useDesk)·다른 의원 보기는 보기만: 모든 단추·고르기·체크가 잠긴다. PC 화면만(폰 전용 모양 없음)

/** [지금 맞추기] 답: 바뀐 것 수, 또는 오류 번호(E-GCAL-*) */
export type GcalSyncReply = { ok: true; changed: number } | { ok: false; code: string }

type GcalRulesFormProps = {
  /** 지금 연결(비밀 글자 없음) — 캘린더 이름·이은 날·맞춤 방법·취소/변경 색 */
  view: GcalView
  /** 마지막 맞춤(gcal_state.last_ok_at, DB가 준 시각 글자 그대로). 없으면 null */
  lastOkAt: string | null
  /** 고를 수 있는 넷 저장(lib/storage/gcal saveGcalRules) */
  saveRules(rules: GcalRules): Promise<void | 'invalid'>
  /** 한 번 받아 오기(lib/gcal) */
  syncNow(): Promise<GcalSyncReply>
  /** 잇기 끊기(lib/storage/gcal unlinkGcal) */
  unlink(): Promise<void>
  /** [연결 시험 · 캘린더 바꾸기] → 잇기 화면으로 */
  onChangeCalendar(): void
  now?: () => Date
}

const PULL_MINUTES: readonly GcalRules['pullMin'][] = [1, 2, 5]

// 시안 .vseg.sm(받아 오는 간격): 30px·좌우 12px·small, 눌린 칸 accent-soft·accent-strong 600
const segGroup = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface'
const segButton =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40'
const segOn = 'bg-accent-soft font-semibold text-accent-strong'
const segOff = 'font-medium text-ink-2 transition not-disabled:hover:bg-canvas'
const sub = 'text-muted'

function syncCode(value: unknown): ErrorCode {
  return typeof value === 'string' && value.startsWith('E-GCAL-') && isErrorCode(value) ? value : 'E-GCAL-REACH'
}

/** 줄 하나: 왼쪽 제목(dt) → 오른쪽 값(dd) */
function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="pt-1.5 text-small font-semibold text-ink">{term}</dt>
      <dd className="grid min-w-0 gap-1.5 text-small text-ink-2">{children}</dd>
    </div>
  )
}

/** 정해진 규칙 글: 본문 + 옅은 덧붙임 */
function Fixed({ main, extra }: { main: string; extra?: string }) {
  return (
    <p className="pt-1.5">
      {main}
      {extra !== undefined && (
        <>
          {' '}
          <span className={sub}>{extra}</span>
        </>
      )}
    </p>
  )
}

function Choice({ name, checked, disabled, label, extra, onPick }: { name: string; checked: boolean; disabled: boolean; label: string; extra?: string; onPick(): void }) {
  return (
    <label className={`flex items-start gap-2 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onPick} className="mt-0.5 size-4 shrink-0 accent-accent" />
      <span className="text-ink">
        {label}
        {extra !== undefined && (
          <>
            <br />
            <small className="text-caption text-muted">{extra}</small>
          </>
        )}
      </span>
    </label>
  )
}

export function GcalRulesForm({ view, lastOkAt, saveRules, syncNow, unlink, onChangeCalendar, now = () => new Date() }: GcalRulesFormProps) {
  const desk = useDesk()
  const readOnly = useReadOnly()
  const locked = desk || readOnly
  const { notice, say } = useGcalNotice()
  const headId = useId()
  const deleteName = useId()
  const arrivalName = useId()

  const [rules, setRules] = useState<GcalRules>(() => ({ ...view.rules }))
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [bandError, setBandError] = useState<ErrorCode | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [asking, setAsking] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const busy = useRef(false)

  const set = <K extends keyof GcalRules>(key: K, value: GcalRules[K]) => setRules((prev) => ({ ...prev, [key]: value }))
  const lastAt = lastOkAt === null ? null : parseStamp(lastOkAt)
  const lastHm = syncedAt ?? (lastAt === null ? null : hmOf(lastAt))
  const linkedOn = view.linkedOn

  /** 한 번에 하나만(맞추기·저장·끊기) */
  async function once(run: () => Promise<void>) {
    if (locked || busy.current) return
    busy.current = true
    try {
      await run()
    } finally {
      busy.current = false
    }
  }

  const sync = () =>
    once(async () => {
      setSyncing(true)
      setBandError(null)
      let reply: GcalSyncReply | null = null
      try {
        reply = await syncNow()
      } catch {
        reply = null
      }
      setSyncing(false)
      if (reply === null || reply.ok !== true) return setBandError(syncCode(reply?.ok === false ? reply.code : null))
      const hm = hmOf(now())
      setSyncedAt(hm)
      say(T.synced(reply.changed > 0 ? countText(reply.changed) : null, hm))
    })

  const save = () =>
    once(async () => {
      setSaving(true)
      setSaveFailed(false)
      let saved = false
      try {
        saved = (await saveRules({ pullMin: rules.pullMin, onGoogleDelete: rules.onGoogleDelete, arrival: rules.arrival, offAllStaff: rules.offAllStaff })) !== 'invalid'
      } catch {
        saved = false
      }
      setSaving(false)
      if (!saved) return setSaveFailed(true)
      say(T.saved)
    })

  const confirmUnlink = () =>
    once(async () => {
      setUnlinking(true)
      setBandError(null)
      let done = false
      try {
        await unlink()
        done = true
      } catch {
        done = false
      }
      setUnlinking(false)
      setAsking(false)
      if (!done) setBandError('E-SETTINGS-FAILED')
    })

  return (
    <div className="flex flex-col gap-4">
      {linkedOn !== null && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-positive-soft bg-positive-soft px-3.5 py-3 text-small text-ink-2">
          <p className="flex items-center">
            <span aria-hidden="true" className="mr-1.5 inline-block size-2 shrink-0 rounded-full bg-positive" />
            <span>
              {T.bandHead}
              <b className="font-semibold text-ink">{view.calendarName ?? ''}</b>
              {`${T.bandSince(mdwOf(linkedOn))}${lastHm === null ? '' : T.bandLast(lastHm)}`}
            </span>
          </p>
          <span className="flex-1" />
          <button type="button" disabled={locked} aria-busy={syncing || undefined} onClick={sync} className={ds.button.secondary}>
            <Icon name="reload" />
            {T.syncNow}
          </button>
          <button type="button" disabled={locked} onClick={onChangeCalendar} className={ds.button.secondary}>
            {T.changeCalendar}
          </button>
          <button type="button" disabled={locked} onClick={() => !locked && setAsking(true)} className={ds.button.danger}>
            {T.unlink}
          </button>
        </div>
      )}
      {bandError !== null && <ErrorCard code={bandError} />}

      <section aria-labelledby={headId} className="grid min-w-0 gap-3.5 rounded-float border border-line bg-surface px-6 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id={headId} className="text-subtitle font-semibold text-ink">
            {T.title}
          </h2>
          <span className="text-caption text-muted">{T.titleHint}</span>
        </div>
        <dl className="grid">
          <Row term={T.pullKey}>
            <div className="flex flex-wrap items-center gap-2 text-ink">
              {T.pullBefore}
              <div role="group" aria-label={T.pullLabel} className={segGroup}>
                {PULL_MINUTES.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    aria-pressed={rules.pullMin === minutes}
                    disabled={locked}
                    onClick={() => set('pullMin', minutes)}
                    className={`${segButton} ${rules.pullMin === minutes ? segOn : segOff}`}
                  >
                    {T.pullMinute(minutes)}
                  </button>
                ))}
              </div>
              {T.pullAfter}
            </div>
            <p className="text-caption text-muted">{T.pullHint}</p>
          </Row>
          <Row term={T.writeKey}>
            <Fixed main={T.write} />
          </Row>
          <Row term={T.cancelKey}>
            <Fixed main={T.cancelMain(G_COLOR_NAME[view.look.cancel])} extra={T.cancelSub} />
          </Row>
          <Row term={T.deleteKey}>
            <Fixed main={T.delete} />
          </Row>
          <Row term={T.gCancelKey}>
            <Fixed main={T.gCancelMain} extra={T.gCancelSub} />
          </Row>
          <Row term={T.gDeleteKey}>
            <Choice
              name={deleteName}
              checked={rules.onGoogleDelete === 'cancel'}
              disabled={locked}
              label={T.gDeleteCancel}
              extra={T.gDeleteCancelSub}
              onPick={() => set('onGoogleDelete', 'cancel')}
            />
            <Choice name={deleteName} checked={rules.onGoogleDelete === 'delete'} disabled={locked} label={T.gDeleteDelete} onPick={() => set('onGoogleDelete', 'delete')} />
          </Row>
          <Row term={T.bothKey}>
            <Fixed main={T.bothMain} extra={T.bothSub} />
          </Row>
          <Row term={T.moveKey}>
            <Fixed main={T.move(G_COLOR_NAME[view.look.change])} />
          </Row>
          <Row term={T.gMoveKey}>
            <Fixed main={T.gMoveMain} extra={T.gMoveSub} />
          </Row>
          <Row term={T.gChangeKey}>
            <Fixed main={T.gChangeMain} extra={T.gChangeSub} />
          </Row>
          <Row term={T.arrivalKey}>
            <Choice name={arrivalName} checked={rules.arrival === 'off'} disabled={locked} label={T.arrivalOff} extra={T.arrivalOffSub} onPick={() => set('arrival', 'off')} />
            <Choice name={arrivalName} checked={rules.arrival === 'title'} disabled={locked} label={T.arrivalTitle} onPick={() => set('arrival', 'title')} />
          </Row>
          {linkedOn !== null && (
            <Row term={T.daysKey}>
              <Fixed main={T.daysMain(mdwOf(linkedOn))} extra={T.daysSub(addMonthsToDay(linkedOn, -12))} />
            </Row>
          )}
          <Row term={T.overlapKey}>
            <Fixed main={T.overlapMain} extra={T.overlapSub} />
          </Row>
          <Row term={T.skipKey}>
            <Fixed main={T.skipMain} extra={T.skipSub} />
          </Row>
          <Row term={T.leaveKey}>
            <Fixed main={T.leaveMain} extra={T.leaveSub} />
            <label className={`flex items-center gap-2 text-ink ${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <span className={ds.checkboxWrap}>
                <input
                  type="checkbox"
                  checked={rules.offAllStaff}
                  disabled={locked}
                  onChange={(e) => set('offAllStaff', e.target.checked)}
                  className={ds.checkbox}
                />
                <Icon name="check" className={ds.checkboxMark} />
              </span>
              {T.leaveAll}
            </label>
          </Row>
        </dl>
        {saveFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
        <div className="flex justify-end border-t border-line pt-3.5">
          <button type="button" disabled={locked} aria-busy={saving || undefined} onClick={save} className={ds.button.primary}>
            {T.save}
          </button>
        </div>
      </section>

      {asking && (
        <ConfirmDialog
          title={T.unlink}
          body={T.unlinkAsk}
          confirmLabel={T.unlink}
          busy={unlinking}
          onConfirm={confirmUnlink}
          onCancel={() => !unlinking && setAsking(false)}
        />
      )}
      <GcalNotice notice={notice} />
    </div>
  )
}
