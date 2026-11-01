'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { BridgeState } from '@/types/bridge'
import { useBridge } from '../useBridge'
import { BusyCard } from './SetupAlert'

// /claim 자리 (REQ-006, 목업 화면 1·6·11). 이 TASK에서는 갈래만: 점검 화면은 TASK-13, 밖에서 보는 건수는 TASK-19가 채운다.
// - 확장이 있는 PC 크롬인데 연결이 안 됐으면 설치·연결 확인(/claim/setup)이 먼저 나온다(목업 화면 1 "연결이 안 된 채로 청구 탭을 열면")
// - 확장 없는 곳·휴대폰이면 '밖에서 보는 건수' 자리
// - 다른 창에서 작업 중이면 목업 화면 6의 카드([건수만 보기]는 이 자리에서 건수 보기로)

const TO_SETUP: ReadonlySet<BridgeState> = new Set(['no-helper', 'update-helper', 'update-extension', 'disconnected'])

const titleClass = 'text-title font-semibold text-ink'
// 안내 상자: ds.panel + 안쪽 24px(768px 미만 16px)
const box = `${ds.panel} p-6 max-md:p-4`

/** 밖에서 보는 건수 자리(목업 화면 11): 건수는 아직 없다(TASK-19) */
function OutsideCounts() {
  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className={titleClass}>청구</h1>
        <span className="text-small text-muted">비트 PC가 아닌 곳에서 보는 화면이에요</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface px-4 py-3">
        <span className="text-small text-ink-2">청구 점검은 비트 PC의 크롬에서 엽니다.</span>
        <span className={`${ds.help} ml-auto`}>환자 정보와 삭감 경고는 비트 PC에서만 볼 수 있어요.</span>
      </div>
      <section aria-label="밖에서 보는 건수" className={`${box} flex flex-col gap-1`}>
        <h2 className={ds.panelTitle}>밖에서 보는 건수</h2>
        <p className="text-small text-muted">아직 올린 건수가 없어요.</p>
      </section>
      <div className="flex flex-wrap items-center gap-2">
        <span className={ds.help}>이 PC가 비트 PC라면</span>
        <Link href="/claim/setup" className={`${ds.textButton} no-underline`}>
          설치·연결 확인
        </Link>
      </div>
    </div>
  )
}

export function ClaimEntry() {
  const { state, helloError, retry } = useBridge()
  const router = useRouter()
  const [outside, setOutside] = useState(false)
  // hello가 오류 번호로 끝나 연결 중에 멈췄어도 설치·연결 확인으로(거기서 번호와 [다시 확인]을 보인다)
  const toSetup = TO_SETUP.has(state) || (state === 'connecting' && helloError !== null)

  useEffect(() => {
    if (toSetup) router.replace('/claim/setup')
  }, [toSetup, router])

  if (state === 'no-extension' || outside) return <OutsideCounts />

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <h1 className={titleClass}>청구</h1>
      {state === 'busy' && (
        <BusyCard
          onRetry={retry}
          outside={
            <button type="button" className={ds.button.secondary} onClick={() => setOutside(true)}>
              건수만 보기
            </button>
          }
        />
      )}
      {state === 'ready' && (
        <section aria-label="청구 점검" className={`${box} flex flex-col items-start gap-1`}>
          <h2 className={ds.panelTitle}>청구 점검 화면은 준비 중입니다</h2>
          <p className="text-small text-muted">이 PC는 비트와 연결됐어요.</p>
          <Link href="/claim/setup" className={`${ds.textButton} no-underline`}>
            설치·연결 확인
          </Link>
        </section>
      )}
    </div>
  )
}
