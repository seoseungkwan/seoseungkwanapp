import { ds } from '@/components/ui/classes'
import { SAMPLE_LABELS } from '@/lib/precheck/memo/onboarding/sampleVisits'

// 처음 질문의 보기 메모 칸(clinic-profile AC-6614.6, design.md 16절): 가짜 진료 3건을 진짜 메모 엔진이 지금 답으로 만든 글(previewMemos).
// 부르는 쪽이 질문 뒤에 놓는다 — 폰은 아래, 넓은 화면(md)은 오른쪽. 글은 손대지 않고 그대로 보인다(엔진 그대로의 모양)

const DRUG_NOTE = '약은 비트를 연결한 뒤 설정 → 병원 문구 → 시술별 문구와 약에서 정해요.'

/** 보기 메모 하나: 칸 이름 + 엔진 글 */
export function SampleMemo({ label, memo }: { label: string; memo: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-caption text-muted">{label}</p>
      <pre className="m-0 whitespace-pre-wrap break-words rounded-control bg-canvas px-3 py-2 font-sans text-small text-ink">{memo}</pre>
    </div>
  )
}

export function ExampleAside({ memos }: { memos: readonly string[] }) {
  return (
    <aside aria-label="보기 메모" className={`${ds.panel} flex min-w-0 flex-col gap-3 p-5 max-md:p-4 md:w-80 md:shrink-0`}>
      <h3 className="text-body font-semibold text-ink">보기 메모</h3>
      {memos.map((memo, at) => (
        <SampleMemo key={SAMPLE_LABELS[at] ?? at} label={SAMPLE_LABELS[at] ?? ''} memo={memo} />
      ))}
      <p className={ds.help}>{DRUG_NOTE}</p>
    </aside>
  )
}
