import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import styles from './ErrorCard.module.css'

// 오류 카드: 무엇이 · 어떻게 고치나 · 오류 번호 (파일럿 ErrorCard 이식, 모양은 목업 로그인 실패 카드).
// 안내 글은 lib/errors.ts에서만 가져온다. 받는 값은 번호 하나라 원래 오류 내용(메시지·스택)을 그릴 길이 없다.
// 다시 시도 같은 단추는 목업처럼 카드 밖에 둔다
export function ErrorCard({ code }: { code: ErrorCode }) {
  const info = errorInfo(code)
  return (
    <div role="alert" className={styles.card}>
      <svg
        aria-hidden="true"
        className={styles.icon}
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5" />
        <path d="M12 16.5h.01" />
      </svg>
      <div className={styles.body}>
        <p className={styles.what}>{info.what}</p>
        <p className={styles.fix}>{info.fix}</p>
        <p className={styles.code}>오류 번호 {code}</p>
      </div>
    </div>
  )
}
