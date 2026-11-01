'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/common/Icon'
import { NotReadyScreen, type NotReadyScreenProps } from '@/components/common/NotReadyScreen'
import { ds } from '@/components/ui/classes'
import type { BridgeState } from '@/types/bridge'
import { useBridge } from '../useBridge'
import { BusyCard } from './SetupAlert'

// /claim 자리 (precheck REQ-006, ui-90 REQ-413, design.md '청구 (TASK-10)', 시안 docs/mockups/ui-90/app/gen.py claim_body·claim_ready_body·BUSY).
// 점검 화면은 precheck TASK-13, 다른 PC에서 보는 건수는 precheck TASK-19가 채운다.
// - 확장이 있는 PC 크롬인데 연결이 안 됐으면 비트 PC 연결(/claim/setup)이 먼저 나온다(목업 화면 1 "연결이 안 된 채로 청구 탭을 열면")
// - 확장 없는 곳·휴대폰이면 "이 PC에서는 청구 점검을 열 수 없어요"(ClaimOffline)
// - 연결됐으면 다른 준비 중 화면과 같은 모양(NotReadyScreen + [비트 PC 연결 다시 확인], "그동안 쓸 수 있어요" 없음)
// - 다른 창에서 작업 중이면 카드 그대로. [건수만 보기]를 누르면 그 자리에서 "건수만 볼 수 있어요"(design.md '시안과 다른 점' 7)

const TO_SETUP: ReadonlySet<BridgeState> = new Set(['no-helper', 'update-helper', 'update-extension', 'disconnected'])

const titleClass = 'text-title font-semibold text-ink'
// "준비 중" 칩 옆 글 줄: small muted, 사이 8 · 줄 사이 6(시안 .cl-other gap 6px 8px)
const chipLine = 'flex flex-wrap items-center gap-x-2 gap-y-1.5 text-small text-muted'

// 연결됨 화면 글(시안 claim_ready_body 글자 그대로). 탭 이름은 "청구"(page.tsx metadata), 준비 중 탭 10개 자료(notReadyFeatures.ts)와는 따로 둔다
const CLAIM_READY: NotReadyScreenProps['feature'] & { name: '청구' } = {
  name: '청구',
  title: '청구 점검 화면은 준비 중이에요',
  intro: '이 PC는 비트와 연결됐어요. 점검 화면이 만들어지면 이 탭에서 바로 열려요.',
  items: ['삭감 예방 사전점검', '청구메모', '상병 확인', '월말 마감'],
}

// 확장 없는 곳·휴대폰(시안 claim_body): h1 → 점 목록 둘 → [이 PC를 비트 PC로 연결] → 위 1px line 아래 건수 줄.
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
        <span className={ds.chip.neutral}>준비 중</span>
      </p>
    </div>
  )
}

export function ClaimEntry() {
  const { state, helloError, retry } = useBridge()
  const router = useRouter()
  const [countsOnly, setCountsOnly] = useState(false)
  // hello가 오류 번호로 끝나 연결 중에 멈췄어도 비트 PC 연결로(거기서 번호와 [다시 확인]을 보인다)
  const toSetup = TO_SETUP.has(state) || (state === 'connecting' && helloError !== null)

  useEffect(() => {
    if (toSetup) router.replace('/claim/setup')
  }, [toSetup, router])

  if (state === 'no-extension') return <ClaimOffline />

  if (state === 'ready') {
    return (
      <NotReadyScreen
        feature={CLAIM_READY}
        action={
          <Link href="/claim/setup" className={`${ds.button.secondary} no-underline max-md:w-full`}>
            비트 PC 연결 다시 확인
          </Link>
        }
        meanwhile={false}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <h1 className={titleClass}>청구</h1>
      {state === 'busy' && countsOnly && (
        // [건수만 보기] 뒤: 건수는 아직 준비 중(precheck TASK-19). [다시 확인]은 다시 붙고 카드로 돌아간다
        <>
          <p className={chipLine}>
            <span>건수만 볼 수 있어요</span>
            <span className={ds.chip.neutral}>준비 중</span>
          </p>
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
