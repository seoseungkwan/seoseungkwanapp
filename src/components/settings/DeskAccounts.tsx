'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useDesk } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { addDeskMember, listDeskMembers, removeDeskMember } from '@/lib/storage/desk'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { DESK_MAX, type DeskAddResult, type DeskMember } from '@/types/desk'
import type { ErrorCode } from '@/types/errors'

// 설정 '데스크 계정' 칸 (specs/desk-feedback REQ-6304 AC-6304.2·AC-6304.3, design.md '③ 설정 데스크 계정 칸', 시안 ③, ADR-031).
// 원장이 데스크 구글 메일을 5개까지 더하고 뺀다. 읽기·더하기·빼기는 lib/storage/desk.ts(정의자 함수 셋)만 부른다.
// 원장 계정에서만 그린다(시안 ③): 설정 화면은 데스크에게 DeskGate가 막지만, 칸도 useDesk()가 참이면 그리지 않는다. 자료는 함수가 원장만 준다.
// 읽기는 효과에서만 한다. 더하기·빼기 뒤에는 목록을 다시 읽는다(그동안 지금 목록을 그대로 보인다). [빼기]는 묻지 않고 바로 지운다

type Load = 'loading' | 'failed' | 'ready'
type Busy = { kind: 'add' } | { kind: 'remove'; id: string } | null

const ADD_PROBLEM: Record<Exclude<DeskAddResult, 'added'>, ErrorCode> = {
  bad: 'E-DESK-EMAIL-BAD',
  taken: 'E-DESK-EMAIL-TAKEN',
  used: 'E-DESK-EMAIL-USED',
  limit: 'E-DESK-LIMIT',
}
const NOTE =
  '데스크 PC에서 이 구글 메일로 로그인하면 바로 이 병원의 데스크 계정이 됩니다(가입 승인 없음). [빼기]를 누르면 그 PC는 다음 화면부터 아무것도 볼 수 없어요. 데스크 계정은 5개까지.'
// 칸: ds.input을 시안 폭(280px 안팎)·단추 높이 36px로 좁힌다. 휴대폰은 44px(ds.input의 h-11·w-full보다 이겨야 해서 !)
const EMAIL_INPUT = `${ds.input} h-9! w-72! max-w-full max-md:h-11!`

/** 로그인 시각 → 한국 날짜 'M/D' */
function monthDay(iso: string): string {
  const [, month, day] = todayInKorea(new Date(iso)).split('-')
  return `${Number(month)}/${Number(day)}`
}

export function DeskAccounts() {
  if (useDesk()) return null
  return <DeskAccountsPanel />
}

function DeskAccountsPanel() {
  const [load, setLoad] = useState<Load>('loading')
  const [members, setMembers] = useState<DeskMember[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<Busy>(null)
  const [problem, setProblem] = useState<ErrorCode | null>(null)
  const titleId = useId()

  // quiet: 더하기·빼기 뒤 다시 읽기. 읽는 동안 지금 목록을 그대로 둔다
  const read = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoad('loading')
    try {
      setMembers(await listDeskMembers(supabaseBrowser()))
      setLoad('ready')
    } catch {
      setLoad('failed')
    }
  }, [])

  useEffect(() => {
    void read(false)
  }, [read])

  const full = members.length >= DESK_MAX

  async function add() {
    if (busy !== null || full) return
    setBusy({ kind: 'add' })
    setProblem(null)
    try {
      const result = await addDeskMember(supabaseBrowser(), text)
      if (result === 'added') {
        setText('')
        await read(true)
      } else {
        // 적은 메일은 칸에 그대로 둔다(AC-6304.3)
        setProblem(ADD_PROBLEM[result])
      }
    } catch {
      setProblem('E-DESK-SAVE-FAILED')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    if (busy !== null) return
    setBusy({ kind: 'remove', id })
    setProblem(null)
    try {
      await removeDeskMember(supabaseBrowser(), id)
      await read(true)
    } catch {
      setProblem('E-DESK-SAVE-FAILED')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex flex-col gap-3 p-5 max-md:p-4`}>
      <h2 id={titleId} className={ds.panelTitle}>
        데스크 계정
      </h2>
      <p className="text-small text-ink-2">
        데스크 계정은 <strong className="font-semibold text-ink">업무일지 · 수납일지 · 예약</strong>만 볼 수 있어요.
        통계·매출·청구·환자·설정은 서버가 보여 주지 않아요.
      </p>
      {load === 'loading' && <p className="text-small text-muted">데스크 계정 목록을 읽는 중이에요…</p>}
      {load === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-DESK-READ-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={() => void read(false)}>
            다시 불러오기
          </button>
        </div>
      )}
      {load === 'ready' && (
        <>
          <form
            noValidate
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="데스크 구글 메일"
              placeholder="데스크가 로그인할 구글 메일"
              className={EMAIL_INPUT}
              value={text}
              disabled={full}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className={ds.button.primary} disabled={full} aria-busy={busy?.kind === 'add' || undefined}>
              더하기
            </button>
          </form>
          {problem && <ErrorCard code={problem} />}
          {members.length > 0 && (
            <ul aria-label="데스크 계정 목록" className="flex flex-col rounded-control border border-line">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-3 py-2 last:border-b-0"
                >
                  <span className="min-w-0 break-all text-body text-ink">{member.email}</span>
                  {member.signedInAt ? (
                    <span className="text-small font-semibold text-positive">{`로그인함 · ${monthDay(member.signedInAt)}`}</span>
                  ) : (
                    <span className="text-small text-muted">아직 로그인 안 함</span>
                  )}
                  <button
                    type="button"
                    className={ds.button.secondarySmall}
                    aria-label={`${member.email} 빼기`}
                    aria-busy={(busy?.kind === 'remove' && busy.id === member.id) || undefined}
                    onClick={() => void remove(member.id)}
                  >
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-caption text-muted">{NOTE}</p>
    </section>
  )
}
