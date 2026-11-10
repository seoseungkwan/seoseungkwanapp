'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { memoProblem } from '@/lib/forms/ai'
import { fileNameOf } from '@/lib/forms/notice'
import { downloadPosterPng } from '@/lib/forms/png'
import { themeInUse } from '@/lib/forms/themes'
import { deleteNotice, insertNotice, listNotices, updateNotice } from '@/lib/storage/formNotices'
import type { SavedNotice } from '@/types/forms'
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
import { NoticeEditor } from './NoticeEditor'
import { NoticeList } from './NoticeList'
import { Poster } from './Poster'
import { PreviewPanel } from './PreviewPanel'

// 서식 탭 화면 — 휴진 안내 (spec forms REQ-3501~3507, design.md 10절, 승인 시안 docs/mockups/forms/screen.html).
// 상태는 이 한 곳(useReducer, formsState.ts). 대충 적은 글은 [정리하기] 때만 /api/ai/forms로 보내고 저장하지 않는다(ADR-028).
// 저장은 브라우저 Supabase + RLS(lib/storage/formNotices). 인쇄는 window.print — 인쇄 면에는 A4 한 장의 안내문만 나온다(AC-3506.1)

const TIDY_PATH = '/api/ai/forms'
const DELETE_CONFIRM = '이 안내문을 지울까요?'
// 서식 화면에 있을 때만 쓰이는 인쇄 쪽 크기(globals.css는 고치지 않는다)
const PRINT_PAGE = '@media print { @page { size: A4 portrait; margin: 0 } }'
const BUSY: TidyAnswer = { kind: 'error', code: 'E-AI-BUSY' }

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
  const posterRef = useRef<HTMLDivElement>(null)
  // 늦게 온 답 버리기: 다른 안내문으로 옮기면 번호를 올린다
  const tidyNo = useRef(0)
  const listNo = useRef(0)
  // 같은 틀(render) 안에서 두 번 눌러도 한 번만 한다
  const working = useRef({ tidy: false, store: false, image: false })

  const preview = previewNotice(state)
  const theme = themeInUse(preview)
  const ready = readyNotice(state)
  const dirty = isDirty(state)

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

  const openNotice = (notice: SavedNotice) => leave(() => dispatch({ type: 'open', notice }))
  const newNotice = () => leave(() => dispatch({ type: 'new' }))

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
        <div role="group" aria-label="서식 도구" className={`${ds.segment.group} mt-3 max-md:grid-cols-1`}>
          <button type="button" aria-pressed="true" className={`${ds.segment.button} ${ds.segment.on}`}>
            휴진 안내
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[232px_minmax(360px,1fr)_440px]">
          <NoticeList list={state.list} openId={state.id} busy={state.store !== null} onNew={newNotice} onOpen={openNotice} onRetry={retryList} />
          <NoticeEditor
            state={state}
            onMemo={(text) => dispatch({ type: 'memo', text })}
            onTidy={() => void tidy()}
            onCard={(index, field, value) => dispatch({ type: 'card', index, field, value })}
            onAddCard={() => dispatch({ type: 'addCard' })}
            onRemoveCard={(index) => dispatch({ type: 'removeCard', index })}
            onMonth={(value) => dispatch({ type: 'month', value })}
            onTheme={(next) => dispatch({ type: 'theme', theme: next })}
          />
          <PreviewPanel
            notice={preview}
            theme={theme}
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
      {/* 인쇄 사본: 화면에는 숨기고 인쇄 면에만 A4(210×297mm) 한 장으로 나온다 */}
      <div data-print-copy="" aria-hidden="true" className="hidden print:block">
        <div className="h-[297mm] w-[210mm] *:block *:size-full">
          <Poster notice={preview} theme={theme} />
        </div>
      </div>
    </>
  )
}
