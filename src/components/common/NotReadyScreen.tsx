import Link from 'next/link'
import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { Icon } from './Icon'
import type { NotReadyFeature } from './notReadyFeatures'

// 준비 중 화면 (ui-90 REQ-415, design.md '준비 중 (TASK-12)', UI_GUIDE '빈 상태', 시안 docs/mockups/ui-90/app/gen.py nr_body · CSS .nr*·.dots·.mw*).
// 아직 없는 기능의 주소(/stats 등 10개)와 청구 연결됨(TASK-10, action·meanwhile로)이 같이 쓴다. 바깥 상자·꾸밈 선·고정 높이가 없다(흰 바탕 한 장 위).
// 서버에서 그대로 그린다. 자료를 읽지 않는다. 앱 틀은 (app)/layout의 AppShell이 준다.
//   왼쪽 칸: "준비 중" 칩 → h1 title → 소개 → 돌아가기 자리(action, 없으면 [대시보드로 돌아가기])
//   오른쪽 칸: h2 "만들 것" → 점 목록
//   그 아래 전체 폭(위 1px line): h2 "그동안 쓸 수 있어요" → [비트 PC 연결] · [청구] (meanwhile={false}면 없다)
// 칸: 1024px 이상 12칸(왼쪽 1~6 · 오른쪽 8~12), 1024px 미만은 쌓는다(만들 것 · 그동안 위에 1px line). 글자 단계는 768px에서 바뀐다.
// 시안 단계 밖 값은 가까운 단계로 옮겼다(design.md '시안과 다른 점' 2): 덩어리 사이 40 → 48(폰 28 → 32, 대시보드 덩어리 사이와 같다),
// 만들 것 사이 10 → 8, 15px 글자 → body(14)·소개는 lead(16), 그동안 링크 사이 40 → 32 · 링크와 설명 사이 10 → 8

export type NotReadyScreenProps = {
  /** 그릴 글: h1(title) · 소개(intro) · 만들 것(items, 받은 순서). 탭 10개는 notReadyFeature(주소)를 그대로 준다 */
  feature: Pick<NotReadyFeature, 'title' | 'intro' | 'items'>
  /** 돌아가기 자리에 둘 것(단추·링크 하나). 없으면 [대시보드로 돌아가기]. 모양(ds.button…·폰 전체 폭)은 주는 쪽이 정한다 */
  action?: ReactNode
  /** 기본 true: 아래에 "그동안 쓸 수 있어요"([비트 PC 연결] · [청구]). 청구 연결됨처럼 이미 그 화면이면 false */
  meanwhile?: boolean
}

// 덩어리 나눔(1024px 미만): 위 32 + 1px line + 20
const STACK_SPLIT = 'mt-8 border-t border-line pt-5'
// 칸 머리(h2): small 600 muted
const COLUMN_TITLE = 'text-small font-semibold text-muted'

// 그동안 쓸 수 있는 화면 둘(시안 글자 그대로): 주소 · 링크 글 · 설명
const MEANWHILE = [
  { href: '/claim/setup', label: '비트 PC 연결', desc: '청구 점검을 쓰려면 먼저 해요' },
  { href: '/claim', label: '청구', desc: '삭감 예방 사전점검' },
] as const

// [대시보드로 돌아가기]: 보조 단추 + 왼쪽을 보는 화살표(오른쪽 화살표를 돌림, ink-2). 폰은 전체 폭(44px)
function BackToDashboard() {
  return (
    <Link href="/dashboard" className={`${ds.button.secondary} no-underline max-md:w-full`}>
      <Icon name="arrow" size={16} className="rotate-180 text-ink-2" />
      대시보드로 돌아가기
    </Link>
  )
}

// 그동안 쓸 수 있어요: 링크(글자 단추 + 오른쪽 화살표, 올림에 밑줄·화살표 오른쪽 2px) 옆에 설명(small muted).
// 768px 미만은 한 줄씩 쌓고 설명이 링크 아래(링크 44px 아래 빈 곳을 8 당긴다), 768px 이상은 옆으로 놓는다
function Meanwhile() {
  return (
    <div className={`${STACK_SPLIT} lg:col-span-12 lg:mt-12`}>
      <h2 className={COLUMN_TITLE}>그동안 쓸 수 있어요</h2>
      <ul className="mt-1 flex flex-col md:flex-row md:flex-wrap md:gap-x-8">
        {MEANWHILE.map(({ href, label, desc }) => (
          <li key={href} className="flex flex-col items-start pt-0.5 pb-2 md:flex-row md:flex-wrap md:items-center md:gap-x-2 md:p-0">
            <Link
              href={href}
              className={`${ds.textButton} group underline decoration-transparent not-disabled:not-aria-disabled:hover:decoration-current`}
            >
              {label}
              <Icon name="arrow" size={16} className="transition group-hover:translate-x-0.5" />
            </Link>
            <span className="text-small text-muted max-md:-mt-2">{desc}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function NotReadyScreen({ feature, action, meanwhile = true }: NotReadyScreenProps) {
  return (
    // 본문 위 여백: 앱 틀 안쪽 위 24에 더해 16(폰 4)
    <div className="pt-1 md:pt-4 lg:grid lg:grid-cols-12 lg:gap-x-6">
      <div className="lg:col-span-6">
        <span className={ds.chip.neutral}>준비 중</span>
        <h1 className="mt-3 text-heading-m font-semibold text-balance text-ink md:text-heading">{feature.title}</h1>
        {/* 최대 폭: 시안 30em × 16px = 480px */}
        <p className="mt-3 max-w-120 text-lead text-ink-2">{feature.intro}</p>
        <div className="mt-6">{action ?? <BackToDashboard />}</div>
      </div>
      {/* 1024px 이상: 위 32로 머리를 h1 높이에 맞춘다(칩 20 + 12) */}
      <div className={`${STACK_SPLIT} lg:col-span-5 lg:col-start-8 lg:mt-0 lg:border-t-0 lg:pt-8`}>
        <h2 className={COLUMN_TITLE}>만들 것</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {feature.items.map((item) => (
            // 꾸밈 점 6px accent: 첫 줄(22px) 가운데에 오게 위 8, 글은 점 왼쪽 끝에서 22px(시안 14px 칸 + 8)
            <li key={item} className="flex gap-4 text-body text-ink">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 bg-accent" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      {meanwhile ? <Meanwhile /> : null}
    </div>
  )
}
