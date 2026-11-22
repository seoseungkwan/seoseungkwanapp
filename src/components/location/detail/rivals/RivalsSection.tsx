'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import { asOfText } from '@/components/location/common/text'
import { SourceLine } from '@/components/location/common/SourceLine'
import { WhyLine } from '@/components/location/common/WhyLine'
import { distText } from '@/lib/location/coords'
import { deptRole, rivalShortText } from '@/lib/location/depts'
import { commaText } from '@/lib/location/money'
import type { DeptId, DeptRule, Got, RivalsGot, SnapshotValue, SourceId } from '@/types/location'
import { type HowProps, MUTED, PICK_BTN, Section, SMALL_BTN, TABLE } from './Section'
import {
  CAP_TEXT,
  SPOT_TEXT,
  deptName,
  historyRows,
  inRange,
  isCapped,
  placeAll,
  rivalDepts,
  roadKeyOf,
  shownOf,
  spotOf,
  weekText,
  type Placed,
} from './text'

// 후보 자세히 › 경쟁 의원 묶음(spec location AC-7909.3·AC-7921.5, design.md 18절, 시안 ?s=candidate sec-comp · notes.md 5절 '고른 과목을 따르는 글').
// 경쟁 의원 = 대표 과목(deptOf)이 과목 고르기 설정의 경쟁 과목인 의원. 한의원이 둘레로 보기면 따로 한 줄(수·1곳당 사는 사람에 안 넣음).
// 모을 때 경쟁이 아니던 의원(detail 없음)은 의사 수·문 연 해 말고 자세한 칸이 '–'. 30m 안 의원은 후보 카카오 도로명과 견줘 같은 건물·옆 건물
// (도로명이 없으면 '30m 안'). 살필 범위 밖(거리 > 범위)은 세지도 그리지도 않는다. props·콜백만 받는다(과목 거르기는 화면 안 상태)

export type RivalsSectionProps = {
  /** 살필 범위 m */
  radiusM: number
  /** 그날 값 rivals(안 보기가 아닌 모든 과목 의원, 가까운 차례 200곳까지)(잘렸으면 capped: true) */
  rivals: RivalsGot
  /** 그날 값 history(3년 개업·폐업) */
  history: Got<SnapshotValue<'history'>>
  /** 그날 값 people — 1곳당 사는 사람에 total만 쓴다 */
  people: Got<{ total: number }>
  /** 의원 과목 고르기 설정(바꾸면 다시 부르지 않고 바로 다시 그린다) */
  deptRule: DeptRule
  /** [과목 고르기] — 과목 고르기 판을 연다. 주지 않으면 단추가 없다 */
  onPickDepts?: () => void
  /** 후보 도로명 주소(카카오 k-point, 볼 때만·저장 안 함). 없으면 30m 안을 같은 건물·옆 건물로 나누지 않는다 */
  kakaoRoad?: string | null
  /** 못 받은 칸의 [다시 받기] */
  onRetry?: () => void
  /** 출처 줄을 누르면(주지 않으면 '근거와 출처' 주소로 간다) */
  onOpenSource?: (id: SourceId) => void
  /** 목차 닻(기본 시안 `sec-comp`) */
  id?: string
} & HowProps

type Filter = 'all' | DeptId

const FILTER_BTN = `group inline-flex h-9 cursor-pointer items-center whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-body text-ink transition hover:bg-canvas aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-strong aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-accent ${ds.focusRing}`
// 수 앞 4px(시안 .ob .n): 단추가 inline-flex라 이름과 수 사이 빈칸은 화면에서 지워진다
const FILTER_N = 'ml-1 font-medium tabular-nums text-muted group-aria-pressed:text-accent-strong'
const SUB_HEAD = 'text-small font-semibold text-ink'
// 시안 .kwarn: 노란 바탕 · 선 · 14px 500 · 왼쪽 주의 표 · 오른쪽 [과목 고르기]
const WARN = 'flex flex-wrap items-center gap-2 rounded-control border border-line-strong bg-warning-soft px-3 py-2.5 text-body font-medium text-ink'

const NONE_TEXT = '경쟁 의원 과목을 하나 이상 골라 주세요. 지금은 경쟁 점수를 셀 수 없어요'
const PICK = '과목 고르기'

export function RivalsSection({
  radiusM,
  rivals,
  history,
  people,
  deptRule,
  onPickDepts,
  kakaoRoad,
  onRetry,
  onOpenSource,
  id = 'sec-comp',
  howCtx,
  howOpen,
  onHow,
}: RivalsSectionProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const shown = shownOf(rivals)
  const placed = shown ? placeAll(inRange(shown.v, radiusM), deptRule) : []
  const comps = placed.filter((p) => p.role === 'rival')
  const picked = rivalDepts(deptRule)
  const count = (k: DeptId) => comps.filter((p) => p.dept === k).length
  const n = comps.length
  const total = shownOf(people)?.v.total ?? null
  const koreanAround = deptRole('korean', deptRule) === 'around'
  const koreans = placed.filter((p) => p.dept === 'korean').length
  const current: Filter = filter !== 'all' && picked.includes(filter) ? filter : 'all'
  const rows = current === 'all' ? comps : comps.filter((p) => p.dept === current)
  const fresh = comps.filter((p) => p.r.detail === undefined).length
  const roadKey = roadKeyOf(kakaoRoad)
  const pick = onPickDepts && (
    <button type="button" className={PICK_BTN} aria-haspopup="dialog" onClick={onPickDepts}>
      {PICK}
    </button>
  )

  return (
    <Section
      id={id}
      title="경쟁 의원"
      count={shown ? n : null}
      after={pick}
      aside={`범위 ${distText(radiusM)} 안 · 고른 과목 ${commaText(deptRule.rival.length)}개`}
      howId="comp"
      howCtx={howCtx}
      howOpen={howOpen}
      onHow={onHow}
    >
      {shown ? (
        <>
          {picked.length > 0 ? (
            <p data-testid="rival-line" className="text-body text-ink">
              범위 안에 경쟁 의원이 <b className="font-semibold tabular-nums">{commaText(n)}곳</b>이에요{' '}
              <span className={MUTED}>({rivalShortText(deptRule)})</span>
              {n > 0 && total !== null && (
                <>
                  {' → 경쟁 의원 1곳당 사는 사람 '}
                  <b className="font-semibold tabular-nums">{commaText(Math.floor(total / n))}명</b>
                </>
              )}
            </p>
          ) : (
            <div data-testid="rival-none" className={WARN}>
              <WarnIcon />
              <span className="min-w-0 flex-[1_1_240px]">{NONE_TEXT}</span>
              {onPickDepts && (
                <button type="button" className={SMALL_BTN} aria-haspopup="dialog" onClick={onPickDepts}>
                  {PICK}
                </button>
              )}
            </div>
          )}
          {koreanAround && (
            <p data-testid="rival-korean" className={`text-small ${MUTED}`}>
              한의원 <b className="font-semibold tabular-nums text-ink">{commaText(koreans)}곳</b>은 경쟁 수에 넣지 않고 따로 세요 · [과목
              고르기]에서 경쟁 의원으로 바꿀 수 있어요
            </p>
          )}
          {picked.length > 0 && (
            <>
              <div role="group" aria-label="과목 거르기" className="flex flex-wrap gap-1.5">
                {(['all', ...picked] as const).map((k) => (
                  <button key={k} type="button" className={FILTER_BTN} aria-pressed={current === k} onClick={() => setFilter(k)}>
                    {k === 'all' ? '전체' : deptName(k)} <span className={FILTER_N}>{commaText(k === 'all' ? n : count(k))}</span>
                  </button>
                ))}
              </div>
              <RivalTable rows={rows} all={current === 'all'} src={rivals.src} roadKey={roadKey} />
              {fresh > 0 && (
                <p data-testid="rival-fresh" className={ds.help}>
                  {`'–'인 ${commaText(fresh)}곳은 새로 경쟁 의원에 넣은 과목이에요. [다시 받기]를 누르면 의사 수·장비·진료비가 채워져요.`}
                </p>
              )}
              {isCapped(rivals) && <p className={ds.help}>{CAP_TEXT}</p>}
            </>
          )}
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
      <History radiusM={radiusM} history={history} deptRule={deptRule} onRetry={onRetry} onOpenSource={onOpenSource} />
    </Section>
  )
}

function RivalTable({ rows, all, src, roadKey }: { rows: Placed[]; all: boolean; src: SourceId; roadKey: string | null }) {
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
          {rows.map((p, i) => (
            <RivalRow key={`${p.r.name}-${i}`} p={p} roadKey={roadKey} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const missing = (t = '자료 없음') => <span className={MUTED}>{t}</span>
const DASH = '–'

function RivalRow({ p, roadKey }: { p: Placed; roadKey: string | null }) {
  const { r } = p
  const d = r.detail
  return (
    <tr className={TABLE.row}>
      <td className={TABLE.td}>
        <b className="font-semibold">{r.name}</b>
      </td>
      <td className={TABLE.tdNowrap}>{deptName(p.dept)}</td>
      <td className={TABLE.tdNum}>{r.sameBuilding ? SPOT_TEXT[spotOf(r.address, roadKey)] : distText(r.distM)}</td>
      <td className={TABLE.tdNum}>{r.doctors === null ? missing(DASH) : `${commaText(r.doctors)}명`}</td>
      <td className={TABLE.tdNum}>{d === undefined ? missing(DASH) : d.therapists === null ? missing() : `${commaText(d.therapists)}명`}</td>
      <td className={TABLE.td}>{d === undefined ? missing(DASH) : <Gear mri={d.mri} ct={d.ct} />}</td>
      <td className={TABLE.tdNum}>{r.openedYear === null ? missing(DASH) : `${r.openedYear}년`}</td>
      <td className={`${TABLE.td} text-small`}>{d === undefined ? missing(DASH) : (weekText(d.week) ?? missing())}</td>
    </tr>
  )
}

function Gear({ mri, ct }: { mri: boolean | null; ct: boolean | null }) {
  const gear = [mri ? 'MRI' : null, ct ? 'CT' : null].filter((g) => g !== null)
  if (gear.length === 0) return mri === null && ct === null ? missing() : missing(DASH)
  return (
    <span className="inline-flex flex-wrap gap-1">
      {gear.map((g) => (
        <span key={g} className={ds.chip.neutral}>
          {g}
        </span>
      ))}
    </span>
  )
}

type HistoryProps = Pick<RivalsSectionProps, 'radiusM' | 'history' | 'deptRule' | 'onRetry' | 'onOpenSource'>

// 3년 사이 문 열고 닫은 곳 — 경쟁 과목만 세고, 이 자리(30m 안) 폐업은 과목과 상관없이 보인다
function History({ radiusM, history, deptRule, onRetry, onOpenSource }: HistoryProps) {
  const shown = shownOf(history)
  const rows = shown ? historyRows(shown.v, radiusM, deptRule) : []
  const opened = rows.filter((e) => e.kind === 'open').length
  return (
    <div className="min-w-0">
      <p data-testid="rival-history-head" className={SUB_HEAD}>
        3년 사이 문 열고 닫은 곳{' '}
        {shown && <span className="font-normal text-muted">{`경쟁 의원 · 문 엶 ${commaText(opened)} · 문 닫음 ${commaText(rows.length - opened)}`}</span>}
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
                      {e.here && !e.rival && <span className={TABLE.sub}>경쟁 과목은 아니지만 이 자리라 보여요</span>}
                    </td>
                    <td className={TABLE.tdNum}>{e.here ? '이 자리' : distText(e.distM)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className={`mt-1 text-small ${MUTED}`}>범위 안에서 3년 사이 문 열거나 닫은 경쟁 의원이 없어요.</p>
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

// 주의 표(시안 ICON.warn — 16px, 경고 색)
function WarnIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 flex-none fill-current text-warning">
      <path d="M8 1.5 15.2 14H.8L8 1.5Zm-.75 4.25v4.5h1.5v-4.5h-1.5Zm0 5.5v1.5h1.5v-1.5h-1.5Z" />
    </svg>
  )
}
