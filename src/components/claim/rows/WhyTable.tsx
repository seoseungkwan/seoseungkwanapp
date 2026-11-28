import Link from 'next/link'
import { ds } from '@/components/ui/classes'
import type { WhyLine, WhySource } from '@/lib/precheck/memo'

// [왜 이렇게?] 출처 표(claim-learn REQ-9306, design.md 8절, 시안 ?s=why, notes '왜 이렇게?' 글 그대로). 줄은 props로만 받는다(출처 찾기는 lib/precheck/memo/why.ts).
// 출처를 누르면 그 설정으로 간다: 주소에는 탭·칸 키와 학습 번호만 싣고 환자 값은 싣지 않는다(AC-9306.2)

const th = 'whitespace-nowrap border-b border-line bg-canvas px-2 py-1 text-left text-caption font-medium text-muted'
const td = 'border-t border-line px-2 py-1 align-top'
const link = `${ds.focusRing} rounded-control text-small font-medium text-accent underline-offset-3 hover:underline`

/** 설정으로 가는 주소(design.md 8절): /settings?ptab={탭}&field={칸}, 학습은 ptab=learn&learn={번호} */
function hrefOf(source: Exclude<WhySource, { kind: 'none' }>): string {
  const query = source.kind === 'learn' ? new URLSearchParams({ ptab: 'learn', learn: source.id }) : new URLSearchParams({ ptab: source.tab, field: source.field })
  return `/settings?${query.toString()}`
}

function Source({ line }: { line: WhyLine }) {
  const { source, codes, chart } = line
  if (source.kind === 'none') return <span className="text-caption text-muted">출처 모름</span>
  const name = source.kind === 'learn' ? `학습: ${source.name}` : `병원 문구 › ${source.tabLabel} › ${source.label}`
  const extra = [codes.length > 0 ? `처방 ${codes.join(', ')}` : '', chart ? `차트: ${chart}` : ''].filter(Boolean).join(' · ')
  return (
    <>
      <Link href={hrefOf(source)} className={link}>
        {name}
      </Link>
      {extra && <p className="text-caption text-muted">{extra}</p>}
    </>
  )
}

/** 메모 줄마다 출처(AC-9306.1): 줄 | 출처(학습 이름 또는 병원 문구 칸) + 처방 코드·차트 줄 */
export function WhyTable({ lines }: { lines: readonly WhyLine[] }) {
  return (
    <section aria-label="이 메모가 이렇게 나온 까닭" className="col-span-2 flex min-w-0 flex-col gap-2 lg:min-h-0 lg:overflow-y-auto">
      <h4 className="text-small font-semibold text-ink">이 메모가 이렇게 나온 까닭</h4>
      <table className="w-full table-fixed border-collapse border border-line text-small">
        <colgroup>
          <col className="w-5/12" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th className={th}>줄</th>
            <th className={th}>출처</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index}>
              <td className={`${td} whitespace-pre-wrap break-words text-ink`}>{line.line}</td>
              <td className={`${td} break-words`}>
                <Source line={line} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-muted">출처를 누르면 그 설정으로 가요.</p>
    </section>
  )
}
