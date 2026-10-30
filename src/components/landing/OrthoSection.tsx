import styles from './OrthoSection.module.css'

const TILES: { title: string; desc: string }[] = [
  { title: '주사', desc: '주사 치료 수와 F/U 기록' },
  { title: '물리치료', desc: '물리치료 내원 환자 수' },
  { title: '비급여', desc: '비급여 치료 내역' },
  { title: '월말 보고', desc: '한 장으로 받는 월간 보고' },
]

// 정형외과·통증 의원 섹션(#ortho): 타일 4장
export default function OrthoSection() {
  return (
    <section id="ortho" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>FOR ORTHO &amp; PAIN CLINICS</span>
          <h2 className={styles.title}>정형외과·통증 의원을 위해 만들었습니다</h2>
          <p className={styles.lead}>
            척추·관절 환자 흐름, 도수·물리치료 처방, 치료사 생산성까지. 정형외과에서 매일 보는 숫자에 맞췄습니다.
          </p>
        </div>
        <div className={styles.tiles}>
          {TILES.map(({ title, desc }) => (
            <figure key={title} className={styles.tile}>
              <figcaption className={styles.caption}>
                <strong className={styles.captionTitle}>{title}</strong>
                <span className={styles.captionDesc}>{desc}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}
