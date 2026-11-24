'use client'

import Link from 'next/link'
import { useId } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { DownloadButton } from '@/components/install/DownloadButton'
import { useInstallFiles } from '@/components/install/useInstallFiles'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { installMeta, type InstallFile, type InstallKind } from '@/lib/storage/installFiles'

// 설정 탭 맨 위 '비트 PC 연결 · 설치 파일' 칸 (helper-download REQ-5103 AC-5103.2, design.md '화면', 시안 docs/mockups/helper-download ?s=settings).
// 크롬 확장·도우미 두 줄: 이름·설명 · 지금 판 · 크기 · [받기](보조 — 이 화면의 주 단추는 다른 칸의 [저장]이다).
// 목록은 이 칸에서 한 번 읽고 두 단추와 나눠 쓴다(useInstallFiles). 목록 읽기 실패는 칸 안에 오류 카드 하나, 받기 실패는 그 줄에 보인다.
// 768px 미만은 지금 판·크기 칸을 숨기고(시안 hide-sm) 단추·링크는 44px 전체 폭이다. 설치 순서와 연결 확인은 비트 PC 연결 화면(/claim/setup)이 맡는다.
// 보는 중(admin-view AC-8011.3)에는 아래 [비트 PC 연결 확인하러 가기 →] 줄을 그리지 않는다(WriteOnly). 설치 파일 [받기]는 읽기라 그대로다

const ROWS: readonly { kind: InstallKind; name: string; desc: string; label: string }[] = [
  { kind: 'extension', name: '크롬 확장', desc: '크롬에 붙이는 작은 프로그램', label: '확장 내려받기' },
  { kind: 'helper', name: '도우미', desc: '비트 자료를 읽는 PC 프로그램', label: '도우미 내려받기' },
]

const th = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const td = 'border-b border-line px-2 py-3 align-middle first:pl-0 last:pr-0'
// 시안 hide-sm: 768px 미만에서 숨기는 칸
const wide = 'max-md:hidden'

/** 지금 판·크기 칸 글자: installMeta('0.9.0 · 0.9MB · 11월 17일 올림')의 앞 두 조각. 올린 파일이 없으면 '—' */
function versionAndSize(file: InstallFile | null): [string, string] {
  if (!file) return ['—', '—']
  const [version, size] = installMeta(file).split(' · ')
  return [version, size]
}

export function InstallFilesCard() {
  const titleId = useId()
  const list = useInstallFiles()

  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex flex-col gap-3 p-5 max-md:p-4`}>
      <h2 id={titleId} className={ds.panelTitle}>
        비트 PC 연결 · 설치 파일
      </h2>
      <p className="text-small text-muted">
        비트를 쓰는 PC(접수·진료실)에 확장과 도우미를 깔아야 청구·통계·환자·수납일지가 비트 자료를 읽어요. 새 판이 나오면 여기서 다시 받아 덮어 설치하세요.
      </p>
      <div className={ds.table.wrap}>
        <table className={ds.table.table}>
          <thead>
            <tr>
              <th className={th}>종류</th>
              <th className={`${th} ${wide}`}>지금 판</th>
              <th className={`${th} ${wide}`}>크기</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ kind, name, desc, label }) => {
              const [version, size] = list.status === 'ready' ? versionAndSize(list.files[kind]) : ['', '']
              return (
                <tr key={kind}>
                  <td className={td}>
                    <span className="block text-body font-semibold text-ink">{name}</span>
                    <span className="block text-small text-muted">{desc}</span>
                  </td>
                  <td className={`${td} ${wide} whitespace-nowrap text-ink`}>{version}</td>
                  <td className={`${td} ${wide} whitespace-nowrap text-ink`}>{size}</td>
                  <td className={td}>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <DownloadButton kind={kind} label={label} variant="secondary" inTable />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {list.status === 'failed' && <ErrorCard code={list.code} />}
      <WriteOnly>
        <div className="flex flex-wrap items-center gap-2 max-md:grid">
          <Link href="/claim/setup" className={`${ds.button.secondary} no-underline max-md:w-full`}>
            비트 PC 연결 확인하러 가기 →
          </Link>
          <span className="text-small text-muted">설치 순서와 연결 확인은 이 화면에서 해요(청구 탭 아래)</span>
        </div>
      </WriteOnly>
    </section>
  )
}
