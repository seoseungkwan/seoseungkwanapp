import { ds } from '@/components/ui/classes'

// 더하기 판 '비트에서 찾기' 결과(spec clinic-calendar AC-5905.6, 시안 ?s=new·기본값 14번). 울타리 안 부품:
// Worker 찾기 결과(성별·나이·마지막 내원)를 그리기만 하고, 고르면 이름·차트번호 두 칸만 onPick으로 넘긴다(성별·나이·마지막 내원은 화면 밖으로 안 간다).
// 한 명이면 화면이 바로 채우고 무엇을 채웠는지(filled)만 알린다. 없으면 신환 안내

/** 찾은 사람 한 줄. workers/calendar found 값과 같은 모양(울타리 때문에 workers 타입을 가져오지 않는다) */
export type BitPick = { chart: string; name: string; sex: '남' | '여' | ''; age: number | null; last: string | null }

export type BitPicksProps = {
  rows: readonly BitPick[] | null // null = 아직 찾지 않음
  more?: boolean // 20명을 넘어 잘림
  filled?: 'chart' | 'name' | null // 한 명이라 화면이 채운 칸
  today: string
  onPick: (picked: { name: string; chart: string }) => void
}

// 마지막 내원: 올해면 MM/DD, 아니면 YYYY/MM/DD, 없으면 –
function lastText(last: string | null, today: string): string {
  if (!last) return '–'
  const [y, m, d] = last.split('-')
  return y === today.slice(0, 4) ? `${m}/${d}` : `${y}/${m}/${d}`
}

function detail(row: BitPick, today: string): string {
  return [row.sex, row.age === null ? '' : `${row.age}세`, `마지막 내원 ${lastText(row.last, today)}`].filter(Boolean).join(' · ')
}

export function BitPicks({ rows, more = false, filled = null, today, onPick }: BitPicksProps) {
  if (rows === null) return null
  if (rows.length > 1) {
    return (
      <div role="listbox" aria-label="같은 이름 고르기" className="overflow-clip rounded-control border border-line-strong bg-surface">
        <div className="border-b border-line bg-canvas px-3 py-1.5 text-caption font-semibold text-ink-2">비트에 같은 이름이 {rows.length}명 있어요 · 골라 주세요</div>
        {rows.map((row) => (
          <button
            key={row.chart}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => onPick({ name: row.name, chart: row.chart })}
            className={`flex w-full cursor-pointer items-baseline gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-accent-soft max-md:min-h-11 ${ds.focusRing}`}
          >
            <b className="font-semibold text-ink tabular-nums">{row.chart}</b>
            <span className="text-ink">{row.name}</span>
            <small className="ml-auto text-caption text-muted">{detail(row, today)}</small>
          </button>
        ))}
        {more ? <p className="border-t border-line px-3 py-1.5 text-caption text-muted">찾은 환자가 많아요. 이름을 더 적거나 차트번호로 찾아 주세요</p> : null}
      </div>
    )
  }
  if (filled) return <p className="text-caption font-medium text-positive">✓ 비트에서 찾아 {filled === 'chart' ? '차트번호를' : '이름을'} 채웠어요</p>
  if (rows.length === 0) return <p className="text-caption text-muted">비트에 없어요. 신환이면 차트번호는 비워 두세요.</p>
  return null
}
