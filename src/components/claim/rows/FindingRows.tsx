'use client'

import { useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { Basis, Finding } from '@/types/precheck'
import { GRADE_LABEL, gradeChip, gradeEdge } from './grade'

// 점검 경고 줄(AC-013.3, 목업 화면 3 '.warn-item'): 등급 칩 · 규칙 제목 → 내용 · 세부 → 근거 한 줄과 [근거 보기]. 줄은 props로만 받는다

// ds.textButton은 body 글자라 caption 줄에 맞춘 작은 글자 단추를 따로 둔다(같은 속성 클래스를 겹치지 않는다)
const smallLink = `inline-flex cursor-pointer items-center rounded-control text-caption font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing} max-md:min-h-11`

const basisLine = (basis: Basis) => `${basis.doc} · ${basis.number}${basis.effective ? ` (${basis.effective})` : ''}`
const isWebLink = (url: string | undefined): url is string => url !== undefined && /^https?:\/\//.test(url)

function FindingRow({ finding, title }: { finding: Finding; title: string }) {
  const [open, setOpen] = useState(false)
  const [first, ...rest] = finding.basis
  return (
    <li className={`flex flex-col gap-1 border-l-2 pl-3 ${gradeEdge(finding.grade)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={gradeChip(finding.grade)}>{GRADE_LABEL[finding.grade]}</span>
        <span className="text-small font-semibold text-ink">{title}</span>
      </div>
      <p className="text-small text-ink-2">{finding.message}</p>
      {finding.detail && <p className="text-caption text-muted">{finding.detail}</p>}
      {first && (
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted">
          <span>
            근거: {first.number}
            {rest.length > 0 && ` 외 ${rest.length}건`}
          </span>
          <button type="button" className={smallLink} aria-expanded={open} onClick={() => setOpen(!open)}>
            근거 보기
          </button>
        </div>
      )}
      {open && (
        <ul className="flex flex-col gap-1 rounded-control bg-canvas px-3 py-2 text-caption text-ink-2">
          {finding.basis.map((basis) => (
            <li key={`${basis.doc}|${basis.number}`} className="flex flex-wrap items-center gap-2">
              <span>{basisLine(basis)}</span>
              {isWebLink(basis.url) && (
                <a href={basis.url} target="_blank" rel="noreferrer noopener" className={smallLink}>
                  원문 열기
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

export function FindingRows({ findings, titles }: { findings: readonly Finding[]; titles: ReadonlyMap<string, string> }) {
  return (
    <ul className="flex flex-col gap-2">
      {findings.map((finding, index) => (
        // 같은 규칙이 같은 글로 두 번 걸릴 수 있어 차례를 함께 쓴다. 고른 진료가 바뀌면 부모가 key로 새로 그린다
        <FindingRow key={`${index}|${finding.ruleId}`} finding={finding} title={titles.get(finding.ruleId) ?? finding.ruleId} />
      ))}
    </ul>
  )
}
