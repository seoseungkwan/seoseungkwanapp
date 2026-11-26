'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { checkGsheetSettings } from '@/lib/gsheet/check'
import { BAD_REPLY, readLink, readStatus } from '@/lib/gsheet/reply'
import { errorCode, type SheetCall } from '@/lib/gsheet/runner'
import { listGsheetRuns, loadGsheetSettings, saveGsheetSettings, setSecretTag } from '@/lib/storage/gsheet'
import type { ErrorCode } from '@/types/errors'
import type { GsheetPinned, GsheetRun, GsheetSaved, GsheetSettings } from '@/types/gsheet'
import type { CodeListState } from './CodePicker'
import { fileName, fromForm, mailText, pinnedOf, samePinned, toForm, type SheetForm } from './form'
import { BANNER, BIT, GOOGLE, HEAD, REASON, SAVE_FAILED, SECTIONS, type SectionKey } from './labels'
import { Dialog } from './parts'
import { CodePickDialog, HospitalPickDialog } from './PickDialog'
import { recentItems } from './recent'
import { readCatalog, readCode, readImport, readPing, type Hospital } from './replies'
import { autoHospital, planRooms } from './rooms'
import { AutoSection, BitSection, GoogleSection, SaveFailed, SheetSection, sectionId, type CatalogView, type PinnedNote, type PingView } from './sections'
import { SheetGuide } from './SheetGuide'

// 수납일지 시트 설정 화면(spec google-link REQ-8516 AC-8516.1~6, 시안 docs/mockups/google-link/sunap.html ?s=settings, design.md 2절 표 17·9-2).
// 탭 안 [설정]을 누르면 탭 본문 자리에 그린다(잇기는 TASK-23 SunapTab). 넣는 PC(또는 아직 넣는 PC가 없는 비트 PC)에서만 열린다 — 그 판단은 부르는 쪽.
// 원장·데스크 모두 고친다(잠그지 않음). 받는 것(props):
//   client    Supabase 브라우저 client — 저장은 lib/storage/gsheet(saveGsheetSettings·setSecretTag·loadGsheetSettings·listGsheetRuns)
//   call      도우미 부르기(통로 call, 오류는 {code: 'E-…'}로 던짐) — sheet.status·code·link·import·ping·catalog만 부른다
//   saved     부르는 쪽이 읽은 서버 설정 + 넣는 PC 표시(secret_tag)
//   onChanged 서버 값이 바뀜(저장·[그대로 가져오기]·코드 복사 뒤의 설정 + secret_tag)
//   onClose   [‹ 시트로 돌아가기]·[취소]·저장 뒤
//   now       시각(시험용, 기본 지금)
// 구글에서 받은 주소·함께 쓸 직원 메일 두 칸은 도우미 sheet.status 값으로 채우고 서버에 저장하지 않는다. 바뀐 채 [연결 시험]·[저장]이면
// sheet.link를 먼저 부르고(그 PC에 확인 창), 기다리는 동안 칸 아래 글, E-GSHEET-DECLINED면 오류 카드 + 두 칸은 전 값. 도우미가 없거나
// 이 PC에 비밀 글자가 없으면 두 칸은 비운 채 잠근다. 비밀 글자는 화면·props·답 어디에도 없다 — 코드 복사 뒤 서버 secret_tag(표시)만 새로 적는다(ADR-052)

type Client = Parameters<typeof saveGsheetSettings>[0]
export type SheetSettingsProps = {
  client: Client
  call: SheetCall
  saved: GsheetSaved
  onChanged: (saved: GsheetSaved) => void
  onClose: () => void
  now?: () => Date
}

type Helper = { phase: 'loading' } | { phase: 'none' } | { phase: 'ready'; bitsheet: boolean; codeVersion: string }
type LinkFields = { url: boolean; mail: boolean }
type LinkError = LinkFields & { code: ErrorCode }

const EMPTY_PINNED: GsheetPinned = { url: null, shareWith: [] }
const CODE_VERSION = '8'
const DECLINED = 'E-GSHEET-DECLINED'
const BIT_CODE = /^E-(BIT|BRIDGE|HELPER)-/
const FALLBACK: ErrorCode = 'E-GSHEET-FAILED'

const asErrorCode = (code: string): ErrorCode => (isErrorCode(code) ? code : FALLBACK)
const badReply = () => Object.assign(new Error(BAD_REPLY), { code: BAD_REPLY })
const sameCode = (a: string, b: string) => a.toUpperCase() === b.toUpperCase()

/** [연결 시험] 안 됨 까닭(design.md 9-3): 수납 번호는 그 글, 비트·통로 번호는 '비트 도우미 연결을 확인해 주세요.', 그 밖은 번호 */
function reasonOf(code: string): string {
  if (BIT_CODE.test(code)) return REASON.bit
  if (code.startsWith('E-GSHEET-') && isErrorCode(code)) return errorInfo(code).fix
  return REASON.other(code)
}

/** 다음 달(새 달 파일 이름 예) */
function nextMonth(now: Date): { year: number; month: number } {
  const [y, m] = todayInKorea(now).split('-').map(Number) as [number, number]
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 }
}

export function SheetSettings({ client, call, saved, onChanged, onClose, now = () => new Date() }: SheetSettingsProps) {
  const [base, setBase] = useState<GsheetSettings>(saved.settings)
  const [serverTag, setServerTag] = useState<string | null>(saved.secretTag)
  const [form, setForm] = useState<SheetForm>(() => toForm(saved.settings))
  const set = useCallback((patch: Partial<SheetForm>) => setForm((f) => ({ ...f, ...patch })), [])
  // 비트 목록이 온 뒤 진료실을 미리 채울 때 그때의 칸 값을 본다
  const formRef = useRef(form)
  useEffect(() => {
    formRef.current = form
  })

  // 도우미(이 PC) — 비밀 글자 표시·두 칸 값
  const [helper, setHelper] = useState<Helper>({ phase: 'loading' })
  const [helperTag, setHelperTag] = useState<string | null>(null)
  const [pinnedBase, setPinnedBase] = useState<GsheetPinned>(EMPTY_PINNED)
  const [url, setUrl] = useState('')
  const [mails, setMails] = useState('')
  const [statusTry, setStatusTry] = useState(0)

  // 비트 목록
  const [catalog, setCatalog] = useState<CatalogView>({ phase: 'loading' })
  const [catalogTry, setCatalogTry] = useState(0)
  const [roomsAuto, setRoomsAuto] = useState(false)
  const [roomsHospital, setRoomsHospital] = useState('')
  const [knownHospitals, setKnownHospitals] = useState<Hospital[]>([])

  const [runs, setRuns] = useState<GsheetRun[] | null>(null)

  // 한 번에 하나만(누름 처리가 기다리는 동안 다시 누름을 무시)
  const busyRef = useRef(false)
  const [linking, setLinking] = useState<LinkFields | null>(null)
  const [linkError, setLinkError] = useState<LinkError | null>(null)
  const [ping, setPing] = useState<PingView>({ kind: 'idle' })
  const [copyBusy, setCopyBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState<ErrorCode | null>(null)
  const [copySaveFailed, setCopySaveFailed] = useState(false)
  const [ask, setAsk] = useState(false)
  const [problems, setProblems] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [bannerHidden, setBannerHidden] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<ErrorCode | null>(null)
  const [importSaveFailed, setImportSaveFailed] = useState(false)
  const [view, setView] = useState<'form' | 'guide'>('form')
  const [picking, setPicking] = useState<'hospital' | 'therapy' | null>(null)
  const [navOn, setNavOn] = useState<SectionKey>('google')

  const today = todayInKorea(now())

  // ── 열 때: 도우미 상태 ─────────────────────────────────────
  useEffect(() => {
    let live = true
    void (async () => {
      let status = null
      try {
        status = readStatus(await call('sheet.status', {}))
      } catch {
        status = null
      }
      if (!live) return
      if (status === null) {
        setHelper({ phase: 'none' })
        setHelperTag(null)
        setPinnedBase(EMPTY_PINNED)
        setUrl('')
        setMails('')
        return
      }
      setHelper({ phase: 'ready', bitsheet: status.bitsheet, codeVersion: status.codeVersion })
      setHelperTag(status.secretTag)
      setPinnedBase(status.pinned)
      setUrl(status.pinned.url ?? '')
      setMails(mailText(status.pinned.shareWith))
    })()
    return () => {
      live = false
    }
  }, [call, statusTry])

  // ── 비트 목록(병원을 바꾸면 다시) ──────────────────────────
  const hospital = form.bitHospital
  const confirmedFor = base.deptRoomsHospital
  useEffect(() => {
    let live = true
    setCatalog({ phase: 'loading' })
    void (async () => {
      let read = null
      try {
        read = readCatalog(await call('sheet.catalog', hospital.length > 0 ? { hospital } : {}))
      } catch {
        read = null
      }
      if (!live) return
      if (read === null) {
        setCatalog({ phase: 'failed' })
        return
      }
      const found = read
      setCatalog({ phase: 'ready', catalog: found })
      if (found.hospitals.length > 0) setKnownHospitals(found.hospitals)
      const effective = hospital.length > 0 ? hospital : autoHospital(found.hospitals)
      setRoomsHospital(found.depts.length > 0 ? effective : '')
      const confirmed = effective.length > 0 && sameCode(confirmedFor, effective)
      const plan = planRooms(found.depts, formRef.current.deptRooms, confirmed)
      setRoomsAuto(plan !== null)
      if (plan !== null) setForm((f) => ({ ...f, deptRooms: plan }))
    })()
    return () => {
      live = false
    }
  }, [call, hospital, confirmedFor, catalogTry])

  // ── 오늘 기록 ──────────────────────────────────────────────
  useEffect(() => {
    let live = true
    listGsheetRuns(client, `${today}T00:00:00+09:00`).then(
      (list) => live && setRuns(list),
      () => live && setRuns(null),
    )
    return () => {
      live = false
    }
  }, [client, today])

  const locked = helper.phase !== 'ready' || helperTag === null
  const draftPinned = () => (locked ? EMPTY_PINNED : pinnedOf(url, mails))
  const settingsNow = () => fromForm(form, base, roomsHospital)

  /** 두 칸이 바뀌었으면 sheet.link(그 PC 확인 창). 됨 → true. 안 됨 → 오류 카드(DECLINED면 두 칸 전 값) */
  const linkIfChanged = async (draft: GsheetPinned): Promise<boolean> => {
    if (samePinned(draft, pinnedBase)) return true
    const fields: LinkFields = { url: (draft.url ?? '') !== (pinnedBase.url ?? ''), mail: !samePinned({ ...draft, url: pinnedBase.url }, pinnedBase) }
    setLinking(fields)
    setLinkError(null)
    try {
      const reply = readLink(await call('sheet.link', { url: draft.url ?? '', shareWith: draft.shareWith }))
      if (reply === null) throw badReply()
      setPinnedBase(draft)
      return true
    } catch (error) {
      const code = errorCode(error)
      setLinkError({ ...fields, code: asErrorCode(code) })
      if (code === DECLINED) {
        setUrl(pinnedBase.url ?? '')
        setMails(mailText(pinnedBase.shareWith))
      }
      return false
    } finally {
      setLinking(null)
    }
  }

  /** 막는 글 가운데 두 칸(주소·메일) 것만 */
  const pinnedProblems = (settings: GsheetSettings, draft: GsheetPinned) => {
    const without = new Set(checkGsheetSettings(settings, EMPTY_PINNED))
    return checkGsheetSettings(settings, draft).filter((p) => !without.has(p))
  }

  const run = async (work: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      await work()
    } finally {
      busyRef.current = false
    }
  }

  // ── [연결 시험] ────────────────────────────────────────────
  const onTest = () =>
    run(async () => {
      const settings = settingsNow()
      const draft = draftPinned()
      const blocked = pinnedProblems(settings, draft)
      setProblems(blocked)
      if (blocked.length > 0) return
      if (!(await linkIfChanged(draft))) return
      setPing({ kind: 'testing' })
      try {
        const reply = readPing(await call('sheet.ping', { settings }))
        if (reply === null) throw badReply()
        if (!reply.ok) {
          setPing({ kind: 'bad', reason: reasonOf(reply.code ?? FALLBACK) })
          return
        }
        const expected = helper.phase === 'ready' ? helper.codeVersion : CODE_VERSION
        const old = reply.version !== null && reply.version !== expected
        setPing({ kind: 'ok', text: GOOGLE.okText(reply.templateTitle ?? '') + (old ? GOOGLE.oldCode : '') })
      } catch (error) {
        setPing({ kind: 'bad', reason: reasonOf(errorCode(error)) })
      }
    })

  // ── [저장] ─────────────────────────────────────────────────
  const onSave = () =>
    run(async () => {
      const settings = settingsNow()
      const draft = draftPinned()
      const blocked = checkGsheetSettings(settings, draft)
      setProblems(blocked)
      setSaveFailed(false)
      if (blocked.length > 0) return
      if (!(await linkIfChanged(draft))) return
      setSaving(true)
      let ok = false
      try {
        ok = (await saveGsheetSettings(client, settings)) !== 'invalid'
      } catch {
        ok = false
      } finally {
        setSaving(false)
      }
      if (!ok) {
        setSaveFailed(true)
        return
      }
      setBase(settings)
      onChanged({ settings, secretTag: serverTag })
      onClose()
    })

  // ── [구글에 붙일 코드 복사] ────────────────────────────────
  const copyCode = () =>
    run(async () => {
      setCopyBusy(true)
      setCopied(false)
      setCopyError(null)
      setCopySaveFailed(false)
      try {
        let reply
        try {
          reply = readCode(await call('sheet.code', {}))
          if (reply === null) throw badReply()
        } catch (error) {
          setCopyError(asErrorCode(errorCode(error)))
          return
        }
        try {
          await setSecretTag(client, reply.secretTag)
        } catch {
          setCopySaveFailed(true)
          return
        }
        setServerTag(reply.secretTag)
        setHelperTag(reply.secretTag)
        setHelper((h) => (h.phase === 'ready' ? h : { phase: 'ready', bitsheet: false, codeVersion: reply.codeVersion }))
        setCopied(true)
        onChanged({ settings: base, secretTag: reply.secretTag })
      } finally {
        setCopyBusy(false)
      }
    })
  const onCopy = () => {
    // 이 PC가 비밀 글자를 못 읽는데 서버에는 넣는 PC 표시가 있으면(옮겨 온 설정) 새로 만들지 먼저 묻는다
    if (helper.phase === 'ready' && helperTag === null && serverTag !== null) setAsk(true)
    else void copyCode()
  }

  // ── [그대로 가져오기] ──────────────────────────────────────
  const onImport = () =>
    run(async () => {
      setImporting(true)
      setImportError(null)
      setImportSaveFailed(false)
      try {
        let reply
        try {
          reply = readImport(await call('sheet.import', {}))
          if (reply === null) throw badReply()
        } catch (error) {
          setImportError(asErrorCode(errorCode(error)))
          return
        }
        let loaded: GsheetSaved
        try {
          if ((await saveGsheetSettings(client, reply.settings)) === 'invalid') throw new Error('invalid')
          await setSecretTag(client, reply.secretTag)
          loaded = await loadGsheetSettings(client)
        } catch {
          setImportSaveFailed(true)
          return
        }
        setBase(loaded.settings)
        setServerTag(loaded.secretTag)
        setForm(toForm(loaded.settings))
        setBannerHidden(true)
        setStatusTry((n) => n + 1)
        setCatalogTry((n) => n + 1)
        onChanged(loaded)
      } finally {
        setImporting(false)
      }
    })

  const rx: CodeListState = catalog.phase === 'ready' ? { phase: 'ready', rx: catalog.catalog.rx } : catalog
  const bitName = catalog.phase === 'ready' ? catalog.catalog.hospitalName.trim() : ''
  const exampleName = useMemo(() => {
    const { year, month } = nextMonth(new Date(`${today}T12:00:00+09:00`))
    const name = form.hospitalLabel.trim() || bitName || '병원'
    return fileName(form.namePattern, name, year, month)
  }, [today, form.hospitalLabel, form.namePattern, bitName])
  const hospitalNote =
    form.bitHospital.length === 0
      ? BIT.hospitalAuto
      : BIT.hospitalPicked(knownHospitals.find((h) => sameCode(h.code, form.bitHospital))?.name.trim() ?? '', form.bitHospital)

  const noteFor = (field: keyof LinkFields): PinnedNote => ({
    waiting: linking?.[field] === true,
    error: linkError !== null && linkError[field] ? linkError.code : null,
  })

  const goTo = (key: SectionKey) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    setNavOn(key)
    document.getElementById(sectionId(key))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  if (view === 'guide') return <SheetGuide onClose={() => setView('form')} />

  const showBanner = helper.phase === 'ready' && helper.bitsheet && !bannerHidden
  const busy = linking !== null || saving

  return (
    <div className="grid gap-4">
      {showBanner ? (
        <div className="grid gap-2">
          <div className="flex items-start gap-3 rounded-control bg-accent-soft px-3.5 py-2.5 text-small text-accent-strong">
            <p className="min-w-0 flex-1">
              <b className="font-semibold">{BANNER.title}</b> {BANNER.text}
            </p>
            <button type="button" className={ds.button.primarySmall} aria-busy={importing || undefined} onClick={() => void onImport()}>
              {BANNER.take}
            </button>
            <button type="button" className={ds.button.ghostSmall} onClick={() => setBannerHidden(true)}>
              {BANNER.skip}
            </button>
          </div>
          {importError !== null ? <ErrorCard code={importError} /> : null}
          {importSaveFailed ? <SaveFailed text={SAVE_FAILED} /> : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={ds.button.ghostSmall} onClick={onClose}>
          {HEAD.back}
        </button>
        <h2 className="text-title font-semibold text-ink">{HEAD.title}</h2>
        <span className="text-small text-muted">{HEAD.hint}</span>
      </div>

      <div className="grid grid-cols-[196px_minmax(0,1fr)] items-start gap-6">
        <nav aria-label={HEAD.navName} className="sticky top-3 grid gap-0.5">
          {SECTIONS.map((s) => (
            <a
              key={s.key}
              href={`#${sectionId(s.key)}`}
              aria-current={navOn === s.key ? 'true' : undefined}
              onClick={goTo(s.key)}
              className={`rounded-control px-3 py-2 text-body ${ds.focusRing} ${navOn === s.key ? 'bg-accent-soft font-semibold text-accent-strong' : 'font-medium text-ink-2 hover:bg-canvas'}`}
            >
              {s.title}
            </a>
          ))}
          <small className="px-3 pt-2.5 text-caption text-muted">{HEAD.navNote}</small>
        </nav>

        <div className="grid min-w-0 max-w-250 gap-4">
          <GoogleSection
            onCopy={onCopy}
            copyBusy={copyBusy}
            copied={copied}
            copyError={copyError}
            copySaveFailed={copySaveFailed}
            saveFailedText={SAVE_FAILED}
            onGuide={() => setView('guide')}
            url={url}
            onUrl={setUrl}
            locked={locked || busy}
            onTest={() => void onTest()}
            testBusy={ping.kind === 'testing' || linking !== null}
            ping={ping}
            urlNote={noteFor('url')}
            hasSecret={helperTag !== null}
          />
          <SheetSection form={form} set={set} mail={mails} onMail={setMails} locked={locked || busy} mailNote={noteFor('mail')} example={exampleName} bitName={bitName} />
          <BitSection
            form={form}
            set={set}
            catalog={catalog}
            rx={rx}
            roomsAuto={roomsAuto}
            hospitalNote={hospitalNote}
            canPick={knownHospitals.length > 0}
            onPickHospital={() => setPicking('hospital')}
            onOpenTherapy={() => setPicking('therapy')}
            onRetry={() => setCatalogTry((n) => n + 1)}
          />
          <AutoSection form={form} set={set} recent={runs === null ? null : recentItems(runs, now())} />

          <div className="sticky bottom-0 z-5 grid gap-2 border-t border-line bg-surface py-3">
            {problems.length > 0 ? (
              <ul role="alert" className="grid gap-0.5 rounded-control bg-warning-soft px-4 py-2.5 text-small font-medium text-ink">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {saveFailed ? <SaveFailed text={SAVE_FAILED} /> : null}
            <div className="flex items-center justify-end gap-2">
              <button type="button" className={ds.button.secondary} onClick={onClose}>
                {HEAD.cancel}
              </button>
              <button type="button" className={ds.button.primary} aria-busy={busy || undefined} onClick={() => void onSave()}>
                {HEAD.save}
              </button>
            </div>
          </div>
        </div>
      </div>

      {ask ? (
        <Dialog labelledBy="gsheet-settings-ask" onClose={() => setAsk(false)}>
          <p id="gsheet-settings-ask" className="text-body text-ink">
            {GOOGLE.ask}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={ds.button.secondary} onClick={() => setAsk(false)}>
              {GOOGLE.askNo}
            </button>
            <button
              type="button"
              className={ds.button.primary}
              onClick={() => {
                setAsk(false)
                void copyCode()
              }}
            >
              {GOOGLE.askYes}
            </button>
          </div>
        </Dialog>
      ) : null}
      {picking === 'hospital' ? (
        <HospitalPickDialog
          hospitals={knownHospitals}
          current={form.bitHospital}
          onClose={() => setPicking(null)}
          onPick={(h) => {
            setPicking(null)
            set({ bitHospital: h.code })
          }}
        />
      ) : null}
      {picking === 'therapy' ? (
        <CodePickDialog
          kind="therapy"
          state={rx}
          selected={form.therapyCodes}
          onClose={() => setPicking(null)}
          onRetry={() => setCatalogTry((n) => n + 1)}
          onDone={(codes) => {
            setPicking(null)
            set({ therapyCodes: codes })
          }}
        />
      ) : null}
    </div>
  )
}
