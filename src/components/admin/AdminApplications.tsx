'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ui } from '@/components/ui/classes'
import { listApplications, setHospitalStatus, type Application } from '@/lib/auth/admin'
import { appliedOn, countByTab, doneMessage, EMPTY, phoneText, rowsOf, TABS, withStatus, type Tab } from './applications'

// 관리자 · 가입 신청 목록 (REQ-007, design.md '관리자', UI_GUIDE '앱 화면' 화면 안 탭·표·칩·확인 창·폰). 문구·순서는 목업 Admin.dc.html.
// 목록은 브라우저가 읽는다(RLS: 관리자는 모든 병원). 상태는 DB 함수 set_hospital_status로만 바꾸고, 성공한 뒤에만 화면 줄을 옮긴다.
// 앱 틀(위쪽 띠·탭 띠·<main>)은 (app)/layout의 AppShell이 준다

const INTRO = '승인하면 그 계정은 바로 대시보드를 쓸 수 있습니다. 거절한 신청은 거절 탭에서 되돌릴 수 있습니다.'
const CONFIRM_BODY = '거절하면 이 계정은 대시보드를 쓸 수 없습니다. 거절 탭에서 언제든 되돌릴 수 있습니다.'

// 화면 안 탭: 앱 탭 띠와 같은 밑줄 모양, 높이 40px·body(폰 44px). 키보드 초점은 탭 안쪽 2px accent 고리
const tabBase =
  'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
// 지금: accent 700 + 아래 3px accent 밑줄(좌우 10px 안쪽, 위 모서리 2px)
const tabCurrent = `${tabBase} font-bold text-accent after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.75 after:rounded-t-xs after:bg-accent`

// 폰(768px 미만): 표 머리를 숨기고 줄마다 카드처럼 쌓는다(UI_GUIDE '표'·'폰'). 패널 틀은 벗기고 줄이 카드가 된다
const panelClass = `${ui.panel} max-md:border-0 max-md:bg-transparent max-md:p-0`
const rowClass = `${ui.table.row} max-md:flex max-md:flex-col max-md:gap-1.5 max-md:rounded-card max-md:border max-md:border-line max-md:bg-surface max-md:p-4`
// 폰 칸: 줄바꿈 허용, 칸 선·여백 없음(ui 칸의 첫 칸 왼쪽 8px도 지운다)
const cellPhone = 'max-md:h-auto max-md:whitespace-normal max-md:border-b-0 max-md:p-0 max-md:first:pl-0'
// 폰에서만 값 앞에 칸 이름(data-label, PC는 표 머리가 대신한다). 이름 칸 56px·muted
const labeled = `${cellPhone} max-md:flex max-md:gap-3 max-md:before:w-14 max-md:before:shrink-0 max-md:before:text-muted max-md:before:content-[attr(data-label)]`
// DOM은 PC 칸 순서(신청일 먼저). 폰은 병원 이름·신청자·이메일·연락처·신청일 / 상태 칩·단추 순서
const cell = {
  date: `${ui.table.tdSub} ${labeled} max-md:order-1`,
  clinic: `${ui.table.td} ${cellPhone} font-medium md:truncate max-md:text-body max-md:font-semibold`,
  applicant: `${ui.table.td} ${labeled} md:truncate`,
  email: `${ui.table.tdSub} ${labeled} md:truncate max-md:break-all`,
  phone: `${ui.table.tdSub} ${labeled}`,
  action: `${ui.table.td} ${cellPhone} max-md:order-2 max-md:mt-2 max-md:flex max-md:flex-col max-md:gap-3`,
}
// 빈 탭 안내: 제목과 설명을 따로 줄로(목업 <p> 둘). 두 줄이라 위아래 여백을 둔다
const emptyClass = `${ui.table.emptyRow} py-3 max-md:block max-md:h-auto max-md:rounded-card max-md:border max-md:bg-surface max-md:px-4 max-md:py-3`
// PC 칸 폭은 정해 둔다(table-fixed): 줄이 다른 탭으로 옮겨 가거나 탭이 비어도 칸 자리가 움직이지 않는다.
// 신청일·신청자·연락처·동작은 정한 폭, 병원 이름·이메일은 남은 폭을 반씩. 글 칸(병원 이름·신청자·이메일)은 넘치면 말줄임 + title로 전체 값.
// 표는 최소 1000px — 더 좁으면 표만 옆으로 밀린다
const COLUMNS = [
  { label: '신청일', width: 'w-28' },
  { label: '병원 이름', width: '' },
  { label: '신청자', width: 'w-28' },
  { label: '이메일', width: '' },
  { label: '연락처', width: 'w-32' },
  { label: '동작', width: 'w-36' },
] as const

function CheckIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" className="shrink-0" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function RestoreIcon() {
  return (
    <svg aria-hidden="true" className="shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5v5h5" />
      <path d="M4.5 10A8 8 0 1 1 6 16.5" />
    </svg>
  )
}

// 거절 확인 창: 처음 초점 [취소], Esc = 취소, Tab은 창 안 두 단추 사이만 돈다. 떠 있는 층(ui.layer) + 가림막 ink 36%
function RejectDialog({ row, onCancel, onConfirm }: { row: Application; onCancel: () => void; onConfirm: () => void }) {
  const titleId = useId()
  const bodyId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // 창 안 빈 곳을 누르면 초점은 창 자신(tabIndex=-1)에 남는다 → 거기서도 Tab은 [취소]·[거절] 사이만 돈다
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const [first, last] = [cancelRef.current, confirmRef.current]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === e.currentTarget)) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && (active === last || active === e.currentTarget)) {
      e.preventDefault()
      first?.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-ink/36 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        onKeyDown={trapTab}
        className={`${ui.layer} flex w-full max-w-100 flex-col gap-4 p-6 outline-hidden max-md:p-5`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          이 신청을 거절할까요?
        </h2>
        <div className="flex flex-col gap-0.5 rounded-card border border-line bg-canvas px-3 py-2.5">
          <span className="text-body font-semibold text-ink">{row.name}</span>
          <span className="break-all text-table text-ink-2">{`${row.applicantName} · ${row.email}`}</span>
        </div>
        <p id={bodyId} className="text-body text-ink-2">
          {CONFIRM_BODY}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${ui.button.secondary} max-md:flex-1`}>
            취소
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={`${ui.button.danger} max-md:flex-1`}>
            거절
          </button>
        </div>
      </div>
    </div>
  )
}

export function AdminApplications() {
  const [rows, setRows] = useState<Application[] | null>(null) // null = 읽는 중
  const [loadError, setLoadError] = useState<{ error: unknown } | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<Application | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  // 바꾸기가 끝난 뒤 초점을 둘 곳: 성공 = 그때의 지금 탭('tab', 누른 단추의 줄은 다른 탭으로 옮겨져 사라진다), 실패 = 처음 누른 단추.
  // 다시 그린 뒤에 옮기므로 effect가 맡는다(focusTick이 바뀔 때). 한 번 쓰면 비운다
  const focusAfterRef = useRef<'tab' | HTMLElement | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const baseId = useId()
  const tabId = (key: Tab) => `${baseId}-tab-${key}`
  const panelId = `${baseId}-panel`

  useEffect(() => {
    let alive = true // 떠난 뒤 온 결과는 버린다
    listApplications().then(
      (list) => {
        if (alive) setRows(list)
      },
      (error: unknown) => {
        if (alive) setLoadError({ error })
      },
    )
    return () => {
      alive = false
    }
  }, [])

  // 목록을 읽지 못하면 그리기를 멈춘다 → 화면 오류(app/error.tsx: E-PAGE-FAILED + [다시 시도]·[로그아웃])가 안내한다
  if (loadError !== null) throw loadError.error

  const select = (key: Tab) => {
    setTab(key)
    setMessage('') // 탭을 바꾸면 완료 줄·오류 카드는 지운다(목업)
    setFailed(false)
  }

  // 화면 안 탭 키보드: ←·→(끝에서 돌아감)·Home·End로 옮기며 바로 연다. 지금 탭만 Tab 순서에 든다
  const onTabKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab)
    const last = TABS.length - 1
    const moves: Record<string, number> = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }
    if (!(e.key in moves)) return
    e.preventDefault()
    const key = TABS[moves[e.key]].key
    select(key)
    tabRefs.current[key]?.focus()
  }

  useEffect(() => {
    const target = focusAfterRef.current
    if (focusTick === 0 || target === null) return
    focusAfterRef.current = null
    ;(target === 'tab' ? tabRefs.current[tab] : target)?.focus()
  }, [focusTick, tab])

  // 함수가 성공한 뒤에만 줄을 옮긴다. 실패하면 줄은 그대로 두고 E-ADMIN-FAILED 카드(저절로 다시 보내지 않는다)
  const change = async (row: Application, status: Tab, origin: HTMLButtonElement | null) => {
    setBusy(true)
    try {
      await setHospitalStatus(row.id, status)
      setRows((prev) => (prev === null ? prev : withStatus(prev, row.id, status)))
      setFailed(false)
      setMessage(doneMessage(row.name, status))
      focusAfterRef.current = 'tab'
    } catch {
      setMessage('')
      setFailed(true)
      focusAfterRef.current = origin
    } finally {
      setBusy(false)
      setFocusTick((n) => n + 1)
    }
  }

  const askReject = (row: Application, opener: HTMLButtonElement) => {
    openerRef.current = opener
    setConfirming(row)
  }
  // [취소]·Esc: 아무것도 하지 않고 누른 [거절]로 초점을 돌려준다
  const cancelReject = useCallback(() => {
    setConfirming(null)
    openerRef.current?.focus()
  }, [])

  const counts = rows === null ? null : countByTab(rows)
  const list = rows === null ? [] : rowsOf(rows, tab)
  const label = TABS.find((t) => t.key === tab)?.label ?? ''

  return (
    <div aria-busy={rows === null} className="flex flex-col gap-4 max-md:gap-3">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-title font-semibold text-ink max-md:text-title-sm">가입 신청</h1>
        <p className="text-body text-ink-2">{INTRO}</p>
      </div>

      {counts !== null && (
        <>
          <div role="tablist" aria-label="신청 상태" onKeyDown={onTabKeyDown} className="flex gap-1 border-b border-line">
            {TABS.map((t) => {
              const on = t.key === tab
              return (
                <button
                  key={t.key}
                  ref={(el) => {
                    tabRefs.current[t.key] = el
                  }}
                  type="button"
                  role="tab"
                  id={tabId(t.key)}
                  aria-selected={on}
                  aria-controls={panelId}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(t.key)}
                  className={on ? tabCurrent : tabIdle}
                >
                  {/* 굵기가 바뀌어도 탭 폭이 흔들리지 않게 굵은 글자 폭을 보이지 않는 ::after로 미리 잡는다 */}
                  <span
                    data-label={t.label}
                    className="inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:font-bold after:content-[attr(data-label)]"
                  >
                    {t.label}
                  </span>{' '}
                  <span className={ui.chip.neutral}>{counts[t.key]}</span>
                </button>
              )
            })}
          </div>

          {/* 완료 줄과 오류 카드는 같은 자리(탭 줄과 표 사이). 완료 줄 자리(role=status)는 늘 두고 글만 바꾼다 —
              새로 붙은 알림 자리는 화면 읽기가 놓칠 수 있다. 비면(:empty) 화면 밖으로 빼 자리를 차지하지 않는다(sr-only) */}
          <p role="status" className="flex items-center gap-2 text-table text-ok empty:sr-only">
            {message !== '' && (
              <>
                <CheckIcon size={16} />
                {message}
              </>
            )}
          </p>
          {failed && <ErrorCard code="E-ADMIN-FAILED" />}

          <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className={panelClass}>
            <div className={`${ui.table.wrap} max-md:overflow-visible`}>
              <table aria-label={`${label} 신청`} className={`${ui.table.table} md:table-fixed md:min-w-250 max-md:block`}>
                <thead className="max-md:hidden">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.label} scope="col" className={`${ui.table.th} ${c.width}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={COLUMNS.length} className={emptyClass}>
                        <p className="font-medium">{EMPTY[tab].title}</p>
                        <p>{EMPTY[tab].body}</p>
                      </td>
                    </tr>
                  ) : (
                    list.map((row) => (
                      <tr key={row.id} className={rowClass}>
                        <td data-label="신청일" className={cell.date}>
                          {appliedOn(row.createdAt)}
                        </td>
                        <td className={cell.clinic} title={row.name}>
                          {row.name}
                        </td>
                        <td data-label="신청자" className={cell.applicant} title={row.applicantName}>
                          {row.applicantName}
                        </td>
                        <td data-label="이메일" className={cell.email} title={row.email}>
                          {row.email}
                        </td>
                        <td data-label="연락처" className={cell.phone}>
                          {phoneText(row.phone)}
                        </td>
                        <td className={cell.action}>
                          {row.status === 'approved' ? (
                            // 승인 줄은 동작 단추 없이 완료 칩만(PC·폰 모두)
                            <span className={`${ui.chip.done} gap-1 self-start`}>
                              <CheckIcon size={12} />
                              승인됨
                            </span>
                          ) : (
                            <>
                              {/* 폰에서만 상태 칩(PC는 탭이 상태를 보인다) */}
                              <span className={`${row.status === 'pending' ? ui.chip.waiting : ui.chip.rejected} self-start md:hidden`}>
                                {row.status === 'pending' ? '대기' : '거절됨'}
                              </span>
                              <div className="flex gap-2">
                                {row.status === 'pending' ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={(e) => void change(row, 'approved', e.currentTarget)}
                                      className={`${ui.button.primarySmall} max-md:flex-1`}
                                    >
                                      승인
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busy}
                                      onClick={(e) => askReject(row, e.currentTarget)}
                                      className={`${ui.button.secondarySmall} max-md:flex-1`}
                                    >
                                      거절
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={(e) => void change(row, 'pending', e.currentTarget)}
                                    className={`${ui.button.secondarySmall} max-md:flex-1`}
                                  >
                                    <RestoreIcon />
                                    되돌리기
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {confirming !== null && (
        <RejectDialog
          row={confirming}
          onCancel={cancelReject}
          onConfirm={() => {
            setConfirming(null)
            void change(confirming, 'rejected', openerRef.current)
          }}
        />
      )}
    </div>
  )
}
