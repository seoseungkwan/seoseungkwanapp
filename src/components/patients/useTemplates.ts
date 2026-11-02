'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_TEMPLATES, type TemplateKind } from '@/lib/patientMessages/defaults'
import { checkTemplate, PatientsStorageError, readTemplates, saveTemplates, type MessageTemplate, type TemplateDraft } from '@/lib/storage/messageTemplates'
import type { ErrorCode } from '@/types/errors'

// 문자 문구 상태(REQ-613). 문구의 원본은 서버다: 고치는 값(draft)은 이 훅에만 있고 브라우저 저장소에 두지 않는다(ADR-021). 읽고 쓰기는 lib/storage로만 한다.
// 다시 읽기는 사용자가 누를 때(reload·save)와 쓰기가 실패한 바로 뒤 한 번뿐이다. 저절로 되풀이하지 않는다.
//
// 저장이 실패하는 세 갈래. 줄이 겹치거나 서버에 중간 값이 남지 않게 나눈다
// - 쓰기는 끝났고 다시 읽기만 실패(E-PATIENTS-TEMPLATES-READ): 저장은 된 것이다. load-failed로 가서 [다시 불러오기]만 보인다. [다시 저장]을 보이면 새 줄을 또 넣는다
// - 쓰기 실패(E-PATIENTS-TEMPLATES-SAVE): 앞 줄만 들어갔을 수 있다. draft는 그대로 두고 saved(다음 저장의 before)만 서버에서 다시 읽는다. 사용자가 본 적 없는 다른 기기 줄은 saved에 넣지 않는다(withoutForeign)
// - 그 다시 읽기도 실패: saved를 믿을 수 없다. draft를 지우지 않고, 다음 저장은 서버 값을 먼저 읽은 뒤에만 쓴다(못 읽으면 쓰지 않는다)

export type TemplateField = 'name' | 'body'
/** key는 화면 줄의 이름이다. id 없는 새 줄도 순서를 바꿔 가며 같은 칸을 유지한다. 서버로 가지 않는다 */
export type DraftRow = TemplateDraft & { key: string }
export type TemplateInvalid = { index: number; field: TemplateField }

type Model = {
  state: 'loading' | 'ready' | 'load-failed'
  saved: MessageTemplate[]
  draft: DraftRow[]
  usingDefaults: boolean
  loadError: ErrorCode | null
  saveError: ErrorCode | null
  saving: boolean
  justSaved: boolean
  tried: boolean
}

const READ_ERROR: ErrorCode = 'E-PATIENTS-TEMPLATES-READ'
const SAVE_ERROR: ErrorCode = 'E-PATIENTS-TEMPLATES-SAVE'

/** 종류 이름(목업 KIND). 새 줄의 처음 이름도 이것으로 짓는다 */
export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = { injection: '주사 안내', followup: '진료 안내' }

const BLANK: Omit<Model, 'state'> = { saved: [], draft: [], usingDefaults: false, loadError: null, saveError: null, saving: false, justSaved: false, tried: false }
const LOADING: Model = { ...BLANK, state: 'loading' }
// 초안이 없다. 기본 문구로 대신하면 before = []로 저장해 서버 줄과 겹친다(AC-613.6)
const LOAD_FAILED: Model = { ...BLANK, state: 'load-failed', loadError: READ_ERROR }

/** 줄 수가 같으면(방금 보낸 줄이면) 칸의 key를 잇는다: 저장 뒤에도 고른 줄·초점이 그대로다 */
const draftOf = (rows: readonly MessageTemplate[], oldKeys: readonly string[] = []): DraftRow[] => {
  const keep = oldKeys.length === rows.length
  return rows.map(({ id, kind, name, body }, i) => ({ id, kind, name, body, key: (keep ? oldKeys[i] : undefined) ?? id }))
}

function loaded(rows: readonly MessageTemplate[]): Model {
  const usingDefaults = rows.length === 0
  const draft = usingDefaults ? DEFAULT_TEMPLATES.map(({ kind, name, body }, i) => ({ kind, name, body, key: `default-${i}` })) : draftOf(rows)
  return { ...BLANK, state: 'ready', saved: [...rows], draft, usingDefaults }
}

/** 서버에 있는 줄과 글·차례가 같은가. id는 보지 않는다: 저장 전 줄은 id가 없다 */
const sameText = (draft: readonly TemplateDraft[], rows: readonly MessageTemplate[]) =>
  draft.length === rows.length && draft.every((t, i) => t.kind === rows[i]?.kind && t.name === rows[i]?.name && t.body === rows[i]?.body)

/**
 * 이 초안이 서버에 다 들어가 있는가. sort_order까지 본다: 순서 바꾸기가 반만 되면 두 줄이 같은 번호가 되는데,
 * 같은 번호는 kind 차례로 읽혀(같은 종류면 DB가 차례를 정하지 않는다) 글 차례만 보면 저장된 것처럼 보인다
 */
const alreadySaved = (draft: readonly TemplateDraft[], rows: readonly MessageTemplate[]) => sameText(draft, rows) && rows.every((row, i) => row.sort_order === i)

/**
 * 쓰기 실패 뒤 다시 읽은 줄 중 다음 저장의 before로 삼을 줄. before에 있는데 초안에 없는 줄은 saveTemplates가 지우므로, 사용자가 본 적 없는 다른 기기 줄(알던 id가 아니고 id 없는 초안과 글도 다른 줄)은 뺀다.
 * 실패 없는 저장처럼 서버에 그대로 두고, 저장이 된 뒤 다시 읽기로 화면에 나온다. id 없는 초안과 글이 같은 줄은 우리가 넣고 답을 잃은 줄이라 남긴다: 다시 저장이 지우고 새로 넣어 겹치지 않는다
 */
function withoutForeign(rows: readonly MessageTemplate[], known: readonly MessageTemplate[], draft: readonly TemplateDraft[]): MessageTemplate[] {
  const knownIds = new Set(known.map(({ id }) => id))
  const unsent = draft.filter(({ id }) => id === undefined)
  return rows.filter((row) => knownIds.has(row.id) || unsent.some((t) => t.kind === row.kind && t.name === row.name && t.body === row.body))
}

function invalidOf(draft: readonly TemplateDraft[]): TemplateInvalid[] {
  return draft.flatMap((t, index) => {
    const found: TemplateInvalid[] = []
    if (checkTemplate(t) === 'name') found.push({ index, field: 'name' })
    // checkTemplate는 앞에서 걸린 칸 하나만 답한다. 내용만 따로 본다
    if (checkTemplate({ ...t, name: '이름' }) === 'body') found.push({ index, field: 'body' })
    return found
  })
}

type ClientSource = SupabaseClient | (() => SupabaseClient)
const clientOf = (source: ClientSource) => (typeof source === 'function' ? source() : source)

/** sb는 클라이언트 또는 만드는 함수다. 함수면 읽을 때 만들므로 그리는 동안(서버 포함) 만들지 않고, 못 만들어도 같은 읽기 실패다 */
export function useTemplates(sb: ClientSource) {
  const source = useRef(sb)
  const [model, setModel] = useState<Model>(LOADING)
  const [loads, setLoads] = useState(0)
  // 저장 중인가. 화면 상태(saving)는 다음 그림부터 보이므로 같은 순간의 두 번째 누름은 이것으로 막는다
  const busy = useRef(false)
  // saved를 믿을 수 없는가(쓰기 실패 뒤 다시 읽기도 실패)
  const stale = useRef(false)
  // 쓰기 실패 뒤 다시 읽은 전부(뺀 다른 기기 줄 포함). 저장됐는지는 saved가 아니라 이것과 본다: 뺀 줄이 있으면 저장된 것으로 끝내지 않고 쓰기·다시 읽기로 가서 그 줄을 화면에 보인다
  const lastRead = useRef<MessageTemplate[] | null>(null)
  const lastAdded = useRef(0)

  useEffect(() => {
    let live = true
    // 클라이언트를 못 만들어도 같은 실패다. 읽기 실패를 빈 목록으로 바꾸지 않는다(기본 문구로 대신하게 된다)
    Promise.resolve()
      .then(() => readTemplates(clientOf(source.current)))
      .then(
        (rows) => {
          if (live) setModel(loaded(rows))
        },
        () => {
          if (live) setModel(LOAD_FAILED)
        },
      )
    return () => {
      live = false
    }
  }, [loads])

  const invalid = invalidOf(model.draft)

  function reload(): void {
    if (model.state !== 'load-failed') return
    stale.current = false
    lastRead.current = null
    setModel(LOADING)
    setLoads((n) => n + 1)
  }

  /** 초안 바꾸기. 저장 중에는 먹지 않는다: 답으로 받은 값이 그동안 고친 글을 덮지 않게 */
  function change(update: (draft: DraftRow[]) => DraftRow[]): void {
    if (busy.current) return
    setModel((m) => {
      if (m.state !== 'ready') return m
      const draft = update(m.draft)
      return draft === m.draft ? m : { ...m, draft, justSaved: false }
    })
  }

  function add(kind: TemplateKind): string | null {
    if (busy.current || model.state !== 'ready') return null
    lastAdded.current += 1
    const key = `new-${lastAdded.current}`
    change((draft) => [...draft, { kind, name: `새 ${TEMPLATE_KIND_LABEL[kind]}`, body: '', key }])
    return key
  }

  async function save(): Promise<void> {
    if (model.state !== 'ready' || busy.current) return
    if (invalid.length > 0) {
      setModel((m) => ({ ...m, tried: true }))
      return
    }
    const sent = model.draft
    // 저장이 된 뒤의 모습. 서버 줄(새 id)을 받되 줄 칸은 잇는다
    const done = (rows: MessageTemplate[]) => {
      lastRead.current = null
      setModel((m) => ({ ...m, saved: rows, draft: draftOf(rows, m.draft.map(({ key }) => key)), usingDefaults: false, saveError: null, saving: false, justSaved: true, tried: false }))
    }
    // 저장 실패. draft는 그대로다. rows를 못 읽었으면 saved도 그대로 둔다(stale이 다음 저장을 막는다)
    const failed = (rows?: MessageTemplate[]) => setModel((m) => ({ ...m, saved: rows ?? m.saved, saveError: SAVE_ERROR, saving: false }))

    busy.current = true
    setModel((m) => ({ ...m, saving: true, saveError: null, justSaved: false }))
    try {
      let before = model.saved
      let onServer = lastRead.current ?? before
      if (stale.current) {
        try {
          onServer = await readTemplates(clientOf(source.current))
          before = withoutForeign(onServer, before, sent)
          stale.current = false
        } catch {
          failed()
          return
        }
      }
      // 답만 잃어 서버가 이미 이 값이면 또 보내지 않는다(id 없는 줄이 겹친다)
      if (alreadySaved(sent, onServer)) {
        done(onServer)
        return
      }
      try {
        done(await saveTemplates(clientOf(source.current), before, sent))
      } catch (err) {
        if (err instanceof PatientsStorageError && err.code === READ_ERROR) {
          setModel(LOAD_FAILED)
          return
        }
        try {
          const rows = await readTemplates(clientOf(source.current))
          if (alreadySaved(sent, rows)) done(rows)
          else {
            lastRead.current = rows
            failed(withoutForeign(rows, before, sent))
          }
        } catch {
          stale.current = true
          failed()
        }
      }
    } finally {
      busy.current = false
    }
  }

  return {
    ...model,
    // 기본 문구를 넣고 답만 잃었으면 서버에 들어간 것이다. 더는 처음이 아니다
    usingDefaults: model.usingDefaults && model.saved.length === 0,
    invalid,
    changed: model.state === 'ready' && !sameText(model.draft, model.saved),
    edit(i: number, patch: Partial<TemplateDraft>): void {
      change((draft) => draft.map((t, j) => (j === i ? { ...t, ...patch } : t)))
    },
    add,
    remove(i: number): void {
      change((draft) => draft.filter((_, j) => j !== i))
    },
    move(i: number, dir: -1 | 1): void {
      change((draft) => {
        const from = draft[i]
        const to = draft[i + dir]
        if (!from || !to) return draft
        const next = [...draft]
        next[i] = to
        next[i + dir] = from
        return next
      })
    },
    save,
    reload,
  }
}
