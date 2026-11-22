'use client'

// 입지 분석 › 한 장 보고서(specs/location TASK-40 · REQ-7914 · AC-7914.2, 시안 docs/mockups/location ?s=report 자리 그대로).
// 후보 하나를 A4 한 장으로: 머리(진행 상태·이름·주소·뽑은 날·저장한 날·범위) · 종합 점수 · 항목 다섯 · 위험 신호 · 사는 사람·수요 ·
// 경쟁 · 자리·교통 · 매물·비용(처음에 드는 돈·손익분기) · 임대 조건 · 진행 메모(최근 2개) · 출처 기준 날짜. 예상 환자 줄은 없다.
// 글은 sheet.ts가 만들고 이 파일은 그리기만 한다. props·콜백만 받는다(읽기·저장·부르기 없음, 보고서는 저장하지 않는다).
// [인쇄]는 window.print(), [PDF로 저장]은 인쇄 창에서 'PDF로 저장'을 고르라는 안내를 먼저 보이고 잠시 뒤 window.print()(시안과 같음).
// 서버 PDF·새 패키지 없음(ADR-011과 같은 브라우저 인쇄). 인쇄 때: 앱 위쪽 띠·탭 줄은 AppShell이 print:hidden으로 숨기고,
// 이 부품의 도구 줄·안내 줄도 print:hidden, 종이 감싸개·종이는 여백·테두리·바탕을 뺀다. 입지 분석 머리·안쪽 탭·후보 고르기 줄은
// 그것을 그리는 화면(잇기)이 print:hidden을 붙인다. 종이 크기(@page)는 이 화면이 붙어 있을 때만 쓰이게 부품 안 <style>로 둔다
// (고시·공지 주간 모음과 같은 방식). PC 모양 하나(폰 전용 모양 없음) — 좁은 창에서는 종이 감싸개 안에서만 옆으로 밀린다

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { DownloadIcon, LeftIcon, PrintIcon } from './icons'
import { buildSheet, NO_SCORE, type SheetInput, type SheetItem, type SheetRow } from './sheet'

export type OnePageReportProps = SheetInput & {
  /** [후보로 돌아가기] */
  onBack: () => void
}

// 인쇄 종이: A4 세로, 시안 @media print의 @page 여백 12mm
const PRINT_PAGE = '@media print { @page { size: A4 portrait; margin: 12mm } }'
const PDF_HINT = "인쇄 창이 열리면 프린터(대상)를 'PDF로 저장'으로 골라요."
const PDF_DELAY_MS = 600

// ds 묶음에서 768px 미만에서만 바뀌는 클래스를 뺀다(폰 전용 모양 없음, 사용자 규칙 2026-11-21).
// 앞말 글자를 통째로 적지 않는다(source.test가 소스에서 화면 폭 앞말을 찾는다) → 뒤에 쌍점이 오는지만 본다
const PHONE_ONLY = /^max-md(?=:)/
const pc = (classes: string) =>
  classes
    .split(/\s+/)
    .filter((c) => c !== '' && !PHONE_ONLY.test(c))
    .join(' ')
const BUTTON = pc(ds.button.secondary)
const PRIMARY = pc(ds.button.primary)

// 종이(시안 .paper): 794px(= 210mm) 흰 종이, 안쪽 44px 52px, 글자 12px
const PAPER = 'mx-auto w-[210mm] border border-line bg-surface px-13 py-11 text-caption text-ink print:w-auto print:border-0 print:p-0'
const WRAP = 'mt-4 overflow-x-auto rounded-control bg-canvas p-8 print:m-0 print:overflow-visible print:bg-transparent print:p-0'
const H3 = 'mt-4 border-b border-line-strong pb-1 text-small font-semibold text-ink'
const ROW = 'grid grid-cols-[112px_minmax(0,1fr)] gap-2 border-b border-line py-0.5'
// 위험 신호 앞 '!' 네모(시안 .pf p::before). 인쇄는 바탕색이 빠지므로 테두리·글자색으로 바꾼다
const FLAG =
  "grid grid-cols-[14px_minmax(0,1fr)] gap-1.5 before:mt-0.5 before:grid before:size-3.5 before:place-items-center before:rounded-control before:bg-negative before:text-caption before:font-semibold before:text-surface before:content-['!'] print:before:border print:before:border-negative print:before:bg-surface print:before:text-negative"

export function OnePageReport({ onBack, ...input }: OnePageReportProps) {
  const sheet = buildSheet(input)
  const [hint, setHint] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 화면을 떠나면 기다리던 인쇄 창을 열지 않는다
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current)
    },
    [],
  )

  const print = () => window.print()
  const savePdf = () => {
    setHint(PDF_HINT)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = null
      print()
    }, PDF_DELAY_MS)
  }

  return (
    <div>
      <style>{PRINT_PAGE}</style>
      <div role="group" aria-label="보고서 도구" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 print:hidden">
        <button type="button" onClick={onBack} className={BUTTON}>
          <LeftIcon />
          후보로 돌아가기
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={ds.help}>A4 한 장 · 인쇄하면 앱 틀은 빠지고 종이만 나와요</span>
          <button type="button" onClick={savePdf} className={BUTTON}>
            <DownloadIcon />
            PDF로 저장
          </button>
          <button type="button" onClick={print} className={PRIMARY}>
            <PrintIcon />
            인쇄
          </button>
        </div>
      </div>
      <p role="status" className="mt-2 min-h-5 text-small text-ink-2 print:hidden">
        {hint}
      </p>

      <div className={WRAP}>
        <article aria-label="한 장 보고서" className={PAPER}>
          <header className="flex items-start justify-between gap-4 border-b border-ink pb-3">
            <div className="min-w-0">
              <p className="text-muted">{sheet.kicker}</p>
              <h2 className="text-title font-semibold text-ink">{sheet.name}</h2>
              {sheet.address && <p>{sheet.address}</p>}
              <p className="text-muted">{sheet.made}</p>
            </div>
            <Total total={sheet.total} />
          </header>

          <ul aria-label="항목 점수" className="mt-1.5 grid list-none grid-cols-5 border-b border-line">
            {sheet.items.map((item) => (
              <Item key={item.name} item={item} />
            ))}
          </ul>

          <Block title={`위험 신호 ${sheet.flags.length}개`}>
            <ul className="mt-1.5 grid list-none gap-1">
              {sheet.flags.map((f, i) => (
                <li key={i} className={FLAG}>
                  <span>
                    <b className="font-semibold">{f.title}</b>
                    {` — ${f.detail}`}
                  </span>
                </li>
              ))}
            </ul>
          </Block>

          <div className="grid grid-cols-2 gap-x-6">
            <Block title="사는 사람·수요">
              <Rows rows={sheet.people} />
            </Block>
            <Block title="경쟁">
              <Rows rows={sheet.rivals} />
            </Block>
            <Block title="자리·교통">
              <Rows rows={sheet.site} />
            </Block>
            <Block title="매물·비용">
              <Rows rows={sheet.money} />
            </Block>
          </div>

          <Block title="임대 조건(제안 → 바람)">
            <div className="grid grid-cols-2 gap-x-6">
              <Rows rows={sheet.terms[0]} />
              <Rows rows={sheet.terms[1]} />
            </div>
          </Block>

          {sheet.notes.length > 0 && (
            <Block title="진행 메모">
              <Rows rows={sheet.notes} clamp />
            </Block>
          )}

          <footer className="mt-4 border-t border-line-strong pt-2 text-caption text-muted">{sheet.foot}</footer>
        </article>
      </div>
    </div>
  )
}

// 종합 점수(시안 .ph1 .sc): `종합 점수` · 큰 숫자 · `/ 100점`. 점수가 없으면 `점수 없음`
function Total({ total }: { total: number | null }) {
  return (
    <div role="group" aria-label="종합 점수" className="shrink-0 text-right">
      <span className="block text-muted">종합 점수</span>
      {total === null ? (
        <b className="block text-lead font-semibold text-muted">{NO_SCORE}</b>
      ) : (
        <>
          <b className="block text-display-m font-semibold tabular-nums">{total}</b>
          <span className="text-muted">/ 100점</span>
        </>
      )}
    </div>
  )
}

// 항목 하나(시안 .pi div): 이름 · `{보탠 점수}/{만점}` 또는 `값 없음`
function Item({ item }: { item: SheetItem }) {
  return (
    <li className="min-w-0 border-l border-line px-2 py-1 first:border-l-0 first:pl-0">
      <span className="text-muted">{item.name}</span>
      <b className="block text-lead font-semibold tabular-nums">
        {item.points === null ? (
          <span className="text-caption font-medium text-muted">{item.empty}</span>
        ) : (
          <>
            {item.points}
            <span className="text-caption font-medium text-muted">/{item.max}</span>
          </>
        )}
      </b>
    </li>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className={H3}>
        {title}
      </h3>
      {children}
    </section>
  )
}

// 이름·값 줄(시안 .paper dl): 이름 112px · 값. 메모는 두 줄까지만
function Rows({ rows, clamp = false }: { rows: readonly SheetRow[]; clamp?: boolean }) {
  return (
    <dl className="mt-1.5 min-w-0">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className={ROW}>
          <dt className="text-muted">{r.label}</dt>
          <dd className={`min-w-0 tabular-nums ${clamp ? 'line-clamp-2 break-words' : ''}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
