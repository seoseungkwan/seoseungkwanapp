export type ErrorCode =
  | 'E-PARSE-COLUMN' | 'E-PARSE-ROW' | 'E-PARSE-EMPTY' | 'E-PARSE-TOO-BIG'
  | 'E-PARSE-RRN' | 'E-PARSE-UNREADABLE' | 'E-ANALYZE-TIMEOUT' | 'E-ANALYZE-FAILED'

export type ErrorInfo = { what: string; fix: string }
