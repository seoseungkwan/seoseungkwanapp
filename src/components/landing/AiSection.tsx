import { Icon } from '@/components/common/Icon'
import styles from './AiSection.module.css'
import base from './base.module.css'

// AI가 지키는 약속 4개(제목·설명). 768px 미만은 설명이 숨고 제목만 2칸으로 놓인다
const POINTS = [
  { title: '근거 숫자와 함께', desc: '모든 문장에 어떤 숫자를 보고 말했는지 붙입니다.' },
  { title: "짐작은 '추정'이라고", desc: '원인을 짐작할 때는 추정이라고 분명히 밝힙니다.' },
  { title: '이어서 채팅으로 질문', desc: '리포트를 보다가 궁금한 점을 바로 물어봅니다.' },
  { title: '환자 정보 없이', desc: 'AI에는 합계 숫자만 보내고, 채팅 기록은 저장하지 않습니다.' },
]

// 리포트 예시 항목(숫자는 승인 시안 그대로인 예시). phoneHidden 근거는 768px 미만에서 숨는다
const ITEMS = [
  { tag: '늘었어요', tone: base.chipPositive, text: '신환이 지난달보다 늘었습니다.', basis: '근거 · 신환 9월 486명 → 10월 524명' },
  { tag: '살펴볼 것', tone: base.chipWarning, text: '인건비율이 지난달보다 올랐습니다.', basis: '근거 · 인건비 총액 ÷ 매출' },
  {
    tag: '추정',
    tone: base.chipNeutral,
    text: '도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.',
    basis: '근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건',
    phoneHidden: true,
  },
]

// AI 섹션(#ai, canvas 띠) (specs/b2b-redesign AC-209.1, 시안 screens.mjs landingPC·landingPhone #ai).
// 1024px 이상 12칸에서 글 1~4칸 · 리포트 패널 5~12칸, 미만은 쌓인다.
// 채팅 칸은 그림일 뿐 아무것도 받지 않는다(칩은 span, 물어보기 칸은 aria-hidden). 상자는 리포트 패널 하나다
export default function AiSection() {
  return (
    <section id="ai" className={`${base.sec} ${base.secCanvas}`}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={styles.text}>
            <h2 className={base.tHeading}>버튼 한 번이면 AI가 이번 달을 읽어 줍니다</h2>
            <p className={styles.lead}>
              숫자를 늘어놓는 데서 끝나지 않습니다. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리합니다.
            </p>
            <dl className={styles.points}>
              {POINTS.map((p) => (
                <div key={p.title} className={styles.point}>
                  <dt className={styles.pointTitle}>{p.title}</dt>
                  <dd className={styles.pointDesc}>{p.desc}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={styles.report}>
            <div className={styles.reportHead}>
              <h3 className={base.tSubtitle}>10월 AI 리포트</h3>
              <span className={`${base.chip} ${base.chipNeutral}`}>
                <span className={base.pcOnly}>방금 생성 ·</span> 예시
              </span>
            </div>
            <div className={styles.reportBody}>
              <ol className={styles.items}>
                {ITEMS.map((item) => (
                  <li key={item.tag} className={styles.item}>
                    <span className={`${base.chip} ${item.tone} ${styles.tag}`}>{item.tag}</span>
                    <div className={styles.itemBody}>
                      <p>{item.text}</p>
                      <p className={[base.tSmall, styles.basis, item.phoneHidden && base.pcOnly].filter(Boolean).join(' ')}>
                        {item.basis}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className={`${styles.chat} ${base.pcOnly}`}>
                <p className={styles.bubble}>다음 달엔 뭘 보면 좋을까?</p>
                <p className={`${base.tSmall} ${styles.typing}`}>AI가 답을 쓰는 중…</p>
                <div className={base.chips}>
                  <span className={`${base.chip} ${base.chipNeutral}`}>재방문율이 낮은 처방은?</span>
                  <span className={`${base.chip} ${base.chipNeutral}`}>인건비율 괜찮아?</span>
                </div>
                <div aria-hidden="true" className={styles.ask}>
                  <span className={styles.askText}>AI에게 물어보기</span>
                  <span className={styles.send}>
                    <Icon name="arrow" size={14} />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
