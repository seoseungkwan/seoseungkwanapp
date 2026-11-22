// 후보 자세히 › 소득·쓸 힘 묶음(spec location AC-7909.7, 시안 ?s=candidate #sec-income).
// 평균 근로소득(시군구, 귀속 연도 · 시·도 평균과 견줌 · `동 단위 자료가 없어요.`) · 아파트·상가 ㎡당 거래가(지난 6달, 법정동 기준) →
// 의료급여·차상위(후보 시군구, 머리 `시군구 기준 · 기초생활보장 의료급여 기준 · 겹칠 수 있어요` — 옛 구 묶음 값이면 끝에 ` · 옛 {구} 기준`,
// 세 줄 수·비율(snapshot.ts welfareRate) + 출처 줄). 자료가 없으면 그 칸만 design.md 15절 글이다. 그날 값(Snapshot)만 받는다(props·콜백만).
// 제목 아래 '이렇게 봤어요'(AC-7920.2): method.ts HOW.income을 부르는 쪽이 준 howCtx로 채움, 펼침도 props(howOpen·onHow)
import type { ReactNode } from 'react'
import { commaText, wonText } from '@/lib/location/money'
import type { Got, Snapshot, SnapshotValue } from '@/types/location'
import { GotView, type HowProps, INFO, INFO_DD, INFO_DT, INFO_ROW, type Pass, Section, SubHead } from './Section'
import { rateText, shownOf, sidoCompareText, welfareLines, welfareNote } from './text'

export type IncomeSectionProps = Pass &
  HowProps & {
    /** 그날 값(전체 Snapshot을 그대로 넘겨도 된다) */
    snapshot: Pick<Snapshot, 'income' | 'aptPrice' | 'bizPrice' | 'welfare'>
  }

const BIG = 'font-semibold tabular-nums'
const AFTER = 'text-small text-ink-2'
// 금액은 원 정수(원 미만 버림)
const won = (n: number) => wonText(Math.floor(n))

export function IncomeSection({ snapshot: s, howCtx, howOpen, onHow, onRetry, onOpenSource }: IncomeSectionProps) {
  const pass: Pass = { onRetry, onOpenSource }
  const sggName = shownOf(s.income)?.v.sggName
  return (
    <Section id="income" title="소득·쓸 힘" howCtx={howCtx} howOpen={howOpen} onHow={onHow}>
      <dl className={INFO}>
        <Row label="평균 근로소득(한 해)">
          <GotView got={s.income} {...pass}>
            {(v) => (
              <p>
                <b className={BIG}>{won(v.won)}</b> <span className={AFTER}>{`· ${v.year}년 귀속${sidoCompareText(v) ?? ''}`}</span>
              </p>
            )}
          </GotView>
          <p className="mt-0.5 text-caption text-muted">
            {sggName ? `동 단위 자료가 없어요. ${sggName} 평균이에요(사는 곳 기준).` : '동 단위 자료가 없어요.'}
          </p>
        </Row>
        <Price label="아파트 거래가(㎡당)" got={s.aptPrice} {...pass} />
        <Price label="상가·업무용 거래가(㎡당)" got={s.bizPrice} {...pass} />
      </dl>
      <Welfare got={s.welfare} {...pass} />
    </Section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={INFO_ROW}>
      <dt className={INFO_DT}>{label}</dt>
      <dd className={INFO_DD}>{children}</dd>
    </div>
  )
}

// ㎡당 거래가: `{금액} · 지난 6달 {n}건 · 법정동 기준`
function Price({ label, got, ...pass }: Pass & { label: string; got: Got<SnapshotValue<'aptPrice'>> }) {
  return (
    <Row label={label}>
      <GotView got={got} {...pass}>
        {(v) => (
          <p>
            <b className={BIG}>{won(v.perM2)}</b> <span className={AFTER}>{`· 지난 6달 ${commaText(v.deals)}건 · 법정동 기준`}</span>
          </p>
        )}
      </GotView>
    </Row>
  )
}

// 의료급여·차상위(design.md 4·5·6절): 세 줄 `{n}명 ({x}%)` — x는 그 시군구 주민등록 인구 대비 소수 첫째 자리 버림(welfareRate), 인구가 없으면 `–`.
// 새 시군구가 판에 옛 구로만 있으면(basis) 머리 끝 ` · 옛 {구} 기준`. 출처 줄 끝에 판에서 찾은 시군구 이름(옛 구 묶음이면 '중구·동구')을 붙인다
function Welfare({ got, ...pass }: Pass & { got: Got<SnapshotValue<'welfare'>> }) {
  const shown = shownOf(got)?.v
  return (
    <div className="min-w-0">
      <SubHead title="의료급여·차상위" note={welfareNote(shown?.basis ?? null)} />
      <GotView got={got} extra={shown?.sggName} {...pass}>
        {(v) => (
          <dl className={INFO}>
            {welfareLines(v).map((line) => (
              <Row key={line.label} label={line.label}>
                <b className={BIG}>{commaText(line.count)}명</b> <span className="tabular-nums text-ink-2">({rateText(line.rate)})</span>
              </Row>
            ))}
          </dl>
        )}
      </GotView>
    </div>
  )
}
