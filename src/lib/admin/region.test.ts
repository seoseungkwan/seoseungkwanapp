import { describe, expect, it } from 'vitest'
import { REGION_UNKNOWN, SIDO_LIST, regionOf, roParticle, sidoOf } from './region'

// 지역 읽기 — 순수 함수 (admin-view REQ-8013, design.md '지역'·기본값 12·13).
// 시·도는 시안의 17개 차례, 화면의 '지역 모름'은 목록 밖 값(null). 주소는 병원 정보에 그냥 적은 글자 한 칸이라
// 정식·옛·줄인 이름, 우편번호·'대한민국' 머리, 붙여 쓴 꼴, 쉼표를 모두 읽는다. '광주시'만 적힌 주소는 경기 광주시와 헷갈려 지역 모름이다.
// 가짜 주소만 쓴다

// 시안 index.html의 REGIONS 차례 그대로
const SIDO = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']

// design.md '지역' 이름 표(시·도 → 맞추는 이름)
const NAMES: [string, string[]][] = [
  ['서울', ['서울특별시', '서울시', '서울']],
  ['부산', ['부산광역시', '부산시', '부산']],
  ['대구', ['대구광역시', '대구시', '대구']],
  ['인천', ['인천광역시', '인천시', '인천']],
  ['광주', ['광주광역시', '광주']],
  ['대전', ['대전광역시', '대전시', '대전']],
  ['울산', ['울산광역시', '울산시', '울산']],
  ['세종', ['세종특별자치시', '세종시', '세종']],
  ['경기', ['경기도', '경기']],
  ['강원', ['강원특별자치도', '강원도', '강원']],
  ['충북', ['충청북도', '충북']],
  ['충남', ['충청남도', '충남']],
  ['전북', ['전북특별자치도', '전라북도', '전북']],
  ['전남', ['전라남도', '전남']],
  ['경북', ['경상북도', '경북']],
  ['경남', ['경상남도', '경남']],
  ['제주', ['제주특별자치도', '제주도', '제주시', '제주']],
]
const NAME_ROWS = NAMES.flatMap(([sido, names]) => names.map((name) => [name, sido] as const))
// 3글자 이상(정식·옛 이름) — 띄어쓰기 없이 붙여 써도 읽는다
const LONG_ROWS = NAME_ROWS.filter(([name]) => name.length >= 3)
// 2글자 줄인 이름 — 붙여 쓴 꼴로는 읽지 않는다(경기광주… 처럼 헷갈림)
const SHORT_ROWS = NAME_ROWS.filter(([name]) => name.length === 2)

describe('AC-8013.1 SIDO_LIST — 시안의 17개 시·도, 그 차례', () => {
  it('AC-8013.1: 서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주 17개가 이 차례다', () => {
    expect([...SIDO_LIST]).toEqual(SIDO)
    expect(SIDO_LIST).toHaveLength(17)
  })

  it('AC-8013.1: 이름 표의 시·도가 SIDO_LIST와 같은 차례로 모두 있다(시험 준비 확인)', () => {
    expect(NAMES.map(([sido]) => sido)).toEqual(SIDO)
  })

  it('AC-8013.1·AC-8013.3: 지역 모름(목록 밖 값)은 SIDO_LIST에 없고 화면 글은 `지역 모름`이다', () => {
    expect(REGION_UNKNOWN).toBe('지역 모름')
    expect(SIDO_LIST as readonly string[]).not.toContain(REGION_UNKNOWN)
  })
})

describe('AC-8013.2 sidoOf — 이름 표의 이름마다 한 줄', () => {
  it.each(NAME_ROWS)('AC-8013.2: `%s 가짜구 가짜로 1` → %s', (name, sido) => {
    expect(sidoOf(`${name} 가짜구 가짜로 1`)).toBe(sido)
  })

  it.each(NAME_ROWS)('AC-8013.2: 이름만 `%s` → %s', (name, sido) => {
    expect(sidoOf(name)).toBe(sido)
  })

  it.each(NAME_ROWS)('AC-8013.2: 쉼표 앞 첫 낱말 `%s, 가짜구 가짜로 1` → %s', (name, sido) => {
    expect(sidoOf(`${name}, 가짜구 가짜로 1`)).toBe(sido)
    expect(sidoOf(`${name},가짜구 가짜로 1`)).toBe(sido)
  })
})

describe('AC-8013.2 sidoOf — 붙여 쓴 꼴(띄어쓰기 없음)', () => {
  it.each(LONG_ROWS)('AC-8013.2: 3글자 이상 `%s`에 바로 붙은 `%s가짜구 가짜로 1` → 그 시·도', (name, sido) => {
    expect(sidoOf(`${name}가짜구 가짜로 1`)).toBe(sido)
  })

  it.each([
    ['서울특별시강남구 가짜로 1', '서울'],
    ['경기도성남시 분당구 가짜로 2', '경기'],
    ['강원특별자치도춘천시 가짜로 3', '강원'],
    ['전북특별자치도전주시 가짜로 4', '전북'],
    ['제주특별자치도제주시 가짜로 5', '제주'],
  ])('AC-8013.2: `%s` → %s', (address, sido) => {
    expect(sidoOf(address)).toBe(sido)
  })

  it.each(SHORT_ROWS)('AC-8013.2: 2글자 줄인 이름 `%s`에 바로 붙은 꼴(`%s가짜구…`)은 읽지 않는다 → null', (name) => {
    expect(sidoOf(`${name}가짜구 가짜로 1`)).toBeNull()
  })

  it('AC-8013.2: `경기광주시 오포읍 …`(2글자 줄인 이름 + 광주시)은 지역 모름 → null', () => {
    expect(sidoOf('경기광주시 오포읍 가짜로 1')).toBeNull()
  })
})

describe('AC-8013.2 sidoOf — 우편번호·대한민국·빈칸', () => {
  it.each([
    ['(06236) 서울특별시 가짜구 가짜로 1', '서울'],
    ['06236 서울 가짜구 가짜로 1', '서울'],
    ['[48058] 부산광역시 가짜구 가짜로 2', '부산'],
    ['(48058)부산광역시 가짜구 가짜로 2', '부산'],
    ['대한민국 서울특별시 가짜구 가짜로 1', '서울'],
    ['대한민국 경기도 가짜시 가짜로 3', '경기'],
    ['(06236) 대한민국 서울특별시 가짜구 가짜로 1', '서울'],
    ['대한민국 (06236) 서울특별시 가짜구 가짜로 1', '서울'],
    ['대한민국, 인천광역시 가짜구 가짜로 4', '인천'],
  ])('AC-8013.2: `%s` → %s', (address, sido) => {
    expect(sidoOf(address)).toBe(sido)
  })

  it.each([
    ['   서울특별시   가짜구    가짜로 1  ', '서울'],
    ['경기도\t가짜시  가짜로 3', '경기'],
    ['\n 대구광역시 \n 가짜구', '대구'],
    ['  전남광주통합특별시    광산구   가짜로 1', '광주'],
  ])('AC-8013.2: 앞뒤 빈칸·빈칸 여럿 `%j` → %s', (address, sido) => {
    expect(sidoOf(address)).toBe(sido)
  })
})

describe('AC-8013.2 sidoOf — 광주·전남(따로), 전남광주통합특별시', () => {
  it.each([
    ['광주 북구 가짜로 1', '광주'],
    ['광주광역시 광산구 가짜로 2', '광주'],
    ['경기 광주시 오포읍 가짜로 3', '경기'],
    ['경기도 광주시 가짜로 4', '경기'],
    ['전라남도 순천시 가짜로 5', '전남'],
    ['전남 여수시 가짜로 6', '전남'],
    ['전남광주통합특별시 광산구 가짜로 7', '광주'],
    ['전남광주통합특별시 북구 가짜로 8', '광주'],
    ['전남광주통합특별시 동구 가짜로 9', '광주'],
    ['전남광주통합특별시 순천시 가짜로 10', '전남'],
    ['전남광주통합특별시 담양군 가짜면 11', '전남'],
    ['전남광주통합특별시, 서구 가짜로 12', '광주'],
    ['전남광주 남구 가짜로 13', '광주'],
    ['전남광주 목포시 가짜로 14', '전남'],
    ['전남광주통합특별시광산구 가짜로 15', '광주'],
    ['전남광주통합특별시순천시 가짜로 16', '전남'],
  ])('AC-8013.2: `%s` → %s', (address, sido) => {
    expect(sidoOf(address)).toBe(sido)
  })

  it.each(['광주시 오포읍 가짜로 1', '광주시', '광주시, 가짜로 2', '광주시가짜읍 가짜로 3'])(
    'AC-8013.2: `광주시`만 적힘 `%s`(경기 광주시와 헷갈림) → null',
    (address) => {
      expect(sidoOf(address)).toBeNull()
    },
  )
})

describe('AC-8013.2 sidoOf — 옛·새 정식 이름', () => {
  it.each([
    ['전라북도 전주시 가짜로 1', '전북'],
    ['전북특별자치도 전주시 가짜로 1', '전북'],
    ['강원도 춘천시 가짜로 2', '강원'],
    ['강원특별자치도 춘천시 가짜로 2', '강원'],
    ['제주특별자치도 제주시 가짜로 3', '제주'],
    ['제주도 서귀포시 가짜로 4', '제주'],
    ['세종특별자치시 가짜로 5', '세종'],
  ])('AC-8013.2: `%s` → %s', (address, sido) => {
    expect(sidoOf(address)).toBe(sido)
  })
})

describe('AC-8013.2 sidoOf — 시·도가 없음·빈 글', () => {
  it.each([
    ['성남시 분당구 가짜로 1'],
    ['수원시 가짜구 가짜로 2'],
    ['가짜구 가짜로 3'],
    ['Seoul Gangnam-gu'],
    ['12345'],
    ['대한민국'],
    [''],
    ['   '],
  ])('AC-8013.2: `%j` → null', (address) => {
    expect(sidoOf(address)).toBeNull()
  })

  it('AC-8013.2: null·undefined → null', () => {
    expect(sidoOf(null)).toBeNull()
    expect(sidoOf(undefined)).toBeNull()
  })
})

describe('AC-8013.2 sidoOf — 저장소 안 예 넷(design.md 조사로 안 것 10)', () => {
  it.each([
    ['서울 가짜구 가짜로 1', '서울'],
    ['서울시 예시구 예시로 12, 3층', '서울'],
    ['경기도 예시시 예시로 45', '경기'],
    ['서울특별시 서초구 서초동 123-4', '서울'],
  ])('AC-8013.2: `%s` → %s', (address, sido) => {
    expect(sidoOf(address)).toBe(sido)
  })
})

describe('AC-8013.3 regionOf — 관리자가 정한 지역 먼저, 없으면 주소에서', () => {
  it('AC-8013.3: 정한 줄이 없으면(undefined) 주소에서 읽은 시·도다', () => {
    expect(regionOf('서울특별시 가짜구 가짜로 1', undefined)).toBe('서울')
    expect(regionOf('경기 광주시 가짜로 2')).toBe('경기')
    expect(regionOf('광주시 가짜로 3', undefined)).toBeNull()
    expect(regionOf(null, undefined)).toBeNull()
  })

  it('AC-8013.3: 정한 값이 있으면 주소와 상관없이 그 값이다', () => {
    expect(regionOf('서울특별시 가짜구 가짜로 1', '부산')).toBe('부산')
    expect(regionOf(null, '제주')).toBe('제주')
    expect(regionOf('광주시 가짜로 3', '경기')).toBe('경기')
  })

  it('AC-8013.3: 정한 값이 null(지역 모름으로 정함)이면 주소가 있어도 null이다', () => {
    expect(regionOf('서울특별시 가짜구 가짜로 1', null)).toBeNull()
    expect(regionOf(null, null)).toBeNull()
  })

  it.each(SIDO)('AC-8013.3: 정한 값 %s는 그대로 돌려준다', (sido) => {
    expect(regionOf('부산광역시 가짜구', sido)).toBe(sido)
  })

  it('AC-8013.3: 17개 밖의 정한 값(DB 제약 밖)은 지역 모름(null)으로 본다', () => {
    expect(regionOf('서울특별시 가짜구', '가짜도')).toBeNull()
    expect(regionOf('서울특별시 가짜구', REGION_UNKNOWN)).toBeNull()
    expect(regionOf('서울특별시 가짜구', '')).toBeNull()
  })
})

describe('AC-8012.2 roParticle — 완료 줄 `{지역}로/으로`', () => {
  // 받침 없음 → 로, 'ㄹ' 받침 → 로, 그 밖 받침 → 으로
  const EXPECTED: Record<string, '로' | '으로'> = {
    서울: '로', // ㄹ
    부산: '으로',
    대구: '로', // 받침 없음
    인천: '으로',
    광주: '로',
    대전: '으로',
    울산: '으로',
    세종: '으로',
    경기: '로',
    강원: '으로',
    충북: '으로',
    충남: '으로',
    전북: '으로',
    전남: '으로',
    경북: '으로',
    경남: '으로',
    제주: '로',
  }

  it('AC-8012.2: 시험 표가 17개 모두를 갖는다(시험 준비 확인)', () => {
    expect(Object.keys(EXPECTED)).toEqual(SIDO)
  })

  it.each(SIDO)('AC-8012.2: %s', (sido) => {
    expect(roParticle(sido)).toBe(EXPECTED[sido])
  })

  it('AC-8012.2: 받침 없음(대구·경기)·ㄹ 받침(서울) → 로, 그 밖 받침(부산·세종·충북) → 으로', () => {
    expect(roParticle('대구')).toBe('로')
    expect(roParticle('경기')).toBe('로')
    expect(roParticle('서울')).toBe('로')
    expect(roParticle('부산')).toBe('으로')
    expect(roParticle('세종')).toBe('으로')
    expect(roParticle('충북')).toBe('으로')
  })

  it('AC-8012.2: 지역 모름(null·`지역 모름`) → 으로', () => {
    expect(roParticle(null)).toBe('으로')
    expect(roParticle(REGION_UNKNOWN)).toBe('으로')
  })
})
