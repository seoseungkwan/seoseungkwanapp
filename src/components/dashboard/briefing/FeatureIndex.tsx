import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { DASHBOARD_FEATURES } from './features'
import { ARROW_MOVE, PRESS, SECTION, SECTION_HEAD, SECTION_TITLE } from './layout'

// 기능 목차 (tab-frame AC-316.4, design.md '대시보드 짜임' 기능 목차, 메모 §3 '기능 목차'·§6·§7). 연결 전·뒤 모두 맨 아래 섹션.
// 칸 하나 = 링크 하나(안에 다른 링크·단추 없음). 칸마다 테두리 상자가 없고 위 1px line 하나로 나눈다.
// 1줄 이름(사용 가능 ink · 준비 중 ink-2, 올림 accent) + 오른쪽 상태, 2줄 설명. 1024px 이상 3열 · 768~1023px 2열 · 폰 1열(칸 높이 56 이상).
// "준비 중" 상태 글자는 시안대로 faint다 — 같은 칸에 이름·설명이 있고 상태는 덧붙은 표시라 정보가 색에만 기대지 않는다(design.md '준비 중 탭도 보통 탭 모양')
const INDEX_TITLE_ID = 'dashboard-feature-index-title'
const CELL = `group block border-t border-line pt-3 pb-4 max-md:min-h-14 max-md:py-3 ${PRESS} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`

// 머리 옆 글의 수는 목차 자료에서 센다(칸 수 · 사용 가능 수)
const total = DASHBOARD_FEATURES.length
const ready = DASHBOARD_FEATURES.filter((f) => f.ready).length

export function FeatureIndex() {
  return (
    <section aria-labelledby={INDEX_TITLE_ID} className={SECTION}>
      <div className={SECTION_HEAD}>
        <h2 id={INDEX_TITLE_ID} className={SECTION_TITLE}>
          기능 목차
        </h2>
        <p className="text-small text-muted">
          {total}개 가운데 {ready}개를 지금 쓸 수 있어요
        </p>
      </div>
      <ul aria-label="기능" className="grid list-none gap-x-6 md:grid-cols-2 lg:grid-cols-3">
        {DASHBOARD_FEATURES.map((feature) => (
          <li key={feature.name}>
            <Link href={feature.href} className={CELL}>
              <span className="flex items-center justify-between gap-3">
                <span className={`text-subtitle font-semibold transition group-hover:text-accent ${feature.ready ? 'text-ink' : 'text-ink-2'}`}>{feature.name}</span>
                {feature.ready ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-caption font-medium text-accent">
                    사용 가능
                    <Icon name="arrow" size={14} className={ARROW_MOVE} />
                  </span>
                ) : (
                  <span className="shrink-0 text-caption font-medium text-faint">준비 중</span>
                )}
              </span>
              <span className="mt-0.5 block text-small text-muted">{feature.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
