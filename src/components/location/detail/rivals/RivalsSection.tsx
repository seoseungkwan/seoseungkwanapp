'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import { asOfText } from '@/components/location/common/text'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { distText } from '@/lib/location/coords'
import { commaText } from '@/lib/location/money'
import type { Got, Rival, RivalKind, SnapshotValue, SourceId } from '@/types/location'
import { MUTED, Section, TABLE } from './Section'
import { KIND_LABEL, KIND_ORDER, inRange, isRival, shownOf, weekText } from './text'

// 후보 자세히 › 경쟁 의원 묶음(spec location AC-7909.3, 시안 ?s=candidate sec-comp).
// 정형외과·마취통증의학과·재활의학과 수와 한의원 수(따로 — 머리 수·1곳당 사는 사람에는 안 넣음), 의원마다 의사·물리치료사(없으면 `자료 없음`)·
// MRI·CT·문 연 해·같은 건물·진료 시간, 아래 3년 개폐업. 살필 범위 밖(거리 > 범위)은 세지도 그리지도 않는다.
// props·콜백만 받는다(읽기·저장·바깥 부르기 없음). 과목 거르기는 화면 안 상태다

export type RivalsSectionProps = {
  /** 살필 범위 m */
  radiusM: number
  /** 그날 값 rivals(한의원 포함, 가까운 차례) */
  rivals: Got<Rival[]>
  /** 그날 값 history(3년 개업·폐업) */
  history: Got<SnapshotValue<'history'>>
  /** 그날 값 people — 1곳당 사는 사람에 total만 쓴다 */
  people: Got<{ total: number }>
  /** 못 받은 칸의 [다시 받기] */
  onRetry?: () => void
  /** 출처 줄을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: SourceId) => void
  /** 목차 닻(기본 시안 `sec-comp`) */
  id?: string
}

type Filter = 'all' | RivalKind

const FILTER_BTN = `group inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-body text-ink transition hover:bg-canvas aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-strong aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-accent ${ds.focusRing}`
const FILTER_N = 'font-medium tabular-nums text-muted group-aria-pressed:text-accent-strong'
const SUB_HEAD = 'text-small font-semibold text-ink'

export function RivalsSection({ radiusM, rivals, history, people, onRetry, onOpenSource, id = 'sec-comp' }: RivalsSectionProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = shownOf(rivals)
  const comps = shown ? inRange(shown.v, radiusM) : []
  const count = (k: RivalKind) => comps.filter((r) => r.kind === k).length
  const n = comps.filter(isRival).length
  const total = shownOf(people)?.v.total ?? null

  return (
    <Section id={id} title="경쟁 의원" count={shown ? n : null} aside={`범위 ${distText(radiusM)} 안 · 한의원은 따로 세요`}>
      {shown ? (
        <>
          <p data-testid="rival-counts" className="text-body text-ink">
            {KIND_ORDER.map((k, i) => (
              <span key={k}>
                {i > 0 && ' · '}
                {KIND_LABEL[k]} <b className="font-semibold tabular-nums">{commaText(count(k))}</b>
              </span>
            ))}
            {n === 0 ? (
              ' → 범위 안에 정형외과·통증·재활 의원이 없어요'
            ) : total !== null ? (
              <>
                {' → 정형외과·통증·재활 1곳당 사는 사람 '}
                <b className="font-semibold tabular-nums">{commaText(Math.floor(total / n))}명</b>
              </>
            ) : null}
          </p>
          <div role="group" aria-label="과목 거르기" className="flex flex-wrap gap-1.5">
            {(['all', ...KIND_ORDER] as const).map((k) => (
              <button key={k} type="button" className={FILTER_BTN} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {k === 'all' ? '전체' : KIND_LABEL[k]}{' '}
                <span className={FILTER_N}>{commaText(k === 'all' ? comps.length : count(k))}</span>
              </button>
            ))}
          </div>
          <RivalTable rows={filter === 'all' ? comps : comps.filter((r) => r.kind === filter)} all={filter === 'all'} src={rivals.src} />
          {!rivals.ok && <WhyLine why={rivals.why} src={rivals.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
        </>
      ) : (
        !rivals.ok && <WhyLine why={rivals.why} src={rivals.src} onRetry={onRetry} place="value" />
      )}
      <div>
        <SourceLine src="hosp-list" asOf={shown?.asOf} extra="의원·과목·의사 수·문 연 해" onOpen={onOpenSource} />
        <SourceLine src="hosp-detail" asOf={shown?.asOf} extra="MRI·CT·물리치료사" onOpen={onOpenSource} />
        <SourceLine src="hosp-hours" asOf={shown?.asOf} extra="진료 시간" onOpen={onOpenSource} />
      </div>
      <History radiusM={radiusM} history={history} onRetry={onRetry} onOpenSource={onOpenSource} />
    </Section>
  )
}

function RivalTable({ rows, all, src }: { rows: Rival[]; all: boolean; src: SourceId }) {
  if (rows.length === 0)
    return all ? <WhyLine why="none" src={src} /> : <p className={`text-body ${MUTED}`}>이 과목 의원이 범위 안에 없어요.</p>
  return (
    <div className={TABLE.wrap}>
      <table className={TABLE.table}>
        <thead>
          <tr>
            <th className={TABLE.th}>의원</th>
            <th className={TABLE.th}>과목</th>
            <th className={TABLE.thNum}>거리</th>
            <th className={TABLE.thNum}>의사</th>
            <th className={TABLE.thNum}>물리치료사</th>
            <th className={TABLE.th}>장비</th>
            <th className={TABLE.thNum}>문 연 해</th>
            <th className={TABLE.th}>진료 시간</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <RivalRow key={`${r.name}-${i}`} r={r} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const missing = (t = '자료 없음') => <span className={MUTED}>{t}</span>

function RivalRow({ r }: { r: Rival }) {
  const gear = [r.mri ? 'MRI' : null, r.ct ? 'CT' : null].filter((g) => g !== null)
  const hours = weekText(r.week)
  return (
    <tr className={TABLE.row}>
      <td className={TABLE.td}>
        <b className="font-semibold">{r.name}</b>
      </td>
      <td className={TABLE.tdNowrap}>{KIND_LABEL[r.kind]}</td>
      <td className={TABLE.tdNum}>{r.sameBuilding ? '같은 건물' : distText(r.distM)}</td>
      <td className={TABLE.tdNum}>{r.doctors === null ? missing('–') : `${commaText(r.doctors)}명`}</td>
      <td className={TABLE.tdNum}>{r.therapists === null ? missing() : `${commaText(r.therapists)}명`}</td>
      <td className={TABLE.td}>
        {gear.length > 0 ? (
          <span className="inline-flex flex-wrap gap-1">
            {gear.map((g) => (
              <span key={g} className={ds.chip.neutral}>
                {g}
              </span>
            ))}
          </span>
        ) : r.mri === null && r.ct === null ? (
          missing()
        ) : (
          missing('–')
        )}
      </td>
      <td className={TABLE.tdNum}>{r.openedYear === null ? missing('–') : `${r.openedYear}년`}</td>
      <td className={`${TABLE.td} text-small`}>{hours === null ? missing() : hours}</td>
    </tr>
  )
}

type HistoryProps = Pick<RivalsSectionProps, 'radiusM' | 'history' | 'onRetry' | 'onOpenSource'>

function History({ radiusM, history, onRetry, onOpenSource }: HistoryProps) {
  const shown = shownOf(history)
  const rows = shown ? inRange(shown.v, radiusM).sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0)) : []
  const opened = rows.filter((e) => e.kind === 'open').length
  return (
    <div className="min-w-0">
      <p data-testid="rival-history-head" className={SUB_HEAD}>
        3년 사이 문 열고 닫은 곳{' '}
        {shown && <span className="font-normal text-muted">{`문 엶 ${commaText(opened)} · 문 닫음 ${commaText(rows.length - opened)}`}</span>}
      </p>
      {shown ? (
        rows.length > 0 ? (
          <div className={`mt-1 ${TABLE.wrap}`}>
            <table className={TABLE.table}>
              <thead>
                <tr>
                  <th className={TABLE.th}>날짜</th>
                  <th className={TABLE.th}>무엇</th>
                  <th className={TABLE.th}>의원</th>
                  <th className={TABLE.thNum}>거리</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e, i) => (
                  <tr key={`${e.on}-${e.name}-${i}`} className={TABLE.row}>
                    <td className={`${TABLE.tdNowrap} tabular-nums`}>{asOfText(e.on)}</td>
                    <td className={TABLE.tdNowrap}>
                      {e.kind === 'open' ? <span className={ds.chip.warning}>문 엶</span> : <span className={ds.chip.neutral}>문 닫음</span>}
                    </td>
                    <td className={TABLE.td}>
                      <b className="font-semibold">{e.name}</b>
                    </td>
                    <td className={TABLE.tdNum}>{distText(e.distM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`mt-1 text-small ${MUTED}`}>범위 안에서 3년 사이 문 열거나 닫은 의원이 없어요.</p>
        )
      ) : (
        !history.ok && (
          <div className="mt-1">
            <WhyLine why={history.why} src={history.src} onRetry={onRetry} />
          </div>
        )
      )}
      {shown && !history.ok && <WhyLine why={history.why} src={history.src} prevAsOf={shown.asOf} onRetry={onRetry} />}
      <SourceLine src={history.src} asOf={shown?.asOf} onOpen={onOpenSource} />
    </div>
  )
}
