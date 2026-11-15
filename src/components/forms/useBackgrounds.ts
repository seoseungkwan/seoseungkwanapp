import { useEffect, useReducer, useRef, useState, type Dispatch, type RefObject } from 'react'
import { wordsOf, wordsProblem } from '@/lib/forms/background'
import { base64ToBytes, jpegDataUrl, readBackground } from '@/lib/forms/backgroundImage'
import { backgroundPick, isThemePick } from '@/lib/forms/themes'
import { deleteBackground, listBackgrounds, readBackgroundImage, saveBackground } from '@/lib/storage/formBackgrounds'
import type { SavedBackground } from '@/types/formBackground'
import type { ClosureNotice, ThemePick } from '@/types/forms'
import {
  bgAnswerOf,
  bgReducer,
  canSaveTrial,
  initialBgState,
  posterLook,
  shownMode,
  type BgAction,
  type BgAnswer,
  type BgState,
  type PosterLook,
} from './backgroundState'

// 휴진 안내 '배경' 칸의 부르기·저장·내려받기 (specs/forms-themes design.md 10-2절). 상태는 backgroundState(순수 reducer) 한 곳.
// 고른 그림 값(안내문 theme)은 서식 상태에 있다 — 여기서는 받기(pick)와 바꾸기(onPick)만 한다.
// AI 배경은 /api/ai/forms/background에 적은 말만 보낸다(ADR-029). 받은 그림은 브라우저가 읽어(readBackground) 미리보기에만 얹고,
// [내 배경으로 저장]을 누른 것만 브라우저 Supabase(RLS)로 올린다(lib/storage/formBackgrounds).
// 내 배경 목록은 보이는 칸이 '내 배경'이 될 때 처음 한 번 읽고, 큰 그림은 그 배경을 처음 쓸 때 한 번 내려받는다.
// 화면이 사라진 뒤 온 답은 버리고(번호 세기 — 서식 화면의 정리 답과 같은 방법), 같은 틀 안에서 두 번 눌러도 한 번만 한다

const BACKGROUND_PATH = '/api/ai/forms/background'
const DELETE_CONFIRM = '이 배경을 지울까요? 이 배경을 쓴 다른 안내문은 저절로 고른 테마로 보여요'
const BACKGROUND_PREFIX = 'bg-'
const BUSY: BgAnswer = { kind: 'error', code: 'E-AI-BUSY' }
type Mode = 'theme' | 'mine'
type StoreWork = 'save' | 'delete'

export type Backgrounds = {
  state: BgState
  mode: Mode // 보이는 칸(값이 내 배경이면 늘 'mine')
  look: (notice: ClosureNotice) => PosterLook
  storeWork: StoreWork // 마지막으로 한 저장소 일(E-FORMS-BG-STORE-FAILED를 어느 칸에 보일지)
  setMode(mode: Mode): void // 'theme'이고 지금 값이 내 배경이면 onPick(null)
  noticeChanged(): void // 안내문을 열거나 새로 만들 때: 칸만 '테마 그림'으로(값은 그대로 — 내 배경 값이면 shownMode가 'mine'). 만든 배경은 남는다(시안 openNotice)
  setWords(text: string): void // 30자까지 자른다(reducer)
  make(): Promise<void>
  remake(): Promise<void> // 만든 배경의 말로 다시 만든다
  saveTrial(): Promise<void>
  discard(): void
  retry(): void // 목록 실패면 다시 읽기, 그림 실패면 다시 내려받기
  remove(item: SavedBackground): Promise<void>
}

// 던지지 않는다. 연결이 끊기면 E-AI-BUSY, 몸통이 JSON이 아니면 null로 읽어 bgAnswerOf가 가른다(모르는 답은 E-FORMS-BG-FAILED).
// redirect: 'manual' — 로그인이 끊겨 돌려보내는 답을 따라가지 않는다
async function askBackground(text: string): Promise<BgAnswer> {
  try {
    const response = await fetch(BACKGROUND_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      redirect: 'manual',
      cache: 'no-store',
    })
    const body: unknown = await response.json().catch(() => null)
    return bgAnswerOf(response.status, body)
  } catch {
    return BUSY
  }
}

// 내 배경 값(bg-<소문자 uuid>)이면 그 id
function backgroundIdOf(pick: ThemePick | null): string | null {
  return pick !== null && pick.startsWith(BACKGROUND_PREFIX) && isThemePick(pick) ? pick.slice(BACKGROUND_PREFIX.length) : null
}

// 목록 읽기. 새로 읽기 시작하거나 화면이 사라지면 번호가 올라 앞 답은 버린다
async function readList(dispatch: Dispatch<BgAction>, listNo: RefObject<number>) {
  listNo.current += 1
  const no = listNo.current
  dispatch({ type: 'listLoading' })
  const result = await listBackgrounds()
  if (no === listNo.current) dispatch({ type: 'listLoaded', result })
}

// 큰 그림 내려받기 → data: 주소. 내 배경 id마다 둔다(다른 배경을 골랐다가 돌아와도 다시 받지 않는다)
async function readImage(dispatch: Dispatch<BgAction>, alive: RefObject<boolean>, item: SavedBackground) {
  dispatch({ type: 'imageLoading', id: item.id })
  const bytes = await readBackgroundImage(item)
  if (alive.current) dispatch({ type: 'imageLoaded', id: item.id, image: bytes === null ? null : jpegDataUrl(bytes) })
}

export function useBackgrounds(pick: ThemePick | null, onPick: (pick: ThemePick | null) => void): Backgrounds {
  const [state, dispatch] = useReducer(bgReducer, undefined, initialBgState)
  const [storeWork, setStoreWork] = useState<StoreWork>('save')
  const alive = useRef(true)
  const listNo = useRef(0)
  const makeNo = useRef(0)
  const working = useRef({ make: false, store: false })
  // 기다린 뒤(지우기가 끝난 뒤) 견줄 지금 값
  const pickNow = useRef(pick)

  const mode = shownMode(state, pick)
  const chosenId = backgroundIdOf(pick)
  const chosen = chosenId !== null && state.list.kind === 'ok' ? (state.list.items.find((b) => b.id === chosenId) ?? null) : null
  const chosenImage = chosen === null ? undefined : state.images[chosen.id]

  useEffect(() => {
    pickNow.current = pick
  }, [pick])

  useEffect(() => {
    alive.current = true
    working.current = { make: false, store: false }
    return () => {
      alive.current = false
      listNo.current += 1
      makeNo.current += 1
    }
  }, [])

  // 보이는 칸이 '내 배경'이 될 때 아직 읽지 않았으면 한 번 읽는다(서식 화면을 열 때는 읽지 않는다)
  useEffect(() => {
    if (mode === 'mine' && state.list.kind === 'idle') void readList(dispatch, listNo)
  }, [mode, state.list.kind])

  // 고른 내 배경이 목록에 있고 그림을 아직 받지 않았으면 한 번 내려받는다
  useEffect(() => {
    if (chosen !== null && chosenImage === undefined) void readImage(dispatch, alive, chosen)
  }, [chosen, chosenImage])

  async function make(text: string) {
    const words = wordsOf(text)
    if (working.current.make || words === null) return
    if (wordsProblem(text)) {
      dispatch({ type: 'makeFailed', code: 'E-FORMS-PRIVATE' }) // 아무것도 보내지 않는다(AC-4611.2)
      return
    }
    working.current.make = true
    makeNo.current += 1
    const no = makeNo.current
    dispatch({ type: 'makeStart' })
    const answer = await askBackground(words)
    if (no !== makeNo.current) return
    let next: BgAction
    if (answer.kind === 'error') {
      next = { type: 'makeFailed', code: answer.code }
    } else {
      const bytes = base64ToBytes(answer.jpeg)
      const read = await readBackground(bytes)
      if (no !== makeNo.current) return
      next = read === null ? { type: 'makeFailed', code: 'E-FORMS-BG-FAILED' } : { type: 'makeDone', trial: { words, bytes, ...read } }
    }
    working.current.make = false
    dispatch(next)
  }

  async function saveTrial() {
    const trial = state.trial
    // 목록을 읽어 30장 밑일 때만(가득 차면 단추도 막힌다, AC-4611.4)
    if (trial === null || !canSaveTrial(state) || working.current.store) return
    working.current.store = true
    setStoreWork('save')
    dispatch({ type: 'saveStart' })
    const result = await saveBackground({ words: trial.words, accent: trial.accent, thumb: trial.thumb, image: trial.bytes })
    working.current.store = false
    if (!alive.current) return
    if (result === 'failed') {
      dispatch({ type: 'storeFailed' })
      return
    }
    dispatch({ type: 'saved', item: result, image: trial.image })
    onPick(backgroundPick(result.id))
  }

  async function remove(item: SavedBackground) {
    if (working.current.store || !window.confirm(DELETE_CONFIRM)) return
    working.current.store = true
    setStoreWork('delete')
    dispatch({ type: 'deleteStart' })
    const ok = await deleteBackground(item)
    working.current.store = false
    if (!alive.current) return
    if (!ok) {
      dispatch({ type: 'storeFailed' })
      return
    }
    dispatch({ type: 'deleted', id: item.id })
    if (pickNow.current === backgroundPick(item.id)) onPick(null)
  }

  function setMode(next: Mode) {
    dispatch({ type: 'mode', mode: next })
    if (next === 'theme' && chosenId !== null) onPick(null)
  }

  function retry() {
    if (state.list.kind === 'failed') void readList(dispatch, listNo)
    else if (chosen !== null && chosenImage?.kind === 'failed') void readImage(dispatch, alive, chosen)
  }

  return {
    state,
    mode,
    look: (notice) => posterLook(notice, state),
    storeWork,
    setMode,
    noticeChanged: () => dispatch({ type: 'mode', mode: 'theme' }),
    setWords: (text) => dispatch({ type: 'words', text }),
    make: () => make(state.words),
    remake: async () => {
      if (state.trial !== null) await make(state.trial.words)
    },
    saveTrial,
    discard: () => dispatch({ type: 'discard' }),
    retry,
    remove,
  }
}
