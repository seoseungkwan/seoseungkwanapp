import Link from 'next/link'
import { Icon } from '@/components/common/Icon'
import { DASHBOARD_FEATURES, type FeatureStatus } from './features'
import { ARROW_MOVE, NOTE, PRESS, SECTION, SECTION_HEAD, SECTION_TITLE } from './layout'

// 기능 목차 (tab-frame AC-316.4, ui-90 AC-414.5, design.md '대시보드 (TASK-11)', 시안 docs/mockups/ui-90/app/gen.py dash_body·FEATS). 연결 전·뒤 모두 맨 아래 섹션.
// 칸 하나 = 링크 하나(안에 다른 링크·단추 없음). 칸마다 테두리 상자가 없고 위 1px line 하나로 나눈다.
// 1줄 이름(준비 중만 ink-2, 올림 accent) + 오른쪽 상태 글자(small), 2줄 설명. 1024px 이상 3열 · 768~1023px 2열 · 폰 1열(칸 높이 56 이상).
// 상태 글자: 청구(connect-first)는 연결 전 "연결 먼저"(ink-2 600 + 화살표) · 연결 뒤 "사용 가능", 설정·업무일지(ready)는 "사용 가능"(accent 500 + 화살표), 나머지는 "준비 중"(muted).
// 같은 칸에 이름·설명이 있고 상태는 덧붙은 표시라 정보가 색에만 기대지 않는다(design.md '준비 중 탭도 보통 탭 모양')
const INDEX_TITLE_ID = 'dashboard-feature-index-title'
const CELL = `group block border-t border-line pt-3 pb-4 no-underline max-md:min-h-14 max-md:py-3 ${PRESS} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent`
const STATUS_GO = 'inline-flex shrink-0 items-center gap-0.5 text-small'

// 머리 옆 글의 수는 목차 자료에서 센다(칸 수 · 지금 쓰는 수 · 연결하면 쓰는 수)
const countOf = (status: FeatureStatus) => DASHBOARD_FEATURES.filter((f) => f.status === status).length
const total = DASHBOARD_FEATURES.length
const now = countOf('ready')
const afterConnect = countOf('connect-first')

function Status({ status, connected }: { status: FeatureStatus; connected: boolean }) {
  if (status === 'soon') return <span className="shrink-0 text-small text-muted">준비 중</span>
  if (status === 'connect-first' && !connected) {
    return (
      <span className={`${STATUS_GO} font-semibold text-ink-2`}>
        연결 먼저
        <Icon name="arrow" size={14} className={ARROW_MOVE} />
      </span>
    )
  }
  return (
    <span className={`${STATUS_GO} font-medium text-accent`}>
      사용 가능
      <Icon name="arrow" size={14} className={ARROW_MOVE} />
    </span>
  )
}

export function FeatureIndex({ connected }: { connected: boolean }) {
  return (
    <section aria-labelledby={INDEX_TITLE_ID} className={SECTION}>
      <div className={SECTION_HEAD}>
        <h2 id={INDEX_TITLE_ID} className={SECTION_TITLE}>
          기능 목차
        </h2>
        <p className={NOTE}>
          {total}개 가운데 {now}개는 지금, {afterConnect}개는 연결하면 쓸 수 있어요
        </p>
      </div>
      <ul aria-label="기능" className="grid list-none gap-x-6 md:grid-cols-2 lg:grid-cols-3">
        {DASHBOARD_FEATURES.map((feature) => (
          <li key={feature.name}>
            <Link href={feature.href} className={CELL}>
              <span className="flex items-center justify-between gap-3">
                <span
                  className={`text-subtitle font-semibold transition group-hover:text-accent ${feature.status === 'soon' ? 'text-ink-2' : 'text-ink'}`}
                >
                  {feature.name}
                </span>
                <Status status={feature.status} connected={connected} />
              </span>
              <span className="mt-0.5 block text-small text-muted">{feature.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
