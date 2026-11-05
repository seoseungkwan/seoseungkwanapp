import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import RevenuePage, { metadata } from './page'

// /revenue 페이지와 매출 문서 줄 (spec revenue REQ-010). 화면 동작은 components/revenue/RevenueScreen.test.tsx가 본다.
// 여기서는 준비 중 화면이 아니라 매출 화면을 그리는지, 탭 이름, 문서가 도우미 읽기를 말하는지, 백업 목록을 본다. 문서는 글자로 읽는다
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({}) }))

const ROOT = process.cwd()
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const lineOf = (doc: string, start: string) => doc.split('\n').find((line) => line.startsWith(start))
const h1Texts = (markup: string) =>
  [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())

describe('AC-010.1: /revenue는 준비 중 화면이 아니다', () => {
  it('AC-010.1 페이지는 매출 화면 뿌리(h1 "매출")를 그리고 준비 중 화면을 쓰지 않는다', () => {
    const html = renderToStaticMarkup(<RevenuePage />)
    expect(h1Texts(html)).toEqual(['매출'])
    expect(html).not.toContain('준비 중')
    expect(html).not.toContain('그동안 쓸 수 있어요')
    expect(html).not.toContain('대시보드로 돌아가기')
  })

  it('AC-010.1 페이지 소스는 RevenueScreen을 불러 그리고 준비 중 자료를 꺼내지 않는다', () => {
    const source = read('src/app/(app)/revenue/page.tsx')
    expect(source).toMatch(/from '@\/components\/revenue\/RevenueScreen'/)
    expect(source).toContain('<RevenueScreen />')
    expect(source).not.toMatch(/NotReadyScreen|notReadyFeature/)
  })
})

describe('AC-010.2: 브라우저 탭 이름', () => {
  it('AC-010.2 /revenue의 metadata.title은 "매출"이고, 앱 틀 레이아웃의 틀과 합쳐 "매출 · 의원 이름"이 된다', () => {
    expect(metadata.title).toBe('매출')
    expect(read('src/app/(app)/layout.tsx')).toContain('template: `%s · ${name}`')
  })
})

describe('AC-010.3·AC-010.4: 문서', () => {
  it('AC-010.3 plan.md §2-4와 ARCHITECTURE.md의 매출 줄이 도우미 읽기(revenue.days)를 말한다', () => {
    const plan = read('plan.md')
    expect(plan).toContain('revenue.days')
    expect(plan).toContain('sales_days')
    const section = /### 2-4\. 매출\n([\s\S]*?)\n### /.exec(plan)?.[1] ?? ''
    expect(section).toContain(
      '(2026-11-01 바뀜: 매출은 비트 PC 도우미의 `revenue.days`로 읽어 `sales_days`·`sales_codes`에 집계만 저장한다. 폴더 연결·파일 끌어다 놓기는 하지 않는다 — specs/revenue)',
    )
    expect(lineOf(plan, '| `sales_days` |')).toContain('칸은 specs/revenue design.md 6절')

    const flow = lineOf(read('docs/ARCHITECTURE.md'), '[매출]')
    expect(flow).toBeDefined()
    expect(flow).not.toContain('폴더 연결')
    expect(flow).not.toContain('끌어다 놓기')
    expect(flow).toContain('revenue.days')
    expect(flow).toContain('sales_days')
    expect(flow).toContain('sales_codes')
    expect(flow).toContain('2026-11-01')

    const tabRow = lineOf(read('docs/tab-frame/plan.md'), '| 매출 |')
    expect(tabRow).toContain('건당 진료비')
    expect(tabRow).not.toContain('평균 진료비')
  })

  it('AC-010.4 백업 목록에 매출 표 둘과 묶음 표', () => {
    const tables = 'src/lib/backup/tables.ts'
    if (existsSync(join(ROOT, tables))) {
      const source = read(tables)
      for (const name of ['sales_days', 'sales_codes', 'rx_groups']) expect(source, name).toContain(name)
    } else {
      expect(read('docs/ARCHITECTURE.md')).toContain(
        '백업 목록(`lib/backup/tables.ts`)에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다(`rx_groups`는 총괄이 손으로 만든 유일한 자료)',
      )
    }
  })
})
