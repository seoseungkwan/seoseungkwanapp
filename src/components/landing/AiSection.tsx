import type { ReactNode } from 'react'
import styles from './AiSection.module.css'
import base from './base.module.css'

// AI가 지키는 약속 4개(번호·색 없이 제목과 설명만)
const POINTS = [
  { title: '근거 숫자와 함께', desc: '모든 문장에 어떤 숫자를 보고 말했는지 붙입니다.' },
  { title: "짐작은 '추정'이라고", desc: '원인을 짐작할 때는 추정이라고 분명히 밝힙니다.' },
  { title: '이어서 채팅으로 질문', desc: '리포트를 보다가 궁금한 점을 바로 물어봅니다.' },
  { title: '환자 정보 없이', desc: 'AI에는 합계 숫자만 보내고, 채팅 기록은 저장하지 않습니다.' },
]

// 리포트 예시 항목. 모르는 숫자는 [ ] 빈칸이고, 빈칸은 중간에서 줄이 바뀌지 않게 묶는다
const ITEMS: { tag: string; tone: string; text: string; basis: ReactNode }[] = [
  {
    tag: '늘었어요',
    tone: base.chipOk,
    text: '신환이 지난달보다 늘었습니다.',
    basis: (
      <>
        근거 · 신환 <span className={base.nowrap}>[지난달]명</span> → <span className={base.nowrap}>[이번 달]명</span>
      </>
    ),
  },
  { tag: '살펴볼 것', tone: base.chipAttn, text: '인건비율이 지난달보다 올랐습니다.', basis: '근거 · 인건비 총액 ÷ 매출' },
  {
    tag: '추정',
    tone: base.chipWait,
    text: '도수치료 증가는 신환 증가와 함께 움직인 것으로 보입니다.',
    basis: (
      <>
        근거 · 처방 그룹 &apos;도수&apos; <span className={base.nowrap}>[지난달]건</span> →{' '}
        <span className={base.nowrap}>[이번 달]건</span>
      </>
    ),
  },
]

// AI 섹션(#ai) (specs/landing-v2 AC-108.1): 제목 → 리포트 패널(항목 3줄 | 채팅 칸) → 약속 4개.
// 채팅은 그림일 뿐 아무것도 받지 않는다(칩은 span, 물어보기 칸은 aria-hidden). 점 3개는 움직이지 않는다
export default function AiSection() {
  return (
    <section id="ai" className={`${base.sec} ${base.secCanvas}`}>
      <div className={`${base.wrap} ${base.stack}`}>
        <div className={base.head}>
          <h2 className={base.tH2}>
            버튼 한 번이면,
            <br />
            AI가 이번 달을 읽어 줍니다
          </h2>
          <p className={base.tLead}>
            숫자를 늘어놓는 데서 끝나지 않습니다. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로
            정리합니다.
          </p>
        </div>

        <div className={styles.rep}>
          <div className={styles.repHead}>
            <h3 className={base.tH3}>10월 AI 리포트</h3>
            <span className={`${base.chip} ${base.chipSample}`}>방금 생성 · 예시</span>
          </div>
          <div className={styles.repBody}>
            <div className={styles.repItems}>
              {ITEMS.map((item) => (
                <div key={item.tag} className={styles.repItem}>
                  <span className={`${base.chip} ${item.tone} ${styles.repTag}`}>{item.tag}</span>
                  <span className={styles.repText}>{item.text}</span>
                  <span className={styles.repBasis}>{item.basis}</span>
                </div>
              ))}
            </div>
            <div className={styles.chat}>
              <div className={styles.question}>다음 달엔 뭘 보면 좋을까?</div>
              <span role="img" aria-label="AI가 답을 쓰는 중" className={styles.typing}>
                <i />
                <i />
                <i />
              </span>
              <div className={base.chips}>
                <span className={`${base.chip} ${base.chipNeutral}`}>재방문율이 낮은 처방은?</span>
                <span className={`${base.chip} ${base.chipNeutral}`}>인건비율 괜찮아?</span>
              </div>
              <div aria-hidden="true" className={styles.ask}>
                <span>AI에게 물어보기</span>
                <span className={styles.send}>
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 18 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 9h11M10 4.5L14.5 9 10 13.5" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </div>

        <ul className={`${base.items} ${base.itemsFour}`}>
          {POINTS.map((p) => (
            <li key={p.title} className={base.item}>
              <h3 className={base.tH3}>{p.title}</h3>
              <p className={base.tBody}>{p.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
