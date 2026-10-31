'use client'

import { useEffect, useState } from 'react'
import { LogoMark } from '@/components/common/LogoMark'
import base from './base.module.css'
import styles from './HeroChart.module.css'
import { heroFrame, startHeroTicker } from './heroFrames'

// 미리보기 안 예시 글자(시안 그대로). 실제 앱 탭과 같은 이름이다
const TABS = ['대시보드', '통계', 'AI 리포트', '매출', '재고', '급여', '일일마감·보고', '월간 PDF'] as const
const MONTHS = ['5월', '6월', '7월', '8월', '9월', '10월'] as const
const GRID_LINES = ['25%', '50%', '75%', '100%'] as const

// 히어로 아래 앱 화면 미리보기 (specs/landing-v2 AC-107.3): 위쪽 띠 · 탭 · 대시보드(KPI 3장 + 월별 추이).
// 예시 값은 2.6초마다 바뀌고, 모션 줄이기면 틱 0에 멈춘다. 꾸밈 그림이라 링크·단추·입력이 없다
export default function HeroChart() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return startHeroTicker({ reduce, onTick: setTick })
  }, [])

  const { visits, newRate, ringPct, bars } = heroFrame(tick)

  return (
    <div className={styles.app}>
      <div className={styles.top} aria-hidden="true">
        <span className={styles.logo}>
          <LogoMark size={20} />
          [서비스 이름]
        </span>
        <span className={styles.acct}>
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
          </svg>
        </span>
      </div>

      <div className={styles.tabs} aria-hidden="true">
        {TABS.map((name, i) => (
          <span key={name} className={i === 0 ? `${styles.tab} ${styles.tabOn}` : styles.tab}>
            {name}
          </span>
        ))}
      </div>

      <div className={styles.body}>
        <div className={styles.title}>
          <span className={styles.heading}>대시보드</span>
          <span className={`${base.chip} ${base.chipSample}`}>숫자는 예시</span>
        </div>

        <div className={styles.grid}>
          <div className={styles.kpi}>
            <div className={styles.kpiBody}>
              <div className={styles.kpiLabel}>오늘 외래</div>
              <div className={styles.kpiValue}>
                {visits}
                <span className={styles.unit}>명</span>
              </div>
            </div>
            <div className={styles.kpiFoot}>
              <span className={styles.up}>▲</span> 지난주 같은 요일보다
            </div>
          </div>

          <div className={styles.kpi}>
            <div className={styles.kpiBody}>
              <div className={styles.kpiLabel}>신환율</div>
              {/* 옛 시험(AC-003.3)이 "신환율 18.2%"를 한 덩어리로 찾는다 → 값과 %를 한 원소에 */}
              <div className={styles.kpiValue}>{newRate}%</div>
            </div>
            <div className={styles.kpiFoot}>
              <div className={styles.meter} aria-hidden="true">
                <i className={styles.meterFill} style={{ width: `${newRate}%` }} />
              </div>
            </div>
          </div>

          <div className={`${styles.kpi} ${styles.kpiAi}`}>
            <div className={styles.kpiLabel}>AI 한 줄 요약</div>
            <div className={styles.aiText}>도수치료 처방이 지난달보다 늘었어요.</div>
            <div className={styles.kpiFoot}>
              <span className={styles.link}>근거 숫자 보기 →</span>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>월별 추이</span>
            </div>
            <div className={styles.chart}>
              <div className={styles.ring}>
                <svg aria-hidden="true" viewBox="0 0 120 120">
                  <circle className={styles.ringTrack} cx="60" cy="60" r="46" fill="none" />
                  <circle
                    className={styles.ringValue}
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    pathLength={100}
                    strokeDasharray={`${ringPct} 100`}
                    transform="rotate(-90 60 60)"
                  />
                  <text className={styles.ringText} x="60" y="68" textAnchor="middle">
                    {ringPct}%
                  </text>
                </svg>
              </div>
              <div className={styles.bars}>
                <div className={styles.plot}>
                  {GRID_LINES.map((bottom) => (
                    <span key={bottom} className={styles.gridLine} style={{ bottom }} />
                  ))}
                  {bars.map((height, i) => (
                    <div key={i} className={styles.barCol}>
                      <div
                        className={i === bars.length - 1 ? `${styles.bar} ${styles.barLast}` : styles.bar}
                        style={{ height: `${height}%` }}
                      >
                        <span className={styles.barLabel}>{height}%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.months} aria-hidden="true">
                  {MONTHS.map((month) => (
                    <span key={month}>{month}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
