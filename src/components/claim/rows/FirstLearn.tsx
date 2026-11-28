'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { FirstLearnKind } from '@/types/precheck'

// 처음 학습(claim-learn REQ-9305, design.md 7절, 시안 ?s=first, notes '처음 학습' 글 그대로). 종류·예시 진료는 props로만 받는다.
// 확인 안 한 종류부터 하나씩: [맞아요](위가 종류 열쇠를 저장) · [고치기](위가 그 예시 진료를 고치기 칸으로 연다) · [건너뛰기](이 칸 안에서만 넘김) · [그만].
// 덮은 비율 = 확인한 종류의 진료 수 합 ÷ 불러온 진료 수, 내림 정수 %

const box = 'flex min-w-0 flex-col gap-0.5 rounded-control border border-line bg-surface px-3 py-2 text-small text-ink'
const boxLabel = 'text-caption font-semibold text-muted'

export function FirstLearn({
  total,
  kinds,
  confirmed,
  short,
  onRight,
  onFix,
  onStop,
  onLoadMonth,
}: {
  /** 불러온 진료 수 */
  total: number
  /** 진료 수 많은 차례의 종류(Worker가 정했다). done은 전에 확인한 종류 */
  kinds: readonly FirstLearnKind[]
  /** 이 칸을 연 뒤 [맞아요]로 확인한 종류 열쇠 */
  confirmed: ReadonlySet<string>
  /** 불러온 기간이 7일보다 짧거나 진료가 없다('한 달 불러오기' 띠, AC-9305.4) */
  short: boolean
  onRight(kind: FirstLearnKind): void
  onFix(kind: FirstLearnKind): void
  onStop(): void
  onLoadMonth(): void
}) {
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set())
  const isDone = (kind: FirstLearnKind) => kind.done || confirmed.has(kind.key)
  const doneKinds = kinds.filter(isDone)
  const covered = doneKinds.reduce((sum, kind) => sum + kind.count, 0)
  const percent = total > 0 ? Math.floor((covered * 100) / total) : 0
  const current = kinds.find((kind) => !isDone(kind) && !skipped.has(kind.key)) ?? null

  return (
    <section aria-label="처음 학습" className={`${ds.panel} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={ds.panelTitle}>처음 학습</h2>
        <span className="flex-1" />
        <button type="button" className={ds.button.secondarySmall} onClick={onStop}>
          그만
        </button>
      </div>
      <p className="text-small text-ink-2">자주 나온 진료부터 하나씩 봐요. 맞으면 [맞아요], 다르면 [고치기]로 고쳐 학습해요. 언제든 [그만]하고 나중에 이어서 할 수 있어요.</p>
      {kinds.length > 0 && (
        <div className="flex max-w-160 flex-col gap-1.5">
          <div role="progressbar" aria-label="확인한 종류" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-clip rounded-control bg-line">
            <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-small text-ink-2">{`확인한 종류가 불러온 진료의 ${percent}%예요 (${doneKinds.length} / ${kinds.length} 종류)`}</span>
        </div>
      )}
      {current ? (
        <div className="flex flex-col gap-3 rounded-control border border-line bg-canvas p-4">
          <h3 className="text-subtitle font-semibold text-ink">{`${current.name} · 진료 ${current.count}건`}</h3>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
            <div role="group" aria-label="차트" className={box}>
              <span className={boxLabel}>차트</span>
              {current.example.chart.map((line, index) => (
                <span key={index} className="break-words">
                  {line}
                </span>
              ))}
            </div>
            <div role="group" aria-label="처방" className={box}>
              <span className={boxLabel}>처방</span>
              {current.example.rx.map((row, index) => (
                <span key={index} className="break-words">
                  {`${row.code} ${row.name}${row.qty === null ? '' : ` ${row.qty}`}`}
                </span>
              ))}
            </div>
            <div role="group" aria-label="지금 메모" className={box}>
              <span className={boxLabel}>지금 메모</span>
              {current.example.memo
                .split('\n')
                .filter((line) => line.trim())
                .map((line, index) => (
                  <span key={index} className="break-words">
                    {line}
                  </span>
                ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.primarySmall} onClick={() => onRight(current)}>
              맞아요
            </button>
            <button type="button" className={ds.button.secondarySmall} onClick={() => onFix(current)}>
              고치기
            </button>
            <button type="button" className={ds.button.secondarySmall} onClick={() => setSkipped((now) => new Set(now).add(current.key))}>
              건너뛰기
            </button>
          </div>
        </div>
      ) : (
        kinds.length > 0 && <p className="text-small text-ink-2">불러온 진료의 종류를 다 봤어요.</p>
      )}
      {short && (
        <div className="flex flex-wrap items-center gap-2 rounded-control bg-accent-soft px-4 py-3">
          <p className="text-small text-ink">처음 학습은 한 달쯤 불러온 진료로 하면 좋아요. 지금 불러온 기간이 짧아요.</p>
          <span className="flex-1" />
          <button type="button" className={ds.button.primarySmall} onClick={onLoadMonth}>
            지난 30일 불러오기
          </button>
        </div>
      )}
    </section>
  )
}
