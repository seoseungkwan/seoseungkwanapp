export type ErrorCode =
  | 'E-PARSE-COLUMN' | 'E-PARSE-ROW' | 'E-PARSE-EMPTY' | 'E-PARSE-TOO-BIG'
  | 'E-PARSE-RRN' | 'E-PARSE-UNREADABLE' | 'E-ANALYZE-TIMEOUT' | 'E-ANALYZE-FAILED'
  | 'E-AUTH-CALLBACK' | 'E-AUTH-START' | 'E-SIGNUP-FAILED' | 'E-ADMIN-FAILED' | 'E-PAGE-FAILED'
  // 청구 사전점검 연결(확장·도우미·통로, spec precheck design.md 4-5)
  | 'E-EXT-MISSING' | 'E-HELPER-MISSING' | 'E-HELPER-OLD' | 'E-EXT-OLD' | 'E-BRIDGE-BUSY'
  | 'E-BRIDGE-DISCONNECTED' | 'E-BRIDGE-REJECTED' | 'E-BRIDGE-BAD-REPLY' | 'E-HELPER-BAD-MESSAGE' | 'E-HELPER-UNKNOWN-COMMAND'
  // 비트 접속·등록(bit.check 단계와 등록 단계, 설치·연결 확인 화면 TASK-6)
  | 'E-BIT-NOT-FOUND' | 'E-BIT-DB-FAILED' | 'E-BIT-READ-FAILED' | 'E-BIT-NOT-REGISTERED' | 'E-BIT-HOSPITAL-MISMATCH'
  | 'E-STORE-FAILED' | 'E-STORE-BROKEN'
  // 통계 도우미 자료(stats.rows, spec stats)
  | 'E-STATS-HISTORY' | 'E-STATS-TOO-BIG' | 'E-STATS-CHANGED'
  // 통계 숫자 저장·읽기(lib/storage/stats.ts, spec stats)
  | 'E-STATS-SAVE-FAILED' | 'E-STATS-READ-FAILED'

export type ErrorInfo = { what: string; fix: string }
