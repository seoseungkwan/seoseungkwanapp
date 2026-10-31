import base from './base.module.css'
import styles from './PromiseBand.module.css'

// 히어로 아래 핵심 약속 띠 (specs/landing-v2 AC-107.5): 개인정보 약속 3줄 (plan.md §4·§6의 사실만).
// 아이콘은 20px 선 그림(currentColor, 굵기 1.5). AI 항목은 합계 기호(Σ)다
export default function PromiseBand() {
  return (
    <section aria-label="핵심 약속" className={styles.band}>
      <div className={`${base.wrap} ${styles.inner}`}>
        <div className={styles.bandItem}>
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path d="M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z" />
          </svg>
          환자 개인정보 서버 전송 0건
        </div>
        <div className={styles.bandItem}>
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <rect x="2" y="4" width="18" height="12" rx="2" />
            <path d="M7 19h8" />
          </svg>
          환자 파일은 브라우저 안에서만 계산
        </div>
        <div className={styles.bandItem}>
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 4h-9l5 6-5 6h9" />
          </svg>
          AI에는 합계 숫자만
        </div>
      </div>
    </section>
  )
}
