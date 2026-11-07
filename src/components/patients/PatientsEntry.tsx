'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useBridge } from '@/components/claim/useBridge'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import type { BridgeState } from '@/types/bridge'
import { CountsOnly } from './CountsOnly'
import { MessagesTool } from './MessagesTool'
import { ConnectingView, PatientsScreen, ToolSlot } from './PatientsScreen'
import { ToolRow } from './ToolRow'
import { PATIENTS_TOOLS, toolHref, type PatientsTool } from './tools'
import { usePatientsWorkerObject } from './usePatientsWorker'

// /patients 입구(REQ-610, 목업 page·toolBody·connectView·busyView). 맨 위 도구 단추 줄 아래에 연결 상태로 도구 자리를 고른다(ClaimEntry와 같은 갈래).
// - 확장 없는 곳·휴대폰: 명단 도구 → 건수만
// - 도우미 없음·업데이트·끊김(연결 중에 hello가 번호로 끝난 경우 포함): 명단 도구 → 비트 PC 연결 안내
// - 다른 창 작업 중: 안내 + [건수만 보기](그 자리에서 건수). 글은 환자 탭 전용이다(docs/mockups/patients/README.md)
// - 연결됨: PatientsScreen
// 문자 문구 도구는 환자 정보가 없어 어느 상태에서나 자기 자리다(AC-613.5). 그래서 이 연결 갈래 밖에 하나만 둔다: 고치는 동안 연결 상태가 바뀌거나 다른 도구로 갔다 와도
// 다시 만들어지지 않아 고친 글을 잃지 않는다. 처음 열 때 만들고(열지 않으면 문구를 읽지 않는다) 그 뒤로는 숨기기만 한다

type Reason = 'no-helper' | 'update' | 'disconnected'

const REASON_TEXT: Record<Reason, string> = {
  'no-helper': '이 PC에서 도우미를 찾지 못했어요. 도우미가 꺼져 있거나 아직 설치하지 않았어요.',
  update: '도우미나 크롬 확장 프로그램을 새 판으로 바꿔야 해요.',
  disconnected: '도우미와 연결이 끊겼어요.',
}

const REASON_OF: Partial<Record<BridgeState, Reason>> = {
  'no-helper': 'no-helper',
  'update-helper': 'update',
  'update-extension': 'update',
  disconnected: 'disconnected',
}

const TOOL_ITEMS = PATIENTS_TOOLS.map(({ id, label, icon }) => ({ id, label, icon, href: toolHref(id) }))

function ConnectFirst({ reason }: { reason: Reason }) {
  return (
    // 최대 폭 600px, 위 8(목업 .cf)
    <div className="max-w-150 pt-2">
      <h2 className="text-title font-semibold text-ink">비트 PC 연결이 먼저예요</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {['명단은 비트 PC(비트가 깔린 의원 PC)에서 비트를 읽어 만들어요.', `${REASON_TEXT[reason]} [비트 PC 연결]에서 하나씩 확인할 수 있어요.`].map((line) => (
          <li key={line} className="flex gap-4 text-body text-ink">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-accent" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <Link href="/claim/setup" className={`${ds.button.primaryLarge} group no-underline max-md:w-full`}>
          비트 PC 연결
          <Icon name="arrow" className="transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      <p className="mt-8 flex flex-wrap items-center gap-x-3 border-t border-line pt-4 text-small text-muted">
        <span>연결하지 않아도 문자 문구는 고칠 수 있어요</span>
        <Link href={toolHref('messages')} className={`${ds.textButton} group no-underline`}>
          문자 문구 열기
          <Icon name="arrow" className="transition group-hover:translate-x-0.5" />
        </Link>
      </p>
    </div>
  )
}

function BusyNotice({ onRetry, onCountsOnly }: { onRetry(): void; onCountsOnly(): void }) {
  return (
    <section role="alert" aria-labelledby="patients-busy-title" className={`${ds.panel} grid w-130 max-w-full gap-3 p-6 max-md:p-4`}>
      <h2 id="patients-busy-title" className="text-title font-semibold text-ink">
        비트를 다른 창에서 읽고 있어요
      </h2>
      <p className="text-body text-ink-2">비트는 한 번에 한 창에서만 읽을 수 있어요. 청구나 환자 탭이 열린 다른 창으로 가서 계속하거나, 그 창을 닫아 주세요.</p>
      <p className="text-small text-ink-2">다른 창을 닫았다면 [다시 확인]을 누르세요.</p>
      <div className="flex flex-wrap gap-2 max-md:grid">
        <button type="button" className={ds.button.primary} onClick={onRetry}>
          다시 확인
        </button>
        <button type="button" className={ds.button.secondary} onClick={onCountsOnly}>
          건수만 보기
        </button>
      </div>
      <p className="text-caption text-muted">오류 번호 E-BRIDGE-BUSY</p>
    </section>
  )
}

/**
 * Worker가 생긴 뒤에 그린다: useBridge는 처음부터 같은 Worker로 붙는다(Worker 오류가 없으면 한 번).
 * Worker 오류 뒤 [다시 불러오기]로 새 Worker가 오면 useBridge가 새 통로 포트로 다시 붙고(연결 중 → ready), ready에서 명단 자리를 새로 그린다(AC-610.6)
 */
function Connected({ tool, worker }: { tool: PatientsTool; worker: Worker }) {
  const { state, hello, helloError, retry, stream } = useBridge({ worker })
  const [countsOnly, setCountsOnly] = useState(false)

  // 비트 명단 두 도구는 hello의 도우미 버전으로 읽을 수 있는지 본다(AC-2802.5)
  if (state === 'ready') return <PatientsScreen tool={tool} bridge={{ stream }} worker={worker} helperVersion={hello?.helperVersion} />
  if (tool === 'messages') return null
  if (state === 'no-extension') return <CountsOnly />
  if (state === 'busy') {
    if (!countsOnly) return <BusyNotice onRetry={retry} onCountsOnly={() => setCountsOnly(true)} />
    return (
      <CountsOnly
        action={
          <button
            type="button"
            className={`${ds.button.secondary} max-md:w-full`}
            onClick={() => {
              setCountsOnly(false)
              retry()
            }}
          >
            다시 확인
          </button>
        }
      />
    )
  }
  const reason = REASON_OF[state]
  if (reason) return <ConnectFirst reason={reason} />
  // hello가 번호로 끝나 연결 중에 멈췄다. 번호와 [다시 확인]은 비트 PC 연결 화면이 보인다(ClaimEntry와 같다)
  if (helloError !== null) return <ConnectFirst reason="disconnected" />
  return <ConnectingView tool={tool} />
}

export function PatientsEntry({ tool }: { tool: PatientsTool }) {
  const worker = usePatientsWorkerObject()
  const [messagesOpened, setMessagesOpened] = useState(tool === 'messages')
  if (tool === 'messages' && !messagesOpened) setMessagesOpened(true)
  return (
    <div>
      <h1 className="text-title font-semibold text-ink">환자</h1>
      <div className="mt-3">
        <ToolRow label="환자 도구" items={TOOL_ITEMS} current={tool} />
      </div>
      <div className="mt-6 max-md:mt-4">
        {worker ? <Connected tool={tool} worker={worker} /> : tool !== 'messages' && <ConnectingView tool={tool} />}
        {messagesOpened && (
          <ToolSlot tool="messages" hidden={tool !== 'messages'}>
            <MessagesTool today={todayInKorea()} active={tool === 'messages'} />
          </ToolSlot>
        )}
      </div>
    </div>
  )
}
