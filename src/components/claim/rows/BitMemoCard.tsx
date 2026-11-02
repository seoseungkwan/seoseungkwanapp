import { ds } from '@/components/ui/classes'
import { errorInfo, isErrorCode } from '@/lib/errors'
import type { DateRange } from '@/types/dates'
import type { MemoCompare, VisitMemo } from '@/types/precheck'

// '비트에 저장된 청구메모' 카드(AC-018.25, design.md 19-12, 입력 쪽 승인 목업). 환자 글이라 이 폴더에 둔다. 줄은 props로만 받는다.
// 같고 다름은 AC-016.2의 글자 그대로 비교다(원본 카드는 글자·숫자만 견준다). [이 메모로 바꾸기]는 카드 밖 줄에 있다(AC-018.14)

/** 읽기 상태: 아직 받지 않음 · 읽는 중 · 받음 · 실패. at은 그 내용을 받은 시각(HH:MM), has는 보일 내용이 있는가 */
export type BitCardState = { status: 'never' | 'reading' | 'ok' | 'failed'; at: string | null; count: number; period: DateRange | null; has: boolean; code: string | null }

const short = (ymd: string) => `${ymd.slice(5, 7)}/${ymd.slice(8)}`
/** "10/01~10/12 · 12건" */
export const bitSpan = ({ period, count }: Pick<BitCardState, 'period' | 'count'>) => (period ? `${short(period.from)}~${short(period.to)} · ${count}건` : `${count}건`)
/** 오류 문구 하나: errors.ts의 글, 없는 번호면 번호만 */
export const bitErrorText = (code: string | null) => (code && isErrorCode(code) ? errorInfo(code).what : `오류 번호 ${code ?? 'E-CLAIM-PARTIAL'}`)

const BADGE: Record<MemoCompare, { label: string; chip: string }> = {
  같음: { label: '지금 메모와 같음', chip: ds.chip.positive },
  다름: { label: '지금 메모와 다름', chip: ds.chip.warning },
  '비트에 없음': { label: '비트에 없음', chip: ds.chip.neutral },
  '조회 못함': { label: '불러오지 못함', chip: ds.chip.negative },
}
const note = 'text-caption text-muted'

export function BitMemoCard({ row, state, afterEntry, locked }: { row: Pick<VisitMemo, 'compare' | 'inBit'>; state: BitCardState; afterEntry: boolean; locked: boolean }) {
  const badge = BADGE[row.compare]
  const body = (text: string, none = false) => <p className={none ? 'text-small text-muted' : 'whitespace-pre-wrap break-words text-small text-ink'}>{text}</p>
  const stored = () => (row.compare === '비트에 없음' ? body('비트에 저장된 청구메모가 없어요.', true) : row.compare === '조회 못함' ? body('이 사람 메모는 읽지 못했어요. 비어 있다는 뜻이 아니에요.', true) : body(row.inBit ?? '', false))

  let chips = null
  let content = null
  let top = null
  let foot = null
  if (state.status === 'reading') {
    chips = <span className={ds.chip.accent}>불러오는 중</span>
    content = body('비트에서 기간 전체 청구메모를 불러오는 중이에요…', true)
  } else if (state.status === 'never') {
    content = body(`아직 불러오지 않았어요. ${locked ? '입력이 끝난 뒤 ' : ''}[비트 메모 전체 불러오기]를 눌러 주세요.`, true)
    foot = <p className={note}>비트에서 읽기만 해요. 비트 로그인 창은 뜨지 않아요.</p>
  } else if (state.status === 'failed') {
    chips = (
      <>
        <span className={ds.chip.negative}>불러오지 못함</span>
        {state.has && row.compare !== '조회 못함' && <span className={badge.chip}>{badge.label}</span>}
      </>
    )
    top = (
      <>
        <p className="text-caption font-medium text-negative">{bitErrorText(state.code)}</p>
        {state.has && state.at && (
          <p className={note}>
            아래는 {state.at}에 불러온 내용 · {bitSpan(state)}
          </p>
        )}
      </>
    )
    content = state.has ? stored() : null
  } else {
    chips = <span className={badge.chip}>{badge.label}</span>
    content = stored()
    foot = (
      <p className={note}>
        {bitSpan(state)} · {state.at}에 불러옴
      </p>
    )
  }

  return (
    <div role="group" aria-label="비트에 저장된 청구메모" className="flex min-w-0 flex-col gap-1 rounded-control border border-line bg-canvas px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <b className="text-small font-semibold text-ink">비트에 저장된 청구메모</b>
        {chips}
      </div>
      {top}
      {content}
      {foot}
      {afterEntry && state.at && state.status !== 'reading' && state.status !== 'never' && <p className={note}>{state.at} 뒤에 비트에 입력한 사람이에요. 다시 불러오면 맞춰져요.</p>}
    </div>
  )
}
