import { Fragment, type ReactNode } from 'react'
import { Icon, type IconName } from '@/components/common/Icon'
import base from './base.module.css'
import styles from './PrivacySection.module.css'

// 흐름 칸 3개(병원 PC → 서버 → AI)와 그 사이 연결 글자. 문구는 plan.md §4·§6에 정한 사실만(시안 docs/mockups/ui-90/entry/screens.mjs 그대로)
const NODES: { key: string; icon: IconName; title: ReactNode; desc: string; link?: string }[] = [
  {
    key: 'pc',
    icon: 'monitor',
    title: (
      <>
        <span className={base.nw}>병원 PC</span> · 브라우저
      </>
    ),
    desc: '환자 파일을 여기서만 열고 계산해요.',
    link: '합계 숫자만',
  },
  { key: 'server', icon: 'server', title: '서버', desc: '통계·매출 합계만 저장해요. 원본 파일은 올라가지 않아요.', link: '집계만' },
  { key: 'ai', icon: 'doc', title: 'AI 분석', desc: '서버가 꺼낸 합계 숫자로만 리포트를 써요.' },
]

// 개인정보 약속 4개(768px 이상만, 시안 PRIV_RULES). 문구는 plan.md §4·§6에 정한 사실만
const RULES = [
  {
    title: '필요한 칸만 읽어요',
    desc: '계산에 쓰는 칸을 정해 두고 그 칸만 읽어요. 차트번호는 계산하는 동안 메모리 안에서만 써요.',
  },
  { title: '주민번호가 보이면 멈춰요', desc: "'-' 없이 붙여 쓴 13자리까지 잡아서, 섞여 있으면 계산하지 않고 알려 줘요." },
  { title: 'AI에는 합계 숫자만', desc: '통계·매출 합계와 인건비 총액만 보내요. 직원 이름·개인별 급여도 보내지 않아요.' },
  {
    title: '승인한 사람만, 공용 PC도 안심',
    desc: '구글 로그인 뒤 관리자가 승인한 계정만 들어와요. 30분 동안 움직임이 없으면 자동으로 로그아웃해요.',
  },
]

// 개인정보 섹션(#privacy, canvas 띠) (specs/b2b-redesign AC-210.2, specs/ui-90 AC-421.7, 시안 screens.mjs PRIV_H2·PRIV_RULES·landingPC·landingPhone #privacy).
// 윗부분(1024px 이상 글 1~8칸 · 0건 10~12칸) → 흐름 상자 하나(칸 3개 + 연결 2개) → 약속 dl(768px 이상).
// 첫 칸의 멈춤 줄은 PC(여기서 멈춤 + 항목)와 휴대폰(한 문장) 글이 시안대로 다르다. "병원 PC"는 줄 끝에서 끊기지 않는다(.nw).
// 상자는 흐름 하나다(칸에는 테두리가 없다). 연결은 꾸밈(aria-hidden)이고, 화살표 하나가 1024px 미만에서 아래쪽으로 돈다
export default function PrivacySection() {
  return (
    <section id="privacy" className={`${base.sec} ${base.secCanvas}`}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.top}`}>
          <div className={styles.text}>
            <h2 className={base.tHeading}>
              환자 개인정보는 절대 <span className={base.nw}>병원 PC</span> 밖으로 나가지 않아요
            </h2>
            <p className={`${base.tLead} ${styles.lead}`}>
              환자 이름·주민번호·차트번호는 서버에도, AI에도 가지 않아요. 처음부터 그렇게 설계했어요.
            </p>
          </div>
          <div className={styles.zero}>
            <p className={`${base.tDisplay} ${styles.zeroNum}`}>
              0<span className={styles.unit}>건</span>
            </p>
            <p className={`${base.tSmall} ${styles.zeroCaption}`}>서버와 AI로 보내는 환자 개인정보</p>
          </div>
        </div>

        <div className={styles.flow}>
          {NODES.map((node, i) => (
            <Fragment key={node.key}>
              <div className={styles.node}>
                <h3 className={`${base.tSubtitle} ${styles.nodeTitle}`}>
                  <Icon name={node.icon} className={styles.nodeIcon} />
                  <span>{node.title}</span>
                </h3>
                <p className={`${styles.nodeDesc} ${base.pcOnly}`}>{node.desc}</p>
                {i === 0 && (
                  <>
                    <p className={`${styles.stop} ${base.pcOnly}`}>
                      <Icon name="stop" size={14} />
                      <b className={styles.stopTitle}>여기서 멈춤</b>
                      <span className={styles.stopItems}>환자 이름·주민번호·차트번호·파일 이름</span>
                    </p>
                    <p className={`${styles.stop} ${base.phoneOnly}`}>
                      <Icon name="stop" size={14} />
                      <span className={styles.stopItems}>환자 이름 · 주민번호 · 차트번호는 여기서 멈춤</span>
                    </p>
                  </>
                )}
              </div>
              {node.link && (
                <div aria-hidden="true" className={styles.edge}>
                  <span className={`${base.tCaption} ${styles.edgeLabel}`}>{node.link}</span>
                  <Icon name="arrow" className={styles.edgeArrow} />
                </div>
              )}
            </Fragment>
          ))}
        </div>

        <dl className={`${styles.rules} ${base.pcOnly}`}>
          {RULES.map((rule) => (
            <div key={rule.title} className={styles.rule}>
              <dt className={styles.ruleTitle}>{rule.title}</dt>
              <dd className={styles.ruleDesc}>{rule.desc}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
