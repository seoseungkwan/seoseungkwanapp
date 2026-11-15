'use client'

import { useEffect, useReducer, useRef, useState } from 'react'
import { memoProblem } from '@/lib/forms/ai'
import { guideFileName, guideTitle } from '@/lib/forms/guide'
import { subjectProblem } from '@/lib/forms/guideDrawing'
import { downloadGuidePng } from '@/lib/forms/png'
import { deleteGuide, insertGuide, listGuides, updateGuide } from '@/lib/storage/formGuides'
import { LEAVE_CONFIRM } from './formsState'
import { GuideEditor } from './GuideEditor'
import { GuidePoster } from './GuidePoster'
import {
  drawingAnswerOf,
  guideAnswerOf,
  guideReducer,
  initialGuideState,
  isDirty,
  readyGuide,
  visibleProblems,
  type GuideDrawingAnswer,
  type GuideTidyAnswer,
} from './guideState'
import { NoticeList, type SavedList } from './NoticeList'
import { PreviewPanel } from './PreviewPanel'

// 서식 탭 환자 안내문 한 벌: 목록·만들기·미리보기·인쇄 사본 (spec forms-guide REQ-4501·4506·4507·4509·4513, design.md 9절,
// 승인 시안 docs/mockups/forms-guide/index.html ?s=screen). 상태는 이 한 곳(useReducer, guideState.ts).
// 서식 화면(FormsScreen)이 [환자 안내문]을 처음 누를 때 만들고, 그 뒤로는 숨기기만 한다(hidden) — 고치던 값이 남는다(AC-4501.3).
// 목록은 만들어질 때 한 번 읽는다(AC-4501.2). 숨은 동안은 인쇄 사본을 그리지 않는다(인쇄 면에는 보이는 도구의 사본 하나, AC-4501.4).
// 대충 적은 글은 [정리하기] 때만 /api/ai/forms/guide로, 그릴 것은 [AI로 그림 그리기] 때만 /api/ai/forms/guide/picture로 보내고 저장하지 않는다(ADR-028).
// 저장은 브라우저 Supabase + RLS(lib/storage/formGuides)

const TIDY_PATH = '/api/ai/forms/guide'
const DRAW_PATH = '/api/ai/forms/guide/picture'
const DELETE_CONFIRM = '이 안내문을 지울까요?'
const EMPTY_TEXT = '아직 저장한 환자 안내문이 없어요'
const BUSY = { kind: 'error', code: 'E-AI-BUSY' } as const

// 던지지 않는다. 연결이 끊기면 E-AI-BUSY, 몸통이 JSON이 아니면 null로 읽어 answerOf가 가른다.
// redirect: 'manual' — 로그인이 끊겨 돌려보내는 답을 따라가지 않는다(E-AI-FAILED로 보인다). 휴진 안내 askTidy와 같은 방법
async function ask<T>(path: string, text: string, answerOf: (status: number, body: unknown) => T, busy: T): Promise<T> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      redirect: 'manual',
      cache: 'no-store',
    })
    const body: unknown = await response.json().catch(() => null)
    return answerOf(response.status, body)
  } catch {
    return busy
  }
}
const askTidy = (text: string) => ask<GuideTidyAnswer>(TIDY_PATH, text, guideAnswerOf, BUSY)
const askDrawing = (text: string) => ask<GuideDrawingAnswer>(DRAW_PATH, text, drawingAnswerOf, BUSY)

export function GuideWorkspace({ hidden }: { hidden: boolean }) {
  const [state, dispatch] = useReducer(guideReducer, undefined, initialGuideState)
  const [imaging, setImaging] = useState(false)
  const posterRef = useRef<HTMLDivElement>(null)
  // 늦게 온 답 버리기: 다른 안내문으로 옮기면 번호를 올린다
  const tidyNo = useRef(0)
  const drawNo = useRef(0)
  const listNo = useRef(0)
  // 같은 틀(render) 안에서 두 번 눌러도 한 번만 한다
  const working = useRef({ tidy: false, draw: false, store: false, image: false })

  const ready = readyGuide(state)
  const dirty = isDirty(state)
  const problems = visibleProblems(state)
  const list: SavedList =
    state.list.kind === 'ok'
      ? { kind: 'ok', items: state.list.items.map((g) => ({ id: g.id, title: guideTitle(g.content), updatedAt: g.updatedAt })) }
      : state.list

  async function readList() {
    listNo.current += 1
    const no = listNo.current
    const result = await listGuides()
    if (no === listNo.current) dispatch({ type: 'listLoaded', result })
  }

  useEffect(() => {
    void readList()
    return () => {
      listNo.current += 1
      tidyNo.current += 1
      drawNo.current += 1
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
      dispatch({ type: 'tidyFailed', code: 'E-FORMS-PRIVATE' }) // 아무것도 보내지 않는다(AC-4506.3)
      return
    }
    working.current.tidy = true
    tidyNo.current += 1
    const no = tidyNo.current
    dispatch({ type: 'tidyStart' })
    const answer = await askTidy(text)
    if (no !== tidyNo.current) return
    working.current.tidy = false
    dispatch(answer.kind === 'ok' ? { type: 'tidyDone', guide: answer.guide, truncated: answer.truncated } : { type: 'tidyFailed', code: answer.code })
  }

  async function draw() {
    const text = state.subject.trim()
    if (working.current.draw || text === '') return
    if (subjectProblem(text)) {
      dispatch({ type: 'drawFailed', code: 'E-FORMS-PRIVATE' }) // 아무것도 보내지 않는다(AC-4513.2)
      return
    }
    working.current.draw = true
    drawNo.current += 1
    const no = drawNo.current
    dispatch({ type: 'drawStart' })
    const answer = await askDrawing(text)
    if (no !== drawNo.current) return
    working.current.draw = false
    dispatch(answer.kind === 'ok' ? { type: 'drawDone', drawing: answer.drawing } : { type: 'drawFailed', code: answer.code })
  }

  // 바뀐 내용이 있으면 버릴지 묻는다(AC-4507.3). 옮기면 기다리던 정리·그림 답은 버린다
  function leave(next: () => void) {
    if (dirty && !window.confirm(LEAVE_CONFIRM)) return
    tidyNo.current += 1
    drawNo.current += 1
    working.current.tidy = false
    working.current.draw = false
    next()
  }

  function openGuide(id: string) {
    const guide = state.list.kind === 'ok' ? state.list.items.find((g) => g.id === id) : undefined
    if (guide) leave(() => dispatch({ type: 'open', guide }))
  }
  const newGuide = () => leave(() => dispatch({ type: 'new' }))

  async function save() {
    if (ready === null || working.current.store) return
    working.current.store = true
    dispatch({ type: 'saveStart' })
    const result = state.id === null ? await insertGuide(ready) : await updateGuide(state.id, ready)
    working.current.store = false
    dispatch(result === 'failed' ? { type: 'storeFailed', what: 'save' } : { type: 'saved', guide: result })
  }

  async function remove() {
    const id = state.id
    if (id === null || working.current.store || !window.confirm(DELETE_CONFIRM)) return
    working.current.store = true
    dispatch({ type: 'deleteStart' })
    const ok = await deleteGuide(id)
    working.current.store = false
    if (ok) {
      // 지우면 새 안내문이 된다: 기다리던 정리·그림 답은 버린다
      tidyNo.current += 1
      drawNo.current += 1
      working.current.tidy = false
      working.current.draw = false
    }
    dispatch(ok ? { type: 'deleted', id } : { type: 'storeFailed', what: 'delete' })
  }

  async function image() {
    const svg = posterRef.current?.querySelector('svg')
    if (ready === null || !svg || working.current.image) return
    working.current.image = true
    setImaging(true)
    const ok = await downloadGuidePng(svg, guideFileName(ready))
    working.current.image = false
    setImaging(false)
    dispatch({ type: 'imageFailed', failed: !ok })
  }

  return (
    <>
      {/* hidden 상자에는 display 클래스를 주지 않는다(주면 hidden이 이기지 못한다) */}
      <div hidden={hidden} className="print:hidden">
        <div className="mt-4 grid grid-cols-1 items-start gap-4 xl:grid-cols-[232px_minmax(360px,1fr)_440px]">
          <NoticeList
            label="저장한 환자 안내문"
            emptyText={EMPTY_TEXT}
            list={list}
            openId={state.id}
            busy={state.store !== null}
            onNew={newGuide}
            onOpen={openGuide}
            onRetry={retryList}
          />
          <GuideEditor state={state} problems={problems} dispatch={dispatch} onTidy={() => void tidy()} onDraw={() => void draw()} />
          <PreviewPanel
            poster={<GuidePoster content={state.content} />}
            empty={false}
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
      {/* 인쇄 사본: 이 도구가 보일 때만. 화면에는 숨기고 인쇄 면에만 A4(210×297mm) 한 장으로 나온다(AC-4509.1) */}
      {!hidden && (
        <div data-print-copy="" aria-hidden="true" className="hidden print:block">
          <div className="h-[297mm] w-[210mm] *:block *:size-full">
            <GuidePoster content={state.content} />
          </div>
        </div>
      )}
    </>
  )
}
