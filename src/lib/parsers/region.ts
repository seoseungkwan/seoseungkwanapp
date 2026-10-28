// 주소 → 시·도 + 시·군·구(+ 시 안의 구) + 동·읍·면·가·리까지. 번지·건물·호수는 버린다.
// 앞에서부터 행정 구역 모양 낱말만 차례로 받고, 처음으로 아닌 낱말(번지·도로명·건물)에서 멈춘다 → 도로명 주소는 구까지

const PROVINCE_SHORT = new Set([
  '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
])
const PROVINCE = /^[가-힣]+(특별시|광역시|특별자치시|특별자치도|도)$/
const CITY = /^[가-힣]+(시|군|구)$/
const DISTRICT = /^[가-힣]+구$/ // 시 안의 구
const TOWN = /^[가-힣][가-힣0-9.·]*(동|읍|면|가)$/ // 한글로 시작(건물 '101동'은 아님)
const VILLAGE = /^[가-힣][가-힣0-9]*리$/ // 읍·면 아래

const isProvince = (word: string) => PROVINCE_SHORT.has(word) || PROVINCE.test(word)

export function toRegion(address: string | null | undefined): string | null {
  const words = (address ?? '').split(/[\s,]+/).filter((word) => word !== '')
  const kept: string[] = []
  const take = (test: (word: string) => boolean) => {
    const word = words[kept.length]
    if (word === undefined || !test(word)) return false
    kept.push(word)
    return true
  }
  take(isProvince)
  if (take((word) => CITY.test(word)) && kept[kept.length - 1].endsWith('시')) take((word) => DISTRICT.test(word))
  if (take((word) => TOWN.test(word)) && /[읍면]$/.test(kept[kept.length - 1])) take((word) => VILLAGE.test(word))
  return kept.length > 0 ? kept.join(' ') : null
}
