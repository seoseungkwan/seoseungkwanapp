'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { memoProblem } from '@/lib/forms/ai'
import { fileNameOf, noticeTitle } from '@/lib/forms/notice'
import { downloadPosterPng } from '@/lib/forms/png'
import { deleteNotice, insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import {
  LEAVE_CONFIRM,
  formsReducer,
  initialState,
  isDirty,
  previewNotice,
  readyNotice,
  tidyAnswerOf,
  type TidyAnswer,
} from './formsState'
import { GuideWorkspace } from './GuideWorkspace'
import { NoticeEditor } from './NoticeEditor'
import { NoticeList, type SavedList } from './NoticeList'
import { Poster } from './Poster'
import { PreviewPanel } from './PreviewPanel'
import { useBackgrounds } from './useBackgrounds'

// 서식 탭 화면 — 휴진 안내 (spec forms REQ-3501~3507, design.md 10절, 승인 시안 docs/mockups/forms/screen.html).
// 도구 줄 [휴진 안내]·[환자 안내문](spec forms-guide REQ-4501, design.md 9절): 고른 도구 한 벌만 보인다. 환자 안내문(GuideWorkspace)은
// 처음 누를 때 만들고 그 뒤로는 숨기기만 해, 두 도구 모두 오가도 고치던 값이 남는다(버릴지 묻지 않는다). 인쇄 사본은 보이는 도구의 것 하나뿐이다.
// 상태는 이 한 곳(useReducer, formsState.ts). 대충 적은 글은 [정리하기] 때만 /api/ai/forms로 보내고 저장하지 않는다(ADR-028).
// 저장은 브라우저 Supabase + RLS(lib/storage/formNotices). 인쇄는 window.print — 인쇄 면에는 A4 한 장의 안내문만 나온다(AC-3506.1)

const TIDY_PATH = '/api/ai/forms'
const DELETE_CONFIRM = '이 안내문을 지울까요?'
// 서식 화면에 있을 때만 쓰이는 인쇄 쪽 크기(globals.css는 고치지 않는다)
const PRINT_PAGE = '@media print { @page { size: A4 portrait; margin: 0 } }'
const BUSY: TidyAnswer = { kind: 'error', code: 'E-AI-BUSY' }
type Tool = 'closure' | 'guide'
const TOOLS: readonly [Tool, string][] = [
  ['closure', '휴진 안내'],
  ['guide', '환자 안내문'],
]

// 던지지 않는다. 연결이 끊기면 E-AI-BUSY, 몸통이 JSON이 아니면 null로 읽어 tidyAnswerOf가 가른다.
// redirect: 'manual' — 로그인이 끊겨 돌려보내는 답을 따라가지 않는다(E-AI-FAILED로 보인다)
async function askTidy(text: string): Promise<TidyAnswer> {
  try {
    const response = await fetch(TIDY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      redirect: 'manual',
      cache: 'no-store',
    })
    const body: unknown = await response.json().catch(() => null)
    return tidyAnswerOf(response.status, body)
  } catch {
    return BUSY
  }
}

export function FormsScreen({ today }: { today?: string }) {
  const [state, dispatch] = useReducer(formsReducer, today, (given) => initialState(given ?? todayInKorea()))
  const [imaging, setImaging] = useState(false)
  const [tool, setTool] = useState<Tool>('closure')
  const [guideSeen, setGuideSeen] = useState(false) // 환자 안내문을 한 번이라도 눌렀다(그때 만들고 목록을 읽는다)
  const posterRef = useRef<HTMLDivElement>(null)
  // 늦게 온 답 버리기: 다른 안내문으로 옮기면 번호를 올린다
  const tidyNo = useRef(0)
  const listNo = useRef(0)
  // 같은 틀(render) 안에서 두 번 눌러도 한 번만 한다
  const working = useRef({ tidy: false, store: false, image: false })

  // '배경' 칸(테마 그림 1·2 / 내 배경, specs/forms-themes design.md 10-4절): 미리보기·인쇄 사본에 그릴 그림과 뽑기 막힘
  const bg = useBackgrounds(state.theme, (pick) => dispatch({ type: 'theme', theme: pick }))
  const preview = previewNotice(state)
  const look = bg.look(preview)
  const ready = look.blocked ? null : readyNotice(state)
  const dirty = isDirty(state)
  const list: SavedList =
    state.list.kind === 'ok'
      ? { kind: 'ok', items: state.list.items.map((n) => ({ id: n.id, title: noticeTitle(n), updatedAt: n.updatedAt })) }
      : state.list

  function pick(next: Tool) {
    setTool(next)
    if (next === 'guide') setGuideSeen(true)
  }

  async function readList() {
    listNo.current += 1
    const no = listNo.current
    const result = await listNotices()
    if (no === listNo.current) dispatch({ type: 'listLoaded', result })
  }

  useEffect(() => {
    void readList()
    return () => {
      listNo.current += 1
      tidyNo.current += 1
    }
  }, [])

  function retryList() {
    dispatch({ type: 'listLoading' })
    void readList()
  }

  async function tidy() {
    const text = state.memo
    if (working.current.tidy || text.trim() === '') return
    if (memoProblem(text)) {
      dispatch({ type: 'tidyFailed', code: 'E-FORMS-PRIVATE' }) // 아무것도 보내지 않는다(AC-3502.3)
      return
    }
    working.current.tidy = true
    tidyNo.current += 1
    const no = tidyNo.current
    dispatch({ type: 'tidyStart' })
    const answer = await askTidy(text)
    if (no !== tidyNo.current) return
    working.current.tidy = false
    dispatch(answer.kind === 'ok' ? { type: 'tidyDone', cards: answer.cards, truncated: answer.truncated } : { type: 'tidyFailed', code: answer.code })
  }

  // 바뀐 내용이 있으면 버릴지 묻는다(AC-3507.3). 옮기면 기다리던 정리 답은 버린다
  function leave(next: () => void) {
    if (dirty && !window.confirm(LEAVE_CONFIRM)) return
    tidyNo.current += 1
    working.current.tidy = false
    next()
  }

  function openNotice(id: string) {
    const notice = state.list.kind === 'ok' ? state.list.items.find((n) => n.id === id) : undefined
    if (notice)
      leave(() => {
        dispatch({ type: 'open', notice })
        bg.noticeChanged()
      })
  }
  const newNotice = () =>
    leave(() => {
      dispatch({ type: 'new' })
      bg.noticeChanged()
    })

  async function save() {
    if (ready === null || working.current.store) return
    working.current.store = true
    dispatch({ type: 'saveStart' })
    const result = state.id === null ? await insertNotice(ready) : await updateNotice(state.id, ready)
    working.current.store = false
    dispatch(result === 'failed' ? { type: 'storeFailed', what: 'save' } : { type: 'saved', notice: result })
  }

  async function remove() {
    const id = state.id
    if (id === null || working.current.store || !window.confirm(DELETE_CONFIRM)) return
    working.current.store = true
    dispatch({ type: 'deleteStart' })
    const ok = await deleteNotice(id)
    working.current.store = false
    dispatch(ok ? { type: 'deleted', id } : { type: 'storeFailed', what: 'delete' })
  }

  async function image() {
    const svg = posterRef.current?.querySelector('svg')
    if (ready === null || !svg || working.current.image) return
    working.current.image = true
    setImaging(true)
    const ok = await downloadPosterPng(svg, fileNameOf(ready))
    working.current.image = false
    setImaging(false)
    dispatch({ type: 'imageFailed', failed: !ok })
  }

  return (
    <>
      <style>{PRINT_PAGE}</style>
      <div className="print:hidden">
        <h1 className="text-title font-semibold text-ink">서식</h1>
        <div role="group" aria-label="서식 도구" className={`${ds.segment.group} mt-3 max-md:grid-cols-2`}>
          {TOOLS.map(([id, name]) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              className={`${ds.segment.button} ${tool === id ? ds.segment.on : ds.segment.off}`}
              onClick={() => pick(id)}
            >
              {name}
            </button>
          ))}
        </div>
        {/* 휴진 안내 세 칸. hidden 상자에는 display 클래스를 주지 않는다(주면 hidden이 이기지 못한다) */}
        <div hidden={tool !== 'closure'}>
          <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[232px_minmax(360px,1fr)_440px]">
            <NoticeList
              label="저장한 안내문"
              emptyText="아직 저장한 안내문이 없어요"
              list={list}
              openId={state.id}
              busy={state.store !== null}
              onNew={newNotice}
              onOpen={openNotice}
              onRetry={retryList}
            />
            <NoticeEditor
              state={state}
              onMemo={(text) => dispatch({ type: 'memo', text })}
              onTidy={() => void tidy()}
              onCard={(index, field, value) => dispatch({ type: 'card', index, field, value })}
              onAddCard={() => dispatch({ type: 'addCard' })}
              onRemoveCard={(index) => dispatch({ type: 'removeCard', index })}
              onMonth={(value) => dispatch({ type: 'month', value })}
              onTheme={(next) => dispatch({ type: 'theme', theme: next })}
              bg={bg}
            />
            <PreviewPanel
              poster={<Poster notice={preview} theme={look.theme} art={look.art} background={look.background} />}
              empty={preview.cards.length === 0}
              posterRef={posterRef}
              ready={ready !== null}
              canDelete={state.id !== null}
              saveMark={dirty ? 'dirty' : state.id !== null ? 'saved' : null}
              saving={state.store === 'saving'}
              deleting={state.store === 'deleting'}
              imaging={imaging}
              storeError={state.storeError}
              imageFailed={state.imageFailed}
              onSave={() => void save()}
              onPrint={() => window.print()}
              onImage={() => void image()}
              onDelete={() => void remove()}
            />
          </div>
        </div>
      </div>
      {/* 인쇄 사본: 휴진 안내가 보일 때만. 화면에는 숨기고 인쇄 면에만 A4(210×297mm) 한 장으로 나온다 */}
      {tool === 'closure' && (
        <div data-print-copy="" aria-hidden="true" className="hidden print:block">
          <div className="h-[297mm] w-[210mm] *:block *:size-full">
            <Poster notice={preview} theme={look.theme} art={look.art} background={look.background} />
          </div>
        </div>
      )}
      {guideSeen && <GuideWorkspace hidden={tool !== 'guide'} />}
    </>
  )
}
