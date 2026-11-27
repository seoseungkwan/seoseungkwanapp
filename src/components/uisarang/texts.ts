import type { UisMissingKind } from '@/lib/analytics/uisarang'
import type { UisKind } from '@/types/uisarang'

// 올리기 칸 글(specs/uisarang-upload requirements.md '화면 글자' 올리기 칸 · 결과 — 글자 그대로). 화면 파일은 이 한 곳에서 가져다 쓴다

export const UIS_UPLOAD_TITLE = '의사랑 엑셀 올리기'
export const UIS_UPLOAD_HELP = '의사랑 통계에서 저장한 엑셀을 여기에 끌어다 놓거나 [파일 고르기]를 눌러요. 여러 개를 한 번에 넣어도 돼요.'
export const UIS_UPLOAD_FILES_CAP = '받는 파일'
export const UIS_UPLOAD_FILES = ['수입통계 › 일일수입통계', '진료통계 › 기간별처방통계', '인원통계 › 내원일별환자현황 (위쪽 표 · 아래쪽 표)'] as const
export const UIS_UPLOAD_PERIOD = '조회일은 하루 · 한 주(월~일) · 한 달(1일~말일)만 받아요. 일일수입통계와 아래쪽 표는 하루치만 돼요.'
export const UIS_UPLOAD_ERP = 'ERP 마감일지를 채우기 전에 여기에 먼저 올려 주세요. 마감일지 도우미는 엑셀을 읽은 뒤 지워요.'
export const UIS_UPLOAD_DROP = '파일을 여기에 끌어다 놓으세요'
export const UIS_UPLOAD_DROPPING = '놓으면 이 PC 안에서 읽어요'
export const UIS_UPLOAD_PICK = '파일 고르기'
export const UIS_UPLOAD_PRIVACY = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.'
export const UIS_UPLOAD_FOLDED = '엑셀을 끌어다 놓거나 [파일 고르기]를 눌러요.'
export const UIS_UPLOAD_HELP_OPEN = '도움말 보기'
export const UIS_UPLOAD_HELP_CLOSE = '도움말 접기'
export const uisReadingText = (count: number) => `파일 ${count}개를 이 PC 안에서 읽는 중이에요.`
export const UIS_SAVING = '숫자를 저장하는 중이에요.'

// 결과
export const uisResultHead = (count: number) => `방금 넣은 파일 ${count}개`
/** 옆 글: 저장 {a}개 · 받지 않음 {b}개 · 건너뜀 {c}개 — 0개인 것은 뺀다 */
export function uisResultCounts(saved: number, refused: number, skipped: number): string {
  return [
    [saved, `저장 ${saved}개`],
    [refused, `받지 않음 ${refused}개`],
    [skipped, `건너뜀 ${skipped}개`],
  ]
    .filter(([n]) => n !== 0)
    .map(([, text]) => text)
    .join(' · ')
}
export const UIS_CHIP = { saved: '저장함', refused: '받지 않음', skipped: '건너뜀', failed: '저장 못 함' } as const
export const UIS_KIND_NAME: Record<UisKind, string> = {
  income: '일일수입통계',
  rx: '기간별처방통계',
  visits: '내원일별 위쪽 표',
  visitPatients: '내원일별 아래쪽 표',
  rsv: '예약환자통계',
  rsvPatients: '예약환자통계',
}
export const UIS_UNKNOWN_KIND = '모르는 엑셀'
export const uisMissingColumns = (columns: readonly string[]) => `빠진 칸: ${columns.join(', ')}`
export const uisRowAt = (row: number) => `빈 줄을 빼고 위에서 ${row}번째 줄`
export const UIS_SKIPPED_RSV = '예약환자통계는 웹앱에서 쓰지 않아 건너뛰었어요.'
export const UIS_SKIPPED_SAME = '같은 엑셀이 한 번 더 들어와 하나만 저장했어요.'
export const UIS_MISSING_HEAD = '아직 없는 파일'
export const UIS_MISSING_DESC = '이번에 넣은 날 가운데 아래 파일이 아직 없어요. 같은 날 엑셀을 더 넣으면 채워져요.'
export const UIS_ALL_PRESENT = '넣은 날은 네 가지 파일이 모두 있어요.'
export const UIS_RETRY_SAVE = '다시 저장'
// 아직 없는 파일 줄의 종류 이름(넷)
export const uisMissingName = (kind: UisMissingKind) => UIS_KIND_NAME[kind]
