import styles from './PromiseBand.module.css'

// 히어로 아래 핵심 약속 띠: 개인정보 약속 3줄 (plan.md §4·§6의 사실만)
export default function PromiseBand() {
  return (
    <section aria-label="핵심 약속" className={styles.band}>
      <div className={styles.inner}>
        <div className={styles.item}>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 22 22" fill="none">
            <path
              d="M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z"
              stroke="#077A73"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
          환자 개인정보 서버 전송 0건
        </div>
        <div className={styles.item}>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 22 22" fill="none">
            <rect x="2" y="4" width="18" height="12" rx="2" stroke="#077A73" strokeWidth="1.8" />
            <path d="M7 19h8" stroke="#077A73" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          환자 파일은 브라우저 안에서만 계산
        </div>
        <div className={styles.item}>
          <svg aria-hidden="true" width="24" height="24" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="#6D5DF5" />
          </svg>
          AI에는 합계 숫자만
        </div>
      </div>
    </section>
  )
}
