import type { ReactNode } from 'react'
import styles from './AuthFrame.module.css'

// 로그인 전후 화면(로그인·가입 신청·승인 대기)의 틀: 위쪽 흰 띠(로고 · [서비스 이름]) + 본문.
// 띠에는 메뉴가 없다(목업). 로고는 랜딩 SiteHeader와 같은 그림이고 읽지 않는다.
// headerEnd = 띠 오른쪽 끝에 둘 것(승인 대기·거절 화면의 [로그아웃], 목업 Pending·Rejected). 없으면 아무것도 그리지 않는다
export function AuthFrame({ children, headerEnd }: { children: ReactNode; headerEnd?: ReactNode }) {
  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <svg aria-hidden="true" width="30" height="30" viewBox="0 0 30 30" fill="none">
            <rect x="9" y="3" width="12" height="6" rx="3" stroke="#14C8BA" strokeWidth="2.2" />
            <rect x="11" y="12" width="12" height="6" rx="3" stroke="#14C8BA" strokeWidth="2.2" />
            <rect x="8" y="21" width="12" height="6" rx="3" stroke="#6D5DF5" strokeWidth="2.2" />
          </svg>
          <span>[서비스 이름]</span>
          {headerEnd != null && <div className={styles.headerEnd}>{headerEnd}</div>}
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
