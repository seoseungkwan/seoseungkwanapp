'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { formatWon } from '@/components/revenue/money'
import { ds } from '@/components/ui/classes'
import { addDays, monthOf } from '@/lib/analytics/dates'
import { listAliases, listReceipts, loadInventory, readPhoto } from '@/lib/storage/inventory'
import type { ErrorCode } from '@/types/errors'
import type { InvCategory, InvItem, InvReceipt } from '@/types/inventory'
import { readInvoice } from './invoiceClient'
import { PHOTO_ACCEPT, shrinkPhoto } from './photo'
import { PhotoDialog } from './PhotoDialog'
import { ReceiptConfirm, dayText, draftFromInvoice, draftFromReceipt, manualDraft, orderReceiptLines, type ConfirmMode, type ReceiptDraft } from './ReceiptConfirm'

// 들어온 기록 도구 (specs/inventory REQ-7508 AC-7508.1·7508.3·7508.5, design.md 6절 TASK-10, 시안 ?s=in-list·in-photo).
// 머리 [사진 없이 적기]·[사진 올리기] → 오늘까지 90일 기록을 달로 묶은 표(이번 달은 펼침, 지난달은 접힌 머리 한 줄).
// [사진 올리기]: 브라우저가 사진을 줄이고(photo.ts) 명세서 읽기 경로를 부른 뒤(invoiceClient.ts) 맞춘 이름과 함께 "들어온 것 확인"을 연다.
// 읽는 동안 읽는 중 표시, 실패는 목록 위 오류 카드(E-INV-PHOTO·E-INV-NO-LINES·E-AI-*). [고치기]는 같은 확인 화면을 그 기록 값으로 연다.
// 저장하면 목록과 물품을 다시 읽고 onChanged로 알린다. 입고 줄은 차례 칸이 없어 물품 목록 차례로 그린다

export type ReceiptsToolProps = {
  today: string
  /** 세기 경고의 [입고 적기]: 처음부터 "사진 없이 적기"를 연다 */
  startManual?: boolean
  onChanged?: () => void
}

type Data = { categories: InvCategory[]; items: InvItem[]; receipts: InvReceipt[] }
type Confirm = { mode: ConfirmMode; draft: ReceiptDraft; photo: Blob | null; photoName: string | null; receiptId?: string; key: number }
type Zoom = { title: string; path: string }

const DAYS = 90 // 오늘까지 90일
const TD = 'h-11 whitespace-nowrap border-b border-line px-3 text-ink first:pl-5 last:pr-5'
const TH_BASE = 'h-10 whitespace-nowrap border-b border-line px-3 font-medium text-muted first:pl-5 last:pr-5'
const TH = `${TH_BASE} text-left`
const TH_NUM = `${TH_BASE} text-right`
const GROUP_TH = 'whitespace-nowrap border-b border-line px-3 align-bottom font-semibold text-ink first:pl-5 last:pr-5'
const DETAIL_TD = 'border-b border-line px-3 pt-1 pb-3 first:pl-5 last:pr-5'
const SMALL_LINK = ds.textButton.replace('text-body', 'text-small')
// 첫 물품 줄 펼치기: 글자 단추 모양이지만 글자는 ink(시안 .tbtn.s color:ink)
const ROW_TOGGLE = `inline-flex cursor-pointer items-center gap-1 rounded-control text-small font-medium text-ink underline-offset-3 transition hover:underline ${ds.focusRing}`

const sumOf = (receipt: InvReceipt) => receipt.lines.reduce((sum, line) => sum + line.amount, 0)

function monthLabel(month: string, today: string): string {
  const [year, m] = month.split('-')
  return year === today.slice(0, 4) ? `${Number(m)}월` : `${year}년 ${Number(m)}월`
}

/** 최근 날짜 먼저 온 기록을 달로 묶는다(차례 그대로) */
function byMonth(receipts: InvReceipt[]): [string, InvReceipt[]][] {
  const groups = new Map<string, InvReceipt[]>()
  for (const receipt of receipts) {
    const month = monthOf(receipt.day)
    groups.set(month, [...(groups.get(month) ?? []), receipt])
  }
  return [...groups]
}

export function ReceiptsTool({ today, startManual = false, onChanged }: ReceiptsToolProps) {
  const [data, setData] = useState<Data | 'loading' | 'failed'>('loading')
  const [reloadKey, setReloadKey] = useState(0)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [reading, setReading] = useState(false)
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [askManual, setAskManual] = useState(startManual)
  const [openMonths, setOpenMonths] = useState<ReadonlySet<string>>(new Set())
  const [openRows, setOpenRows] = useState<ReadonlySet<string>>(new Set())
  const [zoom, setZoom] = useState<Zoom | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = useRef(false)
  const confirmKey = useRef(0)
  const dataRef = useRef<Data | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([loadInventory(), listReceipts({ from: addDays(today, 1 - DAYS), to: today })]).then(
      ([inventory, receipts]) => {
        if (!alive) return
        if (inventory === 'failed' || receipts === 'failed') {
          setData((current) => (current === 'loading' || current === 'failed' ? 'failed' : current))
          return
        }
        const next = { categories: inventory.categories, items: inventory.items, receipts }
        dataRef.current = next
        setData(next)
      },
      () => alive && setData('failed'),
    )
    return () => {
      alive = false
    }
  }, [today, reloadKey])

  const openManual = useCallback(() => {
    const ready = dataRef.current
    if (ready === null) return
    setFailure(null)
    setConfirm({ mode: 'manual', draft: manualDraft(today, ready.categories), photo: null, photoName: null, key: ++confirmKey.current })
  }, [today])

  useEffect(() => {
    if (startManual) setAskManual(true)
  }, [startManual])

  useEffect(() => {
    if (askManual && typeof data === 'object') {
      setAskManual(false)
      openManual()
    }
  }, [askManual, data, openManual])

  async function readPhotoFile(file: File) {
    if (busy.current || dataRef.current === null) return
    busy.current = true
    setConfirm(null)
    setFailure(null)
    setReading(true)
    try {
      const photo = await shrinkPhoto(file)
      if (photo === null) {
        setFailure('E-INV-PHOTO')
        return
      }
      const [answer, aliases] = await Promise.all([readInvoice(photo), listAliases()])
      if (answer.kind === 'error') {
        setFailure(answer.code)
        return
      }
      const ready = dataRef.current
      if (ready === null) return
      const draft = draftFromInvoice(answer.invoice, ready.items, aliases === 'failed' ? [] : aliases, ready.categories, today)
      setConfirm({ mode: 'photo', draft, photo, photoName: file.name, key: ++confirmKey.current })
    } catch {
      setFailure('E-AI-FAILED')
    } finally {
      busy.current = false
      setReading(false)
    }
  }

  function openEdit(receipt: InvReceipt) {
    const ready = dataRef.current
    if (ready === null) return
    const key = ++confirmKey.current
    setFailure(null)
    setConfirm({ mode: 'edit', draft: draftFromReceipt(receipt, ready.items, ready.categories), photo: null, photoName: null, receiptId: receipt.id, key })
    if (receipt.photoPath !== null) {
      void readPhoto(receipt.photoPath).then((photo) => setConfirm((current) => (current !== null && current.key === key ? { ...current, photo } : current)))
    }
  }

  function saved() {
    setConfirm(null)
    setReloadKey((n) => n + 1)
    onChanged?.()
  }

  const pickPhoto = () => {
    if (!busy.current) fileRef.current?.click()
  }

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      hidden
      accept={PHOTO_ACCEPT}
      aria-label="명세서 사진 파일"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = '' // 같은 파일을 다시 고를 수 있게
        if (file) void readPhotoFile(file)
      }}
    />
  )

  if (confirm !== null && typeof data === 'object') {
    return (
      <>
        {fileInput}
        <ReceiptConfirm
          key={confirm.key}
          mode={confirm.mode}
          today={today}
          categories={data.categories}
          items={data.items}
          initial={confirm.draft}
          photo={confirm.photo}
          photoName={confirm.photoName}
          receiptId={confirm.receiptId}
          onPhoto={pickPhoto}
          onCancel={() => setConfirm(null)}
          onSaved={saved}
        />
      </>
    )
  }

  const ready = typeof data === 'object'
  return (
    <section aria-labelledby="receipts-title">
      {fileInput}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id="receipts-title" className="text-subtitle font-semibold text-ink">
            들어온 기록
          </h2>
          <p className="mt-0.5 max-w-208 text-small text-muted">거래명세서·영수증·주문 화면 캡처 사진을 올리면 AI가 읽어 줘요. 사진은 기록과 함께 보관해요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ds.button.secondary} disabled={!ready || reading} onClick={openManual}>
            사진 없이 적기
          </button>
          <button type="button" className={ds.button.primary} disabled={!ready} aria-busy={reading || undefined} onClick={pickPhoto}>
            <Icon name="upload" />
            사진 올리기
          </button>
        </div>
      </div>

      {reading && (
        <p role="status" className="mt-4 flex items-center gap-2 text-small text-ink-2">
          <Icon name="clock" className="text-muted" />
          사진을 읽는 중이에요. 잠시 기다려 주세요.
        </p>
      )}
      {failure !== null && (
        <div className="mt-4">
          <ErrorCard code={failure} />
        </div>
      )}

      {data === 'loading' && <p className="mt-4 text-small text-muted">들어온 기록을 읽는 중이에요…</p>}
      {data === 'failed' && (
        <div className="mt-4 flex flex-col items-start gap-3">
          <ErrorCard code="E-INV-READ-FAILED" />
          <button
            type="button"
            className={ds.button.secondary}
            onClick={() => {
              setData('loading')
              setReloadKey((n) => n + 1)
            }}
          >
            다시 읽기
          </button>
        </div>
      )}
      {typeof data === 'object' && (
        <RecordTable
          data={data}
          today={today}
          openMonths={openMonths}
          openRows={openRows}
          onMonth={(month) => setOpenMonths((current) => toggled(current, month))}
          onRow={(id) => setOpenRows((current) => toggled(current, id))}
          onPhoto={(receipt) => receipt.photoPath !== null && setZoom({ title: photoTitle(receipt), path: receipt.photoPath })}
          onEdit={openEdit}
        />
      )}

      {zoom !== null && <PhotoDialog title={zoom.title} source={{ path: zoom.path }} onClose={() => setZoom(null)} />}
    </section>
  )
}

function toggled(set: ReadonlySet<string>, value: string): ReadonlySet<string> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

const photoTitle = (receipt: InvReceipt) => `${dayText(receipt.day)}${receipt.vendor ? ` · ${receipt.vendor}` : ''} 사진`

type TableProps = {
  data: Data
  today: string
  openMonths: ReadonlySet<string>
  openRows: ReadonlySet<string>
  onMonth: (month: string) => void
  onRow: (id: string) => void
  onPhoto: (receipt: InvReceipt) => void
  onEdit: (receipt: InvReceipt) => void
}

function RecordTable({ data, today, openMonths, openRows, onMonth, onRow, onPhoto, onEdit }: TableProps) {
  const byId = new Map(data.items.map((item) => [item.id, item]))
  const thisMonth = monthOf(today)
  const nameOf = (itemId: string) => byId.get(itemId)?.name ?? '알 수 없는 물품'
  const unitOf = (itemId: string) => byId.get(itemId)?.unit ?? ''
  const months = byMonth(data.receipts)

  return (
    <div className="relative mt-3 min-w-0 overflow-x-auto">
      <table className="w-full border-collapse text-small">
        <thead>
          <tr>
            <th className={TH}>날짜</th>
            <th className={TH}>거래처</th>
            <th className={TH}>물품</th>
            <th className={TH_NUM}>금액</th>
            <th className={TH}>사진</th>
            <th className={TH}>
              <span className="sr-only">고치기</span>
            </th>
          </tr>
        </thead>
        {months.length === 0 && (
          <tbody>
            <tr>
              <td colSpan={6} className="h-12 px-5 text-muted">
                최근 {DAYS}일 동안 들어온 기록이 없어요.
              </td>
            </tr>
          </tbody>
        )}
        {months.map(([month, receipts], index) => {
          const current = month === thisMonth
          const open = current || openMonths.has(month)
          const height = index === 0 ? 'h-8' : 'h-11 pt-3'
          return (
            <tbody key={month}>
              <tr>
                <th scope="rowgroup" colSpan={3} className={`${GROUP_TH} ${height} text-left`}>
                  {monthLabel(month, today)}
                  <span className="ml-2 font-normal text-muted">{receipts.length}건</span>
                </th>
                <th className={`${GROUP_TH} ${height} text-right tabular-nums`}>{formatWon(receipts.reduce((sum, receipt) => sum + sumOf(receipt), 0))}</th>
                <th colSpan={2} className={`${GROUP_TH} ${height} text-right`}>
                  {!current && (
                    <button type="button" aria-expanded={open} className={SMALL_LINK} onClick={() => onMonth(month)}>
                      {open ? '접기' : '펼치기'}
                      <Icon name="chev" size={14} className={open ? 'rotate-180' : undefined} />
                    </button>
                  )}
                </th>
              </tr>
              {open &&
                receipts.map((receipt) => {
                  const lines = orderReceiptLines(receipt.lines, data.items, data.categories)
                  const first = lines[0]
                  const summary =
                    first === undefined
                      ? '줄 없음'
                      : `${nameOf(first.itemId)} ${formatCount(first.qty)}${unitOf(first.itemId)}${lines.length > 1 ? ` 외 ${lines.length - 1}줄` : ''}`
                  const rowOpen = openRows.has(receipt.id)
                  return (
                    <Fragment key={receipt.id}>
                      <tr className="hover:bg-canvas">
                        <td className={TD}>{dayText(receipt.day)}</td>
                        <td className={TD}>{receipt.vendor ?? <span className="text-muted">–</span>}</td>
                        <td className={TD}>
                          <button type="button" aria-expanded={rowOpen} className={ROW_TOGGLE} onClick={() => onRow(receipt.id)}>
                            {summary}
                            <Icon name="chev" size={14} className={rowOpen ? 'rotate-180 text-muted' : 'text-muted'} />
                          </button>
                        </td>
                        <td className={`${TD} text-right tabular-nums`}>{formatWon(sumOf(receipt))}</td>
                        <td className={TD}>
                          {receipt.photoPath !== null ? (
                            <button type="button" className={ds.button.secondarySmall} onClick={() => onPhoto(receipt)}>
                              사진 보기
                            </button>
                          ) : (
                            <span className="text-small text-muted">사진 없음</span>
                          )}
                        </td>
                        <td className={`${TD} w-px text-right`}>
                          <button type="button" className={ds.button.ghostSmall} onClick={() => onEdit(receipt)}>
                            고치기
                          </button>
                        </td>
                      </tr>
                      {rowOpen && (
                        <tr>
                          <td className={DETAIL_TD} />
                          <td className={DETAIL_TD} />
                          <td colSpan={4} className={DETAIL_TD}>
                            <div className="grid grid-cols-[max-content_max-content_max-content] gap-x-6 gap-y-0.5 text-small text-ink-2">
                              {lines.map((line, at) => (
                                <Fragment key={`${line.itemId}-${at}`}>
                                  <span>{nameOf(line.itemId)}</span>
                                  <span className="text-right tabular-nums">
                                    {`${formatCount(line.qty)}${unitOf(line.itemId)}${line.unitPrice !== null ? ` × ${formatWon(line.unitPrice)}` : ''}`}
                                  </span>
                                  <span className="text-right tabular-nums">{formatWon(line.amount)}</span>
                                </Fragment>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}
