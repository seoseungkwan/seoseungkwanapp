import styles from './AiSection.module.css'

const SPARKLE_PATH = 'M8 1.5l1.6 4.2 4.4 1.3-4.4 1.3L8 12.5 6.4 8.3 2 7l4.4-1.3z'
const SHIELD_PATH = 'M11 2l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V5l7-3z'

const POINTS = [
  { num: '1', tone: styles.numTeal, title: '근거 숫자와 함께', desc: '모든 문장에 어떤 숫자를 보고 말했는지 붙입니다.' },
  { num: '2', tone: styles.numAmber, title: "짐작은 '추정'이라고", desc: '원인을 짐작할 때는 추정이라고 분명히 밝힙니다.' },
  { num: '3', tone: styles.numPink, title: '이어서 채팅으로 질문', desc: '리포트를 보다가 궁금한 점을 바로 물어봅니다.' },
]

// 리포트 예시 항목. 모르는 숫자는 [ ] 빈칸
const ITEMS = [
  { tag: '늘었어요', tone: styles.tagUp, text: '신환이 지난달보다 늘었습니다.', basis: '근거 · 신환 [지난달]명 → [이번 달]명' },
  { tag: '살펴볼 것', tone: styles.tagWarn, text: '인건비율이 지난달보다 올랐습니다.', basis: '근거 · 인건비 총액 ÷ 매출' },
  {
    tag: '추정',
    tone: styles.tagGuess,
    text: '도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.',
    basis: "근거 · 처방 그룹 '도수' [지난달]건 → [이번 달]건",
  },
]

// AI 섹션(#ai): 왼쪽은 AI가 지키는 약속, 오른쪽은 리포트·채팅 예시. 채팅은 그림일 뿐 아무것도 받지 않는다
export default function AiSection() {
  return (
    <section id="ai" className={styles.section}>
      <div aria-hidden="true" className={styles.glow} />
      <div className={styles.inner}>
        <div className={styles.head}>
          <span className={styles.eyebrow}>
            <svg aria-hidden="true" className={styles.sparkle} width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d={SPARKLE_PATH} fill="#6D5DF5" />
            </svg>
            AI ANALYSIS
          </span>
          <h2 className={styles.title}>
            버튼 한 번이면,
            <br />
            <span className={styles.titleAccent}>AI가 이번 달을 읽어 줍니다</span>
          </h2>
          <p className={styles.lead}>
            숫자를 늘어놓는 데서 끝나지 않습니다. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로
            정리합니다.
          </p>
        </div>

        <div className={styles.body}>
          <div className={styles.points}>
            {POINTS.map((p) => (
              <div key={p.num} className={styles.point}>
                <span className={`${styles.num} ${p.tone}`}>{p.num}</span>
                <div className={styles.pointText}>
                  <h3 className={styles.pointTitle}>{p.title}</h3>
                  <p className={styles.pointDesc}>{p.desc}</p>
                </div>
              </div>
            ))}
            <div className={`${styles.point} ${styles.pointSafe}`}>
              <span className={`${styles.num} ${styles.numSafe}`}>
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d={SHIELD_PATH} stroke="#077A73" strokeWidth="1.8" strokeLinejoin="round" />
                </svg>
              </span>
              <div className={styles.pointText}>
                <h3 className={styles.pointTitle}>환자 정보 없이</h3>
                <p className={styles.pointDesc}>AI에는 합계 숫자만 보내고, 채팅 기록은 저장하지 않습니다.</p>
              </div>
            </div>
          </div>

          <div className={styles.report}>
            <div className={styles.reportHead}>
              <svg aria-hidden="true" className={styles.sparkle} width="22" height="22" viewBox="0 0 16 16" fill="none">
                <path d={SPARKLE_PATH} fill="#6D5DF5" />
              </svg>
              <h3 className={styles.reportTitle}>10월 AI 리포트</h3>
              <span className={styles.example}>방금 생성 · 예시</span>
            </div>
            <div aria-hidden="true" className={styles.shimmer} />
            <div className={styles.items}>
              {ITEMS.map((item) => (
                <div key={item.tag} className={styles.item}>
                  <div className={styles.itemLine}>
                    <span className={`${styles.tag} ${item.tone}`}>{item.tag}</span>
                    <span className={styles.itemText}>{item.text}</span>
                  </div>
                  <span className={styles.basis}>{item.basis}</span>
                </div>
              ))}
            </div>
            <div className={styles.chat}>
              <div className={styles.question}>다음 달엔 뭘 보면 좋을까?</div>
              <div role="img" aria-label="AI가 답을 쓰는 중" className={styles.typing}>
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
                <span className={styles.typingDot} />
              </div>
              <div className={styles.chips}>
                <span className={styles.chip}>재방문율이 낮은 처방은?</span>
                <span className={styles.chip}>인건비율 괜찮아?</span>
              </div>
              <div aria-hidden="true" className={styles.ask}>
                <div className={styles.askBox}>AI에게 물어보기</div>
                <div className={styles.send}>
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path
                      d="M3 9h11M10 4.5L14.5 9 10 13.5"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
