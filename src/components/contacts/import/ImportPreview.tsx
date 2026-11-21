'use client'

import { useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { categoryLabel } from '@/lib/contacts/categories'
import { isEmptyPayload, type ImportPlan, type RowProblem } from '@/lib/contacts/plan'
import { look } from '../parts/look'
import { changeLabels, newCompanyLine, planCounts } from './changeLabels'
import { DisclosureIcon, FileIcon, WarnIcon } from './icons'
import { problemPlace, problemSubject, problemText } from './problemText'

// 엑셀 미리 보기(requirements.md '화면 글자' 엑셀 미리 보기, 시안 ?s=upload-preview, AC-6506.3). 주소록 자리에 한 화면으로 그린다.
// plan(buildImportPlan 결과)·fileName을 props로만 받는다 — 읽기·저장·네트워크가 없고 [넣기]는 onImport로 화면이 한다.
// 칸 값은 보이지 않는다: 칸 이름(이름표)·업체/담당자/장비 이름·새 업체의 하는 일·품목·까닭 글의 분류·날짜 값만

export type ImportPreviewProps = {
  plan: ImportPlan
  fileName: string
  /** 넣는 중: [넣기]·[그만두기]가 꺼진다 */
  saving: boolean
  /** [넣기] 실패: 아래 줄 위에 E-CONTACTS-IMPORT-FAILED 오류 카드 */
  failed: boolean
  onCancel: () => void
  onImport: () => void
}

const DATE = /(\d{4}-\d{2}-\d{2})/

export function ImportPreview({ plan, fileName, saving, failed, onCancel, onImport }: ImportPreviewProps) {
  const [showSame, setShowSame] = useState(false)
  const counts = planCounts(plan)
  const fresh = plan.changes.filter((c) => c.status === 'new')
  const changed = plan.changes.filter((c) => c.status === 'changed')
  const same = plan.changes.filter((c) => c.status === 'same')
  const nothing = isEmptyPayload(plan.payload)
  // 아래 줄은 '화면 글자' 그대로 늘 두 문장(넣지 않는 줄이 0이어도 뒤 문장을 둔다, 시안 .upbar)
  const summary = `새로 ${counts.added}곳을 더하고 ${counts.changed}곳을 고쳐요. 넣지 않는 줄 ${counts.skipped}개는 빼요.`

  const actions = (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={onCancel} disabled={saving} className={look.button}>
        그만두기
      </button>
      <button type="button" onClick={onImport} disabled={saving || nothing} className={look.primary}>
        넣기
      </button>
    </div>
  )

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-title font-semibold text-ink">엑셀 미리 보기</h1>
        {actions}
      </div>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
        <FileIcon className="shrink-0 text-positive" />
        <span className="min-w-0 break-all">{fileName}</span>
        <span aria-hidden="true" className="text-muted">
          ·
        </span>
        <span className="text-muted">{`연락처 시트 ${plan.counts.contacts}줄 · 장비 시트 ${plan.counts.equipment}줄`}</span>
      </p>

      <ul aria-label="미리 보기 숫자" className="mt-4 grid list-none grid-cols-4 border-y border-b-line border-t-line-strong">
        <SumCell label="새로" value={counts.added} unit="곳" />
        <SumCell label="바뀜" value={counts.changed} unit="곳" />
        <SumCell label="그대로" value={counts.same} unit="곳" />
        <SumCell label="넣지 않는 줄" value={counts.skipped} unit="줄" warn />
      </ul>
      <p className="mt-3 max-w-160 text-small text-muted">
        업체 이름이 같으면 고치고, 새 업체는 더해요. 엑셀에 없는 업체는 그대로 두고, 엑셀의 빈 칸은 지금 값을 지우지 않아요. 엑셀로는 아무것도 지우지 않아요. 수리 기록은 엑셀로 넣지 않아요(화면에서 장비마다 더해요).
      </p>

      {fresh.length > 0 && (
        <Section title="새로 더할 업체" count={fresh.length}>
          <ul className="list-none">
            {fresh.map((c) => (
              <li key={c.name} className="grid grid-cols-[44px_minmax(140px,200px)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 border-b border-line py-2.5">
                <span>
                  <span className={ds.chip.accent}>새로</span>
                </span>
                <Who name={c.name} sub={categoryLabel(c.category)} />
                <span className="min-w-0 text-small text-ink-2">{newCompanyLine(c)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {changed.length > 0 && (
        <Section title="바뀌는 업체" count={changed.length} note="바뀌는 칸만 보여 줘요">
          <ul className="list-none">
            {changed.map((c) => (
              <li key={c.name} className="grid grid-cols-[44px_minmax(140px,200px)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 border-b border-line py-2.5">
                <span>
                  <span className={ds.chip.warning}>바뀜</span>
                </span>
                <Who name={c.name} sub={categoryLabel(c.category)} />
                <span className="min-w-0 text-small text-ink-2">
                  {changeLabels(c).map((label) => (
                    <span
                      key={label}
                      data-tag=""
                      className="mr-1 mb-1 inline-flex h-5.5 items-center whitespace-nowrap rounded-control border border-line bg-canvas px-1.5 text-caption text-ink-2"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {plan.problems.length > 0 && (
        <Section title="넣지 않는 줄" count={plan.problems.length} note="이 줄만 빼고 나머지는 넣을 수 있어요">
          <ul className="list-none">
            {plan.problems.map((p, i) => (
              <ProblemRow key={`${p.sheet}-${p.row}-${i}`} problem={p} />
            ))}
          </ul>
        </Section>
      )}

      {(same.length > 0 || plan.untouched.length > 0) && (
        <Section title="그대로인 업체" count={same.length}>
          {same.length > 0 && (
            <>
              <button
                type="button"
                aria-expanded={showSame}
                onClick={() => setShowSame((open) => !open)}
                className={`flex w-full cursor-pointer items-center gap-1.5 border-b border-line py-2.5 text-left font-medium text-ink-2 ${ds.focusRing}`}
              >
                <DisclosureIcon className={showSame ? 'shrink-0 rotate-90' : 'shrink-0'} />
                {`그대로인 업체 ${same.length}곳 보기`}
              </button>
              {showSame && <p className="border-b border-line py-2.5 text-small text-ink-2">{same.map((c) => c.name).join(' · ')}</p>}
            </>
          )}
          {plan.untouched.length > 0 && (
            <p className="mt-3 max-w-160 text-small text-muted">{`엑셀에 없는 업체 ${plan.untouched.length}곳(${plan.untouched.join('·')})도 그대로 둬요.`}</p>
          )}
        </Section>
      )}

      {failed && (
        <div className="mt-8">
          <ErrorCard code="E-CONTACTS-IMPORT-FAILED" />
        </div>
      )}
      <div className={`${failed ? 'mt-4' : 'mt-8'} flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-line-strong bg-surface py-3`}>
        <p className="min-w-0 flex-[1_1_320px] text-small text-ink-2">{summary}</p>
        {actions}
      </div>
    </div>
  )
}

function SumCell({ label, value, unit, warn = false }: { label: string; value: number; unit: string; warn?: boolean }) {
  return (
    <li className="min-w-0 border-l border-line px-5 py-3 first:border-l-0 first:pl-0">
      <p className="flex items-center gap-1.5 text-small text-muted">
        {warn && <WarnIcon />}
        {label}
      </p>
      <p className={warn ? 'text-metric font-semibold tabular-nums text-warning' : 'text-metric font-semibold tabular-nums text-ink'}>
        {value}
        <small className="ml-0.5 text-body font-medium tracking-normal text-muted">{unit}</small>
      </p>
    </li>
  )
}

function Section({ title, count, note, children }: { title: string; count: number; note?: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-2 border-b border-line-strong pb-1.5">
        <h2 className="flex items-center gap-2 text-subtitle font-semibold text-ink">
          {title} <span className="ml-1 font-medium text-muted tabular-nums">{count}</span>
        </h2>
        {note && <p className="text-small text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}

function Who({ name, sub }: { name: string; sub: string }) {
  return (
    <span className="min-w-0">
      <b className="font-semibold text-ink">{name}</b>
      <small className="block text-caption text-muted">{sub}</small>
    </span>
  )
}

function ProblemRow({ problem }: { problem: RowProblem }) {
  const subject = problemSubject(problem)
  // 까닭 글 안 날짜(2026-11-21처럼)는 줄이 바뀌어도 끊기지 않게
  const why = problemText(problem)
    .split(DATE)
    .map((part, i) => (i % 2 === 1 ? <span key={i} className="whitespace-nowrap">{part}</span> : part))
  return (
    <li className="grid grid-cols-[16px_minmax(140px,200px)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 border-b border-line py-2.5">
      <WarnIcon className="mt-0.5 self-start" />
      <span className="min-w-0 font-semibold text-ink tabular-nums">
        {problemPlace(problem)}
        {subject !== '' && <small className="block text-caption font-normal text-muted">{subject}</small>}
      </span>
      <span className="min-w-0 text-ink-2">{why}</span>
    </li>
  )
}
