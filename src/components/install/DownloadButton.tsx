'use client'

import { useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { downloadInstallFile, installMeta, type InstallKind } from '@/lib/storage/installFiles'
import type { ErrorCode } from '@/types/errors'
import { useInstallFiles } from './useInstallFiles'

// 도우미·크롬 확장 받기 단추 (helper-download REQ-5103, design.md '화면', 시안 docs/mockups/helper-download ?s=setup·none·update·ext·settings).
// 자료실(specs/library AC-8109.4)에 올린 그 종류의 가장 높은 판을 받는다. 로그인하고 승인된 사람(승인된 병원의 데스크 포함)만 받을 수 있다(자료실 규칙).
// 단추 줄(flex) 안에 그대로 넣는 조각이다: [단추] · 옆 글 · (실패하면 줄 맨 끝에 오류 카드 한 줄).
// - 옆 글: 판 · 크기 · M월 D일 올림(installMeta, 크기는 자료실과 같은 글자). 파일이 없으면 단추는 눌리지 않고 '아직 받을 파일이 없어요…'
// - 받기 실패는 E-INSTALL-DOWNLOAD-FAILED, 목록 읽기 실패는 E-INSTALL-READ-FAILED 오류 카드(문구는 errors.ts)
// - inTable: 옛 설정 칸 표처럼 판·크기와 목록 읽기 실패를 단추 밖(칸·카드 하나)에서 보이는 곳(설정 칸이 자료실 링크가 된 뒤로 지금은 쓰는 곳이 없다). 그때는 옆 글과 목록 실패 카드를 그리지 않는다
// 768px 미만은 44px(ds 단추) 전체 폭이다. 주 단추는 한 화면에 하나라 놓는 곳이 variant를 고른다

const NO_FILE = '아직 받을 파일이 없어요. 관리자에게 알려 주세요.'

/** 오류 카드 자리: 단추 줄의 맨 끝 한 줄(같은 줄의 [다시 확인] 뒤) */
const errorLine = 'order-last basis-full'

export function DownloadButton({
  kind,
  label,
  variant,
  inTable = false,
}: {
  kind: InstallKind
  label: string
  variant: 'primary' | 'secondary'
  inTable?: boolean
}) {
  const list = useInstallFiles()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<ErrorCode | null>(null)
  const file = list.status === 'ready' ? list.files[kind] : null

  async function download() {
    // 받는 동안 다시 눌러도 또 받지 않는다
    if (busy || !file) return
    setBusy(true)
    setFailed(null)
    try {
      await downloadInstallFile(file)
    } catch {
      setFailed('E-INSTALL-DOWNLOAD-FAILED')
    } finally {
      setBusy(false)
    }
  }

  let side: string | null = null
  if (list.status === 'ready') side = file ? (inTable ? null : installMeta(file)) : NO_FILE

  return (
    <>
      <button
        type="button"
        className={`${variant === 'primary' ? ds.button.primary : ds.button.secondary} max-md:w-full`}
        disabled={!file}
        aria-busy={busy || undefined}
        onClick={() => void download()}
      >
        {label}
      </button>
      {side && <span className="text-small text-muted">{side}</span>}
      {list.status === 'failed' && !inTable && (
        <div className={errorLine}>
          <ErrorCard code={list.code} />
        </div>
      )}
      {failed && (
        <div className={errorLine}>
          <ErrorCard code={failed} />
        </div>
      )}
    </>
  )
}
