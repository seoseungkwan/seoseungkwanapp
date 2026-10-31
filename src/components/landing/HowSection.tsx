import base from './base.module.css'
import styles from './HowSection.module.css'
import { START_HREF } from './links'

const STEPS = [
  { num: '1', title: '구글로 시작하기', desc: '쓰던 구글 계정으로 로그인합니다. 새 비밀번호를 만들 필요가 없습니다.' },
  { num: '2', title: '가입 신청', desc: '처음 한 번만 의원 이름을 적어 신청합니다.' },
  { num: '3', title: '승인 후 바로 사용', desc: '관리자가 승인하면 대시보드가 열립니다.' },
]

// 시작 3단계(#how, 흰 바탕) (specs/b2b-redesign AC-211.1, 시안 screens.mjs landingPC·landingPhone #how).
// 옛 시작하기 섹션(#start)의 안내 문장과 [구글로 시작하기]를 여기에 합쳤다. 단계 제목 "구글로 시작하기"는 링크가 아니다.
// 1024px 이상 12칸에서 글·단추 1~5칸 · 단계 7~12칸. 미만은 쌓이고, 768px 미만은 단추가 단계 뒤로 간다(같은 DOM, CSS order)
export default function HowSection() {
  return (
    <section id="how" className={base.sec}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={styles.text}>
            <h2 className={base.tHeading}>시작은 3단계면 충분합니다</h2>
            <p className={styles.lead}>처음이면 가입 신청 후 관리자 승인을 받습니다.</p>
          </div>
          <a href={START_HREF} className={`${base.btn} ${base.btnLg} ${base.btnPrimary} ${styles.start}`}>
            구글로 시작하기
          </a>
          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.num} className={styles.step}>
                <span className={styles.num}>{step.num}</span>
                <h3 className={`${base.tSubtitle} ${styles.stepTitle}`}>{step.title}</h3>
                <p className={`${styles.desc} ${base.pcOnly}`}>{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}
