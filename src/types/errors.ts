export type ErrorCode =
  | 'E-PARSE-COLUMN' | 'E-PARSE-ROW' | 'E-PARSE-EMPTY' | 'E-PARSE-TOO-BIG'
  | 'E-PARSE-RRN' | 'E-PARSE-UNREADABLE' | 'E-ANALYZE-TIMEOUT' | 'E-ANALYZE-FAILED'
  | 'E-AUTH-CALLBACK' | 'E-AUTH-START' | 'E-SIGNUP-FAILED' | 'E-ADMIN-FAILED' | 'E-PAGE-FAILED'
  // 청구 사전점검 연결(확장·도우미·통로, spec precheck design.md 4-5)
  | 'E-EXT-MISSING' | 'E-HELPER-MISSING' | 'E-HELPER-OLD' | 'E-EXT-OLD' | 'E-BRIDGE-BUSY'
  | 'E-BRIDGE-DISCONNECTED' | 'E-BRIDGE-REJECTED' | 'E-BRIDGE-BAD-REPLY' | 'E-HELPER-BAD-MESSAGE' | 'E-HELPER-UNKNOWN-COMMAND'

export type ErrorInfo = { what: string; fix: string }
