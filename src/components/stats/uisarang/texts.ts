// 통계 탭 의사랑 의원 글(specs/uisarang-upload requirements '화면 글자' 통계 탭 · 셀 수 없음 안내, 시안 docs/mockups/uisarang-upload T).
// 통계 탭 안 의사랑 칸이 이 한 곳에서 글을 가져간다. 대시보드(summary/)는 이 파일을 부르지 않는다(design.md §10-2 울타리)

/** 셀 수 없음 안내의 굵은 제목 · 작은 숫자 칸(90일초진)의 작은 글 */
export const UIS_NA = '의사랑 엑셀로는 셀 수 없어요'

/** 셀 수 없음 안내의 까닭(자리마다) */
export const UIS_WHY = {
  revisit: '환자마다 다시 온 날을 알 수 없어요.', // 환자 카드 신환 재방문율 · 처방 카드 몇 번까지 받나
  rxSplit: '처방을 환자마다 나눌 수 없어요.', // 처방 카드 처방별 신환·재진
  block: '환자마다 받은 처방을 알 수 없어요.', // 예약·전환 카드 Block 전환
  hours: '접수 시각이 엑셀에 없어요.', // 진료 운영 카드 시간대별 접수
  doctors: '원장님마다 나눈 숫자가 엑셀에 없어요.', // 진료 운영 카드 원장님별
  treat: '처방 카드의 묶음별 총액에서 볼 수 있어요.', // 매출 카드 치료별 매출 탭
  mix: '아래쪽 표에서는 나이대만 세요.', // 환자 구성 표 아래(보험·동네 자리)
  report: '기간을 직접 고르면 저장된 숫자로 보고 글을 만들어요.', // 보고 카드 비트 보고 자리
} as const

/** 통계 화면 빈 글(저장된 숫자 없음) */
export const UIS_EMPTY_TITLE = '아직 올린 의사랑 엑셀이 없어요'
export const UIS_EMPTY_BODY = '위 칸에 의사랑 통계 엑셀을 넣으면 숫자가 채워져요.'

/** 카드 옆 글 */
export const UIS_RX_DESC = '처방량은 환자 수가 아니라 의사랑 총투여량의 합이에요'
export const UIS_REPORT_DESC = '저장된 숫자로 만든 보고 글 · 환자 이름은 쓰지 않아요'

/** 처방 카드 탭 이름 */
export const UIS_RX_TABS = { groups: '묶음별 처방량', codes: '처방 코드별', split: '처방별 신환·재진', dropoff: '몇 번까지 받나' } as const

/** 묶음별 처방량 */
export const UIS_GROUP_LEAD = '만들어 둔 묶음마다 처방량과 총액'
export const UIS_GROUP_HEAD = ['묶음', '처방량', '총액'] as const
export const UIS_OTHER = '그 밖 처방'
export const UIS_SUM = '합계'
export const UIS_IGNORED = '빼는 처방·조건은 의사랑 엑셀로 셀 수 없어 넣는 처방만 더했어요.'
export const UIS_EDIT = '묶음 고치기'
export const UIS_EDIT_TITLE = `${UIS_RX_TABS.groups} · ${UIS_EDIT}`
/** 덮음 줄: {기간 이름} 처방 엑셀: {한 달 n개 · 한 주 n개 · 하루 n개}(0개인 것은 뺀다) */
export const uisCoverText = (periodName: string, parts: readonly string[]) => `${periodName} 처방 엑셀: ${parts.join(' · ')}`
export const UIS_COVER_UNIT = { month: '한 달', week: '한 주', day: '하루' } as const

/** 처방 코드별 */
export const UIS_CODE_LEAD = '기간별처방통계의 코드마다'
export const UIS_CODE_HEAD = ['코드', '처방명칭', '처방량', '총액'] as const

/** 기간이 처방 줄로 다 덮이지 않음 */
export const UIS_GAP_TITLE = '처방 엑셀이 모자라요'
export const uisGapText = (days: string, list: string) => `${days}일 치가 없어요: ${list}. 그 날(또는 그 주·달) 기간별처방통계를 올려 주세요.`

/** 환자 구성(의사랑) */
export const UIS_MIX_TITLE = '환자 구성'
export const uisMixDesc = (days: string) => `내원한 날마다 센 수 · 아래쪽 표를 올린 날 ${days}일`
export const UIS_MIX_HEAD = ['나이대', '내원', '비율', '신환', '비율'] as const
export const UIS_MIX_TABLE = '나이대별 내원·신환'
export const uisMixMissing = (days: string) => `아래쪽 표가 없는 진료한 날 ${days}일은 빼고 셌어요.`
