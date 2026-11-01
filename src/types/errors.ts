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
  // 점검 표 불러오기(Worker의 import(), TASK-7)
  | 'E-RULES-LOAD-FAILED'
  // 한 달 자료(claim.month): 도우미가 비트 통계 화면 표를 꺼내지 못함 · Worker가 조각·모양이 다 맞지 않아 멈춤(TASK-9)
  | 'E-BIT-EXPORT-FAILED' | 'E-CLAIM-PARTIAL'
  // AI 리포트(spec ai-report design.md '오류 문구')
  | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'
  // 업무일지(specs/worklog)
  | 'E-WORKLOG-SAVE-FAILED' | 'E-WORKLOG-LOAD-FAILED' | 'E-WORKLOG-NOTE-PRIVATE'

export type ErrorInfo = { what: string; fix: string }
