'use client'

import { useEffect, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { readViewLog, type ViewLogRow } from '@/lib/auth/adminView'
import { newestFirst, viewedAt } from './applications'

// 관리자 화면 '본 기록' 칸 (spec admin-view REQ-8012 AC-8012.3, design.md '관리자 화면'·기본값 11, 시안 docs/mockups/admin-view ?s=admin-list '본 기록').
// 가입 승인 표 아래 ds.panel(설치 파일 칸과 같은 틀). 최근 30일(DB가 거른다)을 한 번 읽고 새 것이 위.
// 읽기 실패는 이 칸 안 E-VIEW-LOG 카드 + [다시 불러오기] — 화면 오류로 던지지 않아 승인 표는 그대로 쓴다. 폰 전용 모양은 없다(사용자 규칙 2026-11-21)
type Load = { kind: 'reading' } | { kind: 'ready'; rows: ViewLogRow[] } | { kind: 'failed' }

const TITLE_ID = 'admin-view-log-title'

/** 본 관리자 칸: '{의원 이름} · {메일}'(메일은 muted). 있는 것만, 둘 다 없으면 — */
function Viewer({ name, email }: { name: string | null; email: string | null }) {
  if (name === null && email === null) return '—'
  if (name === null) return email
  if (email === null) return name
  return (
    <>
      {name} <span className="text-muted">{`· ${email}`}</span>
    </>
  )
}

export function AdminViewLog() {
  const [load, setLoad] = useState<Load>({ kind: 'reading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let alive = true
    readViewLog().then(
      (rows) => {
        if (alive) setLoad({ kind: 'ready', rows: newestFirst(rows) })
      },
      () => {
        if (alive) setLoad({ kind: 'failed' })
      },
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const retry = () => {
    setLoad({ kind: 'reading' })
    setAttempt((n) => n + 1)
  }

  return (
    <section aria-labelledby={TITLE_ID} aria-busy={load.kind === 'reading'} className={ds.panel}>
      <div className={ds.panelHead}>
        <h2 id={TITLE_ID} className={ds.panelTitle}>
          본 기록
        </h2>
        {load.kind === 'ready' && <span className={ds.count}>{`최근 30일 · ${load.rows.length}번`}</span>}
      </div>
      <p className="px-5 pt-1 text-small text-ink-2">관리자가 다른 의원 화면을 열 때마다 적어요.</p>
      {load.kind === 'failed' ? (
        <div className="flex flex-col items-start gap-3 px-5 pt-3 pb-5">
          <ErrorCard code="E-VIEW-LOG" />
          <button type="button" onClick={retry} className={ds.button.secondarySmall}>
            다시 불러오기
          </button>
        </div>
      ) : (
        <div className={`${ds.table.wrap} pt-3`}>
          {/* 칸 폭 고정(시안 .seen): 본 때 220px · 본 의원 40% · 본 관리자는 남은 폭 */}
          <table aria-label="본 기록" className={`${ds.table.table} table-fixed`}>
            <thead>
              <tr>
                <th scope="col" className={`${ds.table.th} w-55`}>
                  본 때
                </th>
                <th scope="col" className={ds.table.th}>
                  본 관리자
                </th>
                <th scope="col" className={`${ds.table.th} w-2/5`}>
                  본 의원
                </th>
              </tr>
            </thead>
            <tbody>
              {load.kind === 'ready' &&
                load.rows.map((row, i) => (
                  <tr key={`${row.startedAt}-${row.hospitalId}-${i}`} className={ds.table.row}>
                    <td className={`${ds.table.tdSub} tabular-nums`}>{viewedAt(row.startedAt)}</td>
                    <td className={ds.table.td}>
                      <Viewer name={row.viewerName} email={row.viewerEmail} />
                    </td>
                    <td className={ds.table.td}>{row.hospitalName}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
