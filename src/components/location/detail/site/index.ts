// 후보 자세히 › 거리 사진 · 건물 서류 · 빈 칸 짐작 · 땅 쓰임·계획(specs/location TASK-36). 틀(detail/frame)의 칸에 차례대로 넣는다.
// 묶음마다 머리(h3)와 목차 닻(sec-photo · sec-bld · sec-vac · sec-land)을 스스로 그리고, head={false}면 몸만 그린다.
// 머리 바로 아래(head={false}여도 묶음 안 맨 위) '이렇게 봤어요'(TASK-72, AC-7920.2) — howCtx·howOpen·onHow를 받는다(펼침은 부르는 쪽이 쥠)
export { StreetPhotos, type StreetPhotosProps } from './StreetPhotos'
export { BuildingDocs, type BuildingDocsProps } from './BuildingDocs'
export { Vacancy, type VacancyProps } from './Vacancy'
export { LandUse, type LandUseProps } from './LandUse'
