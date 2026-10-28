'use client'

import { ErrorCard } from '@/components/common/ErrorCard'
import styles from '@/components/common/ErrorCard.module.css'

// 화면을 그리다 난 오류(AC-002.8): 로그인은 됐는데 서버에서 내 병원 줄을 읽지 못함(표·권한 없음, Supabase 장애) 등.
// 로그인·대시보드로 돌려보내지 않는다 → 문지기와 서로 돌려보내는 고리가 생기지 않는다.
// Next가 넘기는 error·reset은 받지 않는다: 내용(메시지·스택·digest)을 보일 길이 없고, 서버 오류는 reset()만으로는 다시 읽지 않는다
export default function PageError() {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <ErrorCard code="E-PAGE-FAILED" />
        {/* 새로 열면 middleware·서버가 처음부터 다시 확인한다 */}
        <button type="button" className={styles.retry} onClick={() => window.location.reload()}>
          다시 시도
        </button>
      </div>
    </main>
  )
}
