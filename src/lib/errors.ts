import type { ErrorCode, ErrorInfo } from '@/types/errors'

// 오류 번호 → 한국어 안내(무엇이 · 어떻게 고치나). 안내 문구는 이 파일 한 곳에만 둔다.
export const ERRORS: Record<ErrorCode, ErrorInfo> = {
  'E-PARSE-COLUMN': {
    what: '꼭 있어야 하는 칸이 파일에 없어요',
    fix: "비트에서 '환자별 소모 통계'의 열 설정에서 빠진 칸을 켜고 다시 뽑아 주세요",
  },
  'E-PARSE-ROW': {
    what: '날짜·차트번호·처방코드를 읽지 못한 줄이 있어 그 줄을 빼고 잠정 숫자만 보여 드려요',
    fix: '비트에서 다시 뽑아 넣으면 증감 비교와 저장이 돼요',
  },
  'E-PARSE-EMPTY': {
    what: '파일에 읽을 외래 줄이 없어요',
    fix: "기간을 확인하고 '환자별 소모 통계'를 다시 뽑아 주세요",
  },
  'E-PARSE-TOO-BIG': {
    what: '파일이 너무 커요(50MB 또는 100만 줄 넘음)',
    fix: '기간을 줄여서 다시 뽑아 주세요',
  },
  'E-PARSE-RRN': {
    what: '읽는 칸에 주민번호 모양 값이 있어 이 파일은 받지 않았어요',
    fix: "비트 열 설정을 확인하고 '환자별 소모 통계'를 다시 뽑아 주세요",
  },
  'E-PARSE-UNREADABLE': {
    what: '파일을 읽지 못했어요',
    fix: '① 환자별 소모 통계가 맞나요 ② 보안 프로그램·암호로 잠긴 파일인가요 ③ CSV로 다시 뽑아 보세요',
  },
  'E-ANALYZE-TIMEOUT': {
    what: '계산이 30초 넘게 걸려 멈췄어요',
    fix: '다시 시도하거나 기간을 줄여 보세요',
  },
  'E-ANALYZE-FAILED': {
    what: '계산하다가 문제가 생겼어요',
    fix: '다시 시도해 보세요. 계속되면 오류 번호와 함께 문의해 주세요',
  },
  // 인증(spec auth). 문구는 승인된 목업 docs/mockups/auth/LoginError.dc.html 기준
  'E-AUTH-CALLBACK': {
    what: '구글 로그인을 마치지 못했어요',
    fix: '다시 시도해 보세요. 계속되면 오류 번호와 함께 문의해 주세요.',
  },
  // 로그인 시작 실패도 같은 카드로 보인다(AC-003.5). 번호만 다르다
  'E-AUTH-START': {
    what: '구글 로그인을 마치지 못했어요',
    fix: '다시 시도해 보세요. 계속되면 오류 번호와 함께 문의해 주세요.',
  },
  'E-SIGNUP-FAILED': {
    what: '가입 신청을 보내지 못했어요',
    fix: '적은 내용은 그대로 있어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
  },
  'E-ADMIN-FAILED': {
    what: '신청 상태를 바꾸지 못했어요',
    fix: '인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
  },
  'E-PAGE-FAILED': {
    what: '화면을 열지 못했어요',
    fix: '잠시 뒤 [다시 시도]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.',
  },
}

export function errorInfo(code: ErrorCode): ErrorInfo {
  return ERRORS[code]
}
