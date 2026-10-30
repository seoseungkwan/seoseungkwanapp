import type { ReactNode } from 'react'
import base from './base.module.css'
import styles from './PrivacySection.module.css'

// 개인정보 약속 4개. 문구는 plan.md §4·§6에 정한 사실만.
// 약속 3은 768에서 "이름·개인별"이 가운뎃점 뒤에서 끊기지 않게 그 낱말만 nowrap으로 묶는다(AC-112.2)
const RULES: { title: string; desc: ReactNode }[] = [
  {
    title: '필요한 칸만 읽습니다',
    desc: '계산에 쓰는 칸을 정해 두고 그 칸만 읽습니다. 차트번호는 계산하는 동안 메모리 안에서만 씁니다.',
  },
  {
    title: '주민번호가 보이면 멈춥니다',
    desc: "'-' 없이 붙여 쓴 13자리까지 잡아서, 섞여 있으면 계산하지 않고 알려 줍니다.",
  },
  {
    title: 'AI에는 합계 숫자만',
    desc: (
      <>
        통계·매출 합계와 인건비 총액만 보냅니다. 직원 <span className={base.nowrap}>이름·개인별</span> 급여도 보내지 않습니다.
      </>
    ),
  },
  {
    title: '승인한 사람만, 공용 PC도 안심',
    desc: '구글 로그인 뒤 관리자가 승인한 계정만 들어옵니다. 30분 동안 움직임이 없으면 자동으로 로그아웃합니다.',
  },
]

// 흐름 카드의 20px 아이콘(꾸밈). 색은 CSS(.nodeHead svg)가 currentColor로 정한다
function Icon({ viewBox, children }: { viewBox: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

// 카드 사이 연결(꾸밈): 화살표 선 + 칩. 1024 미만은 아래 화살표, 1024부터 가로 화살표에 칩이 선 위로 간다
function FlowLink({ label }: { label: string }) {
  return (
    <div aria-hidden="true" className={styles.link}>
      <span className={styles.linkLine} />
      <span className={`${base.chip} ${base.chipNeutral} ${styles.linkChip}`}>{label}</span>
    </div>
  )
}

// 개인정보 섹션(#privacy) (specs/landing-v2 AC-110.1): 제목 + 0건 카드 → 병원 PC → 서버 → AI 흐름 → 약속 4개
export default function PrivacySection() {
  return (
    <section id="privacy" className={base.sec}>
      <div className={`${base.wrap} ${base.stack}`}>
        <div className={styles.top}>
          <div className={base.head}>
            <h2 className={base.tH2}>
              환자 개인정보는
              <br />
              절대 병원 PC 밖으로 나가지 않습니다
            </h2>
            <p className={base.tLead}>
              환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않습니다. 처음부터 그렇게 설계했습니다.
            </p>
          </div>
          <div className={`${base.card} ${styles.zero}`}>
            <p className={styles.zeroNum}>
              0<span>건</span>
            </p>
            <p className={styles.zeroCaption}>
              서버와 AI로 보내는
              <br />
              환자 개인정보
            </p>
          </div>
        </div>

        <div className={styles.flow}>
          <div className={styles.node}>
            <div className={styles.nodeHead}>
              <Icon viewBox="0 0 22 22">
                <rect x="2" y="4" width="18" height="12" rx="2" />
                <path d="M7 19h8" />
              </Icon>
              <h3 className={base.tH3}>병원 PC · 브라우저</h3>
            </div>
            <p className={base.tBody}>환자 파일을 여기서만 열고 계산합니다.</p>
            <div className={styles.stop}>
              <span className={styles.stopTitle}>
                <svg
                  aria-hidden="true"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                >
                  <circle cx="8" cy="8" r="6.5" />
                  <path d="M3.5 12.5l9-9" />
                </svg>
                여기서 멈춤
              </span>
              <span className={styles.stopItems}>환자 이름 · 주민번호 · 차트번호 · 파일 이름</span>
            </div>
          </div>

          <FlowLink label="합계 숫자만" />

          <div className={styles.node}>
            <div className={styles.nodeHead}>
              <Icon viewBox="0 0 22 22">
                <rect x="3" y="3" width="16" height="6" rx="1.5" />
                <rect x="3" y="12" width="16" height="6" rx="1.5" />
              </Icon>
              <h3 className={base.tH3}>서버</h3>
            </div>
            <p className={base.tBody}>통계·매출 합계만 저장합니다. 원본 파일은 올라가지 않습니다.</p>
          </div>

          <FlowLink label="집계만" />

          <div className={styles.node}>
            <div className={styles.nodeHead}>
              <Icon viewBox="0 0 20 20">
                <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
                <path d="M7.5 9.5h5M7.5 12.5h5M7.5 15.5h3" />
              </Icon>
              <h3 className={base.tH3}>AI 분석</h3>
            </div>
            <p className={base.tBody}>서버가 꺼낸 합계 숫자로만 리포트를 씁니다.</p>
          </div>
        </div>

        <ul className={`${base.items} ${base.itemsFour}`}>
          {RULES.map((rule) => (
            <li key={rule.title} className={base.item}>
              <h3 className={base.tH3}>{rule.title}</h3>
              <p className={base.tBody}>{rule.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
