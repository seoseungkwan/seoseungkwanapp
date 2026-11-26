'use client'

import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { useDesk } from '@/components/shell/role'
import { WriteOnly } from '@/components/shell/viewing'
import { BIT_PC_HREF, FRAME_TEXT, GCAL_HREF, SETTINGS_HREF } from './labels'

// 설정 › 구글 캘린더 안 메뉴 틀 (spec google-link REQ-8528 AC-8528.1, notes-calendar '공통', 시안 calendar.html settingsHead·flowBar).
// 제목 '설정' → 설정 안 메뉴 [설정 | 비트 PC 연결 | 구글 캘린더 + 새](지금 화면, 링크라 aria-current) → 구글 캘린더 안 메뉴 단추 셋(시안 .vseg, aria-pressed)과
// 오른쪽 '원장 계정만 …' → 처음 잇기면 차례 띠(① → ② → ③, 맞춤 방법에는 없음) → 안쪽 화면(children).
// 어느 칸을 그릴지·처음 잇기인지·닫아 둘 칸은 화면 묶음(GcalSettingsScreen, TASK-23)이 정해 props로 준다. 안 메뉴는 onTab만 부른다(주소 ?tab= 바꾸기는 묶음 몫).
// 데스크(useDesk)는 보기만: 데스크가 열 수 없는 '설정'(/settings) 칸은 그리지 않고, 안 메뉴로 다른 칸을 보는 것은 된다(칸·단추 잠금은 각 화면이 한다).
// 관리자가 다른 의원을 보는 중이면 설정 화면과 같이 '비트 PC 연결' 칸을 그리지 않는다(WriteOnly). PC 화면만(폰 전용 모양 없음)

/** 구글 캘린더 화면 칸. import는 처음 잇기 ③(안 메뉴에는 '잇기'로 보인다) */
export type GcalTab = 'connect' | 'colors' | 'import' | 'rules'
/** 안 메뉴 단추로 가는 칸 */
export type GcalMenuTab = Exclude<GcalTab, 'import'>

const MENU: readonly GcalMenuTab[] = ['connect', 'colors', 'rules']
const FLOW: readonly Exclude<GcalTab, 'rules'>[] = ['connect', 'colors', 'import']

// 설정 안 메뉴 칸 모양은 설정 화면(SettingsPage)과 같다
const subBase =
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const subIdle = `${subBase} font-medium text-ink-2 hover:text-ink`
const subCurrent = `${subBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`
const newBadge = 'rounded-full bg-accent-soft px-1.5 text-caption font-semibold text-accent-strong'

// 구글 캘린더 안 메뉴(시안 .gtop .vseg): 34px·좌우 18px·body 500, 눌린 칸 accent-soft·accent-strong 600
const segGroup = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface'
const segButton =
  'h-8.5 cursor-pointer border-l border-line-strong px-4.5 text-body first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40'
const segOn = 'bg-accent-soft font-semibold text-accent-strong'
const segOff = 'font-medium text-ink-2 transition not-disabled:hover:bg-canvas'

// 차례 띠(시안 .flow): 28px 둥근 칩, 지난 것 positive, 지금 것 accent 바탕 흰 글자
const flowItem = 'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5'
const flowDone = `${flowItem} border-positive-soft bg-positive-soft font-semibold text-positive`
const flowCur = `${flowItem} border-transparent bg-accent font-semibold text-surface`
const flowNext = `${flowItem} border-line bg-surface`

type GcalFrameProps = {
  /** 지금 그리는 칸 */
  tab: GcalTab
  /** 처음 잇기(아직 가져오지 않음)면 차례 띠를 그린다 */
  firstRun: boolean
  /** 안 메뉴 단추를 누르면 그 칸 이름으로 부른다 */
  onTab(tab: GcalMenuTab): void
  /** 눌리지 않게 닫아 둘 안 메뉴 칸(처음 잇기 차례만 열어 둘 때) */
  closedTabs?: readonly GcalMenuTab[]
  children: ReactNode
}

function FlowBar({ tab }: { tab: Exclude<GcalTab, 'rules'> }) {
  const at = FLOW.indexOf(tab)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-small text-muted">
      <ol aria-label={FRAME_TEXT.flowLabel} className="flex list-none flex-wrap items-center gap-1.5">
        {FLOW.map((step, i) => (
          <Fragment key={step}>
            {i > 0 && (
              <li aria-hidden="true" className="text-faint">
                →
              </li>
            )}
            <li aria-current={i === at ? 'step' : undefined} className={i < at ? flowDone : i === at ? flowCur : flowNext}>
              {i < at && <Icon name="check" size={14} />}
              {FRAME_TEXT.flow[step]}
            </li>
          </Fragment>
        ))}
      </ol>
      <span>{FRAME_TEXT.flowNote}</span>
    </div>
  )
}

export function GcalFrame({ tab, firstRun, onTab, closedTabs = [], children }: GcalFrameProps) {
  const desk = useDesk()
  const pressed: GcalMenuTab = tab === 'import' ? 'connect' : tab
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <h1 className="text-title font-semibold text-ink">{FRAME_TEXT.title}</h1>
        <nav aria-label={FRAME_TEXT.settingsNav} className="flex border-b border-line">
          {!desk && (
            <Link href={SETTINGS_HREF} className={subIdle}>
              {FRAME_TEXT.settings}
            </Link>
          )}
          <WriteOnly>
            <Link href={BIT_PC_HREF} className={subIdle}>
              {FRAME_TEXT.bitPc}
            </Link>
          </WriteOnly>
          <Link href={GCAL_HREF} aria-current="page" className={subCurrent}>
            {FRAME_TEXT.gcal}
            <span className={newBadge}>{FRAME_TEXT.newBadge}</span>
          </Link>
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div role="group" aria-label={FRAME_TEXT.subNav} className={segGroup}>
          {MENU.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={pressed === item}
              disabled={closedTabs.includes(item)}
              onClick={() => onTab(item)}
              className={`${segButton} ${pressed === item ? segOn : segOff}`}
            >
              {FRAME_TEXT.sub[item]}
            </button>
          ))}
        </div>
        <span className="text-caption text-muted">{FRAME_TEXT.hint}</span>
      </div>
      {firstRun && tab !== 'rules' && <FlowBar tab={tab} />}
      {children}
    </div>
  )
}
