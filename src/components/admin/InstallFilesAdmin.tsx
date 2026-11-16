'use client'

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { InstallFilesError, installMeta, latestInstallFiles, uploadInstallFile, type InstallFile, type InstallKind } from '@/lib/storage/installFiles'
import type { ErrorCode } from '@/types/errors'

// 관리자 · '설치 파일' 칸 (specs/helper-download REQ-5104, design.md '화면', 시안 docs/mockups/helper-download/index.html ?s=admin·uploading·bad·done).
// 도우미·크롬 확장 zip을 보관함(install-files)에 올린다. 목록·올리기는 브라우저가 Storage 규칙으로만 한다(관리자만 올림, ADR-004).
// 판·크기·날짜 글자는 installMeta 한 곳에서 만든 것을 칸마다 나눠 쓴다. 오류 안내는 errors.ts 번호로만 그린다(원래 오류 글은 버린다).
// 시안의 '새 칸' 표시·페이지 머리 설명 글은 시안 표시용이라 그리지 않는다

const DESC = '비트 PC 연결 화면의 [내려받기] 단추가 여기 올린 파일을 줘요. 로그인하고 승인된 사람만 받을 수 있어요.'
const DONE_BODY = '이제 모든 병원의 비트 PC 연결 화면에서 이 판을 받아요.'
// 표 차례는 시안 그대로(도우미 먼저)
const ROWS: ReadonlyArray<{ kind: InstallKind; label: string }> = [
  { kind: 'helper', label: '도우미' },
  { kind: 'extension', label: '크롬 확장' },
]
const LABEL: Record<InstallKind, string> = { helper: '도우미', extension: '크롬 확장' }

// 휴대폰(768px 미만)에서는 크기·올린 날 칸을 숨긴다(시안 hide-sm). 단추는 44px(ds 단추의 max-md:h-11) 전체 폭
const HIDE_SM = 'max-md:hidden'
const UPLOAD_BUTTON = `${ds.button.secondary} max-md:w-full`
// 안내 글 안 파일·폴더 이름(시안 code): 바탕과 같은 흰 칸 + 1px 선, 글자 굵기 500
const CODE = 'rounded-control border border-line px-1 font-medium text-ink-2'

type Files = Record<InstallKind, InstallFile | null>
type Load = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; files: Files }
type Result = { kind: 'done'; file: InstallFile } | { kind: 'failed'; code: ErrorCode }

/** installMeta '0.9.0 · 0.9MB · 11월 17일 올림'을 칸마다 나눈다(날짜 칸은 머리가 '올린 날'이라 '올림'을 뺀다) */
function cellsOf(file: InstallFile): { version: string; size: string; date: string } {
  const [version = '', size = '', uploaded = ''] = installMeta(file).split(' · ')
  return { version, size, date: uploaded.replace(/ 올림$/, '') }
}

export function InstallFilesAdmin() {
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [uploading, setUploading] = useState<Record<InstallKind, boolean>>({ helper: false, extension: false })
  const [result, setResult] = useState<Result | null>(null)
  const inputs = useRef<Partial<Record<InstallKind, HTMLInputElement | null>>>({})
  const alive = useRef(true) // 떠난 뒤 온 결과는 버린다

  const read = useCallback(async () => {
    try {
      const files = await latestInstallFiles()
      if (alive.current) setLoad({ kind: 'ready', files })
    } catch {
      if (alive.current) setLoad({ kind: 'failed' })
    }
  }, [])

  useEffect(() => {
    alive.current = true
    void read()
    return () => {
      alive.current = false
    }
  }, [read])

  const choose = async (kind: InstallKind, event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0]
    event.target.value = '' // 같은 파일을 다시 고를 수 있게
    if (chosen === undefined) return
    setUploading((prev) => ({ ...prev, [kind]: true }))
    setResult(null)
    try {
      const file = await uploadInstallFile(chosen)
      if (!alive.current) return
      setResult({ kind: 'done', file })
      void read() // 목록을 새로 읽어 새 판을 보인다
    } catch (error) {
      if (alive.current) setResult({ kind: 'failed', code: error instanceof InstallFilesError ? error.code : 'E-INSTALL-UPLOAD-FAILED' })
    } finally {
      if (alive.current) setUploading((prev) => ({ ...prev, [kind]: false }))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 결과 상자는 칸 위(시안 .alert). 성공 알림 자리(role=status)는 늘 두고 안만 바꾼다 — 비면 화면 밖으로 빼 자리를 차지하지 않는다 */}
      <div role="status" className="empty:sr-only">
        {result?.kind === 'done' && (
          <div className="flex items-start gap-2 rounded-control bg-positive-soft px-4 py-3">
            <Icon name="check" className="mt-0.5 shrink-0 text-positive" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-body font-semibold text-ink">{`${LABEL[result.file.kind]} ${result.file.version.join('.')}을 올렸어요`}</p>
              <p className="text-small text-ink-2">{DONE_BODY}</p>
            </div>
          </div>
        )}
      </div>
      {result?.kind === 'failed' && <ErrorCard code={result.code} />}

      <section aria-labelledby="install-files-title" className={ds.panel}>
        <div className={ds.panelHead}>
          <h2 id="install-files-title" className={ds.panelTitle}>
            설치 파일
          </h2>
        </div>
        <p className="px-5 pt-1 text-small text-ink-2 max-md:px-4">{DESC}</p>
        {load.kind === 'failed' && (
          <div className="px-5 pt-3 max-md:px-4">
            <ErrorCard code="E-INSTALL-READ-FAILED" />
          </div>
        )}
        <div className={`${ds.table.wrap} pt-3`}>
          <table aria-label="설치 파일" className={ds.table.table}>
            <thead>
              <tr>
                <th scope="col" className={ds.table.th}>
                  종류
                </th>
                <th scope="col" className={ds.table.th}>
                  지금 판
                </th>
                <th scope="col" className={`${ds.table.th} ${HIDE_SM}`}>
                  크기
                </th>
                <th scope="col" className={`${ds.table.th} ${HIDE_SM}`}>
                  올린 날
                </th>
                {/* 단추 칸 머리는 비우고 이름만 준다(sr-only는 absolute라 옆으로 밀리는 표 밖까지 나간다) */}
                <th scope="col" aria-label="올리기" className={ds.table.th} />
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ kind, label }) => {
                const file = load.kind === 'ready' ? load.files[kind] : null
                const cells = file === null ? null : cellsOf(file)
                const empty = load.kind === 'loading' ? '읽는 중…' : load.kind === 'failed' ? '' : '아직 없어요'
                const busy = uploading[kind]
                return (
                  <tr key={kind} className={ds.table.row}>
                    <td className={`${ds.table.td} font-semibold`}>{label}</td>
                    <td className={cells === null ? `${ds.table.td} text-muted` : `${ds.table.td} tabular-nums`}>{cells?.version ?? empty}</td>
                    <td className={`${ds.table.tdSub} tabular-nums ${HIDE_SM}`}>{cells?.size ?? ''}</td>
                    <td className={`${ds.table.tdSub} tabular-nums ${HIDE_SM}`}>{cells?.date ?? ''}</td>
                    <td className={`${ds.table.td} text-right`}>
                      <button type="button" disabled={busy} onClick={() => inputs.current[kind]?.click()} className={UPLOAD_BUTTON}>
                        <Icon name="upload" />
                        {busy ? '올리는 중…' : '새 파일 올리기'}
                      </button>
                      <input
                        ref={(el) => {
                          inputs.current[kind] = el
                        }}
                        type="file"
                        accept=".zip"
                        hidden
                        onChange={(event) => void choose(kind, event)}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="px-5 pt-3 pb-5 text-small text-muted max-md:px-4 max-md:pb-4">
          새 판이 나오면 Claude가 바탕화면 <code className={CODE}>도우미-설치파일</code> 폴더에 zip을 놓아 둬요. 그 파일을 [새 파일 올리기]로
          고르세요. 이름은 <code className={CODE}>precheck-helper-0.9.0.zip</code>·<code className={CODE}>precheck-extension-0.3.0.zip</code> 모양만
          받아요(5MB까지). 예전 판은 지우지 않고 남겨 두고, 받기 단추는 가장 높은 판을 줘요.
        </p>
      </section>
    </div>
  )
}
