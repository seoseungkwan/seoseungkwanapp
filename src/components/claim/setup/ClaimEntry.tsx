'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { BridgeState } from '@/types/bridge'
import { openClaimChannel } from '../claimLoad'
import { ClaimScreen } from '../ClaimScreen'
import { OutsideCounts } from '../OutsideCounts'
import { useBridge } from '../useBridge'
import { BusyCard } from './SetupAlert'

// /claim 입구 (precheck REQ-006·REQ-013, ui-90 REQ-413, design.md '청구 (TASK-10)', 시안 docs/mockups/ui-90/app/gen.py claim_body·BUSY).
// 다른 PC에서 보는 건수(precheck AC-019.5)는 OutsideCounts가 아래 두 자리에 들어간다. ui-90 화면이 목업 화면 11보다 앞서므로 h1·안내·단추는 그대로다.
// - 확장이 있는 PC 크롬인데 연결이 안 됐으면 비트 PC 연결(/claim/setup)이 먼저 나온다(목업 화면 1 "연결이 안 된 채로 청구 탭을 열면")
// - 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요"(ClaimOffline, AC-013.8). 이때는 Worker를 만들지 않는다
// - 연결됐으면 청구 화면(ClaimScreen). 통로와 번호 칸은 Worker 하나를 함께 쓴다
// - 다른 창에서 작업 중이면 카드 그대로. [건수만 보기]를 누르면 그 자리에서 건수와 "건수만 볼 수 있어요"(design.md '시안과 다른 점' 7)

const TO_SETUP: ReadonlySet<BridgeState> = new Set(['no-helper', 'update-helper', 'update-extension', 'disconnected'])

const titleClass = 'text-title font-semibold text-ink'
// 건수 위 글 줄: small muted, 사이 8 · 줄 사이 6(시안 .cl-other gap 6px 8px)
const chipLine = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small text-muted'

// 확장 없는 곳·휴대폰(시안 claim_body): h1 → 점 목록 둘 → [이 PC를 비트 PC로 연결] → 위 1px line 아래 건수 줄 → 건수(AC-019.5).
// 건수는 600px 자리 안에 둔다: 네 칸 표가 그 폭에 들어가 윗부분과 폭을 맞춘다.
// 시안 단계 밖 값은 가까운 단계로(design.md '시안과 다른 점' 2): 22/30 제목 → heading-m, 15px 글자 → body, 점 사이 10 → 8 (준비 중 화면과 같다)
function ClaimOffline() {
  return (
    // 최대 폭 600px(시안 .cl), 위 8
    <div className="max-w-150 pt-2">
      <h1 className="text-heading-m font-semibold text-balance text-ink md:text-heading">이 PC에서는 청구 점검을 열 수 없어요</h1>
      <ul className="mt-4 flex flex-col gap-2">
        {['환자 정보와 삭감 경고는 비트 PC(비트가 깔린 의원 PC)에서만 보여요.', '이 PC는 아직 비트 PC로 연결되지 않았어요.'].map((line) => (
          // 꾸밈 점 6px accent: 첫 줄(22px) 가운데에 오게 위 8, 글은 점 왼쪽 끝에서 22px(시안 14px 칸 + 8)
          <li key={line} className="flex gap-4 text-body text-ink">
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-accent" />
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        {/* 주 큰 단추 + 꾸밈 화살표(올림에 오른쪽 2px). 폰은 전체 폭 */}
        <Link href="/claim/setup" className={`${ds.button.primaryLarge} group no-underline max-md:w-full`}>
          이 PC를 비트 PC로 연결
          <Icon name="arrow" size={16} className="transition group-hover:translate-x-0.5" />
        </Link>
      </div>
      {/* 위 32 + 1px line + 16 */}
      <p className={`${chipLine} mt-8 border-t border-line pt-4`}>
        <span>다른 PC에서는 건수만 볼 수 있어요</span>
      </p>
      <div className="mt-3">
        <OutsideCounts />
      </div>
    </div>
  )
}

export function ClaimEntry() {
  // 서버에서 그릴 때와 Worker를 못 만드는 곳에서는 null이다. 그려지는 글자는 연결 상태로만 정하므로 서버와 어긋나지 않는다
  const [channel] = useState(() => openClaimChannel())
  const { state, helloError, retry, call, stream, onProgress } = useBridge({ worker: channel?.worker })
  const router = useRouter()
  const [countsOnly, setCountsOnly] = useState(false)
  // hello가 오류 번호로 끝나 연결 중에 멈췄어도 비트 PC 연결로(거기서 번호와 [다시 확인]을 보인다)
  const toSetup = TO_SETUP.has(state) || (state === 'connecting' && helloError !== null)

  useEffect(() => {
    if (toSetup) router.replace('/claim/setup')
  }, [toSetup, router])

  if (state === 'no-extension') return <ClaimOffline />

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <h1 className={titleClass}>청구</h1>
      {state === 'ready' && (channel ? <ClaimScreen channel={channel} call={call} stream={stream} onProgress={onProgress} /> : <ErrorCard code="E-RULES-LOAD-FAILED" />)}
      {state === 'busy' && countsOnly && (
        // [건수만 보기] 뒤: 건수(AC-019.5). [다시 확인]은 다시 붙고 카드로 돌아간다
        <>
          <p className={chipLine}>
            <span>건수만 볼 수 있어요</span>
          </p>
          <OutsideCounts />
          <div>
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
          </div>
        </>
      )}
      {state === 'busy' && !countsOnly && (
        <BusyCard
          onRetry={retry}
          outside={
            <button type="button" className={ds.button.secondary} onClick={() => setCountsOnly(true)}>
              건수만 보기
            </button>
          }
        />
      )}
    </div>
  )
}
