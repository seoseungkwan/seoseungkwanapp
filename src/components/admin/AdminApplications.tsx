'use client'

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { EMR_LABEL } from '@/lib/clinic/emrText'
import { listAdminHospitals, listApplications, setAdmin, setHospitalStatus, type AdminMark, type Application } from '@/lib/auth/admin'
import { listUploadStatus, setUploadMonths, type UploadRow } from '@/lib/auth/adminSync'
import { listViewHospitals, setHospitalRegion, startAdminView, type ViewHospital } from '@/lib/auth/adminView'
import { DEFAULT_FILL_MONTHS, fillChangedText } from '@/lib/autoUpload/range'
import { setViewKey } from '@/lib/supabase/viewKey'
import { AdminNav } from './AdminNav'
import { FillSelect, selectBox, UploadState } from './UploadCells'
import {
  adminBadgeOf,
  adminDoneMessage,
  adminRoleOf,
  appliedOn,
  countByTab,
  doneMessage,
  EMPTY,
  isMine,
  phoneText,
  REGION_CHOICES,
  regionDoneMessage,
  regionOfRow,
  rowsOf,
  TABS,
  viewTitle,
  withAdmin,
  withRegion,
  withStatus,
  type Tab,
} from './applications'

// 관리자 · 가입 승인 (REQ-007, b2b-redesign REQ-220, ui-90 REQ-417, docs/UI_GUIDE.md '관리자'). 짜임은 목업 Admin.dc.html, 모양은 b2b-redesign 시안,
// 이름("가입 승인" = 계정 메뉴·탭 이름)·"관리자" 표시·말투(~요)는 ui-90 시안 docs/mockups/ui-90/app/gen.py admin_body.
// 목록은 브라우저가 읽는다(RLS: 관리자는 모든 병원). 상태는 DB 함수 set_hospital_status로만 바꾸고, 성공한 뒤에만 화면 줄을 옮긴다.
// '승인' 탭의 관리자 표시·정하기·빼기는 spec multi-admin(REQ-7703·REQ-7704, 시안 docs/mockups/multi-admin): 표시는 admin_hospitals(),
// 바꾸기는 DB 함수 set_admin으로만 하고 성공한 뒤에만 손에 든 표시를 고친다(목록을 다시 읽지 않는다).
// 안쪽 메뉴·'승인' 탭 이름 눌러 보기·지역 칸·본 기록 자리(bottom)·신청자 · 이메일 한 칸은 spec admin-view(REQ-8012·REQ-8022, design.md '관리자 화면',
// 시안 docs/mockups/admin-view ?s=admin-list). 관리자 화면은 다른 의원을 보는 중이어도 숨김이 없다(읽기만 바탕을 쓰지 않는다, AC-8012.4).
// '승인' 탭의 채울 기간·저절로 올림 칸·표 위 안내 줄·2차 칸 폭은 admin-view 2차(REQ-8022 AC-8022.2~8022.5, design.md '가입 승인 표 2차',
// 시안 ?s=admin-list 2차): 상태는 admin_auto_upload_list()로 함께 읽고, 채울 기간은 DB 함수 set_auto_upload_months로만 바꾼 뒤 손에 든 값만 고친다.
// 앱 틀(위쪽 띠·탭 띠·<main>)은 (app)/layout의 AppShell이 준다

// multi-admin requirements.md '화면 글자' INTRO 전체(지금 두 문장 끝에 한 문장을 더함) + admin-view 한 문장(시안 T.adminIntro)
const INTRO =
  '승인하면 그 계정은 바로 대시보드를 쓸 수 있어요. 거절한 신청은 거절 탭에서 되돌릴 수 있어요. 승인 탭에서 관리자를 정하거나 뺄 수 있어요. 의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.'
// 지역 모름 고르기 상자의 마우스 글(admin-view design.md '화면 글자')
const REGION_UNKNOWN_TIP = '병원 정보에 주소가 없어 지역을 몰라요. 골라 주세요.'
// '승인' 탭 표 위 안내 줄(admin-view design.md '화면 글자' 2차, 시안 T.autoNoteB · T.autoNote)
const AUTO_NOTE_TITLE = '저절로 올림'
const AUTO_NOTE =
  '의원 비트 PC에서 그날 처음 앱을 열면, 어제까지 아직 안 올라온 날의 매출·통계 숫자를 사이트에 올려요. 채울 기간이 길면 최근 달부터 한 번에 5분쯤씩 나눠 채우고, 다음에 열 때 이어서 채워요. 의원 화면에는 아무것도 보이지 않아요.'

// 확인 창 셋: 제목·본문·확인 단추 글자·확인 단추 모양만 다르다(multi-admin design.md 기본값 12).
// 거절 창 문구는 시안에 없어 말끝만 "~요"로 바꾼다(ui-90 design.md '시안과 다른 점' 11). 정하기·빼기는 multi-admin '화면 글자' 그대로
type ConfirmKind = 'reject' | 'add' | 'remove'
const CONFIRM: Record<ConfirmKind, { title: string; body: string; confirmLabel: string; confirmClass: string }> = {
  reject: {
    title: '이 신청을 거절할까요?',
    body: '거절하면 이 계정은 대시보드를 쓸 수 없어요. 거절 탭에서 언제든 되돌릴 수 있어요.',
    confirmLabel: '거절',
    confirmClass: ds.button.danger,
  },
  add: {
    title: '이 계정을 관리자로 정할까요?',
    body: '관리자는 가입 승인·거절, 설치 파일 올리기, 관리자 정하기·빼기를 할 수 있어요.',
    confirmLabel: '관리자로 정하기',
    confirmClass: ds.button.primary,
  },
  remove: {
    title: '관리자에서 뺄까요?',
    body: '빼도 이 계정은 지금처럼 대시보드를 써요. 가입 승인 화면만 열 수 없어요.',
    confirmLabel: '빼기',
    confirmClass: ds.button.danger,
  },
}

// 실패 카드 번호: 가입 상태 바꾸기(승인·거절·되돌리기)는 E-ADMIN-FAILED, 관리자 정하기·빼기는 E-ADMIN-ROLE(multi-admin 기본값 11),
// 다른 의원 보기 시작은 E-VIEW-START, 지역 고치기는 E-REGION-SAVE(admin-view AC-8012.1·AC-8012.2), 채울 기간 바꾸기는 E-AUTO-MONTHS(AC-8022.3).
// 모두 같은 자리(탭 줄과 표 사이)
type FailCode = 'E-ADMIN-FAILED' | 'E-ADMIN-ROLE' | 'E-VIEW-START' | 'E-REGION-SAVE' | 'E-AUTO-MONTHS'

// 화면 안 탭: 40px·body(휴대폰 44px), 탭 줄 아래 1px line. 첫 탭은 왼쪽 12px을 당겨 글자를 제목 끝에 맞춘다.
// 키보드 초점은 탭 안쪽 2px accent 고리
const tabBase =
  'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const tabIdle = `${tabBase} font-medium text-ink-2 hover:text-ink`
// 지금: ink 600 + 아래 2px accent 밑줄(글자 폭, 탭 줄 선 위에 겹침)
const tabCurrent = `${tabBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`

// 표는 패널 틀 없이 본문 위에 바로 둔다: surface 띠 + 위아래 1px line(모서리 없음). PC 몸 줄 56px·body 글자.
// 휴대폰(768px 미만): 표 머리를 숨기고 줄마다 네 줄 격자로 쌓는다. 띠는 본문 좌우 여백(16px)만큼 밖으로 나가 화면 끝까지 닿고,
// 줄 사이는 1px line(마지막 줄 없음), 줄 안쪽 12px 16px
const rowClass = `${ds.table.row} md:h-14 max-md:grid max-md:grid-cols-[fit-content(50%)_1fr_auto] max-md:items-center max-md:gap-y-0.5 max-md:border-b max-md:border-line max-md:px-4 max-md:py-3 max-md:last:border-b-0`
// 휴대폰 칸: 높이·칸 선·여백을 지운다(ds 칸의 첫 칸 왼쪽·끝 칸 오른쪽 20px도)
const cellPhone = 'max-md:h-auto max-md:border-b-0 max-md:p-0 max-md:first:pl-0 max-md:last:pr-0'
// DOM은 PC 칸 순서(신청일 먼저). 휴대폰 격자(칸 3개: 신청자 글자 폭(줄 폭의 반까지) · 남은 폭 · 글자 폭).
// 긴 이름(DB는 30자까지)은 첫 칸 안에서 줄바꿈한다 → 셋째 칸(신청일·단추)은 늘 화면 안에 남는다:
//   1줄 의원 이름(600, 말줄임) · 오른쪽 신청일(caption muted)
//   2줄 쓰는 EMR(small ink-2, emr-signup AC-7304.1)
//   3줄 신청자 · 이메일(small ink-2, 한 칸 안에 이름 / 메일 두 줄 — admin-view AC-8022.1, 격자는 그대로)
//   4줄 연락처(small muted) · 오른쪽 동작 단추(44px)
// 768~1023px(태블릿)은 글 칸(의원 이름·신청자·이메일)이 좁아 말줄임 대신 줄바꿈한다 — title은 마우스로만 보이니 터치·키보드로도
// 전체 값을 보고 [승인]을 누르게(1024px 이상은 말줄임 그대로, 휴대폰 의원 이름도 말줄임 그대로)
const wrapTablet = 'md:max-lg:whitespace-normal md:max-lg:break-all'
// 이메일은 낱말 중간(barun@exampl / e.com)에서 자르지 않는다(ui-90 TASK-19 채점): "@" 바로 뒤에만 줄을 바꿀 자리(<wbr>)를 두고,
// break-all 대신 overflow-wrap:anywhere — 도메인이 칸보다 길 때만 그 안에서 줄을 바꾼다. 1024px 이상은 말줄임 그대로
const wrapEmail = 'md:max-lg:whitespace-normal wrap-anywhere'
const cell = {
  date: `${ds.table.tdSub} ${cellPhone} md:text-body max-md:col-start-3 max-md:row-start-1 max-md:ml-3 max-md:justify-self-end max-md:text-caption`,
  clinic: `${ds.table.td} ${cellPhone} truncate ${wrapTablet} text-body font-semibold max-md:col-start-1 max-md:col-end-3 max-md:row-start-1`,
  emr: `${ds.table.tdSub} ${cellPhone} md:text-body max-md:col-start-1 max-md:col-end-4 max-md:row-start-2`,
  // 신청자 · 이메일 한 칸(admin-view AC-8022.1): 칸은 몸 칸, 안의 두 줄(whoName·whoEmail)이 말줄임·줄바꿈을 맡는다. 폰 격자 자리는 지금 셋째 줄 전체 폭
  who: `${ds.table.td} ${cellPhone} md:text-body max-md:col-start-1 max-md:col-end-4 max-md:row-start-3 max-md:self-start max-md:whitespace-normal max-md:text-ink-2`,
  // 지역 칸(admin-view AC-8012.2, '승인' 탭만): 고르기 상자 하나
  region: `${ds.table.td} ${cellPhone}`,
  // 채울 기간 칸(고르기 상자 하나)·저절로 올림 칸(두 줄, admin-view AC-8022.3·AC-8022.4, '승인' 탭만): 지역 칸과 같은 몸 칸(새 폰 모양 없음)
  fill: `${ds.table.td} ${cellPhone}`,
  upload: `${ds.table.td} ${cellPhone}`,
  phone: `${ds.table.tdSub} ${cellPhone} tabular-nums md:text-body max-md:col-start-1 max-md:col-end-3 max-md:row-start-4 max-md:mt-1.5 max-md:text-muted`,
  action: `${ds.table.td} ${cellPhone} max-md:col-start-3 max-md:row-start-4 max-md:mt-1.5 max-md:ml-3 max-md:justify-self-end`,
}
// 신청자 · 이메일 칸의 두 줄: 첫 줄 이름(몸 글자), 둘째 줄 메일(small ink-2). PC는 줄마다 말줄임 + title, 768~1023px은 줄바꿈(메일은 "@" 뒤에서만)
const whoName = `md:truncate ${wrapTablet} wrap-anywhere`
// 메일 줄은 시안 .who2 .e처럼 12px muted라 1440 폭에서 잘리지 않는다
const whoEmail = `text-caption text-muted md:truncate ${wrapEmail}`
// 승인 줄 의원 이름 단추(시안 .vlink): 눈 14 + accent-strong 600 글자, 올리면 밑줄. 이름만 말줄임
const viewLink = `inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-control font-semibold text-accent-strong underline-offset-3 not-disabled:hover:underline disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing}`
// 지역 고르기 상자(시안 .sel, 설정 예약 칸 SELECT와 같은 32px 모양 — 채울 기간 고르기와 같은 selectBox). 지역 모름은 주황 글자 500(시안 .sel.unknown)
const regionSelect = selectBox
// 빈 탭 안내: 제목과 설명을 따로 줄로(목업 <p> 둘). 두 줄이라 위아래 여백을 둔다
const emptyClass = `${ds.table.emptyRow} py-3 max-md:block max-md:h-auto max-md:px-4`
// PC 칸 폭은 정해 둔다(table-fixed): 줄이 다른 탭으로 옮겨 가거나 탭이 비어도 칸 자리가 움직이지 않는다.
// 신청일 120px, EMR 112px('그 밖의 EMR'이 칸 여백 빼고도 들어간다), 연락처·동작 150px, 의원 이름·신청자 · 이메일은 남은 폭을 반씩.
// 글 칸(의원 이름·신청자 · 이메일의 두 줄)은 넘치면 말줄임 + title로 전체 값.
// 대기·거절 표에는 최소 폭이 없다: 768~1023px(본문 720~975px)에서는 정한 칸을 글자 폭에 맞춰 줄여(신청일 116 · EMR 96 · 연락처 136)
// 옆으로 밀지 않고도 모든 칸과 [승인]·[거절]이 보인다(768px에서는 의원 이름·이메일 칸이 좁아 여러 줄로 바뀐다). 동작 칸은 그 폭에서도 150px 그대로 —
// 140px이면 [관리자로 정하기]가 겨우 들어간다(multi-admin 기본값 9, 시안 notes.md '칸 폭'). 동작 칸 머리는 오른쪽(ds.table.th의 왼쪽 정렬을 md:로 덮는다, 휴대폰은 머리가 없다)
const COLUMNS: readonly { label: string; width: string }[] = [
  { label: '신청일', width: 'w-30 max-lg:w-29' },
  { label: '의원 이름', width: '' },
  { label: 'EMR', width: 'w-28 max-lg:w-24' },
  { label: '신청자 · 이메일', width: '' },
  { label: '연락처', width: 'w-37.5 max-lg:w-34' },
  { label: '동작', width: 'w-37.5 md:text-right' },
]
// '승인' 탭(admin-view 2차 AC-8022.2, 시안 notes.md '2차 모양 결정'): 칸 차례 신청일 · 의원 이름 · 지역 · 채울 기간 · 저절로 올림 · EMR ·
// 신청자 · 이메일(한 칸) · 연락처 · 동작, 폭 112 · 184 · 108 · 88 · 248 · 60 · (남은 폭) · 132 · 144. 표 최소 폭 1232px — 1440은 다 보이고,
// 더 좁으면 표만 옆으로 밀린다(그래서 폭마다 다른 칸 폭이 없다). 동작 144px에도 [관리자로 정하기]가 들어간다(140px이면 겨우 들어감)
const APPROVED_COLUMNS: readonly { label: string; width: string }[] = [
  { label: '신청일', width: 'w-28' },
  { label: '의원 이름', width: 'w-46' },
  { label: '지역', width: 'w-27' },
  { label: '채울 기간', width: 'w-22' },
  { label: '저절로 올림', width: 'w-62' },
  { label: 'EMR', width: 'w-15' },
  { label: '신청자 · 이메일', width: '' },
  { label: '연락처', width: 'w-33' },
  { label: '동작', width: 'w-36 md:text-right' },
]
const APPROVED_MIN = 'md:min-w-308'

// 그 병원의 채울 기간: 상태 목록의 months, 목록에 없는 줄(이 화면에서 막 승인한 줄)은 DB 기본값과 같은 2달
const uploadMonthsOf = (uploads: ReadonlyMap<string, UploadRow>, hospitalId: string) => uploads.get(hospitalId)?.months ?? DEFAULT_FILL_MONTHS
// 채울 기간을 바꾼 뒤 손에 든 상태: 그 줄 months만 바꾼 새 목록(다른 줄·받은 목록은 그대로). 목록에 없던 줄은 올라온 것 없는 줄로 더한다
function withUploadMonths(uploads: ReadonlyMap<string, UploadRow>, hospitalId: string, months: number): ReadonlyMap<string, UploadRow> {
  const next = new Map(uploads)
  const before = uploads.get(hospitalId)
  next.set(hospitalId, before === undefined ? { months, throughDay: null, filledFrom: null, lastOkAt: null, errorCode: null, errorAt: null } : { ...before, months })
  return next
}

// 이메일 글자: "@" 바로 뒤에 줄을 바꿀 자리(<wbr>). 글자(textContent)·복사한 글자는 그대로다.
// 크롬은 nowrap 안에서도 <wbr>에서 줄을 바꾼다 → 말줄임하는 1024px 이상에서는 <wbr>을 뺀다(lg:hidden)
function EmailText({ email }: { email: string }) {
  const at = email.indexOf('@')
  if (at < 0) return email
  return (
    <>
      {email.slice(0, at + 1)}
      <wbr className="lg:hidden" />
      {email.slice(at + 1)}
    </>
  )
}

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

// 확인 창(거절·관리자로 정하기·관리자에서 빼기가 같이 쓴다): 처음 초점 [취소], Esc = 취소, Tab은 창 안 두 단추 사이만 돈다.
// 떠 있는 층(ds.layer, 8px·그림자)·폭 400px·안쪽 24px + 가림막 ink 36%. 클래스는 셋이 같고 확인 단추 모양(confirmClass)만 다르다
function ConfirmDialog({
  row,
  title,
  body,
  confirmLabel,
  confirmClass,
  onCancel,
  onConfirm,
}: {
  row: Application
  title: string
  body: string
  confirmLabel: string
  confirmClass: string
  onCancel: () => void
  onConfirm: () => void
}) {
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

  // 창 안 빈 곳을 누르면 초점은 창 자신(tabIndex=-1)에 남는다 → 거기서도 Tab은 [취소]·확인 단추 사이만 돈다
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
          {title}
        </h2>
        {/* 신청 내용: 창(상자) 안이라 테두리 없이 canvas 바탕만(상자 안 상자 금지) */}
        <div className="flex flex-col gap-0.5 rounded-control bg-canvas px-3 py-2">
          <span className="text-body font-semibold text-ink">{row.name}</span>
          <span className="break-all text-small text-ink-2">{`${row.applicantName} · ${row.email}`}</span>
        </div>
        <p id={bodyId} className="text-body text-ink-2">
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${ds.button.secondary} max-md:flex-1`}>
            취소
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={`${confirmClass} max-md:flex-1`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// top: 제목 묶음 바로 아래·신청 탭 위에 그릴 칸(관리자 화면의 '설치 파일' 칸, helper-download AC-5104.3)
// bottom: 신청 표 아래에 그릴 칸(관리자 화면의 '본 기록' 칸, admin-view AC-8012.3)
export function AdminApplications({ top, bottom }: { top?: ReactNode; bottom?: ReactNode } = {}) {
  const [rows, setRows] = useState<Application[] | null>(null) // null = 읽는 중
  // 관리자 표시(admin_hospitals): 신청 목록과 같이 온다 — rows가 null이 아니면 이것도 읽힌 값이다
  const [marks, setMarks] = useState<AdminMark[]>([])
  // 보기 목록(admin_view_hospitals: 주소·정한 지역·내 의원): 이것도 같이 온다(admin-view AC-8012.5)
  const [views, setViews] = useState<ViewHospital[]>([])
  // 저절로 올림 상태(admin_auto_upload_list: 병원 id마다 채울 기간·올라온 날·오류): 이것도 같이 온다(admin-view AC-8022.5)
  const [uploads, setUploads] = useState<ReadonlyMap<string, UploadRow>>(new Map())
  const [loadError, setLoadError] = useState<{ error: unknown } | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState<FailCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<{ row: Application; kind: ConfirmKind } | null>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)
  // 바꾸기가 끝난 뒤 초점을 둘 곳: 성공 = 그때의 지금 탭('tab', 누른 단추의 줄은 다른 탭으로 옮겨지거나 단추가 바뀐다), 실패 = 처음 누른 단추.
  // 다시 그린 뒤에 옮기므로 effect가 맡는다(focusTick이 바뀔 때). 한 번 쓰면 비운다
  const focusAfterRef = useRef<'tab' | HTMLElement | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const baseId = useId()
  const tabId = (key: Tab) => `${baseId}-tab-${key}`
  const panelId = `${baseId}-panel`

  useEffect(() => {
    let alive = true // 떠난 뒤 온 결과는 버린다
    // 신청 목록·관리자 표시·보기 목록·저절로 올림 상태를 한 번씩 읽고, 넷 다 온 뒤에 탭·표를 그린다(틀린 단추·지역·채울 기간을 잠깐이라도 보이지 않게)
    Promise.all([listApplications(), listAdminHospitals(), listViewHospitals(), listUploadStatus()]).then(
      ([list, adminMarks, viewList, uploadList]) => {
        if (!alive) return
        setMarks(adminMarks)
        setViews(viewList)
        setUploads(uploadList)
        setRows(list)
      },
      (error: unknown) => {
        if (alive) setLoadError({ error })
      },
    )
    return () => {
      alive = false
    }
  }, [])

  // 넷 중 하나라도 읽지 못하면 그리기를 멈춘다 → 화면 오류(app/error.tsx: E-PAGE-FAILED + [다시 시도]·[로그아웃])가 안내한다
  if (loadError !== null) throw loadError.error

  const select = (key: Tab) => {
    setTab(key)
    setMessage('') // 탭을 바꾸면 완료 줄·오류 카드는 지운다(목업)
    setFailed(null)
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

  // 함수가 성공한 뒤에만 손에 든 자료를 고친다(목록을 다시 읽지 않는다). 실패하면 그대로 두고 그 번호의 카드(저절로 다시 보내지 않는다).
  // 보내는 동안 표의 동작 단추·이름 단추·지역 상자는 모두 막힌다(busy). 성공 뒤 초점: 줄이 옮겨 가는 바꾸기는 지금 탭('tab'),
  // 그 자리에 남는 지역 고치기는 그 상자('origin')
  const send = async (
    call: () => Promise<void>,
    apply: () => void,
    done: string,
    failCode: FailCode,
    origin: HTMLElement | null,
    after: 'tab' | 'origin' = 'tab',
  ) => {
    setBusy(true)
    try {
      await call()
      apply()
      setFailed(null)
      setMessage(done)
      focusAfterRef.current = after === 'tab' ? 'tab' : origin
    } catch {
      setMessage('')
      setFailed(failCode)
      focusAfterRef.current = origin
    } finally {
      setBusy(false)
      setFocusTick((n) => n + 1)
    }
  }

  // 가입 상태 바꾸기(승인·거절·되돌리기): 성공하면 줄을 다른 탭으로 옮긴다. 실패는 E-ADMIN-FAILED
  const change = (row: Application, status: Tab, origin: HTMLElement | null) =>
    send(
      () => setHospitalStatus(row.id, status),
      () => setRows((prev) => (prev === null ? prev : withStatus(prev, row.id, status))),
      doneMessage(row.name, status),
      'E-ADMIN-FAILED',
      origin,
    )

  // 관리자 정하기(true)·빼기(false): 성공하면 그 줄은 '승인' 탭에 그대로 있고 표시만 바뀐다. 실패는 E-ADMIN-ROLE
  const changeAdmin = (row: Application, admin: boolean, origin: HTMLElement | null) =>
    send(
      () => setAdmin(row.id, admin),
      () => setMarks((prev) => withAdmin(prev, row.id, admin)),
      adminDoneMessage(row.name, admin),
      'E-ADMIN-ROLE',
      origin,
    )

  // 지역 고치기(admin-view AC-8012.2): setHospitalRegion 한 번(지역 모름 = null) → 되면 손에 든 보기 목록의 그 줄만 고친다. 실패는 E-REGION-SAVE, 값은 그대로
  const changeRegion = (row: Application, value: string, origin: HTMLElement) => {
    const sido = REGION_CHOICES.find((c) => (c.value ?? '') === value)?.value ?? null
    return send(
      () => setHospitalRegion(row.id, sido),
      () => setViews((prev) => withRegion(prev, row.id, sido)),
      regionDoneMessage(row.name, sido),
      'E-REGION-SAVE',
      origin,
      'origin',
    )
  }

  // 채울 기간 바꾸기(admin-view AC-8022.3): 확인 창 없이 setUploadMonths 한 번 → 되면 손에 든 상태의 그 줄 months만 고친다(저절로 올림 글은
  // 그 값으로 다시 센다, 목록을 다시 읽지 않는다). 늘림·줄임 완료 줄은 fillChangedText. 실패는 E-AUTO-MONTHS, 값은 그대로, 초점은 그 상자
  const changeFill = (row: Application, months: number, origin: HTMLElement) =>
    send(
      () => setUploadMonths(row.id, months),
      () => setUploads((prev) => withUploadMonths(prev, row.id, months)),
      fillChangedText(row.name, uploadMonthsOf(uploads, row.id), months),
      'E-AUTO-MONTHS',
      origin,
      'origin',
    )

  // 다른 의원 보기(admin-view AC-8012.1): 확인 창 없이 startAdminView → 보기 열쇠 쿠키(setViewKey) → /dashboard를 새로 연다
  // (ViewPicker와 같은 흐름을 이 파일이 스스로 쓴다). 여는 동안 표는 막히고, 실패하면 E-VIEW-START 카드 + 초점은 누른 이름
  const startView = async (row: Application, origin: HTMLElement) => {
    setBusy(true)
    try {
      setViewKey(await startAdminView(row.id))
      window.location.assign('/dashboard')
    } catch {
      setMessage('')
      setFailed('E-VIEW-START')
      focusAfterRef.current = origin
      setBusy(false)
      setFocusTick((n) => n + 1)
    }
  }

  // 거절·정하기·빼기는 먼저 확인 창(아직 함수를 부르지 않는다)
  const ask = (row: Application, kind: ConfirmKind, opener: HTMLButtonElement) => {
    openerRef.current = opener
    setConfirming({ row, kind })
  }
  // [취소]·Esc: 아무것도 하지 않고 누른 줄 단추로 초점을 돌려준다
  const cancelConfirm = useCallback(() => {
    setConfirming(null)
    openerRef.current?.focus()
  }, [])
  const confirm = () => {
    if (confirming === null) return
    const { row, kind } = confirming
    setConfirming(null)
    if (kind === 'reject') void change(row, 'rejected', openerRef.current)
    else void changeAdmin(row, kind === 'add', openerRef.current)
  }

  // '승인' 탭 동작 칸(multi-admin AC-7703.3): 내 줄 흐린 글자 `내 계정` · 남이 보는 주 관리자 줄 빈칸(아무도 뺄 수 없다) ·
  // 다른 관리자 [관리자 빼기] · 그 밖 [관리자로 정하기](둘 다 보조 작은 단추). '승인됨' 칩은 없다(탭이 이미 '승인'이다)
  const approvedAction = (row: Application) => {
    const role = adminRoleOf(marks, row.id)
    if (role === 'owner') return null
    return (
      <div className="flex justify-end gap-2">
        {role === 'mine' ? (
          <span className="text-small text-muted">내 계정</span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={(e) => ask(row, role === 'admin' ? 'remove' : 'add', e.currentTarget)}
            className={ds.button.secondarySmall}
          >
            {role === 'admin' ? '관리자 빼기' : '관리자로 정하기'}
          </button>
        )}
      </div>
    )
  }

  const counts = rows === null ? null : countByTab(rows)
  const list = rows === null ? [] : rowsOf(rows, tab)
  const label = TABS.find((t) => t.key === tab)?.label ?? ''
  const approvedTab = tab === 'approved'
  const columns = approvedTab ? APPROVED_COLUMNS : COLUMNS
  const today = todayInKorea() // 저절로 올림 칸의 채울 기간 첫날을 세는 한국 오늘

  return (
    <div aria-busy={rows === null} className="flex flex-col gap-4 max-md:gap-3">
      {/* 머리(시안 .ahead): 제목 묶음(.loc · .ad-h1 — 작은 "관리자" 표시(small 600 muted + userCheck 14) → h1, 사이 4px) → 안쪽 메뉴(사이 12px, admin-view AC-8012.4).
          읽는 중에도 그린다. 안내(시안 .intro)는 그 아래 16px, 최대 폭은 시안 40em × body 14px = 560px → max-w-140 */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex items-center gap-1.5 text-small font-semibold text-muted">
            <Icon name="userCheck" size={14} className="shrink-0" />
            관리자
          </p>
          <h1 className="text-title font-semibold text-ink">가입 승인</h1>
        </div>
        <AdminNav current="/admin" />
      </div>
      <p className="max-w-140 text-body text-ink-2">{INTRO}</p>

      {top}

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

          {/* '승인' 탭만 표 위 안내 줄(시안 .tnote): 올림 아이콘 16(꾸밈, muted, 첫 줄에 맞춰 위 2px) + 굵은 `저절로 올림` · 안내 글, small ink-2, 최대 폭 920px */}
          {approvedTab && (
            <p className="flex max-w-230 items-start gap-2 text-small text-ink-2">
              <Icon name="upload" size={16} className="mt-0.5 shrink-0 text-muted" />
              <span>
                <b className="font-semibold text-ink">{AUTO_NOTE_TITLE}</b> · {AUTO_NOTE}
              </span>
            </p>
          )}

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
          {failed !== null && <ErrorCard code={failed} />}

          <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
            <div className={`${ds.table.wrap} max-md:-mx-4 max-md:overflow-visible`}>
              <table
                aria-label={`${label} 신청`}
                className={`${ds.table.table} border-y border-line bg-surface md:table-fixed max-md:block${approvedTab ? ` ${APPROVED_MIN}` : ''}`}
              >
                <thead className="max-md:hidden">
                  <tr>
                    {columns.map((c) => (
                      <th key={c.label} scope="col" className={`${ds.table.th} ${c.width}`}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="max-md:flex max-md:flex-col">
                  {list.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className={emptyClass}>
                        <p className="font-medium">{EMPTY[tab].title}</p>
                        <p>{EMPTY[tab].body}</p>
                      </td>
                    </tr>
                  ) : (
                    list.map((row) => {
                      // 관리자인 승인 줄: 의원 이름 바로 뒤 표(주 관리자 줄 '주 관리자', 그 밖 '관리자', multi-admin AC-7703.3)
                      const approved = row.status === 'approved'
                      const badge = approved ? adminBadgeOf(marks, row.id) : null
                      // 보기 목록(admin_view_hospitals)에 있고 내 줄이 아닌 승인 줄: 이름이 보기 단추(admin-view AC-8012.1).
                      // 내 줄·대기·거절 줄과 목록에 아직 없는 줄(이 화면에서 막 승인함 — 다시 읽으면 생긴다)은 보통 글자
                      const viewable = approved && views.some((v) => v.hospitalId === row.id) && !isMine(views, marks, row.id)
                      const region = approved ? regionOfRow(views, row.id) : null
                      return (
                        <tr key={row.id} className={rowClass}>
                          <td className={cell.date}>
                            <span className="tabular-nums text-muted">{appliedOn(row.createdAt)}</span>
                          </td>
                          <td className={cell.clinic} title={row.name}>
                            {badge === null && !viewable ? (
                              row.name
                            ) : (
                              // 이름 뒤 6px에 표(ds.chip.accent). 이름만 말줄임되고 표는 늘 보인다(시안 notes.md '모양 결정'). 칸 title은 이름 그대로
                              <div className="flex min-w-0 items-center gap-1.5">
                                {viewable ? (
                                  <button
                                    type="button"
                                    title={viewTitle(row.name)}
                                    disabled={busy}
                                    onClick={(e) => void startView(row, e.currentTarget)}
                                    className={viewLink}
                                  >
                                    <Icon name="eye" size={14} className="shrink-0" />
                                    <span className="truncate">{row.name}</span>
                                  </button>
                                ) : (
                                  <span className="truncate">{row.name}</span>
                                )}
                                {badge !== null && <span className={ds.chip.accent}>{badge}</span>}
                              </div>
                            )}
                          </td>
                          {approvedTab && (
                            <td className={cell.region}>
                              <select
                                aria-label={`${row.name} 지역`}
                                value={region ?? ''}
                                disabled={busy}
                                title={region === null ? REGION_UNKNOWN_TIP : undefined}
                                onChange={(e) => void changeRegion(row, e.currentTarget.value, e.currentTarget)}
                                className={`${regionSelect} ${region === null ? 'font-medium text-warning' : 'text-ink'}`}
                              >
                                {REGION_CHOICES.map((c) => (
                                  <option key={c.label} value={c.value ?? ''}>
                                    {c.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}
                          {approvedTab && (
                            <td className={cell.fill}>
                              <FillSelect
                                name={row.name}
                                months={uploadMonthsOf(uploads, row.id)}
                                disabled={busy}
                                onChange={(months, box) => void changeFill(row, months, box)}
                              />
                            </td>
                          )}
                          {approvedTab && (
                            <td className={cell.upload}>
                              <UploadState row={uploads.get(row.id)} months={uploadMonthsOf(uploads, row.id)} today={today} />
                            </td>
                          )}
                          <td className={cell.emr}>{EMR_LABEL[row.emr]}</td>
                          <td className={cell.who}>
                            <div className="flex min-w-0 flex-col">
                              <span title={row.applicantName} className={whoName}>
                                {row.applicantName}
                              </span>
                              <span title={row.email} className={whoEmail}>
                                <EmailText email={row.email} />
                              </span>
                            </div>
                          </td>
                          <td className={cell.phone}>
                            {phoneText(row.phone)}
                          </td>
                          <td className={cell.action}>
                            {/* 줄의 상태 칩은 없다(탭이 상태다) */}
                            {row.status === 'approved' ? (
                              approvedAction(row)
                            ) : (
                              <div className="flex justify-end gap-2">
                                {row.status === 'pending' ? (
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
                                      onClick={(e) => ask(row, 'reject', e.currentTarget)}
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
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {bottom}

      {confirming !== null && (
        <ConfirmDialog row={confirming.row} {...CONFIRM[confirming.kind]} onCancel={cancelConfirm} onConfirm={confirm} />
      )}
    </div>
  )
}
