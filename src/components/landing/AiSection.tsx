import styles from './AiSection.module.css'
import base from './base.module.css'

// AI가 지키는 약속 4개(제목·설명, 시안 AI_POINTS). 768px 미만은 설명이 숨고 제목만 2칸으로 놓인다
const POINTS = [
  { title: '근거 숫자와 함께', desc: '모든 문장에 어떤 숫자를 보고 말했는지 붙여요.' },
  { title: "짐작은 '추정'이라고", desc: '원인을 짐작할 때는 추정이라고 분명히 밝혀요.' },
  { title: '정해 둔 양식 그대로', desc: '월간보고 발표 자료를 우리 의원 양식에 맞춰 채워요.' },
  { title: '환자 정보 없이', desc: 'AI에는 합계 숫자만 보내요.' },
]

// 리포트 예시 항목(시안 AI_ITEMS, 숫자는 예시). phoneHidden 근거는 768px 미만에서 숨는다
const ITEMS = [
  { tag: '늘었어요', tone: base.chipPositive, text: '신환이 지난달보다 늘었어요.', basis: '근거 · 신환 9월 486명 → 10월 524명' },
  { tag: '살펴볼 것', tone: base.chipWarning, text: '인건비율이 지난달보다 올랐어요.', basis: '근거 · 인건비 총액 ÷ 매출' },
  {
    tag: '추정',
    tone: base.chipNeutral,
    text: '도수치료 증가는 신환 증가와 함께 움직인 것으로 보여요.',
    basis: '근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건',
    phoneHidden: true,
  },
]

// AI 섹션(#ai, canvas 띠) (specs/b2b-redesign AC-209.1, specs/ui-90 AC-421.4, 시안 docs/mockups/ui-90/entry/screens.mjs landingPC·landingPhone #ai).
// 아직 없는 AI 리포트 탭이라 머리에 "준비 중" 칩을 단다. 앱에 없는 채팅 칸은 없다.
// DOM 차례는 글 → 리포트 패널 → 약속이다(휴대폰은 이 차례로 쌓인다). 1024px 이상 12칸에서 글·약속은 1~4칸 두 줄, 패널은 5~12칸이고
// 위에 맞춰 내용 높이만큼만 그린다(패널 아래 빈 공간 없음). 상자는 리포트 패널 하나다
export default function AiSection() {
  return (
    <section id="ai" className={`${base.sec} ${base.secCanvas}`}>
      <div className={base.wrap}>
        <div className={`${base.grid} ${styles.layout}`}>
          <div className={styles.text}>
            <p className={styles.kick}>
              <span className={`${base.chip} ${base.chipNeutral}`}>준비 중</span>
              <span className={`${base.tSmall} ${styles.tab}`}>AI 리포트 탭</span>
            </p>
            <h2 className={`${base.tHeading} ${styles.title}`}>버튼 한 번이면 AI가 이번 달을 읽어 줘요</h2>
            <p className={`${base.tLead} ${styles.lead}`}>
              숫자를 늘어놓는 데서 끝나지 않아요. 무엇이 달라졌는지, 왜 그런지, 다음 달 무엇을 봐야 하는지 말로 정리해요.
            </p>
          </div>

          <div className={styles.report}>
            <div className={styles.reportHead}>
              <h3 className={base.tSubtitle}>10월 AI 리포트</h3>
              <span className={`${base.chip} ${base.chipNeutral}`}>예시</span>
            </div>
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
          </div>

          <dl className={styles.points}>
            {POINTS.map((p) => (
              <div key={p.title} className={styles.point}>
                <dt className={styles.pointTitle}>{p.title}</dt>
                <dd className={styles.pointDesc}>{p.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  )
}
