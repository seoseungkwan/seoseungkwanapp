import { readFileSync } from 'node:fs'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { NoticeMark, NoticeView, RuleAlert } from '@/types/notices'
import type { RuleChangeAlert, RuleTally } from '@/types/ruleAuto'
import { badgeText, changeBandText, chipChangedText, fromText, humanBandText, ruleChips } from './ruleView'

// 점검 규칙 저절로 바꾸기 화면 글자(specs/rule-auto design 11절). 글자는 시안 notes.md '화면 글자'(index.html T) 그대로다.
// {번호}는 view.ts noticeNoText('2026-251') = '보건복지부 고시 제2026-251호', {날짜}는 '12월 1일' 꼴

const change = (id: string, noticeNo: string | null, changeCount: number): RuleChangeAlert => ({ id, noticeNo, title: `글 ${id}`, changeCount })
const human = (id: string, noticeNo: string | null, ruleCount: number): RuleAlert => ({ id, noticeNo, title: `글 ${id}`, ruleCount })
const tally = (changed: number, human: number, pending: number): RuleTally => ({ changed, human, pending })

describe('AC-7801.2 대시보드 맨 위 띠 글', () => {
  it('AC-7801.2: 바뀜 띠 — 글 하나·고시 번호 있음은 `새 고시({번호})로 점검 규칙 {n}개가 저절로 바뀌었어요. …`다', () => {
    expect(changeBandText([change('a', '2026-251', 2)])).toBe(
      '새 고시(보건복지부 고시 제2026-251호)로 점검 규칙 2개가 저절로 바뀌었어요. 틀려 보이면 글 화면에서 되돌릴 수 있어요.',
    )
  })

  it('AC-7801.2: 바뀜 띠 — 글 하나·번호 없음은 `새 글로 점검 규칙 {n}개가 저절로 바뀌었어요. …`다', () => {
    expect(changeBandText([change('a', null, 1)])).toBe('새 글로 점검 규칙 1개가 저절로 바뀌었어요. 틀려 보이면 글 화면에서 되돌릴 수 있어요.')
    expect(changeBandText([change('a', '', 3)])).toBe('새 글로 점검 규칙 3개가 저절로 바뀌었어요. 틀려 보이면 글 화면에서 되돌릴 수 있어요.')
  })

  it('AC-7801.2: 바뀜 띠 — 글 둘 이상은 k = 글 수, n = 바뀐 줄 수 합이고 번호 유무와 상관없다', () => {
    expect(changeBandText([change('a', '2026-251', 2), change('b', null, 3)])).toBe(
      '새 고시 2개로 점검 규칙 5개가 저절로 바뀌었어요. 틀려 보이면 글 화면에서 되돌릴 수 있어요.',
    )
    expect(changeBandText([change('a', '2026-251', 1), change('b', '2026-255', 1), change('c', null, 4)])).toBe(
      '새 고시 3개로 점검 규칙 6개가 저절로 바뀌었어요. 틀려 보이면 글 화면에서 되돌릴 수 있어요.',
    )
  })

  it('AC-7801.2: 사람이 봐야 함 띠 — 글 하나·고시 번호 있음은 `새 고시({번호})가 점검 규칙 {n}개를 바꿨는데, …`다', () => {
    expect(humanBandText([human('a', '2026-251', 2)])).toBe(
      '새 고시(보건복지부 고시 제2026-251호)가 점검 규칙 2개를 바꿨는데, 저절로 고칠 수 없는 내용이라 직접 확인해야 해요.',
    )
  })

  it('AC-7801.2: 사람이 봐야 함 띠 — 글 하나·번호 없음은 `새 글이 점검 규칙 {n}개를 바꿨는데, …`다', () => {
    expect(humanBandText([human('a', null, 1)])).toBe('새 글이 점검 규칙 1개를 바꿨는데, 저절로 고칠 수 없는 내용이라 직접 확인해야 해요.')
  })

  it('AC-7801.2: 사람이 봐야 함 띠 — 글 둘 이상은 k = 글 수, n = 사람이 봐야 함 줄 수 합이다', () => {
    expect(humanBandText([human('a', '2026-251', 2), human('b', null, 5)])).toBe(
      '새 고시 2개가 점검 규칙 7개를 바꿨는데, 저절로 고칠 수 없는 내용이라 직접 확인해야 해요.',
    )
  })

  it('AC-7801.2: 띠 글 함수는 받은 목록을 바꾸지 않는다', () => {
    const alerts = [change('a', '2026-251', 2), change('b', null, 3)]
    const copy = structuredClone(alerts)
    changeBandText(alerts)
    expect(alerts).toEqual(copy)
  })
})

describe('AC-7801.2 날짜 글 · 칩 글', () => {
  it('AC-7801.2: fromText(2026-12-01)은 `12월 1일 진료부터 적용`이다', () => {
    expect(fromText('2026-12-01')).toBe('12월 1일 진료부터 적용')
    expect(fromText('2027-01-15')).toBe('1월 15일 진료부터 적용')
  })

  it('AC-7801.2: badgeText(2026-11-20)은 `고시로 바뀜 · 11월 20일부터`다', () => {
    expect(badgeText('2026-11-20')).toBe('고시로 바뀜 · 11월 20일부터')
  })

  it('AC-7801.2: chipChangedText(2)는 `점검 규칙 2개 바뀜`이다', () => {
    expect(chipChangedText(2)).toBe('점검 규칙 2개 바뀜')
    expect(chipChangedText(11)).toBe('점검 규칙 11개 바뀜')
  })

  it('AC-7801.2: 날짜 모양이 아니면 던진다(view.ts dayText·dates.ts와 같다)', () => {
    expect(() => fromText('2026-13-01')).toThrow()
    expect(() => badgeText('11월 20일')).toThrow()
  })
})

describe('AC-7801.3 글 목록 규칙 칩 고르기', () => {
  it('AC-7801.3: 사람이 봐야 함 > 0이고 확인하지 않았으면 `점검 규칙 확인 필요`(노랑)다', () => {
    expect(ruleChips(tally(0, 2, 0), null)).toEqual([{ text: '점검 규칙 확인 필요', tone: 'w' }])
  })

  it('AC-7801.3: 사람이 봐야 함 > 0이고 확인했으면 `점검 규칙 확인함`(회색)이다', () => {
    expect(ruleChips(tally(0, 2, 0), '2026-11-22T00:12:00Z')).toEqual([{ text: '점검 규칙 확인함', tone: 'n' }])
  })

  it('AC-7801.3: 바뀜 > 0이면 `점검 규칙 {n}개 바뀜`(파랑)이 사람이 봐야 함 칩 뒤에 온다', () => {
    expect(ruleChips(tally(2, 1, 0), null)).toEqual([
      { text: '점검 규칙 확인 필요', tone: 'w' },
      { text: '점검 규칙 2개 바뀜', tone: 'a' },
    ])
    expect(ruleChips(tally(1, 3, 0), '2026-11-22T00:12:00Z')).toEqual([
      { text: '점검 규칙 확인함', tone: 'n' },
      { text: '점검 규칙 1개 바뀜', tone: 'a' },
    ])
  })

  it('AC-7801.3: 바뀜만 있으면 바뀜 칩 하나다(살펴보는 중이 남아도 살펴보는 중 칩은 없다)', () => {
    expect(ruleChips(tally(2, 0, 0), null)).toEqual([{ text: '점검 규칙 2개 바뀜', tone: 'a' }])
    expect(ruleChips(tally(2, 0, 3), null)).toEqual([{ text: '점검 규칙 2개 바뀜', tone: 'a' }])
    expect(ruleChips(tally(0, 1, 3), null)).toEqual([{ text: '점검 규칙 확인 필요', tone: 'w' }])
  })

  it('AC-7801.3: 바뀜·사람이 봐야 함이 둘 다 0이고 살펴보는 중 > 0이면 `점검 규칙 살펴보는 중`(회색)이다', () => {
    expect(ruleChips(tally(0, 0, 4), null)).toEqual([{ text: '점검 규칙 살펴보는 중', tone: 'n' }])
    expect(ruleChips(tally(0, 0, 1), '2026-11-22T00:12:00Z')).toEqual([{ text: '점검 규칙 살펴보는 중', tone: 'n' }])
  })

  it('AC-7801.3: 바꿀 것 없음만(모두 0)·tally null·없음이면 빈 목록이다', () => {
    expect(ruleChips(tally(0, 0, 0), null)).toEqual([])
    expect(ruleChips(tally(0, 0, 0), '2026-11-22T00:12:00Z')).toEqual([])
    expect(ruleChips(null, null)).toEqual([])
    expect(ruleChips(undefined, '2026-11-22T00:12:00Z')).toEqual([])
  })

  it('AC-7801.3: 부를 때마다 새 목록이다(받은 값을 바꾸지 않는다)', () => {
    const t = tally(1, 1, 0)
    const a = ruleChips(t, null)
    a.push({ text: 'x', tone: 'n' })
    expect(ruleChips(t, null)).toHaveLength(2)
    expect(t).toEqual(tally(1, 1, 0))
  })

  // 타입은 시험이 돌 때 사라지므로 tsc가 본다(npx tsc --noEmit): 목록 줄의 칸을 그대로 넘길 수 있다(AC-7815.1)
  it('AC-7801.3: ruleChips는 NoticeView.ruleTally(없음·null 포함)와 NoticeMark.rulesCheckedAt을 그대로 받는다', () => {
    expectTypeOf<NoticeView['ruleTally']>().toEqualTypeOf<RuleTally | null | undefined>()
    expectTypeOf<NoticeMark['rulesCheckedAt']>().toEqualTypeOf<string | null>()
    expectTypeOf(ruleChips).parameter(0).toEqualTypeOf<RuleTally | null | undefined>()
    expectTypeOf(ruleChips).parameter(1).toEqualTypeOf<string | null>()
    expectTypeOf(ruleChips).returns.toEqualTypeOf<{ text: string; tone: 'w' | 'a' | 'n' }[]>()
  })
})

describe('순수 모듈', () => {
  // 화면(브라우저)이 부른다: 서버 전용 코드·네트워크·DB·저장소·console 없이 view.ts와 타입만 쓴다
  const source = readFileSync(new URL('./ruleView.ts', import.meta.url), 'utf8')

  it('AC-7801.2·AC-7801.3: ruleView.ts는 view.ts와 고시·공지·규칙 타입만 import한다', () => {
    const imports = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2])
    expect(imports.length).toBeGreaterThan(0)
    for (const spec of imports) expect(['./view', '@/types/notices', '@/types/ruleAuto']).toContain(spec)
  })

  it('AC-7801.2·AC-7801.3: ruleView.ts는 네트워크·저장소·console을 쓰지 않는다', () => {
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|console)\b/)
  })
})
