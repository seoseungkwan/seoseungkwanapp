'use client'

import { Fragment, useId } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import type { ErrorCode } from '@/types/errors'
import { CodePicker, RuleLine, type CodeListState } from './CodePicker'
import type { SheetForm } from './form'
import { AUTO, BIT, COLUMNS, FREE_RULES, GOOGLE, KINDS, NOTES, RX, SECTIONS, SHEET, SIGNS, type SectionKey } from './labels'
import { Check, FIELD, FIELD_GROW, FIELD_M, FIELD_S, FIELD_WIDE, HINT, LINE, Radio, Row, RULE, SELECT, Section } from './parts'
import type { RecentItem } from './recent'
import type { Catalog } from './replies'
import { displayOrder, MAX_ROOM, roomOf } from './rooms'

// 설정 화면 네 칸(spec google-link AC-8516.2·8516.3·8516.6, 시안 sunap.html settingsPage()). 그리기만 한다 — 상태·도우미 부르기·저장은 SheetSettings.
// 구글에서 받은 주소·함께 쓸 직원 메일 두 칸은 도우미 sheet.status 값(이 PC 도우미에만 있는 값)이고 서버에 저장하지 않는다(design.md 2절 표 17)

export type SetForm = (patch: Partial<SheetForm>) => void
export const sectionId = (key: SectionKey) => `gsheet-settings-${key}`
const meta = (key: SectionKey) => SECTIONS.find((s) => s.key === key)!

/** 두 칸 아래: 확인 창을 기다리는 글 · sheet.link 오류 카드 */
export type PinnedNote = { waiting: boolean; error: ErrorCode | null }
function PinnedNoteView({ note }: { note: PinnedNote }) {
  if (note.waiting)
    return (
      <p role="status" className="text-small font-medium text-accent-strong">
        {GOOGLE.waitConfirm}
      </p>
    )
  return note.error !== null ? <ErrorCard code={note.error} /> : null
}

export type PingView = { kind: 'idle' } | { kind: 'testing' } | { kind: 'ok'; text: string } | { kind: 'bad'; reason: string }

function PingLine({ ping }: { ping: PingView }) {
  if (ping.kind === 'idle' || ping.kind === 'testing')
    return (
      <p role="status" className="text-small text-muted">
        {ping.kind === 'idle' ? GOOGLE.notTested : GOOGLE.testing}
      </p>
    )
  return (
    <p role="status" className="flex items-start gap-2 text-small text-ink-2">
      <span className={ping.kind === 'ok' ? ds.chip.positive : ds.chip.negative}>{ping.kind === 'ok' ? GOOGLE.ok : GOOGLE.bad}</span>
      <span>{ping.kind === 'ok' ? ping.text : ping.reason}</span>
    </p>
  )
}

export function GoogleSection(props: {
  onCopy: () => void
  copyBusy: boolean
  copied: boolean
  copyError: ErrorCode | null
  copySaveFailed: boolean
  saveFailedText: string
  onGuide: () => void
  url: string
  onUrl: (text: string) => void
  locked: boolean
  onTest: () => void
  testBusy: boolean
  ping: PingView
  urlNote: PinnedNote
  hasSecret: boolean
}) {
  const urlId = useId()
  const m = meta('google')
  return (
    <Section id={sectionId('google')} title={m.title} small={m.small}>
      <Row label={GOOGLE.codeLabel}>
        <p className="pt-2 text-small text-ink-2">{GOOGLE.codeText}</p>
        <div className={LINE}>
          <button type="button" className={ds.button.primarySmall} aria-busy={props.copyBusy || undefined} onClick={props.onCopy}>
            {GOOGLE.copy}
          </button>
          <button type="button" className={ds.button.secondarySmall} onClick={props.onGuide}>
            {GOOGLE.guide}
          </button>
        </div>
        <p className={HINT}>{GOOGLE.codeHint}</p>
        {props.copied ? (
          <p role="status" className="text-small font-medium text-positive">
            {GOOGLE.copied}
          </p>
        ) : null}
        {props.copyError !== null ? <ErrorCard code={props.copyError} /> : null}
        {props.copySaveFailed ? <SaveFailed text={props.saveFailedText} /> : null}
      </Row>
      <Row label={GOOGLE.urlLabel} htmlFor={urlId}>
        <div className={LINE}>
          <input
            id={urlId}
            type="text"
            className={FIELD_GROW}
            placeholder={GOOGLE.urlPlaceholder}
            value={props.url}
            disabled={props.locked}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => props.onUrl(e.target.value)}
          />
          <button type="button" className={ds.button.secondarySmall} disabled={props.locked} aria-busy={props.testBusy || undefined} onClick={props.onTest}>
            {GOOGLE.test}
          </button>
        </div>
        <PinnedNoteView note={props.urlNote} />
        <PingLine ping={props.ping} />
      </Row>
      <Row label={GOOGLE.pcLabel}>
        {props.hasSecret ? (
          <p className="flex items-center gap-2 pt-2 text-small text-ink-2">
            <span className={ds.chip.accent}>{GOOGLE.pcChip}</span>
            <span>{GOOGLE.pcText}</span>
          </p>
        ) : null}
        <p className={props.hasSecret ? HINT : `${HINT} pt-2`}>{GOOGLE.pcHint}</p>
      </Row>
    </Section>
  )
}

/** '설정을 저장하지 못했어요.' + 웹앱 오류 카드(E-SETTINGS-FAILED) */
export function SaveFailed({ text }: { text: string }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-small font-semibold text-negative">{text}</p>
      <ErrorCard code="E-SETTINGS-FAILED" />
    </div>
  )
}

export function SheetSection(props: {
  form: SheetForm
  set: SetForm
  mail: string
  onMail: (text: string) => void
  locked: boolean
  mailNote: PinnedNote
  /** 새 달 파일 이름 예 */
  example: string
  /** 비트의 병원 이름('' = 아직 못 읽음) */
  bitName: string
}) {
  const { form, set } = props
  const ids = { template: useId(), pattern: useId(), label: useId(), folder: useId(), mail: useId(), mark: useId(), shift: useId() }
  const m = meta('sheet')
  return (
    <Section id={sectionId('sheet')} title={m.title} small={m.small}>
      <Row label={SHEET.templateLabel} htmlFor={ids.template}>
        <input
          id={ids.template}
          type="text"
          className={FIELD_WIDE}
          placeholder={SHEET.templatePlaceholder}
          value={form.templateUrl}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => set({ templateUrl: e.target.value })}
        />
      </Row>
      <Row label={SHEET.patternLabel} htmlFor={ids.pattern}>
        <input id={ids.pattern} type="text" className={FIELD_WIDE} value={form.namePattern} onChange={(e) => set({ namePattern: e.target.value })} />
        <p className={HINT}>{SHEET.patternExample(props.example)}</p>
      </Row>
      <Row label={SHEET.labelLabel} htmlFor={ids.label}>
        <input
          id={ids.label}
          type="text"
          className={FIELD_WIDE}
          placeholder={SHEET.labelPlaceholder(props.bitName)}
          value={form.hospitalLabel}
          onChange={(e) => set({ hospitalLabel: e.target.value })}
        />
        <p className={HINT}>{SHEET.labelHint}</p>
      </Row>
      <Row label={SHEET.folderLabel} htmlFor={ids.folder}>
        <input
          id={ids.folder}
          type="text"
          className={FIELD_WIDE}
          placeholder={SHEET.folderPlaceholder}
          value={form.folderUrl}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => set({ folderUrl: e.target.value })}
        />
      </Row>
      <Row label={SHEET.mailLabel} htmlFor={ids.mail}>
        <input
          id={ids.mail}
          type="text"
          className={FIELD_WIDE}
          value={props.mail}
          disabled={props.locked}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => props.onMail(e.target.value)}
        />
        <p className={HINT}>{SHEET.mailHint}</p>
        <PinnedNoteView note={props.mailNote} />
      </Row>
      <Row label={SHEET.rowsLabel}>
        <div className={LINE}>
          <input type="text" inputMode="numeric" aria-label={SHEET.rowsFromName} className={FIELD_S} value={form.firstRow} onChange={(e) => set({ firstRow: e.target.value })} />
          {SHEET.rowsFrom}
          <input type="text" inputMode="numeric" aria-label={SHEET.rowsToName} className={FIELD_S} value={form.lastRow} onChange={(e) => set({ lastRow: e.target.value })} />
          {SHEET.rowsTo}
        </div>
      </Row>
      <Row label={SHEET.colsLabel}>
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full border-collapse text-small">
            <thead>
              <tr>
                <th className="h-8 border border-line bg-canvas px-2.5 text-left text-caption font-semibold whitespace-nowrap text-muted">{SHEET.colsHead}</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="h-8 border border-line bg-canvas px-2.5 text-center text-caption font-semibold whitespace-nowrap text-muted">
                    {c.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="h-9 border border-line px-2.5 whitespace-nowrap text-muted">{SHEET.colsRow}</td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="h-9 border border-line px-1.5 text-center">
                    <input
                      type="text"
                      aria-label={`${c.name} 칸 글자`}
                      maxLength={3}
                      className={`${FIELD} w-10 px-0 text-center font-semibold`}
                      value={form.cols[c.key]}
                      onChange={(e) => set({ cols: { ...form.cols, [c.key]: e.target.value } })}
                    />
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className={HINT}>{SHEET.colsHint}</p>
      </Row>
      <Row label={SHEET.markLabel} htmlFor={ids.mark}>
        <div className={LINE}>
          <input id={ids.mark} type="text" className={FIELD_S} value={form.markValue} onChange={(e) => set({ markValue: e.target.value })} />
          <span className={HINT}>{SHEET.markHint}</span>
        </div>
      </Row>
      <Row label={SHEET.signsLabel}>
        <table className="w-full max-w-140 border-collapse text-small">
          <thead>
            <tr>
              {SIGNS.map((s) => (
                <th key={s.key} className="h-8 border border-line bg-canvas px-2.5 text-center text-caption font-semibold whitespace-nowrap text-muted">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {SIGNS.map((s) => (
                <td key={s.key} className="h-9 border border-line px-1.5 text-center">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label={`${s.name} 기호 번호`}
                    className={`${FIELD} w-10 px-0 text-center font-semibold`}
                    value={form.signs[s.key]}
                    onChange={(e) => set({ signs: { ...form.signs, [s.key]: e.target.value } })}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className={HINT}>{SHEET.signsHint}</p>
      </Row>
      <Row label={SHEET.shiftLabel} htmlFor={ids.shift}>
        <div className={LINE}>
          <input id={ids.shift} type="text" className={FIELD_M} value={form.shiftCols} onChange={(e) => set({ shiftCols: e.target.value })} />
          <span className={ds.chip.neutral}>{SHEET.shiftChip}</span>
          <span className={HINT}>{SHEET.shiftHint}</span>
        </div>
      </Row>
    </Section>
  )
}

export type CatalogView = { phase: 'loading' } | { phase: 'failed' } | { phase: 'ready'; catalog: Catalog }

function toggled(list: readonly string[], code: string, on: boolean): string[] {
  const without = list.filter((c) => c !== code)
  return on ? [...without, code] : without
}

export function BitSection(props: {
  form: SheetForm
  set: SetForm
  catalog: CatalogView
  rx: CodeListState
  roomsAuto: boolean
  hospitalNote: string
  canPick: boolean
  onPickHospital: () => void
  onOpenTherapy: () => void
  onRetry: () => void
}) {
  const { form, set, catalog } = props
  const roomsTitle = useId()
  const freeGroup = useId()
  const m = meta('bit')
  const depts = catalog.phase === 'ready' ? displayOrder(catalog.catalog.depts) : []

  const setRoom = (code: string, value: string) => {
    const rooms = Object.fromEntries(Object.entries(form.deptRooms).filter(([k]) => k.toUpperCase() !== code.toUpperCase()))
    if (value !== '') rooms[code] = Number(value)
    set({ deptRooms: rooms })
  }

  let deptNote: string | null = null
  if (catalog.phase === 'loading') deptNote = BIT.deptLoading
  else if (catalog.phase === 'failed') deptNote = BIT.deptFailed
  else if (depts.length === 0) deptNote = BIT.deptNone

  return (
    <Section id={sectionId('bit')} title={m.title} small={m.small}>
      <Row label={BIT.hospitalLabel}>
        <div className={LINE}>
          <button type="button" className={ds.button.secondarySmall} disabled={!props.canPick} onClick={props.onPickHospital}>
            {BIT.pick}
          </button>
          <span>{props.hospitalNote}</span>
        </div>
        <p className={HINT}>{BIT.hospitalHint}</p>
      </Row>
      <div className="grid grid-cols-2 gap-4 py-2.5">
        <div className="grid content-start gap-2 rounded-control border border-line px-3.5 py-3">
          <b id={roomsTitle} className="text-body font-semibold text-ink">
            {BIT.roomsTitle}
          </b>
          {deptNote !== null ? (
            <p className="text-small text-ink-2">{deptNote}</p>
          ) : (
            <>
              {props.roomsAuto ? <p className="text-small font-medium text-accent-strong">{BIT.deptAuto}</p> : null}
              <table aria-labelledby={roomsTitle} className="w-full border-collapse text-small">
                <thead>
                  <tr>
                    <th className="h-8 border-b border-line bg-canvas px-2.5 text-left text-caption font-semibold text-muted">{BIT.roomsDept}</th>
                    <th className="h-8 border-b border-line bg-canvas px-2.5 text-left text-caption font-semibold text-muted">{BIT.roomsRoom}</th>
                  </tr>
                </thead>
                <tbody>
                  {depts.map((d) => {
                    const room = roomOf(form.deptRooms, d.code)
                    return (
                      <tr key={d.code}>
                        <td className="border-b border-line px-2.5 py-1.5">
                          <b className="font-semibold text-ink">{d.code}</b> {d.name}
                          <p className={HINT}>{d.today ? BIT.deptVisits(formatCount(d.n90)) : BIT.deptUnused}</p>
                        </td>
                        <td className="border-b border-line px-2.5 py-1.5">
                          <select aria-label={BIT.roomName(d.code)} className={SELECT} value={room === undefined ? '' : String(room)} onChange={(e) => setRoom(d.code, e.target.value)}>
                            <option value="">{BIT.roomEmpty}</option>
                            {Array.from({ length: MAX_ROOM }, (_, i) => (
                              <option key={i + 1} value={String(i + 1)}>
                                {i + 1}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className={HINT}>{BIT.roomsHint(depts.length)}</p>
            </>
          )}
        </div>
        <div className="grid content-start gap-2 rounded-control border border-line px-3.5 py-3">
          <b className="text-body font-semibold text-ink">{BIT.kindsTitle}</b>
          <p className={HINT}>{BIT.kindsHint}</p>
          <p className="mt-1 text-small font-semibold text-ink-2">{BIT.firstTitle}</p>
          {KINDS.first.map((k) => (
            <Check key={k.code} name={k.name} checked={form.firstKinds.includes(k.code)} onChange={(on) => set({ firstKinds: toggled(form.firstKinds, k.code, on) })} />
          ))}
          <p className="mt-1 text-small font-semibold text-ink-2">{BIT.day90Title}</p>
          {KINDS.day90.map((k) => (
            <Check key={k.code} name={k.name} checked={form.day90Kinds.includes(k.code)} onChange={(on) => set({ day90Kinds: toggled(form.day90Kinds, k.code, on) })} />
          ))}
        </div>
      </div>
      <Row label={BIT.blockLabel}>
        <RuleLine kind="block" count={form.blockCodes.length} />
        <CodePicker kind="block" state={props.rx} selected={form.blockCodes} onChange={(codes) => set({ blockCodes: codes })} onRetry={props.onRetry} />
      </Row>
      <Row label={BIT.therapyLabel}>
        <div className={LINE}>
          <span className={RULE}>{form.therapyCodes.length > 0 ? RX.ruleSome(form.therapyCodes.length) : RX.ruleNone.therapy}</span>
          <span className={HINT}>{BIT.sameDialog}</span>
          <button type="button" className={ds.button.secondarySmall} onClick={props.onOpenTherapy}>
            {BIT.pick}
          </button>
        </div>
      </Row>
      <Row label={BIT.freeLabel}>
        <div className="grid gap-2 pt-1.5">
          {FREE_RULES.map((r) => (
            <Radio key={r.value} group={freeGroup} name={r.name} detail={r.detail} checked={form.free === r.value} onChange={() => set({ free: r.value })} />
          ))}
        </div>
      </Row>
      <Row label={BIT.notesLabel}>
        <div className="grid gap-2 pt-1.5">
          {NOTES.map((n) => (
            <Check key={n.key} name={n.name} detail={n.detail} checked={form[n.key]} onChange={(on) => set({ [n.key]: on })} />
          ))}
        </div>
        <p className={HINT}>{BIT.notesHint}</p>
      </Row>
    </Section>
  )
}

export function AutoSection({ form, set, recent }: { form: SheetForm; set: SetForm; recent: RecentItem[] | null }) {
  const everyId = useId()
  const m = meta('auto')
  return (
    <Section id={sectionId('auto')} title={m.title} small={m.small}>
      <Row label={AUTO.onLabel}>
        <div className="pt-1.5">
          <Check name={AUTO.on} detail={AUTO.onDetail} checked={form.autoOn} onChange={(on) => set({ autoOn: on })} />
        </div>
      </Row>
      <Row label={AUTO.everyLabel} htmlFor={everyId}>
        <div className={LINE}>
          <input id={everyId} type="text" inputMode="numeric" className={FIELD_S} value={form.everyMin} onChange={(e) => set({ everyMin: e.target.value })} />
          {AUTO.everyUnit}
          <input type="text" aria-label={AUTO.fromName} className={FIELD_M} value={form.from} onChange={(e) => set({ from: e.target.value })} />~
          <input type="text" aria-label={AUTO.toName} className={FIELD_M} value={form.to} onChange={(e) => set({ to: e.target.value })} />
          <span className={HINT}>{AUTO.everyHint}</span>
        </div>
      </Row>
      <Row label={AUTO.eveningLabel}>
        <div className={LINE}>
          <Check name={AUTO.eveningLabel} label={false} checked={form.eveningOn} onChange={(on) => set({ eveningOn: on })} />
          <input type="text" aria-label={AUTO.eveningName} className={FIELD_M} value={form.evening} onChange={(e) => set({ evening: e.target.value })} />
          <span className={HINT}>{AUTO.eveningHint}</span>
        </div>
      </Row>
      <Row label={AUTO.pastLabel}>
        <p className="pt-2 text-small text-ink-2">{AUTO.pastText}</p>
      </Row>
      <Row label={AUTO.modeLabel}>
        <div className="pt-2 text-body text-ink">
          {AUTO.mode} <span className={HINT}>{AUTO.modeHint}</span>
        </div>
      </Row>
      <Row label={AUTO.recentLabel}>
        <p className="pt-2 text-small text-muted">
          {recent === null
            ? null
            : recent.length === 0
              ? AUTO.recentNone
              : recent.map((item, i) => (
                  <Fragment key={i}>
                    {i > 0 ? ' · ' : null}
                    {item.map((part, j) =>
                      part.warn ? (
                        <span key={j} className="font-medium text-warning">
                          {part.text}
                        </span>
                      ) : (
                        <Fragment key={j}>{part.text}</Fragment>
                      ),
                    )}
                  </Fragment>
                ))}
        </p>
      </Row>
    </Section>
  )
}
