'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { listApplications, setHospitalStatus, type Application } from '@/lib/auth/admin'
import { appliedOn, countByTab, doneMessage, EMPTY, phoneText, rowsOf, TABS, withStatus, type Tab } from './applications'

// 관리자 · 가입 승인 (REQ-007, b2b-redesign REQ-220, ui-90 REQ-417, docs/UI_GUIDE.md '관리자'). 짜임은 목업 Admin.dc.html, 모양은 b2b-redesign 시안,
// 이름("가입 승인" = 계정 메뉴·탭 이름)·"관리자" 표시·말투(~요)는 ui-90 시안 docs/mockups/ui-90/app/gen.py admin_body.
// 목록은 브라우저가 읽는다(RLS: 관리자는 모든 병원). 상태는 DB 함수 set_hospital_status로만 바꾸고, 성공한 뒤에만 화면 줄을 옮긴다.
// 앱 틀(위쪽 띠·탭 띠·<main>)은 (app)/layout의 AppShell이 준다

const INTRO = '승인하면 그 계정은 바로 대시보드를 쓸 수 있어요. 거절한 신청은 거절 탭에서 되돌릴 수 있어요.'
// 거절 확인 창 문구는 시안에 없어 말끝만 "~요"로 바꾼다(ui-90 design.md '시안과 다른 점' 11)
const CONFIRM_BODY = '거절하면 이 계정은 대시보드를 쓸 수 없어요. 거절 탭에서 언제든 되돌릴 수 있어요.'

// 화면 안 탭: 40px·body(휴대폰 44px), 탭 줄 아래 1px line. 첫 탭은 왼쪽 12px을 당겨 글자를 제목 끝에 맞춘다.
// 키보드 초점은 탭 안쪽 2px accent 고리
const tabBase =
  'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
// 지금: ink 600 + 아래 2px accent 밑줄(글자 폭, 탭 줄 선 위에 겹침)
const tabCurrent = `${tabBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

// 표는 패널 틀 없이 본문 위에 바로 둔다: surface 띠 + 위아래 1px line(모서리 없음). PC 몸 줄 56px·body 글자.
// 휴대폰(768px 미만): 표 머리를 숨기고 줄마다 세 줄 격자로 쌓는다. 띠는 본문 좌우 여백(16px)만큼 밖으로 나가 화면 끝까지 닿고,
// 줄 사이는 1px line(마지막 줄 없음), 줄 안쪽 12px 16px
const rowClass = `${ds.table.row} md:h-14 max-md:grid max-md:grid-cols-[fit-content(50%)_1fr_auto] max-md:items-center max-md:gap-y-0.5 max-md:border-b max-md:border-line max-md:px-4 max-md:py-3 max-md:last:border-b-0`
// 휴대폰 칸: 높이·칸 선·여백을 지운다(ds 칸의 첫 칸 왼쪽·끝 칸 오른쪽 20px도)
const cellPhone = 'max-md:h-auto max-md:border-b-0 max-md:p-0 max-md:first:pl-0 max-md:last:pr-0'
// DOM은 PC 칸 순서(신청일 먼저). 휴대폰 격자(칸 3개: 신청자 글자 폭(줄 폭의 반까지) · 남은 폭 · 글자 폭).
// 긴 이름(DB는 30자까지)은 첫 칸 안에서 줄바꿈한다 → 셋째 칸(신청일·단추)은 늘 화면 안에 남는다:
//   1줄 의원 이름(600, 말줄임) · 오른쪽 신청일(caption muted)
//   2줄 신청자 · 이메일(small ink-2)
//   3줄 연락처(small muted) · 오른쪽 동작 단추(44px)
// 768~1023px(태블릿)은 글 칸(의원 이름·신청자·이메일)이 좁아 말줄임 대신 줄바꿈한다 — title은 마우스로만 보이니 터치·키보드로도
// 전체 값을 보고 [승인]을 누르게(1024px 이상은 말줄임 그대로, 휴대폰 의원 이름도 말줄임 그대로)
const wrapTablet = 'md:max-lg:whitespace-normal md:max-lg:break-all'
const cell = {
  date: `${ds.table.tdSub} ${cellPhone} md:text-body max-md:col-start-3 max-md:row-start-1 max-md:ml-3 max-md:justify-self-end max-md:text-caption`,
  clinic: `${ds.table.td} ${cellPhone} truncate ${wrapTablet} text-body font-semibold max-md:col-start-1 max-md:col-end-3 max-md:row-start-1`,
  applicant: `${ds.table.td} ${cellPhone} md:truncate ${wrapTablet} md:text-body max-md:col-start-1 max-md:row-start-2 max-md:self-start max-md:whitespace-normal max-md:break-all max-md:text-ink-2`,
  email: `${ds.table.tdSub} ${cellPhone} md:truncate ${wrapTablet} md:text-body max-md:col-start-2 max-md:col-end-4 max-md:row-start-2 max-md:self-start max-md:whitespace-normal max-md:break-all max-md:before:px-1 max-md:before:content-['·']`,
  phone: `${ds.table.tdSub} ${cellPhone} tabular-nums md:text-body max-md:col-start-1 max-md:col-end-3 max-md:row-start-3 max-md:mt-1.5 max-md:text-muted`,
  action: `${ds.table.td} ${cellPhone} max-md:col-start-3 max-md:row-start-3 max-md:mt-1.5 max-md:ml-3 max-md:justify-self-end`,
}
// 빈 탭 안내: 제목과 설명을 따로 줄로(목업 <p> 둘). 두 줄이라 위아래 여백을 둔다
const emptyClass = `${ds.table.emptyRow} py-3 max-md:block max-md:h-auto max-md:px-4`
// PC 칸 폭은 정해 둔다(table-fixed): 줄이 다른 탭으로 옮겨 가거나 탭이 비어도 칸 자리가 움직이지 않는다.
// 신청일·신청자 120px, 연락처·동작 150px, 의원 이름·이메일은 남은 폭을 반씩. 글 칸(의원 이름·신청자·이메일)은 넘치면 말줄임 + title로 전체 값.
// 표에는 최소 폭이 없다: 768~1023px(본문 720~975px)에서는 정한 칸을 글자 폭에 맞춰 줄여(신청일 116 · 신청자 80 · 연락처 136 · 동작 140)
// 옆으로 밀지 않고도 모든 칸과 [승인]·[거절]이 보인다. 동작 칸 머리는 오른쪽(ds.table.th의 왼쪽 정렬을 md:로 덮는다, 휴대폰은 머리가 없다)
const COLUMNS = [
  { label: '신청일', width: 'w-30 max-lg:w-29' },
  { label: '의원 이름', width: '' },
  { label: '신청자', width: 'w-30 max-lg:w-20' },
  { label: '이메일', width: '' },
  { label: '연락처', width: 'w-37.5 max-lg:w-34' },
  { label: '동작', width: 'w-37.5 max-lg:w-35 md:text-right' },
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

// 거절 확인 창: 처음 초점 [취소], Esc = 취소, Tab은 창 안 두 단추 사이만 돈다. 떠 있는 층(ds.layer, 8px·그림자)·폭 400px·안쪽 24px + 가림막 ink 36%
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
        className={`${ds.layer} flex w-full max-w-100 flex-col gap-4 p-6 outline-hidden`}
      >
        <h2 id={titleId} className="text-lead font-semibold text-ink">
          이 신청을 거절할까요?
        </h2>
        {/* 신청 내용: 창(상자) 안이라 테두리 없이 canvas 바탕만(상자 안 상자 금지) */}
        <div className="flex flex-col gap-0.5 rounded-control bg-canvas px-3 py-2">
          <span className="text-body font-semibold text-ink">{row.name}</span>
          <span className="break-all text-small text-ink-2">{`${row.applicantName} · ${row.email}`}</span>
        </div>
        <p id={bodyId} className="text-body text-ink-2">
          {CONFIRM_BODY}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${ds.button.secondary} max-md:flex-1`}>
            취소
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={`${ds.button.danger} max-md:flex-1`}>
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
      {/* 제목 묶음(시안 .loc · .ad-h1 · .ad-p): 작은 "관리자" 표시(small 600 muted + userCheck 14) → h1 → 안내. 줄 사이 4px.
          안내 최대 폭은 시안 40em × body 14px = 560px → max-w-140 */}
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-small font-semibold text-muted">
          <Icon name="userCheck" size={14} className="shrink-0" />
          관리자
        </p>
        <h1 className="text-title font-semibold text-ink">가입 승인</h1>
        <p className="max-w-140 text-body text-ink-2">{INTRO}</p>
      </div>

      {counts !== null && (
        <>
          <div role="tablist" aria-label="신청 상태" onKeyDown={onTabKeyDown} className="flex border-b border-line">
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
                  {/* 굵기가 바뀌어도 탭 폭이 흔들리지 않게 지금 탭(600) 글자 폭을 보이지 않는 ::after로 미리 잡는다 */}
                  <span
                    data-label={t.label}
                    className="inline-flex flex-col items-center after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
                  >
                    {t.label}
                  </span>{' '}
                  {/* 개수는 칩이 아니라 글자(muted 500) */}
                  <span className="font-medium tabular-nums text-muted">{counts[t.key]}</span>
                </button>
              )
            })}
          </div>

          {/* 완료 줄과 오류 카드는 같은 자리(탭 줄과 표 사이). 완료 줄 자리(role=status)는 늘 두고 글만 바꾼다 —
              새로 붙은 알림 자리는 화면 읽기가 놓칠 수 있다. 비면(:empty) 화면 밖으로 빼 자리를 차지하지 않는다(sr-only) */}
          <p role="status" className="flex items-center gap-2 text-small text-positive empty:sr-only">
            {message !== '' && (
              <>
                <CheckIcon size={16} />
                {message}
              </>
            )}
          </p>
          {failed && <ErrorCard code="E-ADMIN-FAILED" />}

          <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
            <div className={`${ds.table.wrap} max-md:-mx-4 max-md:overflow-visible`}>
              <table
                aria-label={`${label} 신청`}
                className={`${ds.table.table} border-y border-line bg-surface md:table-fixed max-md:block`}
              >
                <thead className="max-md:hidden">
                  <tr>
                    {COLUMNS.map((c) => (
                      <th key={c.label} scope="col" className={`${ds.table.th} ${c.width}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-md:flex max-md:flex-col">
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
                        <td className={cell.date}>
                          <span className="tabular-nums text-muted">{appliedOn(row.createdAt)}</span>
                        </td>
                        <td className={cell.clinic} title={row.name}>
                          {row.name}
                        </td>
                        <td className={cell.applicant} title={row.applicantName}>
                          {row.applicantName}
                        </td>
                        <td className={cell.email} title={row.email}>
                          {row.email}
                        </td>
                        <td className={cell.phone}>
                          {phoneText(row.phone)}
                        </td>
                        <td className={cell.action}>
                          {/* 줄의 상태 칩은 없다(탭이 상태다). 승인 줄은 단추 대신 "승인됨" 완료 칩 */}
                          <div className="flex justify-end gap-2">
                            {row.status === 'approved' ? (
                              <span className={ds.chip.positive}>
                                <CheckIcon size={12} />
                                승인됨
                              </span>
                            ) : row.status === 'pending' ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => void change(row, 'approved', e.currentTarget)}
                                  className={ds.button.accentOutlineSmall}
                                >
                                  승인
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={(e) => askReject(row, e.currentTarget)}
                                  className={ds.button.secondarySmall}
                                >
                                  거절
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={(e) => void change(row, 'pending', e.currentTarget)}
                                className={ds.button.secondarySmall}
                              >
                                <RestoreIcon />
                                되돌리기
                              </button>
                            )}
                          </div>
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
