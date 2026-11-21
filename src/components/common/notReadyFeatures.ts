// 준비 중 기능 자료 (tab-frame REQ-305 AC-305.4, ui-90 REQ-415 AC-415.1, design.md '준비 중 (TASK-12)'). 주소마다 얇은 페이지가 이 항목을 꺼내 NotReadyScreen에 넘긴다.
// 문구는 ui-90 시안(docs/mockups/ui-90/app/gen.py nr_body)의 주소록 말투를 따른다(주소록은 화면이 생겨 빠졌다, contacts AC-6508.1). 숫자를 쓰지 않는다.
// title(h1)은 조사(은/는)까지 통째로 적는다 — 받침에 따라 계산하지 않는다(몇 개뿐이고 시험이 글자를 못 박는다). 탭 이름(metadata)은 name이다.
// 이름·주소는 탭 목록(shell/menu.ts)·기능 목차(dashboard/briefing/features.ts)에도 따로 적는다(병렬 갈래라 서로 불러오지 않는다). 셋이 같은지는 통합 시험이 본다.
// 기능에 진짜 화면이 생기면 그 항목을 여기서 빼고 그 주소의 page.tsx를 진짜 화면으로 바꾼다(design.md '다음 명세가 탭을 채울 때')

export type NotReadyPath =
  never // 지금은 준비 중 기능이 없다(고시·공지·재고·주소록·직원 모두 화면이 생겼다). 새 준비 중 탭을 더하면 `| '/주소'`로 적는다

export type NotReadyFeature = {
  path: NotReadyPath
  /** 탭 이름·목차 이름(예: "주소록") */
  name: string
  /** 화면 h1(예: "주소록은 준비 중이에요") */
  title: string
  intro: string
  items: readonly string[]
}

// 소개 글 끝맺음(새 준비 중 항목을 더할 때 intro 끝에 붙인다): '만들어지면 이 탭에서 바로 쓸 수 있어요.'

// 탭 순서
export const NOT_READY_FEATURES: readonly NotReadyFeature[] = []

const BY_PATH = new Map(NOT_READY_FEATURES.map((feature) => [feature.path, feature]))

// 주소마다 한 줄씩 있다(notReadyFeatures.test.ts) → 늘 찾는다
export function notReadyFeature(path: NotReadyPath): NotReadyFeature {
  return BY_PATH.get(path) as NotReadyFeature
}
