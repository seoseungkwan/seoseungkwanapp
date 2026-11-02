'use client'

import type { ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { isErrorCode } from '@/lib/errors'
import { FollowupTool } from './FollowupTool'
import { RecallTool } from './RecallTool'
import type { PatientsTool } from './tools'
import { usePatientsWorker, type PatientsBridge, type PatientsWorkerApi, type PatientsWorkerHandle, type ReadProgress } from './usePatientsWorker'

// 비트 PC의 환자 탭(AC-610, 목업 listHead·loadingView·errorView). 불러오는 중(진행)·오류·도구 자리를 그리고 도구 몸통을 자리(ToolSlot)에 넣는다(F/U는 TASK-11, 정기 주사는 TASK-12). 문자 문구 도구는 연결 상태와 상관없이 살아 있어야 해서 이 화면 밖(PatientsEntry)에 있다(AC-613.5).
// 도구를 바꿔도 다시 읽지 않는다(이 컴포넌트는 도구가 바뀌어도 그대로 있고, 읽기는 usePatientsWorker 한 곳). 한 종류가 실패하면 그 도구만 오류다(AC-604.3).
// 화면에 오는 것은 Worker가 만든 보기 모양·오류 번호뿐이다. 오류 글은 lib/errors.ts에서만 가져온다

type ListTool = Exclude<PatientsTool, 'messages'>

const LIST_HEAD: Record<ListTool, { title: string; desc: string }> = {
  followup: { title: 'F/U 명단', desc: '다시 오시기로 한 날이 다가온 분이에요. 오시기 전날 문자로 알려 드려요.' },
  recall: { title: '정기 주사 문자 명단', desc: '연골주사 · 비타민D 주사처럼 때마다 맞는 주사의 다음 날짜가 다가온 분이에요.' },
}

// 목업의 정기 주사 글 "처음 읽는 중…7개월치"는 쓰지 않는다: 화면은 첫 읽기인지 모르고, 읽는 달 수도 그때마다 다르다. 진행은 달로 보인다(AC-612.2)
const LIST_LOADING: Record<ListTool, { title: string; unit: string; note: string }> = {
  followup: { title: '비트에서 F/U 명단을 읽는 중이에요', unit: '', note: '최근 120일을 네 번에 나눠 읽어요. 다 읽을 때까지 이 창을 열어 두세요.' },
  recall: { title: '정기 주사 기록을 읽는 중이에요', unit: ' 달', note: '다 읽을 때까지 이 창을 열어 두세요.' },
}

// 불러오는 중 줄: 위 1px line + 20(목업 .ld)
const loadingBox = 'mt-4 border-t border-line pt-5'

/** 도구 머리(목업 head). right는 오른쪽 요약 */
export function ListHead({ tool, right }: { tool: ListTool; right?: ReactNode }) {
  const { title, desc } = LIST_HEAD[tool]
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div>
        <h2 className="text-subtitle font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 max-w-170 text-small text-muted">{desc}</p>
      </div>
      {right}
    </div>
  )
}

/** 도구 몸통 자리 */
export function ToolSlot({ tool, hidden, children }: { tool: PatientsTool; hidden?: boolean; children?: ReactNode }) {
  return (
    <div data-tool-slot={tool} hidden={hidden}>
      {children}
    </div>
  )
}

/** 통로를 잇는 동안(읽기 전). 비트를 읽는다고 말하지 않는다(휴대폰도 첫 화면에 이 글을 잠깐 본다) */
export function ConnectingView({ tool }: { tool: ListTool }) {
  return (
    <>
      <ListHead tool={tool} />
      <div role="status" className={`${loadingBox} text-small text-muted`}>
        비트 PC 연결을 확인하는 중이에요
      </div>
    </>
  )
}

function LoadingView({ tool, progress }: { tool: ListTool; progress: ReadProgress }) {
  const { title, unit, note } = LIST_LOADING[tool]
  return (
    <>
      <ListHead tool={tool} />
      <div role="status" className={loadingBox}>
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-subtitle font-semibold text-ink">
          <span>{title}</span>
          {/* 몇 번째를 읽는지(다 읽고 기다리는 동안 전체를 넘지 않는다). plan 전에는 전체를 모른다 */}
          {progress.total > 0 && (
            <span className="text-accent-strong">
              {Math.min(progress.done + 1, progress.total)}/{progress.total}
              {unit}
            </span>
          )}
        </p>
        <p className="mt-1 max-w-150 text-small text-muted">{note}</p>
      </div>
    </>
  )
}

function ErrorView({ tool, code, onReload }: { tool: ListTool; code: string; onReload(): void }) {
  return (
    <>
      <ListHead tool={tool} />
      <div className="mt-4 max-w-180">
        {/* 도우미가 새로 준 번호는 errors.ts에 글이 없다 → 번호만 */}
        {isErrorCode(code) ? (
          <ErrorCard code={code} />
        ) : (
          <p role="alert" className="rounded-control bg-negative-soft px-4 py-3 text-caption text-ink-2">
            오류 번호 {code}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <button type="button" className={`${ds.button.secondary} max-md:w-full`} onClick={onReload}>
            다시 불러오기
          </button>
          <span className="text-small text-muted">다른 도구는 그대로 쓸 수 있어요.</span>
        </div>
      </div>
    </>
  )
}

// 지금 도구의 불러오는 중·오류·빈 자리. 문자 문구는 이 화면이 그리지 않는다
function ToolState({ tool, load }: { tool: PatientsTool; load: PatientsWorkerApi }) {
  if (tool === 'messages') return null
  if (load.status === 'loading') return <LoadingView tool={tool} progress={load.progress[tool]} />
  const code = load.views?.codes[tool]
  if (code) return <ErrorView tool={tool} code={code} onReload={load.reload} />
  return <ToolSlot tool={tool} />
}

export function PatientsScreen({ tool, bridge, worker }: { tool: PatientsTool; bridge: PatientsBridge; worker: PatientsWorkerHandle }) {
  const load = usePatientsWorker(bridge, worker)
  const views = load.status === 'done' ? load.views : null
  const followup = views && !views.codes.followup ? views.followup : null
  const recall = views && !views.codes.recall ? views.recall : null
  return (
    <>
      {/* 명단 도구는 다 읽은 뒤에는 다른 도구로 가도 살아 있다(숨기기만): 고른 기간·늦게 온 저장 답·오류 줄을 잃지 않는다 */}
      {followup && (
        <ToolSlot tool="followup" hidden={tool !== 'followup'}>
          <FollowupTool
            view={followup}
            storeCode={views?.codes.recall}
            active={tool === 'followup'}
            post={load.post}
            listen={load.listen}
            reload={load.reload}
            head={(summary) => <ListHead tool="followup" right={summary} />}
          />
        </ToolSlot>
      )}
      {recall && (
        <ToolSlot tool="recall" hidden={tool !== 'recall'}>
          <RecallTool
            view={recall}
            storeCode={views?.codes.store}
            // 정기 주사 보기 모양에는 날짜가 없어 F/U 보기 모양의 읽은 날을 쓴다. F/U가 실패했으면 오늘이다
            today={views?.followup?.read.to ?? todayInKorea()}
            active={tool === 'recall'}
            post={load.post}
            listen={load.listen}
            reload={load.reload}
            head={(summary) => <ListHead tool="recall" right={summary} />}
          />
        </ToolSlot>
      )}
      {!(followup && tool === 'followup') && !(recall && tool === 'recall') && <ToolState tool={tool} load={load} />}
    </>
  )
}
