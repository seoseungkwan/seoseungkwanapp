import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { MemoCompare, MemoTableRow } from '@/types/precheck'
import { dayLabel } from '../dateList'

// 메모 표(AC-018.1, Phase 0 목업 화면 4). 사람마다 체크는 없다(AC-018.26). 고친 줄의 '저장 안 됨'은 AC-018.17, 저장은 Worker가 한다(AC-018.2). 줄은 props로만 받는다.
// 완료·같음 줄도 고칠 수 있다: 고치면 Worker가 완료를 푼다(AC-2201.1·AC-2202.1). 입력 중에만 막고, 막힌 칸은 읽기 전용 모양이다(AC-2201.2)

const PAGE = 8
const COMPARE_CHIP: Record<MemoCompare, string> = { 같음: ds.chip.positive, 다름: ds.chip.warning, '비트에 없음': ds.chip.neutral, '조회 못함': ds.chip.negative }
/** 입력 기록의 마지막 상태(AC-018.1·AC-018.5): 다시 연 화면에도 지난 입력의 결과가 보인다. 완료는 위 칩이 말한다 */
const JOURNAL_TEXT: Record<string, string> = { check: '확인 필요', skipped: '건너뜀', skippedByHand: '직접 확인', writing: '쓰다 멈춤', writeUnconfirmed: '쓰다 멈춤' }

export function MemoTable({ rows, valueOf, onChange, onBlur, locked, showUnsaved, focusKey = null }: { rows: readonly MemoTableRow[]; valueOf(key: string, base: string): string; onChange(key: string, text: string): void; onBlur(key: string): void; locked: boolean; showUnsaved: boolean; focusKey?: string | null }) {
  const [limit, setLimit] = useState(() => Math.max(PAGE, rows.findIndex((row) => row.key === focusKey) + 1))
  const [onlyLeft, setOnlyLeft] = useState(false)
  const filtered = onlyLeft ? rows.filter((row) => !row.done) : rows
  const shown = filtered.slice(0, limit)
  return (
    <section aria-label="메모 표" className={`${ds.panel} flex flex-col gap-2`}>
      <div className={ds.panelHead}>
        <h2 className={ds.panelTitle}>메모</h2>
        <span className={ds.count}>{filtered.length === 0 ? '0명' : `1–${shown.length} / ${filtered.length}명`}</span>
      </div>
      <div className="px-5 max-md:px-4">
        <button
          type="button"
          aria-pressed={onlyLeft}
          className={`${ds.button.secondarySmall} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-strong`}
          onClick={() => {
            setOnlyLeft(!onlyLeft)
            setLimit(PAGE)
          }}
        >
          아직 입력 안 된 것만
        </button>
      </div>
      <div className={ds.table.wrap}>
        <table aria-label="메모" className={ds.table.table}>
          <thead>
            <tr>
              <th className={ds.table.th}>진료일</th>
              <th className={ds.table.th}>차트번호</th>
              <th className={ds.table.th}>환자</th>
              <th className={ds.table.th}>처방</th>
              <th className={ds.table.th}>메모</th>
              <th className={ds.table.th}>비교</th>
              <th className={ds.table.th}>상태</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className={ds.table.emptyRow}>
                  조건에 맞는 환자가 없어요.
                </td>
              </tr>
            ) : (
              shown.map((row) => (
                <tr key={row.key} className={ds.table.row}>
                  <td className={ds.table.tdSub}>{dayLabel(row.date)}</td>
                  <td className={ds.table.td}>{row.chart}</td>
                  <td className={ds.table.td}>{row.name}</td>
                  <td className={`${ds.table.tdSub} whitespace-normal`}>{row.rxNames.join(' · ')}</td>
                  <td className="min-w-70 border-b border-line px-3 py-1.5">
                    <textarea
                      aria-label={`${row.name} 메모`}
                      rows={2}
                      maxLength={32000}
                      readOnly={locked}
                      autoFocus={row.key === focusKey}
                      className={`${locked ? ds.readonly : ds.input} h-auto py-1.5 text-small`}
                      value={valueOf(row.key, row.text)}
                      onChange={(event) => onChange(row.key, event.target.value)}
                      onBlur={() => onBlur(row.key)}
                    />
                    {row.missing.length > 0 && <p className={ds.help}>빠진 문장: {row.missing.join(' · ')}</p>}
                  </td>
                  <td className={ds.table.td}>
                    <span className={COMPARE_CHIP[row.compare]}>{row.compare}</span>
                  </td>
                  <td className={ds.table.td}>
                    <div className="flex flex-col items-start gap-0.5">
                      {row.done ? <span className={ds.chip.positive}>완료</span> : row.unfinished ? <span className={ds.chip.warning}>확인 표시 남음</span> : <span className={ds.chip.neutral}>{row.edited ? '고침' : '새 메모'}</span>}
                      {row.lastJournal !== undefined && JOURNAL_TEXT[row.lastJournal] && !row.done && <span className={ds.help}>지난 입력: {JOURNAL_TEXT[row.lastJournal]}</span>}
                      {row.unsaved && showUnsaved && <span className="text-caption font-medium text-negative">저장 안 됨</span>}
                    </div>
                  </td>
                </tr>
              ))
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
  )
}
