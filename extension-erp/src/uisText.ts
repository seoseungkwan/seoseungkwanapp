// 의사랑판(spec erp-uisarang) 화면 글 한 곳(design.md 8-2). ERP 화면 안내(uisView.ts)·엑셀 시트(uisSheet.ts)·설정 화면(uisOptions.ts)이 같이 쓴다.
// - 글은 design.md 10절(★ 바뀐 글)·7-1 까닭 글, 시안 docs/mockups/erp-uisarang/notes.md '화면 글', 시안 index.html(설정 화면 줄 글·저장법) 그대로다
// - 함수 글은 숫자·날짜·칸 이름·보고서 이름·폴더 글만 받는다. 환자 정보는 받을 자리가 없다. 그리는 쪽은 모두 textContent로 넣는다
// - 오류 글(번호마다 무엇이·어떻게)은 errors.ts(UIS_ERRORS·explainFor)에 있다
import { josa } from './josa.js'
import { UIS_OPEN_CODE } from './uisTypes.js'
import type { UisCountKey, UisFolder, UisKind, UisSalesKey } from './uisTypes.js'

function count(n: number): string {
  return n.toLocaleString('ko-KR')
}

/** 보고서 이름(design.md 8-2, UIS_KINDS 차례) */
export const UIS_REPORT_NAMES: Readonly<Record<UisKind, string>> = Object.freeze({
  income: '일일수입통계',
  rx: '기간별처방통계',
  visits: '내원일별환자현황 위쪽 표',
  visitPatients: '내원일별환자현황 아래쪽 표',
  rsv: '예약환자통계 위쪽 표',
  rsvPatients: '예약환자통계 아래쪽 표',
})

/** 엑셀 폴더 글(design.md 8-2, 답 uis.folder로 고름) */
export const UIS_FOLDER_TEXT: Readonly<Record<UisFolder, string>> = Object.freeze({
  desktop: '바탕화면 › ERP마감 폴더',
  profile: '사용자 폴더 › ERP마감 폴더',
})

// --- 조사 ---

export type UisJosaPair = '을/를' | '이/가' | '으로/로' | '와/과' | '은/는'

/** 받침 있음 · 받침 없음 · 끝 글자를 모를 때(josa.ts와 같은 꼴) */
const FORMS: Record<UisJosaPair, readonly [string, string, string]> = {
  '을/를': ['을', '를', '을(를)'],
  '이/가': ['이', '가', '이(가)'],
  '은/는': ['은', '는', '은(는)'],
  '와/과': ['과', '와', '과(와)'],
  '으로/로': ['으로', '로', '(으)로'],
}

type Final = 'none' | 'rieul' | 'other'
/** 끝 숫자를 읽은 소리의 받침: 0 영·십·백·천 · 3 삼 · 6 육 → 받침, 1 일 · 7 칠 · 8 팔 → ㄹ, 2 · 4 · 5 · 9 → 없음 */
const DIGIT_FINAL: readonly Final[] = ['other', 'rieul', 'none', 'other', 'none', 'none', 'other', 'rieul', 'rieul', 'none']

/** 마지막 글자(앞뒤 빈칸 뗌)의 받침. 한글은 josa.ts로 본다. 한글·숫자·영문이 아니면 null */
function finalOf(word: string): Final | null {
  const chars = [...word.trim()]
  const last = chars.length > 0 ? chars[chars.length - 1] : ''
  if (/^[0-9]$/.test(last)) return DIGIT_FINAL[Number(last)]
  // 영문은 끝 글자 읽는 소리로: L 엘 · R 알 → ㄹ, M 엠 · N 엔 → 받침, 그 밖(SONO 소노 · CT 티) → 없음
  if (/^[a-z]$/i.test(last)) return /[lr]/i.test(last) ? 'rieul' : /[mn]/i.test(last) ? 'other' : 'none'
  const topic = josa(word, '은/는')
  if (topic === '는') return 'none'
  if (topic !== '은') return null
  return josa(word, '으로/로') === '로' ? 'rieul' : 'other'
}

/**
 * 이름 뒤에 붙일 조사(design.md 8-2: 을/를·이/가·으로/로·와/과·은/는). 한글은 josa.ts 규칙 그대로이고,
 * josa.ts가 둘 다 보이는 꼴로 두는 숫자(날짜 '2026-11-23으로')·영문('SONO를')은 끝 글자 읽는 소리로 고른다
 */
export function uisJosa(word: string, pair: UisJosaPair): string {
  const [withFinal, without, unknown] = FORMS[pair]
  const final = finalOf(word)
  if (final === null) return unknown
  if (pair === '으로/로') return final === 'other' ? withFinal : without
  return final === 'none' ? without : withFinal
}

const AGAIN = '한셀 창을 닫은 뒤 다시 눌러 주세요.'

// --- ERP 화면 안내 글 ---

/** ERP 화면 단추·안내 글(design.md 9-3·10-1~10-3·7-1, 시안 notes.md '화면 글') */
export const UIS_TEXT = {
  /** 단추 줄 큰 단추(오른쪽 끝)·가운데 버금 단추·읽는 중 글(누른 단추 글이 바뀐다) */
  button: '의사랑 값 채우기',
  exportButton: '엑셀로 받기',
  reading: '의사랑 엑셀 읽는 중…',
  /** 안내 머리: 채우기 · 받기 · 기간 채우기 */
  head: { fill: '의사랑 값 채우기', export: '엑셀로 받기', range: '기간 채우기' },
  close: '안내 닫기',
  closeShort: '닫기',
  openSettings: '설정 열기',
  fillAnyway: '있는 엑셀로 채우기',
  undo: '되돌리기',
  untouched: '아무 칸도 바꾸지 않았어요.',
  /** ⑭ 설정 저장 전(뒤 줄과 [설정 열기]는 지금 panel.ts 글 그대로) */
  first: '처음 한 번 설정 화면에서 코드를 고르고 [저장]을 눌러 주세요.',
  /** ⑬ 기간 채우기 */
  range: {
    lead: '의사랑 자료로는 하루씩만 채울 수 있어요.',
    how: '의사랑 일일수입통계가 하루씩만 나와서예요. 날마다 그날 엑셀 6개를 저장하고 [의사랑 값 채우기]를 눌러 주세요.',
  },
  /** ⑥⑦ 저장할 엑셀 목록: 머리 · 줄 '{번호}. {보고서}' · 상태 */
  files: {
    head: '저장할 엑셀',
    row: (no: number, report: string) => `${no}. ${report}`,
    have: '있음',
    cached: '있음 (앞서 읽음)',
    none: '없음',
  },
  /** ⑥ 엑셀 없음 */
  missing: {
    lead: '의사랑 통계에서 아래 보고서 6개를 엑셀로 저장해 주세요.',
    optional: '3 · 5번(위쪽 표)은 없어도 채울 수 있어요. 있으면 아래쪽 표와 숫자를 한 번 더 맞춰 봐요.',
    how: (date: string) =>
      `조회일은 ${date} 하루, 외/입 구분은 '전체'로 두고 [검색]한 뒤 표 오른쪽 위 초록 엑셀 단추로 저장해 주세요.`,
    where: (folder: string) => `저장할 곳: ${folder}`,
    person: '4 · 6번은 환자별 표예요. ERP 도우미가 이 PC 안에서만 읽고 바로 지워요.',
  },
  /** ⑦ 꼭 있어야 할 4개 가운데 일부 없음 */
  some: {
    one: (report: string) => `의사랑 통계에서 ${report}${uisJosa(report, '을/를')} 엑셀로 저장해 주세요.`,
    many: (n: number) => `의사랑 통계에서 아래 보고서 ${count(n)}개를 엑셀로 저장해 주세요.`,
    help: '저장한 뒤 [의사랑 값 채우기]를 다시 눌러 주세요. [있는 엑셀로 채우기]를 누르면 없는 엑셀의 칸만 비우고 채워요.',
  },
  /** ⑨ 날짜 다름 */
  date: {
    lead: '엑셀 날짜가 마감 일자와 달라요.',
    headDay: (date: string) => `마감 일자 ${date}`,
    headExcel: '엑셀 조회일',
    /** 조회일 줄: 하루면 '{from}', 기간이면 '{from} ~ {to}'. 조회일이 없으면 notFound */
    range: (from: string, to: string | null) => (to === null || to === from ? from : `${from} ~ ${to}`),
    notFound: '찾지 못함',
    how: (n: number, date: string) =>
      `날짜가 다른 엑셀 ${count(n)}개를 조회일 ${date}${uisJosa(date, '으로/로')} 다시 [검색]해 저장한 뒤 다시 눌러 주세요.`,
    kept: '아무 칸도 바꾸지 않았어요. 날짜가 다른 합계 엑셀은 지우지 않고 그대로 두었어요.',
    /** 환자별 엑셀이 날짜 다름일 때 더하는 줄 */
    patientDeleted: '환자별 엑셀(4 · 6번)은 날짜가 달라도 읽은 뒤 바로 지웠어요.',
  },
  /** ⑩ 조건이 '전체' 아님(라벨 이름이 외/입 구분이 아니면 leadLabel) */
  cond: {
    lead: (report: string, value: string) => `${report} 엑셀의 외/입 구분이 '${value}'예요.`,
    leadLabel: (report: string, label: string, value: string) =>
      `${report} 엑셀의 ${label}${uisJosa(label, '이/가')} '${value}'예요.`,
    how: "의사랑 통계에서 외/입 구분을 '전체'로 바꿔 [검색]한 뒤 다시 엑셀로 저장해 주세요.",
  },
  /** ⑪ 같은 엑셀 둘(셋 이상이면 그 수) */
  dup: {
    lead: (report: string, n: number) => `${report} 엑셀이 ${count(n)}개 있어요.`,
    how: (folder: string) => `${folder}에서 하나만 남기고 지운 뒤 다시 눌러 주세요.`,
    why: '어느 것이 맞는지 몰라 아무 칸도 바꾸지 않았어요.',
    /** 환자별 표일 때 더하는 줄 */
    patient: '환자별 엑셀은 둘 다 지웠어요. 하나만 다시 저장해 주세요.',
  },
  /** ⑫ 한셀에 열림(빨강) */
  open: {
    lead: '한셀에 열려 있는 엑셀이 있어 읽지 못했어요.',
    how: (report: string) => `${report}${uisJosa(report, '이/가')} 한셀에 열려 있어요. ${AGAIN}`,
    /** 파일 이름으로 보고서를 짐작하지 못했을 때 */
    howUnknown: `ERP마감 폴더의 엑셀이 한셀에 열려 있어요. ${AGAIN}`,
    why: '환자별 엑셀은 읽은 뒤 바로 지워야 해서, 열려 있으면 읽지 않아요.',
    code: `아무 칸도 바꾸지 않았어요. (번호 ${UIS_OPEN_CODE})`,
  },
  /** 10-2 1. 맞춰 볼 숫자(null인 줄은 그리는 쪽이 뺀다) */
  check: {
    title: '의사랑과 맞춰 볼 숫자',
    total: (won: number) => `외래 총매출 ${count(won)}원`,
    received: (won: number) => `진료수납액 ${count(won)}원`,
    patients: (n: number) => `환자 합계 ${count(n)}명`,
    help: '의사랑 일일수입통계 화면의 같은 숫자와 먼저 견주어 보세요.',
  },
  /** 10-2 2. 채움 줄 */
  filled: (date: string, n: number) => `${date} 의사랑 값으로 ${count(n)}칸을 채웠어요. 저장은 하지 않았어요.`,
  /** 10-2 3. 지움·모아 둔 값·종류 모름·남김·못 지움(빨강) 줄 — 10-3 받았어요 안내도 같은 줄 */
  cleanup: {
    deleted: (n: number) => `읽은 엑셀 ${count(n)}개는 이 PC에서 지웠어요.`,
    cached: (n: number) => `앞서 읽어 둔 엑셀 ${count(n)}개 값도 함께 썼어요.`,
    unknown: (n: number) => `의사랑 통계 엑셀이 아닌 엑셀 ${count(n)}개도 지웠어요.`,
    kept: (n: number) => `날짜가 다른 엑셀 ${count(n)}개는 지우지 않고 두었어요.`,
    failed: (n: number, folder: string) => `지우지 못한 엑셀이 ${count(n)}개 있어요. ${folder}에서 직접 지워 주세요.`,
  },
  /** 칸 묶음 제목 뒤 굵은 수 '{N}칸'(지금 panel.ts 꼴) */
  cells: (n: number) => `${count(n)}칸`,
  /** 10-2 4. 엑셀이 없어 비워 둔 칸 */
  absent: {
    title: '엑셀이 없어 비워 둔 칸',
    why: (report: string) => `${report}${uisJosa(report, '이/가')} 없어 비워 두었어요. 직접 넣어 주세요.`,
  },
  /** 10-2 5. 의사랑에서 읽지 못한 칸(칸 이름 줄은 지금 panel.ts placeLine) */
  unread: {
    title: '의사랑에서 읽지 못한 칸',
    /** 칸이 여럿이면 시안 ④처럼 ' · '로 잇는다 */
    column: (report: string, columns: readonly string[]) =>
      `${report}에 ${columns.map((c) => `'${c}'`).join(' · ')} 칸이 없어요.`,
    fractional: (group: string) => `${group} 건수: 고른 코드의 총투여량에 소수가 있어요.`,
    negativeReturn: '재진: 재진수에서 물리치료내원을 빼니 0보다 작아요.',
    negativeNoExamFee: '진찰료 산정안함: 환자 합계가 초진수 + 재진수보다 작아요.',
    help: '의사랑 통계 표의 칸 설정이 바뀌었을 수 있어요. 비워 둔 칸은 직접 넣거나, 그 칸이 보이게 한 뒤 엑셀을 다시 저장하고 다시 눌러 주세요.',
  },
  /** 10-2 7. 의사랑에 없어 비워 둔 칸(줄마다 [굵은 업무일지, 칸 이름]) */
  none: {
    title: '의사랑에 없어 비워 둔 칸',
    rows: [
      ['업무일지 1', '환자현황 90일초진 · 외래 수입 미수입금(+) · 미수발생(-) · 감액 · 장애인기금(-) · 계좌이체액(-) · 현불/환불(-) · 입원수입'],
      ['업무일지 2', '예약 나머지 칸 · 치료별 건수 · 연령별 90일초진 · 주사1회환자 · 신환주사환자 · 신환주사건수'],
    ] as const,
    help: '의사랑 통계 합계로는 셀 수 없는 칸이라 비워 두었어요. 직접 넣어 주세요. 계좌이체는 현금수납액에 들어 있고, 내원하지 않은 환자의 미수 · 환불은 일일수입통계에 빠져요.',
  },
  /** 10-2 8. 맞춰 보기 경고(주황, design.md 6-2 차례). 글 속 숫자 차례 = 글 차례 */
  warn: {
    totalFee: (fee: number, sum: number) => `총진료비(${count(fee)}원)가 급여총액 + 비급여(${count(sum)}원)와 달라요.`,
    received: (received: number, sum: number) => `진료수납액(${count(received)}원)이 현금 + 카드(${count(sum)}원)와 달라요.`,
    headcount: (n: number, sum: number) => `인원계(${count(n)}명)가 초진 + 재진(${count(sum)}명)과 달라요.`,
    rxTotal: (codeSum: number, sumRow: number) =>
      `기간별처방통계 코드 줄 총액 합(${count(codeSum)}원)이 합계 줄(${count(sumRow)}원)과 달라요.`,
    /** 아래쪽 표가 적으면 '모자랄', 많으면 '많을' */
    visitRows: (rows: number, headcount: number) =>
      `내원일별환자현황 아래쪽 표 환자 수(${count(rows)}명)가 인원수(${count(headcount)}명)와 달라요. ` +
      `연령별 표가 ${count(Math.abs(headcount - rows))}명 ${rows < headcount ? '모자랄' : '많을'} 수 있어요.`,
    visitNew: (lower: number, upper: number) =>
      `내원일별환자현황 아래쪽 표 신규(${count(lower)}명)가 위쪽 표 신규환자(${count(upper)}명)와 달라요.`,
    rsvRows: (lower: number, upper: number) =>
      `예약환자통계 아래쪽 표 예약(${count(lower)}건)이 위쪽 표 예약건수(${count(upper)}건)와 달라요.`,
    rsvVisited: (lower: number, upper: number) =>
      `예약환자통계 아래쪽 표 방문(${count(lower)}건)이 위쪽 표 이행건수(${count(upper)}건)와 달라요.`,
    noDate: '내원일별환자현황 아래쪽 표에서 조회일을 찾지 못했어요. 그날 줄을 누르고 저장했는지 확인해 주세요.',
    unknownAge: (n: number) => `주민번호로 나이를 셀 수 없는 환자 ${count(n)}명은 연령별 표에 넣지 않았어요.`,
    after: '채우기는 했어요. 의사랑 화면과 견주어 확인해 주세요.',
  },
  /** 10-2 9. 예약 참고 줄 */
  reservations: (total: number, visited: number) =>
    `예약환자통계: 예약 ${count(total)}건 · 내원 ${count(visited)}건. ERP 예약 줄은 종류별로 직접 넣어 주세요.`,
  /** 10-3 받았어요 안내(머리 head.export, 단추 [닫기] [의사랑 값 채우기]) */
  exported: {
    lead: (date: string) => `${date} 의사랑 값을 엑셀 파일로 받았어요. ERP 칸은 바꾸지 않았어요.`,
    file: (name: string) => `파일 이름: ${name}(크롬 다운로드 폴더)`,
    blank: "빈 칸은 끝 열 '빈 칸 까닭'을 보고 직접 넣어 주세요.",
  },
  /** 7-1 엑셀 끝 열 '빈 칸 까닭'(noName 칸은 값을 쓰고 까닭은 없음) */
  why: {
    direct: '직접 입력',
    none: '의사랑에 없음',
    unpicked: '코드 안 고름',
    unknown: '못 읽음',
    missing: (report: string) => `못 읽음 (${report} 없음)`,
  },
} as const

// --- 설정 화면 글 ---

type UisRowKey = UisCountKey | UisSalesKey
/** '매일 저장할 엑셀 6개' 표 한 줄(시안). table null = '표 하나', how = 환자별 표만 */
type ReportRow = { menu: string; name: string; table: string | null; how: string | null; file: string; fills: string }

/**
 * 의사랑 설정 화면 글(design.md 9-5·10-6, 시안 notes.md '설정 화면'과 index.html 줄 글).
 * 저장 줄 글 셋과 [저장]·찾기 칸 자리 글·코드 조각 단추 글은 지금 options.ts 글 그대로라 여기 없다.
 * 폴더 글은 받아서 쓴다(closing.uisCodes 답에는 폴더 자리가 없어 그리는 쪽이 고른다)
 */
export const UIS_OPTIONS_TEXT = {
  /** 맨 위 상자(앞 굵은 글 + 뒤 글) */
  source: {
    strong: '의사랑 통계 엑셀에서 읽어요.',
    rest: (folder: string) => `이 PC의 ERP 도우미는 ${folder}에 저장한 의사랑 통계 엑셀을 읽어 ERP 칸을 채워요.`,
  },
  /** 한 번도 저장하지 않았을 때 */
  first: {
    strong: '처음 한 번 ERP 항목마다 의사랑 처방 코드를 고르고 [저장]을 눌러 주세요.',
    rest: '처방 코드는 의원마다 달라 처음에는 고른 코드가 없어요.',
  },
  lead: 'ERP 칸마다 셀 의사랑 처방 코드를 고르세요. 건수와 매출은 따로 골라요. 여러 개를 고를 수 있어요. 코드를 고르지 않은 칸은 건드리지 않아요.',
  /** 코드 목록 줄 · 없을 때 3단계 · [코드 목록 읽기] 결과(design.md 10-6) */
  codes: {
    read: (from: string, to: string, n: number) =>
      `의사랑 기간별처방통계(${from}~${to})에서 처방 코드 ${count(n)}개를 읽었어요. 목록만 기억하고 엑셀은 지웠어요.`,
    again: '새 코드가 생기면 기간별처방통계를 다시 저장하고 [코드 목록 다시 읽기]를 눌러 주세요.',
    none: '처방 코드 목록이 아직 없어요.',
    steps: (folder: string): readonly string[] => [
      '의사랑 통계 › 진료통계 › 기간별처방통계를 열어 주세요.',
      "조회일을 최근 석 달로, 외/입 구분을 '전체'로 두고 [검색]을 눌러 주세요.",
      `표 오른쪽 위 초록 엑셀 단추로 ${folder}에 저장해 주세요.`,
    ],
    then: '그다음 [코드 목록 읽기]를 눌러 주세요.',
    readButton: '코드 목록 읽기',
    rereadButton: '코드 목록 다시 읽기',
    /** missing 뒤에는 steps를 보인다 */
    missing: (folder: string) => `${folder}에 기간별처방통계 엑셀이 없어요.`,
    notAll: (value: string) => `기간별처방통계 엑셀의 외/입 구분이 '${value}'예요. '전체'로 다시 저장해 주세요.`,
    twice: '기간별처방통계 엑셀이 2개 있어요. 하나만 남겨 주세요.',
    open: `기간별처방통계 엑셀이 한셀에 열려 있어요. ${AGAIN}`,
  },
  /** 줄 이름표 */
  label: { counts: '건수로 셀 코드', sales: '매출로 셀 코드' },
  /** 찾기 목록 꼬리: 건수 · 매출 */
  qty: (n: number) => `총투여량 ${count(n)}`,
  amount: (won: number) => `총액 ${count(won)}원`,
  fraction: '주황 숫자는 총투여량에 소수가 있는 코드예요. 건수로는 맞지 않을 수 있어요.',
  /** 고른 코드가 목록에 없을 때 조각 꼬리 */
  notInList: '(처방통계에 없음)',
  /** 코드 목록이 없을 때 찾기 칸 */
  noList: '코드 목록이 없어 찾을 수 없어요',
  /** 씨암·SONO 줄 아래 주의(이름 받침으로 을/를) */
  caution: (name: string) =>
    `시술 코드(예: la358)를 매출에 고르면 ${name}${uisJosa(name, '을/를')} 쓰지 않은 진료의 그 시술 금액도 그날 것이 모두 들어가요.`,
  /** 묶음 차례(design.md 9-5)·설명·줄마다 [key, 쓰는 칸]. 고르는 줄(건수·매출)은 UIS_COUNT_KEYS·UIS_SALES_KEYS에 든 것 */
  sections: [
    {
      title: '치료별 건수 · 매출',
      about:
        '건수는 고른 코드의 총투여량을 더해 업무일지 1 진료 · 치료현황에, 매출은 고른 코드의 총액을 더해 업무일지 2 치료별 매출에 채워요. 총투여량은 환자 수가 아니라 처방한 양이라, 건수에는 한 번에 1씩 나가는 코드만 고르세요.',
      rows: [
        ['carm', '업무일지 1 씨암 · 업무일지 2 씨암 매출'],
        ['sono', '업무일지 1 SONO · 업무일지 2 SONO 매출'],
        ['arthro', '업무일지 1 관절조영술 · 업무일지 2 관절조영 매출'],
        ['manual', '업무일지 1 도수치료 · 업무일지 2 도수 매출 · 도수 총금액'],
        ['eswt', '업무일지 1 충격파(체충) · 업무일지 2 충격파 매출 · 충격파 총금액'],
        ['pt', '업무일지 2 물리치료 매출'],
        ['etc1', '업무일지 2 이 이름 줄의 매출'],
        ['etc2', '업무일지 2 이 이름 줄의 매출'],
        ['etc3', '업무일지 2 이 이름 줄의 매출'],
        ['etc4', '업무일지 2 이 이름 줄의 매출'],
      ],
    },
    {
      title: '진료 · 치료현황만',
      about: '고른 코드의 총투여량을 더해 업무일지 1 진료 · 치료현황에 채워요.',
      rows: [
        ['manualConsult', '업무일지 1 도수상담'],
        ['lipus', '업무일지 1 리푸스'],
        ['nail', '업무일지 1 손발톱케어'],
        ['ct', '업무일지 1 CT'],
        ['surgery', '업무일지 1 수술'],
      ],
    },
    {
      title: '운영 지표',
      about: '고른 코드의 총투여량을 더해 채워요. 주사1회환자 · 신환주사환자 · 신환주사건수는 의사랑 합계로 셀 수 없어 직접 넣어요.',
      rows: [
        ['eswtStd', '업무일지 2 ESWT Standard'],
        ['eswtRadial', '업무일지 2 ESWT Radial'],
      ],
    },
    {
      title: '환자현황',
      about: '고른 코드의 총투여량을 물리치료내원으로 채우고, 일일수입통계 재진수에서 빼서 재진을 채워요.',
      rows: [['ptVisit', '업무일지 1 환자현황 물리치료내원 · 재진']],
    },
  ] as readonly { title: string; about: string; rows: readonly (readonly [UisRowKey, string])[] }[],
  /** 예약 묶음: 줄 고르기 없이 안내 한 줄(design.md 10-6 ★) */
  rsv: {
    title: '예약',
    about:
      '의사랑 예약에는 종류가 없어 실예약환자수만 채워요. 종류별 줄과 변경 · 취소는 직접 넣어 주세요. 예약건수 · 내원 수는 채운 뒤 안내에 보여요.',
  },
  /** '매일 저장할 엑셀 6개' 표와 저장법(시안 + design.md 10-6 ★ '꼭' 열·표 밑 줄) */
  reports: {
    title: '매일 저장할 엑셀 6개',
    intro: (folder: string) => `마감할 때마다 의사랑 통계(FStat)에서 아래 6개를 엑셀로 저장해 ${folder}에 두세요.`,
    columns: { menu: '의사랑 통계 메뉴', table: '표', file: '이름 예', fills: '채우는 칸', need: '꼭' },
    /** '꼭' 열: UIS_REQUIRED면 required */
    need: { required: '꼭', optional: '있으면 좋음' },
    oneTable: '표 하나',
    person: '환자 정보 있음',
    rows: {
      income: { menu: '수입통계', name: '일일수입통계', table: null, how: null, file: '통계-일일수입통계.xls', fills: '외래 수입 6칸 · 재진' },
      rx: {
        menu: '진료통계',
        name: '기간별처방통계',
        table: '위쪽 표',
        how: null,
        file: '통계-기간별처방통계.xls',
        fills: '치료별 건수 · 치료별 매출 · 물리치료내원',
      },
      visits: {
        menu: '인원통계',
        name: '내원일별환자현황',
        table: '위쪽 표',
        how: null,
        file: '통계-내원일별환자현황.xls',
        fills: '신환 · 환자 합계 · 진찰료 산정안함',
      },
      visitPatients: {
        menu: '인원통계',
        name: '내원일별환자현황',
        table: '아래쪽 표',
        how: '그날 줄을 누른 뒤',
        file: '통계-내원일별환자현황-환자별.xls',
        fills: '연령별 신환 · 재진',
      },
      rsv: {
        menu: '인원통계',
        name: '예약환자통계',
        table: '위쪽 표',
        how: null,
        file: '통계-예약환자통계.xls',
        fills: '예약 총갯수 · 내원',
      },
      rsvPatients: {
        menu: '인원통계',
        name: '예약환자통계',
        table: '아래쪽 표',
        how: '그날 줄을 누른 뒤',
        file: '통계-예약환자통계-환자별.xls',
        fills: '실예약환자수',
      },
    } as Readonly<Record<UisKind, ReportRow>>,
    /** 저장법 세 줄(시안) */
    howTo: [
      "조회일은 마감 일자 하루로, 외/입 구분은 '전체'로 두고 [검색]한 뒤 표 오른쪽 위 초록 엑셀 단추를 눌러 저장해요.",
      "이름은 바꿔도 돼요(도우미가 표 머리글로 어느 보고서인지 알아봐요). 아래쪽 표는 위쪽 표와 이름이 겹치지 않게 끝에 '-환자별'을 붙여 주세요.",
      '이 폴더에는 마감 엑셀만 두세요. 다 읽은 뒤 폴더 안 엑셀을 모두 지워요.',
    ] as readonly string[],
    /** 표 밑 줄(design.md 10-6 ★) */
    suffix: '아래쪽 표는 저장할 때 이름 끝에 -환자별을 붙여 주세요.',
    privacy: {
      strong: '4 · 6번 환자별 표에는 환자 이름 · 주민번호가 들어 있어요.',
      rest: 'ERP 도우미가 이 PC 안에서만 읽고 바로 지워요. 주민번호로는 나이만 셈하고, ERP에는 숫자만 넣어요.',
    },
  },
  /** 맨 아래 개인정보 줄 */
  foot: '환자 이름 · 차트번호 · 주민번호는 이 PC의 도우미 밖으로 나가지 않아요. ERP 화면에는 숫자만 넣고, 저장은 ERP에서 직접 눌러요.',
} as const
