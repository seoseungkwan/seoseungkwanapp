import { isMonth, isYmd } from '@/lib/analytics/dates'
import type { SourceId } from '@/types/location'
import { distText } from './coords'
import { DEFAULT_SCORE_RULE, SCORE_GROUPS, type GroupId } from './score'

// 분석 방법 글 한 곳(specs/location design.md 19절, REQ-7920): 처음 안내 '이 탭은 이렇게 분석해요'(METHOD) ·
// 후보 자세히 묶음 열셋의 '이렇게 봤어요'(HOW) · 한 장 보고서 둘째 장 '이렇게 분석했어요'(REPORT)와 표시 채우기(fillHow).
// 글은 requirements '화면 글 기본값' 승인 3 그대로(시안 index.html의 HOW·METHOD·METHOD_DATA·REP_EXTRA와 같은 글).
// 명세가 더한 것: 소득·쓸 힘 줄의 한국사회보장정보원(의료급여·차상위) 한 마디(한 줄·[더 보기]·보고서 자료 칸).
// 연구·법은 조사 파일(specs/location/research)과 LAW_BASIS에 있는 것만 댄다. 순수 함수만

// 글 속 표시: [[열쇠]] = '기준 {그 출처 기준 날짜}' · [[열쇠:d]] = 날짜만 · {범위} = 살필 범위 · {시군구} = 후보 시·군·구 · {경쟁} = 고른 경쟁 과목 짧은 이름
// {무게} = 다섯 항목 지금 무게 · {처음 무게} = 처음 무게일 때만 '(처음 무게)'(fillWeights)

/** 근거 칩: research = 연구 근거 · law = 법 근거 · law-common = 법 근거 + 흔히 보는 기준 · common = 흔히 보는 기준 */
export type HowChip = 'research' | 'law' | 'law-common' | 'common'

/** 칩 글(연구 근거·법 근거 = 파란 칩, 흔히 보는 기준 = 회색 칩) */
export const CHIP_TEXT: Readonly<Record<HowChip, readonly string[]>> = {
  research: ['연구 근거'],
  law: ['법 근거'],
  'law-common': ['법 근거', '흔히 보는 기준'],
  common: ['흔히 보는 기준'],
}

/** 한 줄 머리 · [더 보기]/[접기] · 펼친 네 줄 이름 */
export const HOW_TEXT = {
  label: '이렇게 봤어요',
  more: '더 보기',
  less: '접기',
  rows: { what: '무엇을 봤나', how: '어떻게 셌나', why: '왜 중요한가', basis: '근거' },
} as const

/** 묶음 열셋(후보 자세히 차례) */
export const HOW_IDS = ['people', 'income', 'demand', 'comp', 'others', 'price', 'hours', 'traffic', 'photo', 'bld', 'vac', 'land', 'future'] as const
export type HowId = (typeof HOW_IDS)[number]

/** 묶음 id → 후보 자세히 틀 칸 이름 */
export const HOW_FRAME: Readonly<Record<HowId, string>> = {
  people: 'people',
  income: 'income',
  demand: 'demand',
  comp: 'rivals',
  others: 'others',
  price: 'price',
  hours: 'hours',
  traffic: 'traffic',
  photo: 'photo',
  bld: 'building',
  vac: 'vacancy',
  land: 'land',
  future: 'future',
}

/** 글 속 [[열쇠]] → SOURCES id(requirements 승인 3 표 그대로) */
export const HOW_KEYS: Readonly<Record<string, SourceId>> = {
  pop: 'pop-age',
  sgis: 'dongs',
  apt: 'apt-info',
  subscr: 'presale',
  income: 'income',
  deal: 'apt-trade',
  kyung: 'senior',
  gym: 'gym',
  acc: 'accident',
  ind: 'industry',
  hira: 'hosp-list',
  nmc: 'hosp-hours',
  price: 'nonpay',
  permit: 'clinic-license',
  station: 'rail-stations',
  bus: 'bus-stops',
  flow: 'flow-volume',
  bld: 'building',
  store: 'stores',
  listing: 'user',
}

export type HowLineText = { what: string; how: string; why: string }
export type HowMoreText = { what: string; how: string; why: string; basis: string }
export type HowText = {
  /** 묶음 이름(후보 자세히 묶음 제목·보고서 묶음 칸) */
  name: string
  chip: HowChip
  /** 한 줄 `이렇게 봤어요 {무엇} · {어떻게} · {왜}` */
  line: HowLineText
  /** [더 보기] 네 줄 */
  more: HowMoreText
  /** 근거 글이 대는 LAW_BASIS id(연구 '이선경 외 2009' = catchment) */
  cites: readonly string[]
}

export const HOW: Readonly<Record<HowId, HowText>> = {
  people: {
    name: '사는 사람',
    chip: 'research',
    line: {
      what: '행정안전부 주민등록 인구·세대([[pop]]) · 아파트 단지·입주 예정',
      how: '살필 범위에 걸친 동마다 겹친 넓이만큼 나눠 더한 어림이에요',
      why: '정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요',
    },
    more: {
      what: '행정안전부 주민등록 인구·세대(행정동, [[pop]]) · 국가데이터처 SGIS 동 경계(동 넓이, [[sgis]]) · 국토교통부 공동주택 기본 정보(법정동, [[apt]]) · 한국부동산원 청약홈 분양정보(입주 예정, [[subscr]])',
      how: '살필 범위({범위})에 걸친 행정동마다 범위와 겹친 넓이 비율만큼 인구·세대를 나눠 더해요. 나이대는 10세 단위이고, 4년 추세는 2022년부터 해마다 10월 값을 같은 방법으로 세요. 아파트는 범위에 걸친 법정동 단지의 세대 수를 더하고, 홍보할 차례는 가까움·세대 수·지은 해로 정해요.',
      why: '의원에 다닐 환자는 대부분 둘레에 사는 사람이에요. 무릎·허리처럼 오래 다니는 환자가 많은 40세 이상과 60세 이상을 따로 세요.',
      basis:
        '연구 근거 — 이선경 외, 가정의학회지 2009;30(4):292-300(초록): 정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련이 있었어요. 그래서 점수에서 이 묶음을 가장 무겁게 둬요. 다만 40세·60세로 나눈 기준은 흔히 보는 기준이고, 환자가 오는 거리를 정한 연구는 찾지 못해 살필 범위는 직접 정해요.',
    },
    cites: ['catchment'],
  },
  income: {
    name: '소득·쓸 힘',
    chip: 'common',
    line: {
      what: '국세청 근로소득([[income]]) · 국토교통부 실거래가([[deal]]) · 한국사회보장정보원 의료급여·차상위',
      how: '소득은 동 단위가 없어 시·군·구 평균, 거래가는 범위 법정동의 지난 6달 ㎡당 평균이에요',
      why: '건강보험이 안 되는 진료(비급여)를 받을 형편을 짐작해요',
    },
    more: {
      what: '국세청 근로소득 연말정산 신고현황(시·군·구, 사는 곳 기준, [[income]]) · 국토교통부 아파트·상업업무용 매매 실거래가([[deal]], 지난 6달) · 한국사회보장정보원 복지사업 시군구별 수급권자 현황(의료급여·차상위, 시·군·구)',
      how: '소득은 동 단위 공개 자료가 없어 {시군구} 평균을 그대로 보이고 시·도 평균과 견줘요. 거래가는 범위에 걸친 법정동의 지난 6달 거래를 ㎡당으로 평균 내 시·군·구 평균과 견줘요.',
      why: '체외충격파·도수치료처럼 환자가 다 내는 진료는 동네 형편에 따라 찾는 정도가 달라요.',
      basis: '흔히 보는 기준이에요. 소득과 정형외과 이용을 이은 연구는 찾지 못해 점수에는 넣지 않고 보여만 줘요.',
    },
    cites: [],
  },
  demand: {
    name: '정형외과 수요',
    chip: 'common',
    line: {
      what: '주민등록 인구(40세 이상) · 경로당·체력단련장·학교·교통사고 다발 지점·산업단지',
      how: '범위 안에 있는 곳의 수를 세고, 40세 이상은 1km²당으로 나눴어요',
      why: '나이 든 사람·다친 사람이 많을수록 정형외과에 올 사람이 많아요',
    },
    more: {
      what: '행정안전부 주민등록 인구([[pop]]) · 전국마을회관및경로당표준데이터([[kyung]]) · 행정안전부 체력단련장업([[gym]]) · 전국초중등학교위치표준데이터 · 전국교통사고다발지역표준데이터([[acc]]) · 한국산업단지공단 전국산업단지현황통계([[ind]])',
      how: '범위 안에 있는 곳의 수를 세요. 40세 이상 밀도 = 범위 안 40세 이상 ÷ 범위 넓이(km²)예요. 교통사고는 동 단위 건수가 없어 다발 지점 수와 그 지점 사고 수로 대신해요. 산업단지는 경계 지도를 쓸 수 없어 가장 가까운 단지와 시·군·구 고용 인원을 보여요. 노인복지관·공공 체육 시설은 전국 위치 목록이 없어 경로당·체력단련장으로 대신해요.',
      why: '무릎·허리·어깨 통증은 나이 들수록 늘어요. 교통사고 환자, 일하다 다친 사람, 운동하다 다친 학생과 어른도 정형외과에 와요.',
      basis: '흔히 보는 기준이에요. 이 시설 수와 환자 수를 이은 연구는 찾지 못해, 교통사고·산업단지·학교·경로당·체력단련장의 세부 무게는 처음에 5씩으로 낮게 뒀어요.',
    },
    cites: [],
  },
  comp: {
    name: '경쟁 의원',
    chip: 'common',
    line: {
      what: '심평원 병원정보·상세정보([[hira]]) · 국립중앙의료원 진료 시간 · 행정안전부 의원 인허가',
      how: '범위 안 경쟁 의원({경쟁})을 세고 사는 사람을 의원 수로 나눴어요',
      why: '둘레 환자를 나눠 가질 의원이 몇 곳인지 봐요',
    },
    more: {
      what: '건강보험심사평가원 병원정보서비스·의료기관별상세정보서비스([[hira]]) · 국립중앙의료원 전국 병·의원 찾기([[nmc]]) · 행정안전부 건강_의원 인허가([[permit]])',
      how: '범위 안 경쟁 의원을 세요. 경쟁 의원 과목은 [과목 고르기]에서 내가 정해요(지금: {경쟁}). 처음엔 정형외과·신경외과·마취통증의학과·재활의학과이고, 한의원은 처음엔 경쟁 수에 넣지 않고 따로 세요. 의원마다 대표 과목 하나로 세요(이름에 든 과목 먼저). 1곳당 사는 사람 = 범위 안 사는 사람 ÷ 의원 수예요(점수에서는 새로 열 우리 의원까지 더해 나눠요). 문 열고 닫은 곳은 인허가일·폐업일로 3년 안을 세고, 같은 건물(30m 안) 의원과 이 자리 폐업은 위험 신호로 올려요.',
      why: '같은 동네 환자를 나눠 가져요. 의사가 많거나 MRI·물리치료사가 많은 곳은 센 경쟁 상대이고, 3년 사이 새로 연 곳이 많으면 이미 붐비는 동네일 수 있어요.',
      basis: "흔히 보는 기준이에요. '의원 1곳당 몇 명이면 넉넉한지'를 정한 연구는 찾지 못했어요. 만점 기준(1곳당 2만 명 등)은 점수 무게 판 [세부]에서 바꿀 수 있어요.",
    },
    cites: [],
  },
  others: {
    name: '둘레 다른 과 의원',
    chip: 'common',
    line: {
      what: '심평원 병원정보([[hira]]) · 카카오맵(같은 건물 약국)',
      how: '둘레로 보기로 고른 과목을 과목마다 세고, 같은 건물·옆 건물(30m 안)에 어떤 과가 있는지 적었어요',
      why: '다른 과 의원과 약국이 모인 건물은 아픈 사람이 일부러 찾아오는 곳이에요',
    },
    more: {
      what: '건강보험심사평가원 병원정보서비스(의원 이름·진료과목·위치, [[hira]]) · 카카오맵(같은 건물·옆 건물 약국, 열 때마다 불러와요)',
      how: "범위 안 의원 가운데 [과목 고르기]에서 '둘레로 보기'로 고른 과목을 과목마다 세요. 의원은 진료과목을 여럿 올려서 대표 과목 하나로 세요(이름에 든 과목 먼저, 없으면 처음 올린 과목). 같은 건물·옆 건물은 30m 안이에요. '안 보기'로 고른 과목은 어디에도 세지 않아요.",
      why: '내과·치과·약국이 모인 건물은 아픈 사람이 일부러 찾아오는 곳이라, 오가다 간판을 보고 들르는 환자가 생길 수 있어요. 다른 과는 환자를 나눠 갖지 않아 경쟁 수에는 넣지 않아요.',
      basis:
        "흔히 보는 기준이에요. 다른 과 의원이 모이면 환자가 는다는 연구는 찾지 못해, '같은 건물·옆 건물 의원 수'는 자리 점수의 세부 항목으로만 두고 처음 무게는 0이에요(점수 무게 판에서 올릴 수 있어요).",
    },
    cites: [],
  },
  price: {
    name: '경쟁 의원 진료비',
    chip: 'common',
    line: {
      what: '심평원 비급여진료비정보([[price]]) · 지금 의원 값(내가 적은 값)',
      how: '범위 안 의원이 올린 1회 값으로 가장 싼 곳·평균·가장 비싼 곳을 냈어요',
      why: '둘레가 비싸게 받으면 값으로 견줄 틈이 있어요',
    },
    more: {
      what: '건강보험심사평가원 비급여진료비정보조회서비스([[price]]) · 지금 의원 체외충격파 1회 값(개원 준비에 직접 적은 값)',
      how: '범위 안 경쟁 의원({경쟁})이 올린 체외충격파 1회 값으로 가장 싼 곳·평균·가장 비싼 곳을 내고 지금 의원 값과 견줘요. 값을 올리지 않은 의원은 빼고 세요. 도수치료는 2026년 7월부터 관리급여라 공개 자료에 값이 있을 때만 보여요.',
      why: '체외충격파는 환자가 다 내는 진료라 값이 의원을 고르는 까닭이 돼요. 둘레 평균이 지금 의원 값보다 비싸면 값으로도 견줄 수 있어요.',
      basis: '흔히 보는 기준이에요. 의원마다 1회 기준(시간·부위)이 달라 거친 견주기예요.',
    },
    cites: [],
  },
  hours: {
    name: '진료 시간 빈틈',
    chip: 'common',
    line: {
      what: '국립중앙의료원 전국 병·의원 찾기([[nmc]])',
      how: '범위 안 경쟁 의원의 요일별 여는 시간을 겹쳐, 아무도 안 여는 칸을 셌어요',
      why: '일하는 사람은 저녁·토요일에 오기 쉬워요',
    },
    more: {
      what: '국립중앙의료원 전국 병·의원 찾기 서비스(요일별·공휴일 진료 시간, [[nmc]])',
      how: '의원마다 요일별 여는·닫는 시간을 월~일 × 아침 8시~밤 9시 칸에 겹쳐, 문 연 의원이 하나도 없는 칸을 빈틈으로 세요. 점심 쉬는 시간은 자료에 없어 연 것으로 세고, 공휴일은 세지 않아요. 심평원 의원과는 이름과 거리(50m 안)로 맞춰요.',
      why: '직장인·학생은 평일 저녁과 토요일에 오기 쉬워요. 아무도 안 여는 시간에 열면 그 환자를 모을 수 있어요.',
      basis: '흔히 보는 기준이에요. 빈틈 시간에 환자가 얼마나 오는지 잰 연구는 찾지 못했어요.',
    },
    cites: [],
  },
  traffic: {
    name: '교통·둘레 시설',
    chip: 'common',
    line: {
      what: '도시철도역 위치([[station]]) · 버스정류장 위치 · 정류장별 이용량([[flow]]) · 카카오맵',
      how: '가장 가까운 역까지 곧은 거리, 400m 안 정류장 수, 범위 안 하루 타고 내린 사람을 셌어요',
      why: '무릎·허리가 아픈 환자는 멀리 걷기 힘들어요',
    },
    more: {
      what: '전국도시철도역사정보표준데이터([[station]]) · 국토교통부 전국 버스정류장 위치정보([[bus]]) · 국토교통부 정류장별 이용량(교통카드, [[flow]]) · 전국전통시장표준데이터 · 카카오맵(약국·마트·큰 병원, 열 때마다 새로 불러와요)',
      how: '가장 가까운 역은 곧은 거리(걷는 길이 아님)로 재고, 400m 안 버스 정류장 수를 세요. 사람 흐름은 범위 안 역·정류장마다 한 달 동안 타고 내린 사람을 날 수로 나눈 하루 평균을 더해요. 교통카드 찍은 사람 수라 걷는 사람 수와 달라요.',
      why: '무릎·허리가 아픈 환자와 어르신은 멀리 걷기 힘들어요. 역·정류장·약국이 가까우면 오기 쉽고, 사람이 많이 지나는 자리는 간판을 보는 사람도 많아요.',
      basis:
        '흔히 보는 기준이에요. 몇 m까지 걸어오는지 정한 연구는 찾지 못했어요. 정형외과 자리는 오가는 사람보다 사는 사람과 더 관련이 있었다는 연구(이선경 외, 가정의학회지 2009)가 있어 교통·흐름은 사는 사람·수요보다 가볍게 둬요.',
    },
    cites: ['catchment'],
  },
  photo: {
    name: '거리 사진',
    chip: 'law-common',
    line: {
      what: '카카오맵 로드뷰·하늘 사진(열 때마다 불러와요) · 간판 보임(내가 고른 값)',
      how: '사진으로 입구·간판 자리·주차장 길을 보고 간판이 보이는지 직접 골라요',
      why: '처음 오는 환자는 간판을 보고 찾아오고, 어르신은 입구에 턱이 없어야 들어와요',
    },
    more: {
      what: '카카오맵 로드뷰·하늘 사진(열 때마다 새로 불러오고 저장하지 않아요) · 간판 보임(보여요·가려요·모르겠어요 가운데 내가 고른 값)',
      how: '로드뷰를 돌려 입구·간판 자리·주차장 들어가는 길을 보고, 하늘 사진으로 건물 모양과 둘레를 봐요. 간판이 길에서 보이는지는 직접 골라 자리 점수에 넣어요.',
      why: '처음 오는 환자는 길에서 간판을 보고 찾아와요. 어르신·휠체어 환자는 입구에 턱이 없거나 경사로가 있어야 들어와요.',
      basis:
        '입구는 법 근거가 있어요 — 의원은 넓이와 상관없이 장애인 편의시설 대상이라 접근로·턱 없애기·출입문이 꼭 있어야 해요(장애인등편의법 시행령 별표 1·2). 간판은 흔히 보는 기준이에요. 사진은 찍은 때가 지났을 수 있어 보러 가서 확인해요.',
    },
    cites: ['bf'],
  },
  bld: {
    name: '건물 서류',
    chip: 'law',
    line: {
      what: '국토교통부 건축물대장([[bld]]) · 위반 건축물(내가 고른 값)',
      how: '지은 해·층수·넓이·엘리베이터·주차·층마다 용도를 그대로 옮겼어요',
      why: '건물이 의원을 들일 수 있는지, 개설 신고에 걸림이 없는지 봐요',
    },
    more: {
      what: '국토교통부 건축물대장정보(표제부·층별개요, [[bld]]) · 위반 건축물(있음·없음·모름 가운데 내가 고른 값)',
      how: '건축물대장 표제부(건물 전체)와 층별개요(층마다)를 그대로 옮겨요. 위반 건축물인지는 공개 자료가 없어 건축물대장을 떼어 보고 직접 골라요.',
      why: '의원은 제1종 근린생활시설에 들어가야 하고, 위반 건축물이면 개설 신고가 막힐 수 있어요. 2층 넘는 자리는 엘리베이터가 있어야 어르신이 와요.',
      basis:
        '법 근거 — 의원은 넓이와 상관없이 제1종 근린생활시설이에요(건축법 시행령 별표 1 제3호 라목). 구청은 위반 건축물에 다른 법의 신고를 해 주지 말라고 요청할 수 있어요(건축법 제79조 · 의료법 시행규칙 제25조 제3항 제4호). 500㎡ 이상 의원은 계단이나 엘리베이터 같은 편의시설이 꼭 있어야 해요(장애인등편의법 시행령 별표 2).',
    },
    cites: ['use', 'violation', 'bf'],
  },
  vac: {
    name: '빈 칸 짐작',
    chip: 'common',
    line: {
      what: '소상공인시장진흥공단 상가정보([[store]]) · 건축물대장 층별개요',
      how: "층마다 들어선 가게를 세어 가게가 없는 층을 '빈 층 같아요'로 적었어요",
      why: '빈 층이 많은 건물은 사람이 덜 오는 건물일 수 있어요',
    },
    more: {
      what: '소상공인시장진흥공단 상가(상권)정보([[store]]) · 국토교통부 건축물대장 층별개요([[bld]])',
      how: "건축물대장의 층마다 상가정보에 든 가게를 세고, 가게가 하나도 없는 층을 '빈 층 같아요'로 적어요. 주차장 층은 빼요.",
      why: '빈 층이 많으면 사람이 덜 오는 건물일 수 있고, 반대로 월세·무상 기간을 깎을 여지가 되기도 해요.',
      basis: '흔히 보는 기준이에요. 상가정보의 층 칸은 비어 있거나 늦게 고쳐질 수 있어 짐작이에요. 로드뷰와 함께 보고 보러 가서 확인해요.',
    },
    cites: [],
  },
  land: {
    name: '땅 쓰임·계획',
    chip: 'common',
    line: {
      what: '국토교통부 토지이음(링크만)',
      how: '앱이 받아 오지 않고, 이 땅의 필지 번호로 토지이음 화면을 새 창에 열어요',
      why: '앞으로 도로·재개발로 둘레가 바뀔 수 있어 계약 전에 봐 둬요',
    },
    more: {
      what: '국토교통부 토지이음(토지이용계획, 링크만 걸어요)',
      how: '땅 쓰임(용도지역)·지구단위계획·도로 계획·재개발은 이 앱이 받아 오지 않아요. 건물 지번으로 만든 필지 번호(19자리)로 토지이음 화면을 열어 직접 봐요.',
      why: '여러 해 있을 자리라 앞으로 도로가 나거나 재개발이 되면 환자가 오는 길이 바뀌어요.',
      basis: '흔히 보는 기준이에요(계약 전에 확인할 것). 이 앱이 땅 쓰임을 대신 판단하지 않아요.',
    },
    cites: [],
  },
  future: {
    name: '앞으로 바뀔 것',
    chip: 'common',
    line: {
      what: '주민등록 인구 4년 추세 · 한국부동산원 청약홈 입주 예정([[subscr]])',
      how: '2022년 10월과 올해 10월을 견주고, 범위 안 입주 예정 단지를 입주 때 차례로 놓았어요',
      why: '여러 해 있을 자리라 앞으로 사람이 늘지 줄지가 중요해요',
    },
    more: {
      what: '행정안전부 주민등록 인구(2022년 10월 ~ [[pop:d]]) · 한국부동산원 청약홈 분양정보([[subscr]]) · 재개발·도로는 토지이음 링크',
      how: '범위 안 사는 사람을 2022년 10월과 올해 10월에 같은 방법으로 세어 견줘요(나이대 자료가 2022년 10월부터 있어요). 입주 예정은 범위 안 단지만 입주 연월 차례로 놓아요.',
      why: '개원하면 여러 해 있을 자리라 앞으로 늘 사람(새 아파트)과 줄어드는 동네를 미리 봐요.',
      basis: '흔히 보는 기준이에요. 입주 예정은 분양 공고 값이라 늦어지거나 바뀔 수 있어요.',
    },
    cites: [],
  },
}

// ── 처음 안내 '이 탭은 이렇게 분석해요' ──

/** 줄 하나. lead가 있으면 굵은 머리 글로 `{lead} — {text}`(bulletText). example = 그 줄 아래 `예: {출처 줄}`의 SOURCES id */
export type MethodBullet = { lead: string | null; text: string; example?: SourceId }
/** 묶음별 기관 표 한 줄 */
export type MethodOrg = { group: string; orgs: string }
/** 다섯 줄 하나: 첫 줄만 글(text)과 기관 표(orgs), 나머지는 줄들(bullets) */
export type MethodRow = { title: string; text: string | null; orgs: readonly MethodOrg[]; bullets: readonly MethodBullet[] }

export const METHOD = {
  /** 모든 화면 머리 단추 */
  button: '분석 방법',
  title: '이 탭은 이렇게 분석해요',
  lead: '공개 자료로 동네를 넓게 훑고, 고른 자리를 깊게 본 뒤 점수를 매겨요. 숫자마다 어디서 왔는지 적어 두어 직접 확인할 수 있어요.',
  rows: [
    {
      title: '어떤 자료를 보나',
      text: '나라 기관이 공개한 자료가 대부분이에요. 묶음마다 이런 기관 자료를 봐요.',
      orgs: [
        {
          group: '사는 사람·수요',
          orgs: '행정안전부(주민등록 인구·세대 · 체력단련장) · 국가데이터처(SGIS 동 경계) · 국토교통부(아파트) · 한국부동산원(입주 예정) · 공공데이터포털 표준데이터(경로당·학교·교통사고 다발지역) · 한국산업단지공단(고용 인원)',
        },
        { group: '소득·쓸 힘', orgs: '국세청(근로소득, 시·군·구) · 국토교통부(실거래가) · 한국사회보장정보원(의료급여·차상위, 시·군·구)' },
        {
          group: '경쟁 의원·다른 과 의원',
          orgs: '건강보험심사평가원(병원 정보·진료과목·장비·비급여 진료비) · 국립중앙의료원(진료 시간) · 행정안전부(의원 문 연 날·닫은 날)',
        },
        {
          group: '교통·흐름',
          orgs: '국토교통부(버스정류장 위치 · 정류장별 타고 내린 사람) · 공공데이터포털 표준데이터(도시철도역·전통시장) · 카카오(약국·마트·큰 병원)',
        },
        { group: '자리·건물·땅', orgs: '국토교통부(건축물대장 · 토지이음 링크) · 소상공인시장진흥공단(상가정보) · 카카오(지도·거리 사진)' },
        { group: '매물·개원 준비', orgs: '내가 붙여 넣은 매물·적은 값 · 네이버 부동산·대법원 인터넷등기소는 링크만 · 법 조문(국가법령정보센터)' },
      ],
      bullets: [],
    },
    {
      title: '넓게 훑고 깊게 봐요',
      text: null,
      orgs: [],
      bullets: [
        {
          lead: '넓게',
          text: '시·군·구를 고르면 행정동마다 동 전체 값으로 세 항목(사는 사람·수요 · 경쟁 · 교통·흐름)을 매겨 지도에 색을 칠하고, 좋은 동 차례와 까닭을 보여요.',
        },
        {
          lead: '깊게',
          text: '자리를 후보로 저장하면 그 자리 둘레(살필 범위 300m~3km, 처음 1km)로 다시 세고 자리·비용까지 다섯 항목으로 매겨요. 범위에 걸친 동은 겹친 넓이만큼 인구를 나눠 더한 어림이에요.',
        },
        { lead: '굳혀 두기', text: '저장한 날 받은 값으로 굳혀 두고 그 날짜를 함께 보여요. [오늘 값으로 다시 받기]로 새로 받을 수 있어요.' },
      ],
    },
    {
      title: '점수는 이렇게 매겨요',
      text: null,
      orgs: [],
      bullets: [
        { lead: '다섯 항목', text: '{무게}{처음 무게}.' },
        {
          lead: null,
          text: '세부 항목마다 만점 기준으로 0~100점을 매기고, 세부 무게로 섞어 항목 점수를, 다섯 항목 무게로 섞어 100점 만점 종합 점수를 내요. 자료가 없는 것은 빼고 남은 무게로 매겨요.',
        },
        { lead: '무게와 만점 기준은 내가 정해요', text: '동네 훑기의 점수 무게 판 [세부]에서 바꾸면 지도·순위·후보 점수가 바로 바뀌어요.' },
        {
          lead: '경쟁 의원 과목도 내가 골라요',
          text: '처음엔 정형외과·신경외과·마취통증의학과·재활의학과예요. [과목 고르기]에서 과목마다 경쟁 의원 · 둘레로 보기 · 안 보기를 골라요.',
        },
        {
          lead: null,
          text: "'사는 사람·수요'를 가장 무겁게 둔 까닭은 정형외과 자리가 낮에 오가는 사람보다 사는 사람과 더 관련이 있었다는 연구예요(이선경 외, 가정의학회지 2009). 다른 처음 무게·기준은 연구로 정한 숫자가 아니라 흔히 보는 기준이에요.",
        },
        { lead: null, text: '후보 자세히에서 점수를 올린 것 3 · 내린 것 3을 바로 보여 드려요.' },
      ],
    },
    {
      title: '이것은 못 봐요',
      text: null,
      orgs: [],
      bullets: [
        { lead: '걷는 사람 수', text: '공개 자료가 없어요. 역·정류장에서 교통카드를 찍은 사람 수로 대신해요(걷는 사람 수와 달라요).' },
        { lead: '위반 건축물', text: '알려 주는 공개 자료가 없어요. 건축물대장을 떼어 보고 직접 골라요(있음·없음·모름).' },
        { lead: '실제 임대료', text: '부동산 사이트 매물을 저절로 가져오지 않아요(사이트 약관). 내가 붙여 넣은 매물끼리만 견줘요.' },
        { lead: null, text: "그 밖에 없는 자료는 근거와 출처의 '없는 자료'에 모두 적어 두었어요." },
      ],
    },
    {
      title: '숫자마다 출처가 붙어요',
      text: null,
      orgs: [],
      bullets: [
        { lead: null, text: "화면 숫자 아래 작은 글씨가 '기관 자료 · 기준 날짜'예요.", example: 'pop-age' },
        { lead: null, text: '누르면 근거와 출처의 그 줄로 가서 자료 이름·고쳐지는 주기·이용 조건을 볼 수 있어요.' },
        { lead: null, text: '카카오 지도 값(약국·마트 거리, 거리 사진)은 열 때마다 새로 불러오고 저장하지 않아요.' },
      ],
    },
  ] satisfies readonly MethodRow[] as readonly MethodRow[],
  /** 예시 출처 줄 앞 글 */
  exampleLabel: '예:',
  sourcesButton: '근거와 출처 모두 보기',
  sourcesHelp: '자료 이름·기준 날짜·법 근거 아홉 줄·없는 자료가 다 있어요',
  /** 오른쪽 판 아래 글 */
  panelNote: '처음 화면(후보 없음)에도 같은 안내가 있어요.',
} as const

/** 줄 글 하나로: lead가 있으면 `{lead} — {text}` */
export function bulletText(b: Pick<MethodBullet, 'lead' | 'text'>): string {
  return b.lead ? `${b.lead} — ${b.text}` : b.text
}

// ── 한 장 보고서 둘째 장 '이렇게 분석했어요' ──

export type ReportRowId = HowId | 'cost'
/** 묶음마다 본 자료 표 한 줄: 묶음 · 자료(기관) · 기준 날짜([[열쇠:d]]) · 방법 한 줄 · 못 본 것 */
export type ReportRow = { id: ReportRowId; name: string; orgs: string; dates: string; method: string; missing: string }

const REPORT_ROWS: readonly ReportRow[] = [
  {
    id: 'people',
    name: HOW.people.name,
    orgs: '행정안전부 · 국가데이터처 · 국토교통부 · 한국부동산원',
    dates: '[[pop:d]]',
    method: '범위에 걸친 동을 겹친 넓이만큼 나눠 더한 어림',
    missing: '1인 세대 수 · 2022년 10월 전 나이대',
  },
  {
    id: 'income',
    name: HOW.income.name,
    orgs: '국세청 · 국토교통부 · 한국사회보장정보원',
    dates: '[[income:d]] · [[deal:d]]',
    method: '소득은 시·군·구 평균, 거래가는 범위 법정동 6달 ㎡당 평균',
    missing: '동 단위 소득',
  },
  {
    id: 'demand',
    name: HOW.demand.name,
    orgs: '행정안전부 · 공공데이터포털 표준데이터 · 한국산업단지공단',
    dates: '[[acc:d]] · [[ind:d]]',
    method: '범위 안 수를 셈, 40세 이상은 1km²당',
    missing: '동 단위 교통사고 건수 · 노인복지관·공공 체육 시설 위치 · 산업단지 경계',
  },
  {
    id: 'comp',
    name: HOW.comp.name,
    orgs: '건강보험심사평가원 · 국립중앙의료원 · 행정안전부',
    dates: '[[hira:d]] · [[permit:d]]',
    method: '범위 안 경쟁 의원({경쟁}) 수, 1곳당 사는 사람, 3년 개폐업',
    missing: '물리치료사 수(의원이 안 올리면)',
  },
  {
    id: 'others',
    name: HOW.others.name,
    orgs: '건강보험심사평가원 · 카카오',
    dates: '[[hira:d]]',
    method: '둘레로 보기 과목을 과목마다 셈, 같은 건물·옆 건물은 30m 안',
    missing: '의원 안 진료 과목 비율(대표 과목 하나로만 셈)',
  },
  {
    id: 'price',
    name: HOW.price.name,
    orgs: '건강보험심사평가원 · 내가 적은 값',
    dates: '[[price:d]]',
    method: '범위 안 의원이 올린 체외충격파 1회 값 평균과 지금 의원 값',
    missing: '도수치료 값(공개 자료에 있을 때만)',
  },
  {
    id: 'hours',
    name: HOW.hours.name,
    orgs: '국립중앙의료원',
    dates: '[[nmc:d]]',
    method: '요일·시간 칸마다 문 연 의원 수, 0이면 빈틈',
    missing: '점심 쉬는 시간 · 공휴일 진료',
  },
  {
    id: 'traffic',
    name: HOW.traffic.name,
    orgs: '공공데이터포털 표준데이터 · 국토교통부 · 카카오',
    dates: '[[bus:d]] · [[flow:d]]',
    method: '역까지 곧은 거리, 400m 안 정류장 수, 범위 안 하루 승하차 합',
    missing: '걷는 사람 수 · 지하철 출구 · KTX·일반 기차역',
  },
  {
    id: 'photo',
    name: HOW.photo.name,
    orgs: '카카오 · 내가 고른 값',
    dates: '열 때마다',
    method: '로드뷰로 입구·간판 자리를 보고 간판 보임을 고름',
    missing: '사진 찍은 뒤 바뀐 것',
  },
  {
    id: 'bld',
    name: HOW.bld.name,
    orgs: '국토교통부 · 내가 고른 값',
    dates: '[[bld:d]]',
    method: '표제부·층별개요를 그대로 옮김, 위반 건축물은 직접 고름',
    missing: '위반 건축물(공개 자료 없음)',
  },
  {
    id: 'vac',
    name: HOW.vac.name,
    orgs: '소상공인시장진흥공단 · 국토교통부',
    dates: '[[store:d]]',
    method: '층마다 가게 수, 0이면 빈 층 같아요',
    missing: '실제로 비었는지(가게 정보가 늦을 수 있음)',
  },
  {
    id: 'land',
    name: HOW.land.name,
    orgs: '국토교통부',
    dates: '링크만',
    method: '필지 번호로 토지이음 화면을 엶',
    missing: '땅 쓰임·계획 내용(앱이 받아 오지 않음)',
  },
  {
    id: 'future',
    name: HOW.future.name,
    orgs: '행정안전부 · 한국부동산원',
    dates: '[[subscr:d]]',
    method: '2022→2026 인구 견주기, 범위 안 입주 예정 차례',
    missing: '재개발 위치(서울 밖)',
  },
  {
    id: 'cost',
    name: '매물·비용',
    orgs: '내가 붙여 넣은 매물 · 내가 적은 값',
    dates: '적은 날',
    method: '평당 월세 = 월세 ÷ 전용 평수, 저장한 매물끼리 견줌',
    missing: '실제 임대료 시세(매물 사이트를 저절로 가져오지 않음)',
  },
]

export const REPORT = {
  /** 머리 세 줄(reportHead가 채움) */
  head: {
    kicker: '입지 분석 보고서 · 둘째 장 · 후보 {후보} {이름}',
    title: '이렇게 분석했어요',
    saved: '자료는 {저장한 날}(저장한 날) 값',
    sub: "살필 범위 {범위} · 기관 자료 이름과 이용 조건은 앱의 '근거와 출처'에 모두 있어요",
  },
  scoringTitle: '점수 매기는 법',
  /** 세 줄: 다섯 항목({무게}는 fillWeights) · 매기는 법 · 근거 */
  scoring: [
    { label: '다섯 항목', text: '{무게} (무게는 내가 정해요)' },
    {
      label: '매기는 법',
      text: '세부 항목마다 만점 기준으로 0~100점 → 세부 무게로 섞어 항목 점수 → 항목 무게로 섞어 100점 만점. 자료가 없는 것은 빼고 남은 무게로 매겨요.',
    },
    {
      label: '근거',
      text: '사는 사람을 가장 무겁게 둔 것은 연구(이선경 외, 가정의학회지 2009: 정형외과 자리는 낮에 오가는 사람보다 사는 사람과 더 관련)에 기대요. 건물 요건은 법 조문(건축법 시행령 별표 1 · 건축법 제79조 · 의료법 시행규칙 제25조 · 장애인등편의법 시행령 별표 1·2)에 기대요. 나머지 처음 무게·기준은 흔히 보는 기준이에요.',
    },
  ],
  tableTitle: '묶음마다 본 자료',
  columns: ['묶음', '자료(기관)', '기준 날짜', '방법 한 줄', '못 본 것'],
  /** 묶음 열셋 + 매물·비용 */
  rows: REPORT_ROWS,
  /** 표 아래 늘 못 보는 셋 */
  always:
    "늘 못 보는 것: 걷는 사람 수(교통카드 승하차로 대신) · 위반 건축물(건축물대장을 떼어 직접 확인) · 실제 임대료(붙여 넣은 매물끼리만 견줌). 그 밖의 없는 자료는 앱의 '근거와 출처 › 없는 자료'에 있어요.",
  /** 첫 장 맨 아래 문장 끝에 붙는 글 */
  firstPageEnd: '어떻게 분석했는지는 둘째 장에 있어요.',
} as const

// ── 채우기 ──

/** 채울 값: asOf = 그 후보 그날 값의 출처별 기준 날짜(SOURCES id로 물음, 없으면 null) · radiusM = 살필 범위 · sggName = 후보 시·군·구 · rivalShort = 고른 경쟁 과목 짧은 이름(rivalShortText) */
export type HowCtx = {
  asOf: (src: SourceId) => string | null
  radiusM: number
  sggName: string | null
  rivalShort: string
}

// 기준 날짜 글자(common/text.ts asOfText와 같은 모양): '2026-11-05' → '2026년 11월 5일' · '2026-10' → '2026년 10월' · 그 밖은 그대로
function dateText(asOf: string): string {
  if (isYmd(asOf)) return `${asOf.slice(0, 4)}년 ${Number(asOf.slice(5, 7))}월 ${Number(asOf.slice(8, 10))}일`
  if (isMonth(asOf)) return `${asOf.slice(0, 4)}년 ${Number(asOf.slice(5, 7))}월`
  return asOf
}

const MARK = /\[\[(\w+)(:d)?\]\]/g
const GONE = '\u0000'
const NO_RIVAL = '고른 과목 없음'
const NO_SGG = '시·군·구'

/**
 * 글 속 표시 채우기. 기준 날짜가 없는 [[열쇠]]는 그 표시와 바로 둘레 괄호·쉼표·` · `를 함께 뺀다(빈 괄호를 남기지 않음,
 * `(2022년 10월 ~ [[pop:d]])`는 `(2022년 10월 ~)`). {범위} = distText, {시군구}가 없으면 '시·군·구', {경쟁}이 비면 '고른 과목 없음'
 */
export function fillHow(text: string, ctx: HowCtx): string {
  const marked = text.replace(MARK, (_m, key: string, onlyDate: string | undefined) => {
    const src = HOW_KEYS[key]
    const at = src ? ctx.asOf(src) : null
    if (!at) return GONE
    return onlyDate ? dateText(at) : `기준 ${dateText(at)}`
  })
  return marked
    .replace(/\(\u0000\)/g, '')
    .replace(/, \u0000|\u0000, /g, '')
    .replace(/ · \u0000|\u0000 · /g, '')
    .replace(/ ~ \u0000/g, ' ~')
    .replaceAll(GONE, '')
    .replace(/\{범위\}/g, () => distText(ctx.radiusM))
    .replace(/\{시군구\}/g, ctx.sggName || NO_SGG)
    .replace(/\{경쟁\}/g, ctx.rivalShort || NO_RIVAL)
}

/** 한 묶음의 칩·한 줄·[더 보기]를 채워 HowLine이 받는 모양으로 */
export function filledHow(id: HowId, ctx: HowCtx): { chip: HowChip; line: HowLineText; more: HowMoreText } {
  const h = HOW[id]
  const f = (t: string) => fillHow(t, ctx)
  return {
    chip: h.chip,
    line: { what: f(h.line.what), how: f(h.line.how), why: f(h.line.why) },
    more: { what: f(h.more.what), how: f(h.more.how), why: f(h.more.why), basis: f(h.more.basis) },
  }
}

/** 다섯 항목 무게 글: '사는 사람·수요 30 · 경쟁 25 · 교통·흐름 20 · 자리 15 · 비용 10' */
export function weightsText(weights: Readonly<Record<GroupId, number>>): string {
  return SCORE_GROUPS.map((g) => `${g.name} ${weights[g.id]}`).join(' · ')
}

const isDefaultWeights = (weights: Readonly<Record<GroupId, number>>) =>
  SCORE_GROUPS.every((g) => weights[g.id] === DEFAULT_SCORE_RULE.weights[g.id])

/** {무게} = 지금 무게 · {처음 무게} = 처음 무게 그대로일 때만 '(처음 무게)'(바꾼 무게에 '처음 무게'라 쓰지 않음) */
export function fillWeights(text: string, weights: Readonly<Record<GroupId, number>>): string {
  return text.replace(/\{무게\}/g, weightsText(weights)).replace(/\{처음 무게\}/g, isDefaultWeights(weights) ? '(처음 무게)' : '')
}

/** 둘째 장 머리 세 줄. saved = 저장한 날('YYYY-MM-DD'), 없으면 그 조각을 뺀다 */
export function reportHead(c: { id: string; name: string; saved: string | null; radiusM: number }): { kicker: string; title: string; sub: string } {
  const range = REPORT.head.sub.replace('{범위}', distText(c.radiusM))
  return {
    kicker: REPORT.head.kicker.replace('{후보}', c.id).replace('{이름}', c.name),
    title: REPORT.head.title,
    sub: c.saved ? `${REPORT.head.saved.replace('{저장한 날}', dateText(c.saved))} · ${range}` : range,
  }
}

/** 둘째 장 표 열넷을 채움: 기준 날짜 칸은 출처별 날짜(` · `로), 하나도 없으면 '–' · 방법 한 줄의 {경쟁} */
export function reportRows(ctx: HowCtx): ReportRow[] {
  return REPORT.rows.map((r) => ({
    ...r,
    orgs: fillHow(r.orgs, ctx),
    dates: fillHow(r.dates, ctx) || '–',
    method: fillHow(r.method, ctx),
    missing: fillHow(r.missing, ctx),
  }))
}
