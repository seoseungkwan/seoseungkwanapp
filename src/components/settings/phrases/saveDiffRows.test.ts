import { describe, expect, it } from 'vitest'
import { ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { saveDiffRows } from './saveDiffRows'

// 저장 전 비교 표의 줄(memo-settings AC-3007.5, clinic-profile AC-6608.5·AC-6612.1·AC-6613.3). diffPhrases 위에 코드 칸·시술별 약·부위 칸·약 역할을 쉬운 이름표로 바꾼다(AC-3006.2: 골든이 diffPhrases의 코드 칸 이름표를 원본 그대로 보므로 화면에서 바꾼다)

const our = ourClinicPhrases
const changed = (edit: (p: Phrases) => void) => {
  const value = our()
  edit(value)
  return value
}
const rowsOf = (edit: (p: Phrases) => void) => saveDiffRows(our(), changed(edit)).map(({ label, before, after }) => ({ label, before, after }))

describe('AC-3006.2 코드 칸 이름표', () => {
  it('AC-3006.2: 코드 칸은 "코드 · 칸 이름"으로, 구분·부위는 쉬운 말로 보인다', () => {
    expect(
      rowsOf((p) => {
        p.CODEMAP.KK090 = { ...p.CODEMAP.KK090, n: 'IA주사', k: 'skip', rg: 'knee', memo: '관절강내 주사' }
      }),
    ).toEqual([
      { label: 'KK090 · 구분', before: '시술', after: '제외' },
      { label: 'KK090 · 메모 문구', before: '(없음)', after: '관절강내 주사' },
      { label: 'KK090 · 메모 이름', before: 'IA', after: 'IA주사' },
      { label: 'KK090 · 부위', before: '자동', after: '무릎' },
    ])
  })

  it('AC-3006.2: 새 코드는 칸마다 (없음)에서 바뀐 값으로 보인다', () => {
    expect(
      rowsOf((p) => {
        p.CODEMAP.AA254 = { n: '재진진찰료', k: 'skip', rg: null }
      }),
    ).toEqual([
      { label: 'AA254 · 구분', before: '(없음)', after: '제외' },
      { label: 'AA254 · 메모 이름', before: '(없음)', after: '재진진찰료' },
      { label: 'AA254 · 부위', before: '(없음)', after: '자동' },
    ])
  })

  it('AC-3006.2: 지운 코드 목록은 쉬운 이름표와 코드 목록으로 보인다', () => {
    expect(rowsOf((p) => p.CODEMAP_DEL.push('LA247'))).toEqual([{ label: '지운 코드', before: '(없음)', after: 'LA247' }])
  })

  it('AC-3006.2: memoRules 칸은 diffPhrases 이름표 그대로다', () => {
    expect(rowsOf((p) => (p.memoRules = { iaSide: true, order: { KK090: 1 } }))).toEqual([
      { label: 'IA·건초내주사 줄에 좌우 넣기', before: '끔', after: '켬' },
      { label: 'KK090 · 줄 순서', before: '(없음)', after: '1' },
    ])
  })
})

describe('AC-3007.5 비교 표 줄', () => {
  it('AC-3007.5: 문구 칸은 원본 이름표로 전·후가 보인다', () => {
    expect(rowsOf((p) => (p.TPL.mark = '★'))).toEqual([{ label: '줄머리 기호', before: '◈', after: '★' }])
  })

  it('AC-3007.5: 시술별 약은 시술·약 한 줄로 넣기·빼기와 자리를 보인다', () => {
    expect(
      rowsOf((p) => {
        p.procedureDrugs.KK090 = { ...p.procedureDrugs.KK090, 트리암: { use: 'exclude' }, 새약: { use: 'include', place: 'ownLine', label: 'new' } }
      }),
    ).toEqual([
      { label: 'KK090 · 새약', before: '(안 정함)', after: '넣기 · 따로 한 줄 · 표기 new' },
      { label: 'KK090 · 트리암', before: '넣기 · 시술 뒤 · 표기 triam', after: '빼기' },
    ])
  })

  it('AC-3007.5: 시술 이름별·부위별 문구와 부위 영어 표기는 칸 이름과 함께 보인다', () => {
    expect(
      rowsOf((p) => {
        p.TPL.byProc = { SSNB: '{C-arm} SSNB' }
        p.TPL.byRegion = { knee: '{좌우} knee {시술}' }
        p.TPL.siteNames = { cervical: 'C', lumbar: 'L', shoulder: 'shoulder', knee: 'Knee', ankle: 'ankle', elbow: 'elbow', wrist: 'wrist', hand: 'hand', hip: 'hip', chest: 'rib', foot: 'foot', upper: 'upper extremity' }
      }),
    ).toEqual([
      { label: '시술 이름별 문구 · SSNB', before: '(없음)', after: '{C-arm} SSNB' },
      { label: '부위별 문구 · 무릎', before: '(없음)', after: '{좌우} knee {시술}' },
      { label: '부위 영어 표기 · 무릎', before: 'knee', after: 'Knee' },
    ])
  })

  it('AC-3007.5: 고정 멘트는 단추 이름과 글로 보인다(칸이 없으면 처음 멘트)', () => {
    expect(rowsOf((p) => (p.TPL.fixedPhrases = [{ token: 'C-arm', text: 'C-arm 하에', on: true }, { token: 'Sono', text: 'Sono guide 하에', on: false }]))).toEqual([
      { label: '고정 멘트', before: '{C-arm} C-arm guide 하에 · {Sono} Sono guide 하에 · {시행함} 시행함', after: '{C-arm} C-arm 하에 · {Sono} Sono guide 하에 (끔)' },
    ])
  })

  it('AC-3007.5: 바뀐 것이 없으면 빈 목록이다', () => {
    expect(saveDiffRows(our(), our())).toEqual([])
  })
})

describe('AC-6608.5 약 역할 줄', () => {
  it('AC-6608.5: 약 역할 깃발은 칸마다가 아니라 "코드 · 역할" 한 줄로 고른 이름이 보인다', () => {
    expect(rowsOf((p) => (p.CODEMAP.A15 = { ...p.CODEMAP.A15, steroid: true }))).toEqual([{ label: 'A15 · 역할', before: '자동', after: '스테로이드' }])
    expect(rowsOf((p) => (p.CODEMAP.A19 = { ...p.CODEMAP.A19, steroid: false, localAnesthetic: false, cartilage: false }))).toEqual([{ label: 'A19 · 역할', before: '자동', after: '아님' }])
    const steroid = changed((p) => (p.CODEMAP.A15 = { ...p.CODEMAP.A15, steroid: true }))
    const local = changed((p) => (p.CODEMAP.A15 = { ...p.CODEMAP.A15, localAnesthetic: true }))
    expect(saveDiffRows(steroid, local).map(({ label, before, after }) => ({ label, before, after }))).toEqual([{ label: 'A15 · 역할', before: '스테로이드', after: '마취약' }])
  })

  it('AC-6608.5: 새 코드에 역할을 고르면 다른 칸과 함께 역할 줄이 보인다', () => {
    expect(rowsOf((p) => (p.CODEMAP.A55 = { n: '소론도정', k: 'drug', rg: null, cartilage: true }))).toEqual([
      { label: 'A55 · 역할', before: '자동', after: '연골주사' },
      { label: 'A55 · 구분', before: '(없음)', after: '약' },
      { label: 'A55 · 메모 이름', before: '(없음)', after: '소론도정' },
      { label: 'A55 · 부위', before: '(없음)', after: '자동' },
    ])
  })
})

describe('AC-6612.1·AC-6613 새 칸 줄', () => {
  it("AC-6612.1: 차트 줄임말은 '차트 줄임말' 한 줄로 '적으면 = 읽어요'가 보인다", () => {
    expect(rowsOf((p) => (p.chartWords = [{ term: '무주', target: 'IA' }, { term: '묵', target: 'MBB' }]))).toEqual([{ label: '차트 줄임말', before: '(없음)', after: '무주 = IA, 묵 = MBB' }])
  })

  it("AC-6613.1·AC-6613.3: '두 사유가 겹칠 때'는 고르기 이름으로 보이고, 값 없음과 'twoSite'는 같은 '2부위 사유 먼저'다", () => {
    expect(rowsOf((p) => (p.TPL.reasonPriority = 'interval'))).toEqual([{ label: '두 사유가 겹칠 때', before: '2부위 사유 먼저', after: '주사 간격 사유 먼저' }])
    expect(rowsOf((p) => (p.TPL.reasonPriority = 'both'))).toEqual([{ label: '두 사유가 겹칠 때', before: '2부위 사유 먼저', after: '둘 다' }])
    expect(rowsOf((p) => delete p.TPL.reasonPriority)).toEqual([])
  })

  it('AC-6613.1·AC-6613.3: 비운 코드 칸은 엔진 기본값을 쓴다고 보이고, 고친 칸은 phrases.ts 이름표로 보인다', () => {
    expect(rowsOf((p) => delete p.TPL.intervalCodes)).toEqual([{ label: '주사 간격을 볼 처방코드', before: 'LA358, KK090', after: '기본값: LA358, KK090' }])
    expect(rowsOf((p) => (p.TPL.mainCentralCodes = 'LA321'))).toEqual([{ label: 'Central 시술 처방코드', before: 'LA321, LA323, LA326, LA354, LA356, LA357, LA358, LA359', after: 'LA321' }])
    expect(rowsOf((p) => (p.TPL.twoSiteRules = 'KK090'))).toEqual([{ label: '2부위로 보는 처방', before: 'KK090 = LA274, LA272\nKK061\nKK062', after: 'KK090' }])
  })
})
