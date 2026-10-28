import styles from './PrivacySection.module.css'

const SHIELD_PATH = 'M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z'

// 개인정보 약속 카드. 문구는 plan.md §4·§6에 정한 사실만
const RULES = [
  {
    title: '필요한 칸만 읽습니다',
    desc: <>계산에 쓰는 칸을 정해 두고 그 칸만 읽습니다. 차트번호는 계산하는 동안 메모리 안에서만 씁니다.</>,
  },
  {
    title: '주민번호가 보이면 멈춥니다',
    desc: (
      <>
        &apos;-&apos; 없이 붙여 쓴 13자리까지 잡아서,
        <br />
        섞여 있으면 계산하지 않고 알려 줍니다.
      </>
    ),
  },
  {
    title: 'AI에는 합계 숫자만',
    desc: <>통계·매출 합계와 인건비 총액만 보냅니다. 직원 이름·개인별 급여도 보내지 않습니다.</>,
  },
  {
    title: '승인한 사람만, 공용 PC도 안심',
    desc: <>구글 로그인 뒤 관리자가 승인한 계정만 들어옵니다. 30분 동안 움직임이 없으면 자동으로 로그아웃합니다.</>,
  },
]

// 개인정보 섹션(#privacy): 제목과 0건 카드 · 병원 PC → 서버 → AI 흐름 · 약속 카드 4개
export default function PrivacySection() {
  return (
    <section id="privacy" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.head}>
            <span className={styles.eyebrow}>
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 22 22" fill="none">
                <path d={SHIELD_PATH} stroke="#077A73" strokeWidth="2.2" strokeLinejoin="round" />
              </svg>
              PRIVACY FIRST
            </span>
            <h2 className={styles.title}>
              환자 개인정보는
              <br />
              <span className={styles.titleAccent}>절대 병원 PC 밖으로 나가지 않습니다</span>
            </h2>
            <p className={styles.lead}>
              환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않습니다. 처음부터 그렇게 설계했습니다.
            </p>
          </div>
          <div className={styles.zeroCard}>
            <div className={styles.zero}>
              0<span className={styles.zeroUnit}>건</span>
            </div>
            <div className={styles.zeroCaption}>
              서버와 AI로 보내는
              <br />
              환자 개인정보
            </div>
          </div>
        </div>

        <div className={styles.flow}>
          <div className={`${styles.node} ${styles.nodePc}`}>
            <div className={`${styles.nodeHead} ${styles.center}`}>
              <svg aria-hidden="true" width="26" height="26" viewBox="0 0 22 22" fill="none">
                <rect x="2" y="4" width="18" height="12" rx="2" stroke="#077A73" strokeWidth="1.8" />
                <path d="M7 19h8" stroke="#077A73" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <h3 className={styles.nodeTitle}>병원 PC · 브라우저</h3>
            </div>
            <p className={styles.nodeDesc}>환자 파일을 여기서만 열고 계산합니다.</p>
            <div className={styles.stop}>
              <span className={styles.stopTitle}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="6.5" stroke="#C2410C" strokeWidth="1.6" />
                  <path d="M3.5 12.5l9-9" stroke="#C2410C" strokeWidth="1.6" />
                </svg>
                여기서 멈춤
              </span>
              <span className={styles.stopItems}>환자 이름 · 주민번호 · 차트번호 · 파일 이름</span>
            </div>
          </div>

          <div aria-hidden="true" className={`${styles.link} ${styles.linkTeal}`}>
            <span>합계 숫자만</span>
            <div className={`${styles.line} ${styles.lineTeal}`} />
          </div>

          <div className={`${styles.node} ${styles.nodeServer}`}>
            <div className={`${styles.nodeHead} ${styles.center}`}>
              <svg aria-hidden="true" width="26" height="26" viewBox="0 0 22 22" fill="none">
                <rect x="3" y="3" width="16" height="6" rx="1.5" stroke="#0B1530" strokeWidth="1.8" />
                <rect x="3" y="12" width="16" height="6" rx="1.5" stroke="#0B1530" strokeWidth="1.8" />
              </svg>
              <h3 className={styles.nodeTitle}>서버</h3>
            </div>
            <p className={styles.nodeDesc}>통계·매출 합계만 저장합니다. 원본 파일은 올라가지 않습니다.</p>
          </div>

          <div aria-hidden="true" className={`${styles.link} ${styles.linkViolet}`}>
            <span>집계만</span>
            <div className={`${styles.line} ${styles.lineViolet}`} />
          </div>

          <div className={`${styles.node} ${styles.nodeAi}`}>
            <div className={styles.nodeHead}>
              <svg aria-hidden="true" width="26" height="26" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z" fill="#6D5DF5" />
              </svg>
              <h3 className={styles.nodeTitle}>AI 분석</h3>
            </div>
            <p className={styles.nodeDesc}>서버가 꺼낸 합계 숫자로만 리포트를 씁니다.</p>
          </div>
        </div>

        <div className={styles.rules}>
          {RULES.map((rule) => (
            <div key={rule.title} className={styles.rule}>
              <h3 className={styles.ruleTitle}>{rule.title}</h3>
              <p className={styles.ruleDesc}>{rule.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
