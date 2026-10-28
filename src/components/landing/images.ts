// 승인된 목업의 그림 6장. 파일은 public/landing/(승인본 docs/mockups/landing/images/ 복사)
export type LandingImage = { src: `/landing/${string}.jpg`; alt: string; width: number; height: number }

const tile = (name: string, alt: string): LandingImage => ({ src: `/landing/${name}.jpg`, alt, width: 880, height: 1168 })
const feature = (name: string, alt: string): LandingImage => ({ src: `/landing/${name}.jpg`, alt, width: 1344, height: 752 })

export const LANDING_IMAGES = {
  tileInjection: tile('tile-injection', '주사기와 밴드'),
  tilePhysio: tile('tile-physio', '치료 침대, 전기 치료기, 패드와 찜질팩'),
  tileNoncovered: tile('tile-noncovered', '동전과 지폐'),
  tileReport: tile('tile-report', '차트가 담긴 월말 보고서'),
  featureStats: feature('feature-stats', '차트가 뜬 노트북과 척추·무릎 모형이 있는 책상'),
  featurePayroll: feature('feature-payroll', '계산기와 서류, 표가 뜬 태블릿이 놓인 책상'),
} as const satisfies Record<string, LandingImage>
