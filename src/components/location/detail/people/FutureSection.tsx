// 후보 자세히 › 앞으로 바뀔 것 묶음(spec location AC-7909.1·AC-7909.2, 시안 ?s=candidate #sec-future).
// 줄 차례: 사는 사람 4년 추세(`2022→2026` · `사는 사람 4년 사이 +x%`) → 입주 예정 단지(입주 연월마다) → 재개발·도로(토지이음에서 봐요).
// 재개발·도로 계획은 이 앱이 받아 오지 않는다(토지이음 링크는 땅 쓰임·계획 묶음). 그날 값(Snapshot)만 받는다(props·콜백만).
// 제목 아래 '이렇게 봤어요'(AC-7920.2): method.ts HOW.future를 부르는 쪽이 준 howCtx로 채움, 펼침도 props(howOpen·onHow)
import type { ReactNode } from 'react'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { asOfText } from '@/components/location/common/text'
import { distText } from '@/lib/location/coords'
import { commaText } from '@/lib/location/money'
import type { Got, Snapshot, SnapshotValue } from '@/types/location'
import { GotView, type HowProps, type Pass, Section } from './Section'
import { changeText, shownOf, trendChange } from './text'

export type FutureSectionProps = Pass &
  HowProps & {
    /** 그날 값(전체 Snapshot을 그대로 넘겨도 된다) */
    snapshot: Pick<Snapshot, 'radiusM' | 'trend' | 'presale'>
  }

export function FutureSection({ snapshot: s, howCtx, howOpen, onHow, onRetry, onOpenSource }: FutureSectionProps) {
  const pass: Pass = { onRetry, onOpenSource }
  return (
    <Section id="future" title="앞으로 바뀔 것" aside={`범위 ${distText(s.radiusM)} 안`} howCtx={howCtx} howOpen={howOpen} onHow={onHow}>
      <ul className="m-0 list-none p-0">
        <TrendItem got={s.trend} {...pass} />
        <PresaleItems got={s.presale} {...pass} />
        <Item label="재개발·도로">
          <p className="text-muted">토지이음에서 봐요</p>
          <SourceLine src="land" onOpen={onOpenSource} />
        </Item>
      </ul>
    </Section>
  )
}

// 시안 .tline 줄: 왼쪽 때(120px) · 오른쪽 글
function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-1 border-b border-line py-2.5 text-body">
      <span className="font-semibold tabular-nums text-ink">{label}</span>
      <div className="min-w-0 text-ink">{children}</div>
    </li>
  )
}

function TrendItem({ got, ...pass }: Pass & { got: Got<SnapshotValue<'trend'>> }) {
  const shown = shownOf(got)
  const ch = shown ? trendChange(shown.v) : null
  const last = shown && shown.v.length > 0 ? [...shown.v].sort((a, b) => (a.ym < b.ym ? 1 : a.ym > b.ym ? -1 : 0))[0] : null
  const label = ch ? `${ch.fromYm.slice(0, 4)}→${ch.toYm.slice(0, 4)}` : last ? last.ym.slice(0, 4) : '4년 추세'
  return (
    <Item label={label}>
      <GotView got={got} {...pass}>
        {() =>
          ch ? (
            <p>{`사는 사람 ${ch.years}년 사이 ${changeText(ch.tenths)}`}</p>
          ) : last ? (
            <p>{`사는 사람 ${commaText(last.total)}명`}</p>
          ) : (
            <WhyLine why="none" src={got.src} />
          )
        }
      </GotView>
    </Item>
  )
}

// 입주 예정: 입주 연월마다 한 줄 `{단지} {세대}세대 입주`. 못 받았으면 `입주 예정` 줄에 자료 없음 글
function PresaleItems({ got, onRetry, onOpenSource }: Pass & { got: Got<SnapshotValue<'presale'>> }) {
  const shown = shownOf(got)
  if (!shown)
    return got.ok ? null : (
      <Item label="입주 예정">
        <WhyLine why={got.why} src={got.src} onRetry={onRetry} />
        <SourceLine src={got.src} onOpen={onOpenSource} />
      </Item>
    )
  return shown.v.map((p, i) => (
    <Item key={`${p.moveIn}-${p.name}-${i}`} label={asOfText(p.moveIn)}>
      <p>{`${p.name} ${commaText(p.households)}세대 입주`}</p>
      {!got.ok && <WhyLine why={got.why} src={got.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      <SourceLine src={got.src} asOf={shown.asOf} onOpen={onOpenSource} />
    </Item>
  ))
}
