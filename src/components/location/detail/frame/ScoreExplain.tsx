import type { CandidateExplain, ExplainRow } from '@/lib/location/explain'
import { look } from './look'
import { FRAME_TEXT as T } from './text'

// 점수 풀이(시안 ?s=candidate .why, AC-7920.3): 머리 · 점수를 올린 것 셋 · 점수를 내린 것 셋 · 도움말.
// 줄은 부르는 쪽(CandidateFrame)이 lib/location/explain.ts explainCandidate로 고른 것을 받아 그리기만 한다(셈 없음).
// 줄 세 줄(+ 견줄 값): 점수 글(`+6점`·`−7점`·`1점 아래`) → `{이름} {값 글} · {항목}` → `세부 {s}점 · {만점 기준 글}` → `견줄 값 {글}`(있을 때만)

const ROW = 'grid grid-cols-[56px_minmax(0,1fr)] gap-2.5 border-b border-line py-1.75 text-small'
const SIDE_HEAD = 'mt-2.5 text-caption font-semibold text-ink-2'
const SUB = 'text-caption text-muted'

function Row({ row, up }: { row: ExplainRow; up: boolean }) {
  return (
    <li className={ROW}>
      <span data-line="points" className={`text-right font-semibold whitespace-nowrap tabular-nums ${up ? 'text-positive' : 'text-negative'}`}>
        {row.pointsText}
      </span>
      <div className="min-w-0">
        <p data-line="name" className="text-ink-2">
          <b className="font-semibold text-ink">{row.label}</b> {row.valueText} <span className="text-caption text-muted">· {row.groupLabel}</span>
        </p>
        <p data-line="sub" className={SUB}>
          {T.subLine(row.sub, row.fullText)}
        </p>
        {row.compareText !== null && (
          <p data-line="compare" className={SUB}>
            <span className="text-ink-2">{T.compareLine(row.compareText)}</span>
          </p>
        )}
      </div>
    </li>
  )
}

function Side({ title, aside, rows, up, none }: { title: string; aside: string; rows: readonly ExplainRow[]; up: boolean; none: string }) {
  return (
    <>
      <p className={SIDE_HEAD}>
        <span>{title}</span> <span className="ml-1 font-normal text-muted">{aside}</span>
      </p>
      {rows.length > 0 ? (
        <ul aria-label={title} className="mt-1 border-t border-line">
          {rows.map((r) => (
            <Row key={r.id} row={r} up={up} />
          ))}
        </ul>
      ) : (
        <p className="border-b border-line py-2 text-small text-muted">{none}</p>
      )}
    </>
  )
}

export function ScoreExplain({ explain }: { explain: CandidateExplain }) {
  return (
    <div role="group" aria-label={T.explain} className="min-w-0">
      <h4 className="text-body font-semibold text-ink">
        {T.explain} <span className="ml-1 text-caption font-normal text-muted">{T.explainAside}</span>
      </h4>
      <Side title={T.upTitle} aside={T.upAside} rows={explain.up} up none={T.upNone} />
      <Side title={T.downTitle} aside={T.downAside} rows={explain.down} up={false} none={T.downNone} />
      <p className={`mt-1.5 ${look.help}`}>{T.explainHelp}</p>
    </div>
  )
}
