import styles from './HowSection.module.css'

const STEPS = [
  {
    num: '01',
    card: styles.stepTeal,
    tone: styles.numTeal,
    title: '구글로 시작하기',
    desc: '쓰던 구글 계정으로 로그인합니다. 새 비밀번호를 만들 필요가 없습니다.',
  },
  { num: '02', card: styles.stepCoral, tone: styles.numCoral, title: '가입 신청', desc: '처음 한 번만 의원 이름을 적어 신청합니다.' },
  {
    num: '03',
    card: styles.stepViolet,
    tone: styles.numViolet,
    title: '승인 후 바로 사용',
    desc: '관리자가 승인하면 대시보드가 열립니다.',
  },
]

// 시작 3단계 섹션(#how). 단계 제목 "구글로 시작하기"는 링크가 아니다(시작 링크는 메뉴·히어로·시작하기 섹션 3개)
export default function HowSection() {
  return (
    <section id="how" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>HOW IT STARTS</span>
          <h2 className={styles.title}>시작은 3단계면 충분합니다</h2>
        </div>
        <div aria-hidden="true" className={styles.line} />
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.num} className={`${styles.step} ${step.card}`}>
              <span className={`${styles.num} ${step.tone}`}>{step.num}</span>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepDesc}>{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
