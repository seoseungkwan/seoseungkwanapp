'use client'

// 입지 분석 › 한 장 보고서(specs/location TASK-40·TASK-75 · REQ-7914·REQ-7920 · AC-7914.2·AC-7920.5, 시안 docs/mockups/location ?s=report 자리 그대로).
// 첫 장 — 후보 하나를 A4 한 장으로: 머리(후보 글자·진행 상태·이름·주소·뽑은 날·저장한 날·범위) · 종합 점수 · 항목 다섯 · 위험 신호 · 사는 사람·수요 ·
// 경쟁(고른 과목) · 자리·교통 · 매물·비용(처음에 드는 돈·손익분기) · 임대 조건 · 진행 메모(최근 2개) · 출처 기준 날짜. 예상 환자 줄은 없다.
// 둘째 장 '이렇게 분석했어요'(article.paper2) — 머리 · 점수 매기는 법 세 줄 · 묶음마다 본 자료 표 열넷 · 늘 못 보는 셋(글은 method.ts REPORT).
// 글은 sheet.ts가 만들고 이 파일은 그리기만 한다. props·콜백만 받는다(읽기·저장·부르기 없음, 보고서는 저장하지 않는다).
// [인쇄]는 window.print(), [PDF로 저장]은 인쇄 창에서 'PDF로 저장'을 고르라는 안내를 먼저 보이고 잠시 뒤 window.print()(시안과 같음).
// 서버 PDF·새 패키지 없음(ADR-011과 같은 브라우저 인쇄). 인쇄 때: 앱 위쪽 띠·탭 줄은 AppShell이 print:hidden으로 숨기고,
// 이 부품의 도구 줄·안내 줄도 print:hidden, 종이 감싸개·종이는 여백·테두리·바탕을 뺀다. 둘째 장은 새 쪽에서 시작하고(break-before: page),
// 두 장 모두 A4 한 쪽에 들게 인쇄 때 92%로 줄인다(시안 .paper zoom). 입지 분석 머리·안쪽 탭·후보 고르기 줄은
// 그것을 그리는 화면(잇기)이 print:hidden을 붙인다. 종이 크기(@page)는 이 화면이 붙어 있을 때만 쓰이게 부품 안 <style>로 둔다
// (고시·공지 주간 모음과 같은 방식). PC 모양 하나(폰 전용 모양 없음, 폭 따라 바뀌는 공용 묶음도 안 씀) — 좁은 창에서는 종이 감싸개 안에서만 옆으로 밀린다

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { DownloadIcon, LeftIcon, PrintIcon } from './icons'
import { buildSheet, HELP, NO_SCORE, type Basis, type SheetInput, type SheetItem, type SheetRow } from './sheet'

export type OnePageReportProps = SheetInput & {
  /** [후보 {글자}로 돌아가기](글자가 없으면 [후보로 돌아가기]) */
  onBack: () => void
}

// 인쇄 종이: A4 세로, 시안 @media print의 @page 여백 12mm
const PRINT_PAGE = '@media print { @page { size: A4 portrait; margin: 12mm } }'
const PDF_HINT = "인쇄 창이 열리면 프린터(대상)를 'PDF로 저장'으로 골라요."
const PDF_DELAY_MS = 600

// 단추(시안 .btn · .btn.primary): 36px · 좌우 16px · body 500 · 4px 모서리 — PC 모양 하나라 폭 따라 바뀌는 공용 단추 묶음 대신 값을 적는다
const BUTTON_BASE = `inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border px-4 text-body font-medium transition ${ds.focusRing}`
const BUTTON = `${BUTTON_BASE} border-line-strong bg-surface text-ink hover:bg-canvas`
const PRIMARY = `${BUTTON_BASE} border-transparent bg-accent text-surface hover:bg-accent-strong`

// 종이(시안 .paper): 794px(= 210mm) 흰 종이, 안쪽 44px 52px, 글자 12px. 인쇄 때 92%(시안 @media print .paper zoom)
const PAPER =
  'mx-auto w-[210mm] border border-line bg-surface px-13 py-11 text-caption text-ink print:w-auto print:border-0 print:p-0 print:[zoom:0.92]'
// 둘째 장(시안 .paper2 · .paper + .paper): 화면에서는 첫 장과 24px 띄우고, 인쇄하면 새 쪽에서 시작
const PAPER2 = `${PAPER} mt-6 print:mt-0 print:break-before-page`
const WRAP = 'mt-4 overflow-x-auto rounded-control bg-canvas p-8 print:m-0 print:overflow-visible print:bg-transparent print:p-0'
const H3 = 'mt-4 border-b border-line-strong pb-1 text-small font-semibold text-ink'
const ROW = 'grid grid-cols-[112px_minmax(0,1fr)] gap-2 border-b border-line py-0.5'
// 점수 매기는 법 줄(시안 .bl p): 이름 88px · 글
const LINE = 'grid grid-cols-[88px_minmax(0,1fr)] gap-2'
// 묶음마다 본 자료 표(시안 .bt): 칸 넓이 92 · 150 · 96 · 나머지 · 150px, 머리 muted 600 · 아래 진한 선, 몸 위쪽 맞춤 · 아래 선
const BT_COLS = ['w-23', 'w-[150px]', 'w-24', '', 'w-[150px]'] as const
const BT_TH = 'whitespace-nowrap border-b border-line-strong px-1.5 py-1 text-left font-semibold text-muted first:pl-0'
const BT_TD = 'border-b border-line px-1.5 py-1 align-top first:pl-0'
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
          {input.letter ? `후보 ${input.letter}로 돌아가기` : '후보로 돌아가기'}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={ds.help}>{HELP}</span>
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
        <BasisPaper basis={sheet.basis} />
      </div>
    </div>
  )
}

// 둘째 장 '이렇게 분석했어요'(시안 reportBasisHtml): 머리 · 점수 매기는 법 세 줄 · 묶음마다 본 자료 표 · 늘 못 보는 셋
function BasisPaper({ basis }: { basis: Basis }) {
  return (
    <article aria-label={basis.head.title} className={PAPER2}>
      <header className="border-b border-ink pb-3">
        <p className="text-muted">{basis.head.kicker}</p>
        <h2 className="text-title font-semibold text-ink">{basis.head.title}</h2>
        <p className="text-muted">{basis.head.sub}</p>
      </header>

      <Block title={basis.scoringTitle}>
        <dl className="mt-1.5 grid min-w-0 gap-1">
          {basis.scoring.map((r) => (
            <div key={r.label} className={LINE}>
              <dt className="font-semibold text-ink">{r.label}</dt>
              <dd className="min-w-0">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Block>

      <Block title={basis.tableTitle}>
        <table className="mt-2 w-full border-collapse text-caption">
          <colgroup>
            {BT_COLS.map((w, i) => (
              <col key={i} className={w || undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {basis.columns.map((c) => (
                <th key={c} scope="col" className={BT_TH}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {basis.rows.map((r) => (
              <tr key={r.id}>
                <td className={`${BT_TD} whitespace-nowrap font-semibold`}>{r.name}</td>
                <td className={BT_TD}>{r.orgs}</td>
                <td className={`${BT_TD} whitespace-nowrap tabular-nums`}>{r.dates}</td>
                <td className={BT_TD}>{r.method}</td>
                <td className={`${BT_TD} text-ink-2`}>{r.missing}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Block>

      <footer className="mt-4 border-t border-line-strong pt-2 text-caption text-muted">{basis.always}</footer>
    </article>
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
