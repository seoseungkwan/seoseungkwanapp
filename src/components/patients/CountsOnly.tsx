'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { kstNow } from '@/components/shell/kstNow'
import { ds } from '@/components/ui/classes'
import { readContactCount, type StoredContactCount } from '@/lib/storage/contactCounts'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { toolHref } from './tools'

// 건수만 보이는 자리(AC-610.3·AC-610.4, 목업 countsView). 확장 없는 곳·휴대폰, 다른 창 작업 중의 [건수만 보기]에서 쓴다.
// 줄이 없으면 숫자 없이 '자료 없음', 읽기 실패는 오류 카드 + [다시 불러오기]로 나눠 보인다(실패를 '자료 없음'으로 바꾸지 않는다). 이름·전화는 여기 오지 않는다

type Read = { status: 'loading' } | { status: 'failed' } | { status: 'read'; row: StoredContactCount | null }

const LOADING: Read = { status: 'loading' }

// 시각은 위쪽 띠 시계(kstNow)와 같은 한 곳으로 읽고 '(KST)'만 뗀다
const changedAt = (updatedAt: string) => kstNow(new Date(updatedAt)).replace(/ \(KST\)$/, '')

function CountCell({ name, value, note }: { name: string; value: number; note: string }) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0 max-md:px-0 max-md:py-3">
      <p className="text-small text-muted">{name}</p>
      <p className="mt-1 text-metric font-semibold text-ink max-md:text-heading-m">
        {value}
        <span className="ml-0.5 text-lead font-medium tracking-normal text-ink-2">명</span>
      </p>
      <p className="mt-1 text-small text-ink-2">{note}</p>
    </div>
  )
}

export function CountsOnly({ action }: { /** 다른 창 작업 중에서 왔을 때의 [다시 확인] */ action?: ReactNode }) {
  const [read, setRead] = useState<Read>(LOADING)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const row = await readContactCount(supabaseBrowser())
        if (current) setRead({ status: 'read', row })
      } catch {
        // 오류 내용은 그리지 않는다. 번호 하나로만 보인다
        if (current) setRead({ status: 'failed' })
      }
    })()
    return () => {
      current = false
    }
  }, [attempt])

  return (
    <div>
      <h2 className="text-title font-semibold text-ink">이 PC에서는 남은 건수만 볼 수 있어요</h2>
      <p className="mt-2 text-body text-ink-2">환자 이름과 전화는 비트 PC(비트가 깔린 의원 PC)에서만 보여요.</p>

      {read.status === 'loading' && (
        <p role="status" className="mt-4 text-small text-muted">
          남은 건수를 불러오는 중이에요
        </p>
      )}

      {read.status === 'failed' && (
        <div className="mt-4 max-w-180">
          <ErrorCard code="E-PATIENTS-COUNTS-READ" />
          <div className="mt-3">
            <button
              type="button"
              className={`${ds.button.secondary} max-md:w-full`}
              onClick={() => {
                setRead(LOADING)
                setAttempt((n) => n + 1)
              }}
            >
              다시 불러오기
            </button>
          </div>
        </div>
      )}

      {read.status === 'read' && read.row === null && (
        <div className="mt-4 max-w-180 border-y border-line py-4">
          <p className="text-subtitle font-semibold text-ink">자료 없음</p>
          <p className="mt-1 text-small text-ink-2">비트 PC에서 환자 탭을 열면 건수가 생겨요.</p>
        </div>
      )}

      {read.status === 'read' && read.row !== null && (
        <>
          <div className="mt-4 grid max-w-180 grid-cols-2 divide-x divide-line border-y border-line max-md:grid-cols-1 max-md:divide-x-0 max-md:divide-y">
            <CountCell name="F/U 명단" value={read.row.followup_left} note="내일 오실 분 중 아직 연락 안 한 분" />
            <CountCell name="정기 주사 문자 명단" value={read.row.injection_left} note="주사 날짜가 오늘까지 왔는데 아직 연락 안 한 분" />
          </div>
          <p className="mt-3 text-small text-muted">마지막으로 바뀐 때 {changedAt(read.row.updated_at)} · 비트 PC에서 환자 탭을 열 때마다 새로 바뀌어요.</p>
        </>
      )}

      {action && <div className="mt-4">{action}</div>}

      <p className="mt-6 flex flex-wrap items-center gap-x-3 text-small text-muted">
        <span>문자 문구는 여기서도 고칠 수 있어요</span>
        <Link href={toolHref('messages')} className={`${ds.textButton} group no-underline`}>
          문자 문구 열기
          <Icon name="arrow" className="transition group-hover:translate-x-0.5" />
        </Link>
      </p>
    </div>
  )
}
