'use client'

import { useMemo, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { ClaimVisitView } from '@/types/precheck'
import { filterCount, filterVisits, type VisitFilter } from './resultFilter'
import { GRADE_LABEL, GRADES } from './rows/grade'
import { VisitDetail } from './rows/VisitDetail'
import { VisitRows } from './rows/VisitRows'

// 2단계 점검 결과(AC-013.3, 목업 화면 3): 거르기 → 왼쪽 환자 목록 · 오른쪽 환자 자세히.
// 등급·규칙·찾기는 이 화면 메모리에만 있다. 목업의 [다음: 메모 확인]·메모 초안·'나중에 확인'은 그리지 않는다(TASK-18)

const PAGE = 8
const pill = `${ds.button.secondarySmall} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-strong`

const FILTERS: { key: VisitFilter; label: string }[] = [
  { key: 'warned', label: '경고 있는 환자' },
  ...GRADES.map((grade) => ({ key: grade, label: GRADE_LABEL[grade] })),
  { key: 'dx', label: '추천 상병 확인' },
  { key: 'clean', label: '경고 없음' },
]

export function ResultStep({ visits, groups, hasDx }: { visits: readonly ClaimVisitView[]; groups: readonly { ruleId: string; title: string; visitKeys: readonly string[] }[]; hasDx: boolean }) {
  const [filter, setFilter] = useState<VisitFilter>('warned')
  const [ruleId, setRuleId] = useState('')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)

  const titles = useMemo(() => new Map(groups.map((group) => [group.ruleId, group.title])), [groups])
  // 고른 규칙이 [다시 점검]으로 목록에서 사라지면 거르기를 푼다: 고르기 칸은 '모든 규칙'인데 목록만 비어 경고가 없는 것처럼 보이면 안 된다
  const activeRule = titles.has(ruleId) ? ruleId : ''
  const filtered = useMemo(() => filterVisits(visits, filter, activeRule, query), [visits, filter, activeRule, query])
  const shown = filtered.slice(0, limit)
  const current = filtered.find((visit) => visit.key === selected) ?? filtered[0] ?? null

  if (visits.length === 0) return <p className="text-small text-muted">이 기간에 진료가 없어요.</p>

  return (
    <>
      <div className="flex flex-col gap-2">
        <div role="group" aria-label="환자 거르기" className="flex flex-wrap items-center gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={pill}
              aria-pressed={filter === key}
              onClick={() => {
                setFilter(key)
                setLimit(PAGE)
              }}
            >
              {label} <b className="font-semibold">{filterCount(visits, key)}</b>
            </button>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <select
            aria-label="규칙으로 거르기"
            className={ds.input}
            value={activeRule}
            onChange={(event) => {
              setRuleId(event.target.value)
              setLimit(PAGE)
            }}
          >
            <option value="">모든 규칙</option>
            {groups.map((group) => (
              <option key={group.ruleId} value={group.ruleId}>
                {group.ruleId} {group.title} ({group.visitKeys.length}건)
              </option>
            ))}
          </select>
          <input
            aria-label="환자 찾기"
            className={ds.input}
            placeholder="이름이나 차트번호로 찾기"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setLimit(PAGE)
            }}
          />
        </div>
      </div>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className={`${ds.panel} flex flex-col gap-2`}>
          <div className={ds.panelHead}>
            <h2 className={ds.panelTitle}>환자</h2>
            <span className={ds.count}>{filtered.length === 0 ? '0명' : `1–${shown.length} / ${filtered.length}명`}</span>
          </div>
          <div className={ds.table.wrap}>
            <table aria-label="환자" className={ds.table.table}>
              <thead>
                <tr>
                  <th className={ds.table.th}>진료일</th>
                  <th className={ds.table.th}>차트번호</th>
                  <th className={ds.table.th}>환자</th>
                  <th className={ds.table.th}>경고</th>
                  <th className={ds.table.th}>추천 상병</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={ds.table.emptyRow}>
                      조건에 맞는 환자가 없어요.
                    </td>
                  </tr>
                ) : (
                  <VisitRows visits={shown} selected={current?.key ?? null} onSelect={setSelected} />
                )}
              </tbody>
            </table>
          </div>
          {shown.length < filtered.length && (
            <div className="border-t border-line px-5 py-3 max-md:px-4">
              <button type="button" className={ds.textButton} onClick={() => setLimit(limit + PAGE)}>
                다음 {PAGE}명
              </button>
            </div>
          )}
        </section>
        {current && (
          <section className={ds.panel}>
            <div className={ds.panelBody}>
              <VisitDetail key={current.key} visit={current} titles={titles} hasDx={hasDx} />
            </div>
          </section>
        )}
      </div>
    </>
  )
}
