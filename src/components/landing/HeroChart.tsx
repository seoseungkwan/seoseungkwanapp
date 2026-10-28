'use client'

import { useEffect, useState } from 'react'
import styles from './HeroChart.module.css'
import { heroFrame, startHeroTicker } from './heroFrames'

// 히어로 오른쪽: 예시 차트(도넛·막대 6개) + 떠 있는 숫자 카드 3개. 값은 2.6초마다 바뀌고, 모션 줄이기면 틱 0에 멈춘다
export default function HeroChart() {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    return startHeroTicker({ reduce, onTick: setTick })
  }, [])

  const { visits, newRate, ringPct, bars } = heroFrame(tick)

  return (
    <div className={styles.root}>
      <div className={styles.panel}>
        <div className={styles.canvas} aria-hidden="true">
          <svg className={styles.ring} viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="46" fill="none" stroke="#E3ECFB" strokeWidth="14" />
            <circle
              className={styles.ringValue}
              cx="60"
              cy="60"
              r="46"
              fill="none"
              stroke="#2556D6"
              strokeWidth="14"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${ringPct} 100`}
              transform="rotate(-90 60 60)"
            />
            <text className={styles.ringText} x="60" y="66" textAnchor="middle">
              {ringPct}%
            </text>
          </svg>
          <div className={styles.bars}>
            {bars.map((height, i) => (
              <div key={i} className={styles.barCol}>
                <span className={styles.barLabel}>{height}%</span>
                <div className={styles.bar} style={{ height: `${height}%` }} />
              </div>
            ))}
          </div>
        </div>
        <span className={styles.example}>숫자는 예시</span>
      </div>

      <div className={`${styles.card} ${styles.visits}`}>
        <div className={styles.cardTitle}>오늘 외래</div>
        <div className={styles.visitsValue}>
          {visits}
          <span className={styles.unit}>명</span>
        </div>
        <div className={styles.delta}>▲ 지난주 같은 요일보다</div>
      </div>

      <div className={`${styles.card} ${styles.rate}`}>
        <div className={styles.cardTitle}>신환율</div>
        <div className={styles.rateValue}>{newRate}%</div>
      </div>

      <div className={`${styles.card} ${styles.ai}`}>
        <div className={styles.aiTitle}>
          <svg className={styles.sparkle} width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="#6D5DF5" />
          </svg>
          AI 한 줄 요약
        </div>
        <div className={styles.aiText}>도수치료 처방이 지난달보다 늘었어요.</div>
        <div className={styles.aiLink}>근거 숫자 보기 →</div>
      </div>
    </div>
  )
}
