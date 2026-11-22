'use client'

// 입지 분석 › 근거와 출처(specs/location TASK-28 · REQ-7906 · AC-7906.3, 시안 ?s=sources).
// 출처·법 근거·없는 자료·점수 매기는 법을 lib/location의 목록(SOURCES·SOURCE_GROUPS·VIA_TEXT·KEY_TEXT·LAW_BASIS·MISSING·
// SCORE_GROUPS·DEFAULT_SCORE_RULE)에서만 읽어 그린다 — 출처 글을 여기 따로 적지 않는다. 머리·아래 글만 시안 그대로다.
// 받은 지금 설정(rule)이 처음 값과 다르면 그 칸 아래에 '지금' 값을 함께 보인다. 줄마다 닻 #src-<id>·#law-<id>·#src-score,
// 주소 끝이 닻이면 그 줄을 가운데로 보이고 표시한다. props만 받는다(읽기·저장·부르기 없음). PC 모양 하나(폰 전용 모양 없음)

import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { DEFAULT_SCORE_RULE, SCORE_GROUPS, type ScoreRule } from '@/lib/location/score'
import { KEY_TEXT, LAW_BASIS, MISSING, SOURCE_GROUPS, SOURCES, VIA_TEXT, type Source } from '@/lib/location/sources'
import { bandsText, itemRuleText, lessText, sameBands, sameItem } from './ruleText'

export type SourcesViewProps = {
  /** 지금 점수 설정(location_settings.score_rule을 fillScoreRule로 채운 것). 없으면 처음 설정(DEFAULT_SCORE_RULE)만 보인다 */
  rule?: ScoreRule
  /** 출처 id → 기준 날짜 글(그날 값·자료 파일의 기준, 화면 글 그대로). 없는 출처는 '–' */
  asOf?: Readonly<Partial<Record<string, string>>>
}

const EMPTY = '–'

const sectionHead = 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5'
const h2 = 'text-subtitle font-semibold text-ink'
const aside = 'text-small text-muted'
const lead = 'mt-2 max-w-190 text-small text-ink-2'
const tableWrap = `mt-3 ${ds.table.wrap}`
const th = 'h-10 whitespace-nowrap border-b border-line px-3 text-left align-middle font-medium text-muted first:pl-0 last:pr-0'
const thNum = `${th} text-right`
const td = 'h-11 border-b border-line px-3 py-2 align-top text-ink first:pl-0 last:pr-0'
const tdNum = `${td} text-right tabular-nums`
const groupCell = 'h-9 px-0 pt-4 pb-1 align-bottom text-caption font-semibold text-muted'
const sub = 'block text-caption text-muted'
const now = 'block text-caption font-medium text-accent-strong'
const link = `rounded-control text-accent underline-offset-3 hover:underline ${ds.focusRing}`
const hitBg = 'bg-warning-soft'

function OutLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
    </a>
  )
}

/** 지금 값 한 줄(처음 값과 다를 때만) */
function Now({ children }: { children: ReactNode }) {
  return (
    <span data-now="" className={now}>
      지금 {children}
    </span>
  )
}

const readHash = () => {
  const raw = window.location.hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/** 주소 끝 닻(#src-…·#law-…)이 이 화면 안의 줄이면 그 줄 id. 열 때와 닻이 바뀔 때 그 줄을 가운데로 보인다 */
function useHashTarget(root: RefObject<HTMLElement | null>): string | null {
  const [hit, setHit] = useState<string | null>(null)
  useEffect(() => {
    const follow = () => {
      const id = readHash()
      const el = id ? document.getElementById(id) : null
      if (!el || !root.current?.contains(el)) {
        setHit(null)
        return
      }
      setHit(id)
      el.scrollIntoView?.({ block: 'center' })
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [root])
  return hit
}

const viaText = (s: Source) => (s.key ? `${VIA_TEXT[s.via]} · ${KEY_TEXT[s.key]}` : VIA_TEXT[s.via])

function SourceTable({ hit, asOf }: { hit: string | null; asOf: SourcesViewProps['asOf'] }) {
  return (
    <section aria-labelledby="src-head">
      <div className={sectionHead}>
        <h2 id="src-head" className={h2}>
          숫자가 어디서 왔나
        </h2>
        <span className={aside}>기관·자료 이름은 공개한 곳에 적힌 그대로예요</span>
      </div>
      <p className={lead}>
        화면의 숫자 아래 작은 글씨를 누르면 이 표의 그 줄로 와요. 자료는 볼 때 받고, 후보를 저장할 때 그날 값으로 굳혀 둬요(기준 날짜가 함께 남아요). 카카오맵 값만은 열 때마다 새로 불러와요, 저장하지 않아요.
      </p>
      <div className={tableWrap}>
        <table className={`${ds.table.table} min-w-280`}>
          <colgroup>
            <col className="w-50" />
            <col className="w-47.5" />
            <col className="w-30" />
            <col className="w-27.5" />
            <col className="w-45" />
            <col />
            <col className="w-42.5" />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>화면에 나온 숫자</th>
              <th className={th}>기관 · 자료 이름</th>
              <th className={th}>기준 날짜</th>
              <th className={th}>고쳐지는 주기</th>
              <th className={th}>단위</th>
              <th className={th}>왜 보나(근거)</th>
              <th className={th}>받는 길 · 이용 조건</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_GROUPS.flatMap((group) => [
              <tr key={`group-${group}`}>
                <td colSpan={7} className={groupCell}>
                  {group}
                </td>
              </tr>,
              ...SOURCES.filter((s) => s.group === group).map((s) => {
                const id = `src-${s.id}`
                return (
                  <tr key={id} id={id} data-hit={hit === id ? 'true' : undefined} className={hit === id ? hitBg : undefined}>
                    <td className={`${td} font-semibold`}>{s.shows}</td>
                    <td className={td}>
                      {s.org}
                      <span className={sub}>{s.url ? <OutLink href={s.url}>{s.name}</OutLink> : s.name}</span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{asOf?.[s.id] ?? EMPTY}</td>
                    <td className={td}>{s.cycle}</td>
                    <td className={td}>{s.unit}</td>
                    <td className={td}>{s.why}</td>
                    <td className={`${td} text-ink-2`}>
                      {viaText(s)}
                      <span className={sub}>이용 조건: {s.terms}</span>
                    </td>
                  </tr>
                )
              }),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ScoreTable({ hit, rule }: { hit: string | null; rule: ScoreRule | undefined }) {
  const base = DEFAULT_SCORE_RULE
  const weights = SCORE_GROUPS.map((g) => rule?.weights[g.id] ?? base.weights[g.id])
  const bandsNow = rule && !sameBands(rule.bands, base.bands) ? rule.bands : null
  return (
    <section id="src-score" aria-labelledby="score-head" data-hit={hit === 'src-score' ? 'true' : undefined}>
      <div className={`${sectionHead} ${hit === 'src-score' ? hitBg : ''}`}>
        <h2 id="score-head" className={h2}>
          점수는 이렇게 매겨요
        </h2>
        <span className={aside}>지금 무게 {weights.join(' · ')}</span>
      </div>
      <p className={lead}>
        숫자는 처음 값이에요. 지금 설정이 처음 값과 다르면 그 칸 아래에 &apos;지금&apos; 값을 함께 적어요. 범위 안 개수 기준의 처음 값은 기본 범위 1km(약 3.14km²)에 맞췄어요.
      </p>
      <div className={tableWrap}>
        <table className={`${ds.table.table} min-w-280`}>
          <colgroup>
            <col className="w-80" />
            <col className="w-20" />
            <col />
            <col className="w-80" />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>항목 · 세부 항목</th>
              <th className={thNum}>무게</th>
              <th className={th}>만점 기준</th>
              <th className={th}>왜</th>
            </tr>
          </thead>
          <tbody>
            {SCORE_GROUPS.flatMap((g) => {
              const w = base.weights[g.id]
              const wNow = rule && rule.weights[g.id] !== w ? rule.weights[g.id] : null
              return [
                <tr key={g.id} id={`score-${g.id}`} data-row={`group-${g.id}`}>
                  <td className={td}>
                    <b className="font-semibold">{g.name}</b>
                    {!g.scan && <span className={sub}>후보에서만</span>}
                  </td>
                  <td className={`${tdNum} font-semibold`}>
                    {w}
                    {wNow !== null && <Now>{wNow}</Now>}
                  </td>
                  <td colSpan={2} className={`${td} text-ink-2`}>
                    {g.note && <span className="block">{g.note}</span>}
                    {g.id === 'people' && <span className="block">셀 나이대 {bandsText(base.bands)}</span>}
                    {g.id === 'people' && bandsNow && <Now>{bandsText(bandsNow)}</Now>}
                  </td>
                </tr>,
                ...g.subs.map((s) => {
                  const item = base.items[s.id]
                  const itemNow = rule?.items[s.id]
                  const changed = itemNow && !sameItem(itemNow, item) ? itemNow : null
                  return (
                    <tr key={s.id} id={`score-${s.id}`} data-row={`sub-${s.id}`}>
                      <td className={td}>
                        <span className="block pl-4">
                          {s.label}
                          {g.scan && !s.scan && <span className={sub}>후보에서만</span>}
                        </span>
                      </td>
                      <td className={tdNum}>
                        {item.w}
                        {changed && changed.w !== item.w && <Now>{changed.w}</Now>}
                      </td>
                      <td className={td}>
                        {itemRuleText(item, s.unit)}
                        {s.flip && <span className={sub}>적을수록 좋음으로 고르면 {lessText(s.flip.best, s.flip.worst, s.unit)}</span>}
                        {changed && itemRuleText(changed, s.unit) !== itemRuleText(item, s.unit) && <Now>{itemRuleText(changed, s.unit)}</Now>}
                      </td>
                      <td className={`${td} text-ink-2`}>{s.why}</td>
                    </tr>
                  )
                }),
              ]
            })}
          </tbody>
        </table>
      </div>
      <p className={`mt-1.5 ${ds.help}`}>
        세부 항목마다 만점 기준으로 0~100점을 매기고(사이는 곧은 비례, 버림), 세부 무게로 섞어 항목 점수를 내요. 종합은 항목 점수 × 무게 ÷ 값 있는 항목 무게 합을 항목마다 버려 더해요. 값이 없는 세부 항목·항목은 빼고 남은 무게로 매겨요. 동네 훑기는 동 단위로 앞의 세 항목만, &apos;후보에서만&apos;이 붙지 않은 세부 항목만 써요. 세부 무게와 만점 기준은 동네 훑기의 점수 무게 판 [세부]에서 바꿔요.
      </p>
    </section>
  )
}

function LawTable({ hit }: { hit: string | null }) {
  return (
    <section aria-labelledby="law-head">
      <div className={sectionHead}>
        <h2 id="law-head" className={h2}>
          법 근거
        </h2>
        <span className={aside}>조문을 열어 확인하고 쉬운 말로 줄였어요</span>
      </div>
      <div className={tableWrap}>
        <table className={`${ds.table.table} min-w-240`}>
          <colgroup>
            <col className="w-37.5" />
            <col className="w-62.5" />
            <col />
            <col className="w-55" />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>무엇</th>
              <th className={th}>법 · 조문</th>
              <th className={th}>쉬운 한 줄</th>
              <th className={th}>화면에서 쓰는 곳</th>
            </tr>
          </thead>
          <tbody>
            {LAW_BASIS.map((l) => {
              const id = `law-${l.id}`
              return (
                <tr key={id} id={id} data-hit={hit === id ? 'true' : undefined} className={hit === id ? hitBg : undefined}>
                  <td className={td}>
                    <b className="font-semibold">{l.topic}</b>
                  </td>
                  <td className={td}>
                    {l.url ? <OutLink href={l.url}>{l.law}</OutLink> : l.law}
                    <span className={sub}>{l.article}</span>
                  </td>
                  <td className={td}>{l.summary}</td>
                  <td className={`${td} text-ink-2`}>{l.usedIn}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={`mt-1.5 ${ds.help}`}>건물 요건 표의 ○✕는 법을 대신 판단하지 않아요. 보건소·장비 업체·인테리어 업체에 확인하는 차례표예요.</p>
    </section>
  )
}

function MissingTable() {
  return (
    <section aria-labelledby="missing-head">
      <div className={sectionHead}>
        <h2 id="missing-head" className={h2}>
          없는 자료
        </h2>
        <span className={aside}>공개 자료가 없는 것은 화면에 솔직히 적어요</span>
      </div>
      <div className={tableWrap}>
        <table className={`${ds.table.table} min-w-240`}>
          <colgroup>
            <col className="w-75" />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th className={th}>없는 것</th>
              <th className={th}>대신 이렇게 해요</th>
            </tr>
          </thead>
          <tbody>
            {MISSING.map((m) => (
              <tr key={m.id}>
                <td className={td}>
                  <b className="font-semibold">{m.what}</b>
                </td>
                <td className={td}>{m.instead}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** '근거와 출처' 안쪽 탭: 숫자가 어디서 왔나 → 점수는 이렇게 매겨요 → 법 근거 → 없는 자료(시안 차례) */
export function SourcesView({ rule, asOf }: SourcesViewProps) {
  const root = useRef<HTMLDivElement>(null)
  const hit = useHashTarget(root)
  return (
    <div ref={root} className="mt-5 grid gap-10 *:min-w-0">
      <SourceTable hit={hit} asOf={asOf} />
      <ScoreTable hit={hit} rule={rule} />
      <LawTable hit={hit} />
      <MissingTable />
    </div>
  )
}
