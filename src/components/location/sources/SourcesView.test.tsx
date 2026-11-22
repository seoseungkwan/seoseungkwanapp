// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { AGE_BANDS, DEFAULT_SCORE_RULE, SCORE_GROUPS, type ScoreRule } from '@/lib/location/score'
import { KEY_TEXT, LAW_BASIS, MISSING, SOURCE_GROUPS, SOURCES, VIA_TEXT } from '@/lib/location/sources'
import { SourcesView } from './SourcesView'

// '근거와 출처' 화면(specs/location TASK-28 · REQ-7906 · AC-7906.3, 시안 ?s=sources).
// 화면은 lib/location의 SOURCES·SOURCE_GROUPS·VIA_TEXT·KEY_TEXT·LAW_BASIS·MISSING·SCORE_GROUPS·DEFAULT_SCORE_RULE만 읽어 그린다.
// 시험도 목록을 그대로 훑는다(글자를 따로 적지 않는다) — 예시 몇 개만 글자로 박아 기준 글 모양을 본다

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const rowOf = (id: string) => {
  const row = document.getElementById(id)
  if (!row) throw new Error(`${id} 줄이 없어요`)
  return row
}
const text = (el: Element) => el.textContent ?? ''
const region = (name: string) => screen.getByRole('region', { name })
const cellTexts = (row: Element) => [...row.querySelectorAll('td')].map(text)

/** 지금 설정: 처음 값을 그대로 복사한 것(얼린 DEFAULT_SCORE_RULE은 고칠 수 없다) */
const copyRule = (): ScoreRule => structuredClone(DEFAULT_SCORE_RULE) as ScoreRule

describe('AC-7906.3: 숫자가 어디서 왔나 — SOURCES를 그 목록 그대로', () => {
  it('AC-7906.3: 출처 묶음은 SOURCE_GROUPS 차례이고, 묶음마다 그 묶음 출처 줄이 SOURCES 차례로 있다', () => {
    render(<SourcesView />)
    const table = within(region('숫자가 어디서 왔나')).getByRole('table')
    const rows = [...table.querySelectorAll('tbody tr')]
    const expected = SOURCE_GROUPS.flatMap((g) => [`group:${g}`, ...SOURCES.filter((s) => s.group === g).map((s) => `src-${s.id}`)])
    const got = rows.map((r) => (r.id ? r.id : `group:${text(r)}`))
    expect(got).toEqual(expected)
    // 모든 출처가 한 번씩(빈 묶음에 빠진 출처가 없다)
    expect(rows.filter((r) => r.id).length).toBe(SOURCES.length)
  })

  it('AC-7906.3: 출처 줄 닻은 #src-<id>이고, 줄마다 화면 숫자·기관·자료 이름·주기·단위·왜 보나·받는 길·이용 조건이 글자 그대로다', () => {
    render(<SourcesView />)
    for (const s of SOURCES) {
      const cells = cellTexts(rowOf(`src-${s.id}`))
      expect(cells, s.id).toHaveLength(7)
      expect(cells[0], s.id).toBe(s.shows)
      expect(cells[1], s.id).toBe(`${s.org}${s.name}`)
      expect(cells[3], s.id).toBe(s.cycle)
      expect(cells[4], s.id).toBe(s.unit)
      expect(cells[5], s.id).toBe(s.why)
      const via = s.key ? `${VIA_TEXT[s.via]} · ${KEY_TEXT[s.key]}` : VIA_TEXT[s.via]
      expect(cells[6], s.id).toBe(`${via}이용 조건: ${s.terms}`)
    }
  })

  it('AC-7906.3: 심평원(공공누리 제1유형) 등 이용 조건의 출처 문구가 그대로 보인다', () => {
    render(<SourcesView />)
    const hira = SOURCES.filter((s) => s.org === '건강보험심사평가원')
    expect(hira.length).toBeGreaterThan(0)
    for (const s of hira) {
      expect(s.terms).toContain('공공누리 제1유형')
      expect(text(rowOf(`src-${s.id}`))).toContain(`이용 조건: ${s.terms}`)
    }
    expect(text(rowOf('src-hosp-list'))).toContain("공공누리 제1유형(출처 표시) — 출처: 건강보험심사평가원 '병원정보서비스'")
    for (const s of SOURCES.filter((x) => x.terms.includes('출처'))) expect(text(rowOf(`src-${s.id}`)), s.id).toContain(s.terms)
  })

  it('AC-7906.3: 자료 쪽 주소가 있으면 자료 이름이 새 창 링크(noopener noreferrer)이고, 주소가 없는 사용자 값은 링크가 없다', () => {
    render(<SourcesView />)
    for (const s of SOURCES) {
      const links = [...rowOf(`src-${s.id}`).querySelectorAll('a')]
      if (s.url === null) {
        expect(links, s.id).toHaveLength(0)
        continue
      }
      expect(links, s.id).toHaveLength(1)
      expect(links[0].getAttribute('href'), s.id).toBe(s.url)
      expect(text(links[0]), s.id).toBe(s.name)
      expect(links[0].getAttribute('target'), s.id).toBe('_blank')
      expect(links[0].getAttribute('rel'), s.id).toBe('noopener noreferrer')
    }
    expect(SOURCES.some((s) => s.url === null)).toBe(true)
  })

  it('AC-7906.3: 기준 날짜 칸은 받은 날짜 글을 그대로 보이고, 받은 것이 없으면 –', () => {
    render(<SourcesView asOf={{ 'pop-age': '2026년 10월 말', dongs: '2026년 상반기' }} />)
    expect(cellTexts(rowOf('src-pop-age'))[2]).toBe('2026년 10월 말')
    expect(cellTexts(rowOf('src-dongs'))[2]).toBe('2026년 상반기')
    expect(cellTexts(rowOf('src-hosp-list'))[2]).toBe('–')
  })

  it('AC-7906.3: 머리 글은 시안 그대로다', () => {
    render(<SourcesView />)
    const box = region('숫자가 어디서 왔나')
    expect(within(box).getByText('기관·자료 이름은 공개한 곳에 적힌 그대로예요')).toBeTruthy()
    expect(
      within(box).getByText(
        '화면의 숫자 아래 작은 글씨를 누르면 이 표의 그 줄로 와요. 자료는 볼 때 받고, 후보를 저장할 때 그날 값으로 굳혀 둬요(기준 날짜가 함께 남아요). 카카오맵 값만은 열 때마다 새로 불러와요, 저장하지 않아요.',
      ),
    ).toBeTruthy()
    const heads = within(box)
      .getAllByRole('columnheader')
      .map((th) => text(th))
    expect(heads).toEqual(['화면에 나온 숫자', '기관 · 자료 이름', '기준 날짜', '고쳐지는 주기', '단위', '왜 보나(근거)', '받는 길 · 이용 조건'])
  })
})

describe('AC-7906.3: 법 근거 — LAW_BASIS를 그 목록 그대로', () => {
  it('AC-7906.3: 아홉 줄이 차례대로 #law-<id> 닻과 무엇·법·조문·쉬운 한 줄·화면에서 쓰는 곳을 글자 그대로 가진다', () => {
    render(<SourcesView />)
    const rows = [...within(region('법 근거')).getByRole('table').querySelectorAll('tbody tr')]
    expect(rows.map((r) => r.id)).toEqual(LAW_BASIS.map((l) => `law-${l.id}`))
    expect(rows).toHaveLength(9)
    for (const l of LAW_BASIS) {
      const cells = cellTexts(rowOf(`law-${l.id}`))
      expect(cells, l.id).toEqual([l.topic, `${l.law}${l.article}`, l.summary, l.usedIn])
    }
  })

  it('AC-7906.3: 조문 주소가 있으면 법 이름이 새 창 링크(noopener noreferrer)이고, 연구 논문(진료권)은 링크가 없다', () => {
    render(<SourcesView />)
    for (const l of LAW_BASIS) {
      const links = [...rowOf(`law-${l.id}`).querySelectorAll('a')]
      if (l.url === null) {
        expect(links, l.id).toHaveLength(0)
        continue
      }
      expect(links, l.id).toHaveLength(1)
      expect(links[0].getAttribute('href'), l.id).toBe(l.url)
      expect(text(links[0]), l.id).toBe(l.law)
      expect(links[0].getAttribute('target'), l.id).toBe('_blank')
      expect(links[0].getAttribute('rel'), l.id).toBe('noopener noreferrer')
    }
    expect(LAW_BASIS.find((l) => l.id === 'catchment')?.url).toBeNull()
  })

  it('AC-7906.3: 아래 글은 시안 그대로다', () => {
    render(<SourcesView />)
    expect(
      within(region('법 근거')).getByText('건물 요건 표의 ○✕는 법을 대신 판단하지 않아요. 보건소·장비 업체·인테리어 업체에 확인하는 차례표예요.'),
    ).toBeTruthy()
  })
})

describe('AC-7906.3: 없는 자료 — MISSING을 그 목록 그대로', () => {
  it('AC-7906.3: 열두 줄이 차례대로 무엇·대신을 글자 그대로 가진다', () => {
    render(<SourcesView />)
    const rows = [...within(region('없는 자료')).getByRole('table').querySelectorAll('tbody tr')]
    expect(rows.map(cellTexts)).toEqual(MISSING.map((m) => [m.what, m.instead]))
    expect(rows).toHaveLength(12)
  })
})

describe('AC-7906.3: 점수는 이렇게 매겨요 — DEFAULT_SCORE_RULE(+ 지금 설정)', () => {
  const scoreRows = () => [...within(region('점수는 이렇게 매겨요')).getByRole('table').querySelectorAll('tbody tr')]

  it('AC-7906.3: 닻은 #src-score이고, 항목 다섯과 세부 항목이 SCORE_GROUPS 차례로 처음 무게·까닭과 함께 있다', () => {
    render(<SourcesView />)
    expect(document.getElementById('src-score')).toBe(region('점수는 이렇게 매겨요'))
    expect(SOURCES.some((s) => s.id === 'score')).toBe(false)
    const rows = scoreRows()
    const expected = SCORE_GROUPS.flatMap((g) => [`group-${g.id}`, ...g.subs.map((s) => `sub-${s.id}`)])
    expect(rows.map((r) => r.getAttribute('data-row'))).toEqual(expected)
    for (const g of SCORE_GROUPS) {
      const cells = cellTexts(rows.find((r) => r.getAttribute('data-row') === `group-${g.id}`)!)
      expect(cells[0], g.id).toBe(g.scan ? g.name : `${g.name}후보에서만`)
      expect(cells[1], g.id).toBe(String(DEFAULT_SCORE_RULE.weights[g.id]))
      for (const s of g.subs) {
        const sub = cellTexts(rows.find((r) => r.getAttribute('data-row') === `sub-${s.id}`)!)
        expect(sub[0], s.id).toBe(g.scan && !s.scan ? `${s.label}후보에서만` : s.label)
        expect(sub[1], s.id).toBe(String(DEFAULT_SCORE_RULE.items[s.id].w))
        expect(sub[3], s.id).toBe(s.why)
      }
    }
  })

  it('AC-7906.3: 만점 기준 글 — 많을수록 하나, 적을수록 둘, 돈은 돈 글자, 음수는 −', () => {
    render(<SourcesView />)
    const rule = (id: string) => cellTexts(rowOf(`score-${id}`))[2]
    expect(rule('p-density')).toBe('10,000명/km²면 100점')
    expect(rule('p-senior')).toBe('25%면 100점')
    expect(rule('p-households')).toBe('20,000세대면 100점')
    expect(rule('p-accidents')).toBe('3곳이면 100점')
    expect(rule('c-perRival')).toBe('20,000명이면 100점')
    expect(rule('c-gaps')).toBe('10칸이면 100점')
    expect(rule('s-elevator')).toBe('1대면 100점')
    expect(rule('s-sign')).toBe('1이면 100점')
    expect(rule('c-count')).toBe('0곳 이하면 100점 · 6곳 이상이면 0점')
    expect(rule('t-station')).toBe('200m 이하면 100점 · 1,500m 이상이면 0점')
    expect(rule('s-floor')).toBe('1층 이하면 100점 · 5층 이상이면 0점')
    expect(rule('k-rentPy')).toBe('50,000원 이하면 100점 · 200,000원 이상이면 0점')
    expect(rule('k-deposit')).toBe('3,000만 원 이하면 100점 · 2억 원 이상이면 0점')
    expect(rule('k-premium')).toBe('0원 이하면 100점 · 1억 원 이상이면 0점')
    expect(rule('k-vsAvg')).toBe('−20% 이하면 100점 · 20% 이상이면 0점')
    // 방향을 고르는 세부 항목(p-welfare)은 다른 방향의 처음 기준도 보인다
    expect(rule('p-welfare')).toBe('5%면 100점적을수록 좋음으로 고르면 1% 이하면 100점 · 5% 이상이면 0점')
  })

  it('AC-7906.3: 셀 나이대 처음 값과 항목 설명(note)이 보이고, 지금 설정을 안 받으면 지금 무게는 처음 무게이고 지금 줄이 없다', () => {
    render(<SourcesView />)
    const box = region('점수는 이렇게 매겨요')
    const bands = DEFAULT_SCORE_RULE.bands.map((i) => AGE_BANDS[i]).join(' · ')
    expect(text(rowOf('score-people'))).toContain(`셀 나이대 ${bands}`)
    for (const g of SCORE_GROUPS.filter((x) => x.note)) expect(text(rowOf(`score-${g.id}`)), g.id).toContain(g.note)
    expect(within(box).getByText(`지금 무게 ${SCORE_GROUPS.map((g) => DEFAULT_SCORE_RULE.weights[g.id]).join(' · ')}`)).toBeTruthy()
    expect(box.querySelectorAll('[data-now]')).toHaveLength(0)
  })

  it('AC-7906.3: 받은 지금 설정이 처음 값과 다르면 그 칸에 지금 값을 함께 보인다(같은 칸은 그대로)', () => {
    const now = copyRule()
    now.weights.people = 40
    now.bands = [5, 6, 7, 8, 9, 10]
    now.items['p-density'] = { w: 20, full: 8000 }
    now.items['c-count'] = { w: 30, best: 1, worst: 8 }
    now.items['k-deposit'] = { w: 15, best: 50_000_000, worst: 300_000_000 }
    now.items['p-welfare'] = { w: 10, best: 2, worst: 6 }
    render(<SourcesView rule={now} />)
    const box = region('점수는 이렇게 매겨요')
    expect(within(box).getByText('지금 무게 40 · 25 · 20 · 15 · 10')).toBeTruthy()
    const nowOf = (id: string) => [...rowOf(`score-${id}`).querySelectorAll('[data-now]')].map(text)
    expect(nowOf('people')).toEqual(['지금 40', `지금 ${now.bands.map((i) => AGE_BANDS[i]).join(' · ')}`])
    expect(nowOf('p-density')).toEqual(['지금 20', '지금 8,000명/km²면 100점'])
    expect(nowOf('c-count')).toEqual(['지금 1곳 이하면 100점 · 8곳 이상이면 0점'])
    expect(nowOf('k-deposit')).toEqual(['지금 5,000만 원 이하면 100점 · 3억 원 이상이면 0점'])
    expect(nowOf('p-welfare')).toEqual(['지금 10', '지금 2% 이하면 100점 · 6% 이상이면 0점'])
    // 처음 값은 그대로 보인다
    expect(cellTexts(rowOf('score-p-density')).slice(1, 3)).toEqual(['40지금 20', '10,000명/km²면 100점지금 8,000명/km²면 100점'])
    // 바꾸지 않은 칸에는 지금 줄이 없다
    expect(nowOf('rivals')).toEqual([])
    expect(nowOf('p-senior')).toEqual([])
    // 사는 사람·수요 무게·나이대 2 + p-density 2 + c-count 1 + k-deposit 1 + p-welfare 2
    expect(box.querySelectorAll('[data-now]')).toHaveLength(8)
  })

  it('AC-7906.3: 값이 같은 다른 설정(복사본)을 받으면 지금 줄이 없다', () => {
    render(<SourcesView rule={copyRule()} />)
    expect(region('점수는 이렇게 매겨요').querySelectorAll('[data-now]')).toHaveLength(0)
  })

  it('AC-7906.3: 아래 글에 매기는 법과 범위 기준(기본 범위 1km)이 있다', () => {
    render(<SourcesView />)
    const box = text(region('점수는 이렇게 매겨요'))
    expect(box).toContain('세부 항목마다 만점 기준으로 0~100점을 매기고')
    expect(box).toContain('기본 범위 1km(약 3.14km²)')
    expect(box).toContain('세부 무게와 만점 기준은 동네 훑기의 점수 무게 판 [세부]에서 바꿔요.')
  })
})

describe('AC-7906.3: 주소 끝 닻(#src-<id>·#law-<id>)으로 열면 그 줄로 간다', () => {
  it('AC-7906.3: 열 때 주소가 #src-<id>이면 그 줄을 가운데로 보이고 표시한다', () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    window.history.replaceState(null, '', '/location?tab=sources#src-hosp-list')
    render(<SourcesView />)
    expect(rowOf('src-hosp-list').getAttribute('data-hit')).toBe('true')
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(rowOf('src-pop-age').getAttribute('data-hit')).toBeNull()
  })

  it('AC-7906.3: 열어 둔 채 주소 끝이 #law-<id>·#src-score로 바뀌면 그 줄·칸으로 옮긴다', () => {
    Element.prototype.scrollIntoView = vi.fn()
    render(<SourcesView />)
    act(() => {
      window.history.replaceState(null, '', '/location?tab=sources#law-violation')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(rowOf('law-violation').getAttribute('data-hit')).toBe('true')
    act(() => {
      window.history.replaceState(null, '', '/location?tab=sources#src-score')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(rowOf('law-violation').getAttribute('data-hit')).toBeNull()
    expect(document.getElementById('src-score')?.getAttribute('data-hit')).toBe('true')
  })

  it('AC-7906.3: 이 화면에 없는 닻이면 아무것도 표시하지 않는다', () => {
    Element.prototype.scrollIntoView = vi.fn()
    window.history.replaceState(null, '', '/location?tab=sources#src-none')
    render(<SourcesView />)
    expect(document.querySelectorAll('[data-hit]')).toHaveLength(0)
  })
})

// ── 소스 글자 시험: 목록만 읽어 그리기 · 같은 Phase의 common/을 부르지 않음 · PC 모양만 · 화면 글에 영어 낱말 없음 ──
const DIR = 'src/components/location/sources'
const FILES = readdirSync(join(process.cwd(), DIR)).filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
const read = (f: string) => readFileSync(join(process.cwd(), DIR, f), 'utf8')

describe('AC-7906.3: 화면 소스 — 목록만 읽어 그리고(따로 적은 글 없음) 폰 전용 모양이 없다', () => {
  it('AC-7906.3: 살펴볼 소스가 있다(빈 검사가 아니다)', () => {
    expect(FILES).toContain('SourcesView.tsx')
  })

  it('AC-7906.3: 출처·법 근거·없는 자료·세부 항목 글을 소스에 따로 적지 않는다', () => {
    const lists = [
      ...SOURCES.flatMap((s) => [s.name, s.terms, s.why, s.unit, s.shows]),
      ...LAW_BASIS.flatMap((l) => [l.summary, l.article, l.usedIn]),
      ...MISSING.flatMap((m) => [m.what, m.instead]),
      ...SCORE_GROUPS.flatMap((g) => g.subs.flatMap((s) => [s.label, s.why])),
    ].filter((t) => t.length >= 6)
    for (const f of FILES) {
      const code = read(f)
      expect(lists.filter((t) => code.includes(t)), f).toEqual([])
    }
  })

  it('AC-7906.3: 같은 Phase의 components/location/common을 부르지 않는다', () => {
    for (const f of FILES) expect(read(f), f).not.toMatch(/location\/common|\.\.\/common/)
  })

  it('AC-7906.3: 화면 폭 앞말(sm:·md:·lg:·max-md: 등)이 없고, 가져다 쓰는 ds 묶음에도 없다', () => {
    const variant = /(?<![\w\-[])(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]\s]*\]):/
    for (const f of FILES) {
      const code = read(f)
      expect(code, f).not.toMatch(variant)
      for (const m of code.matchAll(/\bds\.([A-Za-z]\w*(?:\.[A-Za-z]\w*)*)/g)) {
        const value = m[1].split('.').reduce<unknown>((v, k) => (v && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), ds)
        expect(typeof value, `ds.${m[1]}`).toBe('string')
        expect(String(value), `ds.${m[1]}`).not.toMatch(/(?:^|\s)(?:max-|min-)?(?:sm|md|lg|\d*xl):/)
      }
    }
  })

  it('AC-7906.3: 화면 글에 영어 낱말이 없다(목록에서 온 이름·단위는 그대로)', () => {
    const now = copyRule()
    now.weights.cost = 5
    render(<SourcesView rule={now} asOf={{ 'pop-age': '2026년 10월 말' }} />)
    let rest = document.body.textContent ?? ''
    const fromLists = [
      ...SOURCES.flatMap((s) => [s.shows, s.org, s.name, s.cycle, s.unit, s.why, s.terms]),
      ...Object.values(VIA_TEXT),
      ...Object.values(KEY_TEXT),
      ...LAW_BASIS.flatMap((l) => [l.topic, l.law, l.article, l.summary, l.usedIn]),
      ...MISSING.flatMap((m) => [m.what, m.instead]),
      ...SCORE_GROUPS.flatMap((g) => [g.name, g.note, ...g.subs.flatMap((s) => [s.label, s.why])]),
    ]
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
    for (const t of fromLists) rest = rest.split(t).join(' ')
    // 단위(km·km²·m)는 된다
    const words = (rest.match(/[A-Za-z]+/g) ?? []).filter((w) => !['km', 'm'].includes(w))
    expect(words).toEqual([])
  })
})
