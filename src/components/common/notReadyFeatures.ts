// 준비 중 기능 자료 (tab-frame REQ-305 AC-305.4, ui-90 REQ-415 AC-415.1, design.md '준비 중 (TASK-12)'). 주소마다 얇은 페이지가 이 항목을 꺼내 NotReadyScreen에 넘긴다.
// 주소록은 시안(docs/mockups/ui-90/app/gen.py nr_body) 그대로이고, 나머지는 같은 말투다. 숫자를 쓰지 않는다.
// title(h1)은 조사(은/는)까지 통째로 적는다 — 받침에 따라 계산하지 않는다(몇 개뿐이고 시험이 글자를 못 박는다). 탭 이름(metadata)은 name이다.
// 이름·주소는 탭 목록(shell/menu.ts)·기능 목차(dashboard/briefing/features.ts)에도 따로 적는다(병렬 갈래라 서로 불러오지 않는다). 셋이 같은지는 통합 시험이 본다.
// 기능에 진짜 화면이 생기면 그 항목을 여기서 빼고 그 주소의 page.tsx를 진짜 화면으로 바꾼다(design.md '다음 명세가 탭을 채울 때')

export type NotReadyPath =
  | '/stats'
  | '/notices'
  | '/revenue'
  | '/ai-report'
  | '/forms'
  | '/staff'
  | '/inventory'
  | '/contacts'

export type NotReadyFeature = {
  path: NotReadyPath
  /** 탭 이름·목차 이름(예: "주소록") */
  name: string
  /** 화면 h1(예: "주소록은 준비 중이에요") */
  title: string
  intro: string
  items: readonly string[]
}

const SOON = '만들어지면 이 탭에서 바로 쓸 수 있어요.'

// 탭 순서
export const NOT_READY_FEATURES: readonly NotReadyFeature[] = [
  {
    path: '/stats',
    name: '통계',
    title: '통계는 준비 중이에요',
    intro: `환자 흐름과 처방 추세를 그래프로 볼 자리예요. ${SOON}`,
    items: ['환자 수 추이(신환·재진)', '신환 재방문율', '처방 추세', '요일별 환자 수', '원장님 보고 문장'],
  },
  {
    path: '/notices',
    name: '고시·공지',
    title: '고시·공지는 준비 중이에요',
    intro: `심사·고시 새 글을 한곳에서 볼 자리예요. ${SOON}`,
    items: ['심평원 공지·심사기준 변경', '보건복지부 고시·공지', '건강보험공단 공지', '글마다 AI 세 줄 요약'],
  },
  {
    path: '/revenue',
    name: '매출',
    title: '매출은 준비 중이에요',
    intro: `매출 흐름을 나눠 볼 자리예요. ${SOON}`,
    items: ['매출 추이', '급여와 비급여', '치료별 매출', '한 사람당 평균 진료비'],
  },
  {
    path: '/ai-report',
    name: 'AI 리포트',
    title: 'AI 리포트는 준비 중이에요',
    intro: `보고 자료를 정해 둔 양식으로 채울 자리예요. ${SOON}`,
    items: ['월간보고 발표 자료', '주간 요약', '분기와 연간 보고'],
  },
  {
    path: '/forms',
    name: '서식',
    title: '서식은 준비 중이에요',
    intro: `대충 적은 글을 양식에 맞게 정리할 자리예요. ${SOON}`,
    items: ['진료일정·휴진 안내', '환자 안내문', '직원 공지·회의록', '근무표·보고서'],
  },
  {
    path: '/staff',
    name: '직원',
    title: '직원은 준비 중이에요',
    intro: `직원과 급여·휴가를 한곳에서 볼 자리예요. ${SOON}`,
    items: ['직원 명단', '급여 계산과 명세서', '연차와 휴가'],
  },
  {
    path: '/inventory',
    name: '재고',
    title: '재고는 준비 중이에요',
    intro: `물품이 얼마나 남았는지 챙길 자리예요. ${SOON}`,
    items: ['물품 목록·남은 수량', '부족 표시', '들어온 것과 쓴 것'],
  },
  {
    path: '/contacts',
    name: '주소록',
    title: '주소록은 준비 중이에요',
    intro: `거래처와 업체 연락처를 한곳에 모아 둘 자리예요. ${SOON}`,
    items: ['거래처', '수리·관리 업체', '뉴메디코어 연락처'],
  },
]

const BY_PATH = new Map(NOT_READY_FEATURES.map((feature) => [feature.path, feature]))

// 주소마다 한 줄씩 있다(notReadyFeatures.test.ts) → 늘 찾는다
export function notReadyFeature(path: NotReadyPath): NotReadyFeature {
  return BY_PATH.get(path) as NotReadyFeature
}
