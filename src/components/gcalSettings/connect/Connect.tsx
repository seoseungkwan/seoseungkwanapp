'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useDesk } from '@/components/shell/role'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { josa } from '@/lib/calendar/josa'
import { isErrorCode } from '@/lib/errors'
import { buildCalendarCode } from '@/lib/gcal/calendarCode'
import { GCAL_DEFAULT_HEX, type GcalView } from '@/types/gcal'
import type { ErrorCode } from '@/types/errors'
import { GcalNotice, useGcalNotice } from '../frame/notice'
import { countText, hmOf, mdwHmOf } from '../frame/time'
import { CONNECT_TEXT as T, type HowtoPiece } from './labels'
import { isHex, isScriptUrl, isSecret, newSecret } from './secret'

// 설정 › 구글 캘린더 › 잇기 (spec google-link REQ-8528 AC-8528.2~AC-8528.5, notes-calendar `connect`, 시안 calendar.html connectHTML, design.md 2절 표 1·7, 5절).
// 1 구글 코드 붙이기(따라 하기 다섯 줄 + [구글 코드 복사]) → 2 코드 주소·비밀 글자 + [연결 시험] → 3 캘린더 고르기 → ['{이름}'{로/으로} 잇고 다음 →].
// [구글 코드 복사]: crypto.getRandomValues 32바이트 → base64url 비밀 글자 → buildCalendarCode(TASK-11) → 클립보드. 비밀 글자 칸은 가린 채 채운다([보기]/[숨기기]).
// [연결 시험]이 된 뒤에만 주소·비밀 글자를 저장하고(saveConnection), 저장한 비밀 글자는 칸에서 지워 다시 그리지 않는다(view에도 비밀 글자는 없다 — hasSecret만).
// 비밀 글자 칸이 비어 있고 저장한 것이 있으면 secret: null로 부른다(= 저장한 비밀 글자로 시험·주소만 바꿔 저장, 부르는 쪽이 저장한 것을 꺼내 쓴다).
// 구글 부르기·저장은 props로 받은 함수다(묶음 GcalSettingsScreen이 lib/gcal client·lib/storage/gcal을 잇는다). 구글이 준 글(message)은 그리지 않고 오류 번호 카드만.
// 데스크(useDesk)·다른 의원 보기는 보기만: 모든 칸·단추가 잠긴다. PC 화면만(폰 전용 모양 없음)

export type GcalCalendarAccess = 'owner' | 'writer' | 'reader' | 'freeBusyReader'
/** 구글 코드 ping 답의 캘린더 한 줄(design.md 8-2). past·future는 owner·writer만 센다 */
export type GcalCalendarInfo = { id: string; name: string; access: GcalCalendarAccess; hex: string; past: number; future: number }
/** 구글 코드 ping 답(design.md 8-2·12절). 실패면 오류 번호(E-GCAL-*)가 code와 error 두 칸에 같다 */
export type GcalPingReply =
  | { ok: true; version: string; now?: string; calendars: GcalCalendarInfo[] }
  | { ok: false; version?: string; error: string; code: string; message?: string }
/** secret null = 저장해 둔 비밀 글자 그대로 */
export type GcalConnectionInput = { scriptUrl: string; secret: string | null }
export type GcalCalendarInput = { calendarId: string; calendarName: string; defaultHex: string }

type GcalConnectProps = {
  /** 지금 연결(비밀 글자 없음). 줄이 없으면 null. 처음 그릴 때 값으로 칸을 채운다 */
  view: GcalView | null
  /** 구글 코드 ping(캘린더 목록) */
  ping(input: GcalConnectionInput): Promise<GcalPingReply>
  /** 시험이 된 주소·비밀 글자 저장(lib/storage/gcal saveGcalConnection) */
  saveConnection(input: GcalConnectionInput): Promise<void | 'invalid'>
  /** 고른 캘린더 id·이름·바탕 hex 저장(lib/storage/gcal saveGcalCalendar) */
  saveCalendar(input: GcalCalendarInput): Promise<void | 'invalid'>
  /** 캘린더를 저장한 뒤 ② 시행자·종류로 */
  onNext(): void
  now?: () => Date
}

type TestResult = { kind: 'ok'; count: number; hm: string; calendars: GcalCalendarInfo[] } | { kind: 'error'; code: ErrorCode }

const WRITABLE: readonly GcalCalendarAccess[] = ['owner', 'writer']
const ACCESS: readonly GcalCalendarAccess[] = ['owner', 'writer', 'reader', 'freeBusyReader']
const canWrite = (calendar: GcalCalendarInfo) => WRITABLE.includes(calendar.access)
const wholeOrZero = (value: unknown) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : 0)

/** 답의 캘린더 줄을 믿지 않고 쓸 칸만 골라 새로 만든다(모르는 권한은 보기만으로) */
function calendarsOf(value: unknown): GcalCalendarInfo[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    if (typeof row !== 'object' || row === null) return []
    const { id, name, access, hex, past, future } = row as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || typeof name !== 'string') return []
    return [
      {
        id,
        name,
        access: ACCESS.includes(access as GcalCalendarAccess) ? (access as GcalCalendarAccess) : 'reader',
        hex: typeof hex === 'string' ? hex : '',
        past: wholeOrZero(past),
        future: wholeOrZero(future),
      },
    ]
  })
}

/** 실패 답의 오류 번호. 예약 구글 번호(E-GCAL-*)가 아니면 닿지 못함으로 */
function failCode(reply: Partial<{ code: unknown; error: unknown }> | null): ErrorCode {
  for (const value of [reply?.code, reply?.error]) {
    if (typeof value === 'string' && value.startsWith('E-GCAL-') && isErrorCode(value)) return value
  }
  return 'E-GCAL-REACH'
}

// 시안 .btn.accent(연결 시험): 36px·accent 테두리·accent 600
const accentButton =
  'inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-accent bg-surface px-4 text-body font-semibold text-accent transition not-disabled:not-aria-busy:hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 aria-busy:cursor-progress aria-busy:opacity-60'
const okLine = 'flex items-center gap-1.5 text-small font-semibold text-positive'
const labelClass = 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink'
const labelHint = 'text-caption font-normal text-muted'
const help = 'text-caption text-muted'

function HowtoLine({ pieces }: { pieces: readonly HowtoPiece[] }) {
  return pieces.map((piece, i) => {
    if (typeof piece === 'string') return piece
    if ('b' in piece)
      return (
        <b key={i} className="font-semibold text-ink">
          {piece.b}
        </b>
      )
    if ('code' in piece)
      return (
        <code key={i} className="tabular-nums text-ink">
          {piece.code}
        </code>
      )
    return (
      <kbd key={i} className="inline-block whitespace-nowrap rounded-control border border-b-2 border-line-strong bg-surface px-1 text-caption text-ink">
        {piece.kbd}
      </kbd>
    )
  })
}

/** 단계 칸: 왼쪽 동그라미(지난 단계 ✓ · 지금 단계 accent) + 제목·몸 */
function Step({ no, state, title, titleId, children }: { no: number; state: 'done' | 'cur' | 'idle'; title: string; titleId?: string; children: ReactNode }) {
  const dot =
    state === 'done'
      ? 'border-transparent bg-positive text-surface'
      : state === 'cur'
        ? 'border-transparent bg-accent text-surface'
        : 'border-line-strong bg-canvas text-ink-2'
  return (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-3.5 border-t border-line pt-4">
      <span aria-hidden="true" className={`grid size-6.5 place-items-center rounded-full border text-small font-semibold ${dot}`}>
        {state === 'done' ? <Icon name="check" size={14} /> : no}
      </span>
      <div className="grid min-w-0 gap-2.5">
        <h3 id={titleId} className="text-body font-semibold text-ink">
          {title}
        </h3>
        {children}
      </div>
    </div>
  )
}

export function GcalConnect({ view, ping, saveConnection, saveCalendar, onNext, now = () => new Date() }: GcalConnectProps) {
  const desk = useDesk()
  const readOnly = useReadOnly()
  const locked = desk || readOnly
  const { notice, say } = useGcalNotice()
  const headId = useId()
  const howtoId = useId()
  const urlId = useId()
  const secretId = useId()
  const radioName = useId()

  const [url, setUrl] = useState(view?.scriptUrl ?? '')
  const [savedUrl, setSavedUrl] = useState(view?.scriptUrl ?? '')
  const [hasSavedSecret, setHasSavedSecret] = useState(view?.hasSecret === true)
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [copiedAt, setCopiedAt] = useState<string | null>(null)
  const [result, setResult] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [picked, setPicked] = useState<string | null>(view?.calendarId ?? null)
  const [linking, setLinking] = useState(false)
  const [linkFailed, setLinkFailed] = useState(false)
  const busy = useRef(false)

  const calendars = result?.kind === 'ok' ? result.calendars : []
  const chosen = calendars.find((calendar) => calendar.id === picked && canWrite(calendar)) ?? null

  async function copyCode() {
    if (locked) return
    const fresh = newSecret()
    try {
      await navigator.clipboard.writeText(buildCalendarCode(fresh))
    } catch {
      return // 복사하지 못한 비밀 글자는 칸에 넣지 않는다(구글에 붙인 코드와 달라진다)
    }
    setSecret(fresh)
    setShowSecret(false)
    setCopiedAt(mdwHmOf(now()))
    setResult(null)
    say(T.copiedNotice)
  }

  async function testConnection() {
    if (locked || busy.current) return
    const scriptUrl = url.trim()
    if (!isScriptUrl(scriptUrl)) return setResult({ kind: 'error', code: 'E-GCAL-URL' })
    if (secret === '' ? !hasSavedSecret : !isSecret(secret)) return setResult({ kind: 'error', code: 'E-GCAL-KEY' })
    const input: GcalConnectionInput = { scriptUrl, secret: secret === '' ? null : secret }
    busy.current = true
    setTesting(true)
    setResult(null)
    setLinkFailed(false)
    try {
      let reply: GcalPingReply | null = null
      try {
        reply = await ping(input)
      } catch {
        reply = null
      }
      if (reply === null || reply.ok !== true) return setResult({ kind: 'error', code: failCode(reply) })
      if (input.secret !== null || scriptUrl !== savedUrl) {
        let saved = false
        try {
          saved = (await saveConnection(input)) !== 'invalid'
        } catch {
          saved = false
        }
        if (!saved) return setResult({ kind: 'error', code: 'E-SETTINGS-FAILED' })
        // 저장한 비밀 글자는 화면에서 지운다(다시 그리지 않는다)
        setSecret('')
        setShowSecret(false)
        setHasSavedSecret(true)
        setSavedUrl(scriptUrl)
      }
      setResult({ kind: 'ok', count: Array.isArray(reply.calendars) ? reply.calendars.length : 0, hm: hmOf(now()), calendars: calendarsOf(reply.calendars) })
    } finally {
      busy.current = false
      setTesting(false)
    }
  }

  async function link() {
    if (locked || chosen === null || busy.current) return
    busy.current = true
    setLinking(true)
    setLinkFailed(false)
    let saved = false
    try {
      saved = (await saveCalendar({ calendarId: chosen.id, calendarName: chosen.name, defaultHex: isHex(chosen.hex) ? chosen.hex : GCAL_DEFAULT_HEX })) !== 'invalid'
    } catch {
      saved = false
    }
    busy.current = false
    setLinking(false)
    if (!saved) return setLinkFailed(true)
    onNext()
  }

  const step1Done = copiedAt !== null || hasSavedSecret
  const tested = result?.kind === 'ok'

  return (
    <section aria-labelledby={headId} className="grid min-w-0 gap-3.5 rounded-float border border-line bg-surface px-6 py-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headId} className="text-subtitle font-semibold text-ink">
          {T.title}
        </h2>
        {view?.linkedOn == null && <span className="text-caption text-muted">{T.notYet}</span>}
      </div>
      <p className="text-small text-muted">
        <HowtoLine pieces={T.lead} />
      </p>
      <div className="flex items-start gap-2 rounded-control border border-warning-soft bg-warning-soft px-3 py-2.5 text-small text-ink">
        <Icon name="lock" className="mt-0.5 shrink-0 text-warning" />
        <span>{T.privacy}</span>
      </div>

      <Step no={1} state={step1Done ? 'done' : 'cur'} title={T.step1} titleId={howtoId}>
        <ol aria-labelledby={howtoId} className="grid list-decimal gap-1 pl-5 text-small text-ink-2">
          {T.howto.map((pieces, i) => (
            <li key={i}>
              <HowtoLine pieces={pieces} />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" disabled={locked} onClick={copyCode} className={ds.button.secondary}>
            <Icon name="copy" />
            {T.copy}
          </button>
          {copiedAt !== null && (
            <p className={okLine}>
              <Icon name="check" />
              {T.copiedAt(copiedAt)} <span className="font-normal text-muted">{T.copiedSub}</span>
            </p>
          )}
        </div>
      </Step>

      <Step no={2} state={tested ? 'done' : step1Done ? 'cur' : 'idle'} title={T.step2}>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2.5">
          <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
            <label htmlFor={urlId} className={labelClass}>
              {T.urlLabel}
              <span className={labelHint}>{T.urlHint}</span>
            </label>
            <input
              id={urlId}
              value={url}
              disabled={locked}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setUrl(e.target.value)
                setResult(null)
              }}
              className={`${ds.input} tabular-nums text-ink-2`}
            />
          </div>
          <div className="flex min-w-0 flex-[0_1_260px] flex-col gap-1.5">
            <label htmlFor={secretId} className={labelClass}>
              {T.secretLabel}
              <span className={labelHint}>{T.secretHint}</span>
            </label>
            <input
              id={secretId}
              type={showSecret ? 'text' : 'password'}
              value={secret}
              disabled={locked}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setSecret(e.target.value.trim())
                setResult(null)
              }}
              className={`${ds.input} tabular-nums text-ink-2`}
            />
          </div>
          <button type="button" disabled={locked} onClick={() => setShowSecret((shown) => !shown)} className={ds.button.ghost}>
            {showSecret ? T.hide : T.show}
          </button>
          <button type="button" disabled={locked} aria-busy={testing || undefined} onClick={testConnection} className={accentButton}>
            {T.test}
          </button>
        </div>
        <p className={help}>{T.secretHelp}</p>
        {result?.kind === 'ok' && (
          <p className={okLine}>
            <Icon name="check" />
            {T.testedMain(countText(result.count))} <span className="font-normal text-muted">{T.testedAt(result.hm)}</span>
          </p>
        )}
        {result?.kind === 'error' && <ErrorCard code={result.code} />}
      </Step>

      <Step no={3} state={tested ? 'cur' : 'idle'} title={T.step3}>
        {tested && (
          <div role="radiogroup" aria-label={T.pickLabel} className="grid gap-1.5">
            {calendars.map((calendar) => {
              const writable = canWrite(calendar)
              const checked = writable && calendar.id === picked
              return (
                <label
                  key={calendar.id}
                  className={`grid grid-cols-[16px_12px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-control border px-3 py-2.5 text-body text-ink ${
                    checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
                  } ${writable && !locked ? 'cursor-pointer' : 'cursor-not-allowed opacity-55'}`}
                >
                  <input
                    type="radio"
                    name={radioName}
                    value={calendar.id}
                    checked={checked}
                    disabled={locked || !writable}
                    onChange={() => {
                      setPicked(calendar.id)
                      setLinkFailed(false)
                    }}
                    className="size-4 accent-accent"
                  />
                  <i aria-hidden="true" className="size-3 rounded-control" style={{ backgroundColor: isHex(calendar.hex) ? calendar.hex : 'var(--cal-default)' }} />
                  <b className="min-w-0 truncate font-semibold">{calendar.name}</b>
                  <small className="whitespace-nowrap text-caption text-muted">
                    {writable ? T.calendarSub(countText(calendar.past), countText(calendar.future)) : T.readOnlyCalendar}
                  </small>
                </label>
              )
            })}
          </div>
        )}
        <p className={help}>{T.pickHelp}</p>
      </Step>

      {linkFailed && <ErrorCard code="E-SETTINGS-FAILED" />}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-3.5">
        <span className={`flex-1 ${help}`}>{T.bottom}</span>
        {chosen !== null && (
          <button type="button" disabled={locked} aria-busy={linking || undefined} onClick={link} className={ds.button.primary}>
            {`'${chosen.name}'${josa(chosen.name, '로/으로')} 잇고 다음 →`}
          </button>
        )}
      </div>
      <GcalNotice notice={notice} />
    </section>
  )
}
