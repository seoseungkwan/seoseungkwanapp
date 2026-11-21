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
  // 매출 탭 저장(spec revenue design.md 8절)
  | 'E-REVENUE-SAVE-FAILED'
  // 치료 묶음 저장·읽기(spec revenue design.md 8-2절)
  | 'E-REVENUE-GROUP-SAVE-FAILED' | 'E-REVENUE-GROUP-LOAD-FAILED'
  // 통계 도우미 자료(stats.rows, spec stats)
  | 'E-STATS-HISTORY' | 'E-STATS-TOO-BIG' | 'E-STATS-CHANGED'
  // 통계 숫자 저장·읽기(lib/storage/stats.ts, spec stats)
  | 'E-STATS-SAVE-FAILED' | 'E-STATS-READ-FAILED'
  // 통계 탭에서 고른 처방 저장·읽기(lib/storage/rxPicks.ts, spec rx-picker)
  | 'E-STATS-PICK-READ-FAILED' | 'E-STATS-PICK-SAVE-FAILED'
  // 통계 처방별 추세 묶음 읽기·저장(lib/storage/statsRxGroups.ts, spec treatment-trend)
  | 'E-STATS-GROUP-READ-FAILED' | 'E-STATS-GROUP-SAVE-FAILED'
  // 통계 요약 '이번 달 목표' 저장(components/stats/sections/GoalSection.tsx, spec stats-insights AC-6102.5)
  | 'E-STATS-GOAL-SAVE-FAILED'
  // 점검 표 불러오기(Worker의 import(), TASK-7)
  | 'E-RULES-LOAD-FAILED'
  // 한 달 자료(claim.month): 도우미가 비트 통계 화면 표를 꺼내지 못함 · Worker가 조각·모양이 다 맞지 않아 멈춤(TASK-9)
  | 'E-BIT-EXPORT-FAILED' | 'E-CLAIM-PARTIAL'
  // 청구 설정 표를 읽거나 쓰지 못함(TASK-12)
  | 'E-SETTINGS-FAILED'
  // 병원 문구 설정이 없거나 틀려 메모를 만들지 않음(TASK-14)
  | 'E-MEMO-NO-SETTINGS'
  // 입력 건수를 서버에 올리거나 읽지 못함(TASK-19)
  | 'E-COUNTS-FAILED'
  // 날짜별 완료 표시를 저장·되돌리지 못함(lib/storage/claimDayCloses.ts, spec claim-day-done)
  | 'E-DAYCLOSE-FAILED'
  // 비트 입력이 멈춘 번호(도우미 끝 JSON의 code, AC-018.21): 입력 멈춤 · 저장 안 한 처방 창 · 비트 화면 칸이 달라짐
  | 'E-INPUT-STOPPED' | 'E-BIT-UNSAVED-RX' | 'E-BIT-UI-CHANGED'
  // AI 리포트(spec ai-report design.md '오류 문구')
  | 'E-AI-BUSY' | 'E-AI-LIMIT' | 'E-AI-FAILED' | 'E-AI-NO-DATA'
  // 저장한 AI 리포트 읽기(spec ai-report-screen REQ-701). POST가 쓰지 않아 AiErrorCode에는 없다
  | 'E-AI-READ'
  // 업무일지(specs/worklog)
  | 'E-WORKLOG-SAVE-FAILED' | 'E-WORKLOG-LOAD-FAILED' | 'E-WORKLOG-NOTE-PRIVATE'
  // 환자 탭(spec patients REQ-609). 이 명세는 E-PATIENTS-*만 더한다(규칙 C3)
  | 'E-PATIENTS-TEMPLATES-READ' | 'E-PATIENTS-TEMPLATES-SAVE' | 'E-PATIENTS-COUNTS-READ' | 'E-PATIENTS-COUNTS-SAVE' | 'E-PATIENTS-SOURCE'
  // 비트 대시보드(spec bit-dashboard)
  | 'E-BIT-DATA-UNSURE' | 'E-BIT-IN-USE'
  // 서식 탭 휴진 안내(spec forms design.md 11절)
  | 'E-FORMS-PRIVATE' | 'E-FORMS-NO-DATE' | 'E-FORMS-SAVE-FAILED' | 'E-FORMS-READ-FAILED' | 'E-FORMS-IMAGE-FAILED'
  // 휴진 안내 AI 배경(specs/forms-themes design.md 12절): 하루 한도 · OpenAI 한도 · 만들기 실패 · 내 배경 저장·읽기 실패
  | 'E-FORMS-BG-LIMIT' | 'E-FORMS-BG-QUOTA' | 'E-FORMS-BG-FAILED' | 'E-FORMS-BG-STORE-FAILED'
  // 도우미·확장 설치 파일 보관함(specs/helper-download design.md '오류'): 목록 읽기 · 받기 · 이름 · 크기 · 같은 판 · 올리기 실패
  | 'E-INSTALL-READ-FAILED' | 'E-INSTALL-DOWNLOAD-FAILED' | 'E-INSTALL-FILE-NAME' | 'E-INSTALL-FILE-SIZE' | 'E-INSTALL-FILE-EXISTS' | 'E-INSTALL-UPLOAD-FAILED'
  // 설정 '데스크 계정' 칸(specs/desk-feedback design.md '③ 설정 데스크 계정 칸'): 목록 읽기 · 더하기·빼기 실패 · 메일 모양 · 병원 계정 메일 · 이미 데스크 메일 · 5개
  | 'E-DESK-READ-FAILED' | 'E-DESK-SAVE-FAILED' | 'E-DESK-EMAIL-BAD' | 'E-DESK-EMAIL-TAKEN' | 'E-DESK-EMAIL-USED' | 'E-DESK-LIMIT'
  // 설정 '병원 정보' 칸(specs/clinic-profile design.md 3절): 읽기 · 저장 · 로고 올리기 실패
  | 'E-CLINIC-READ-FAILED' | 'E-CLINIC-SAVE-FAILED' | 'E-CLINIC-LOGO-FAILED'
  // 처음 질문 저장 실패(specs/clinic-profile AC-6614.8)
  | 'E-FIRST-RUN-SAVE-FAILED'
  // 고시·공지 탭(specs/notices requirements 기본값 12·20): 목록·글 읽기 실패 · 별표·메모·규칙 확인 저장 실패 · 내 낱말 저장 실패
  | 'E-NOTICE-READ' | 'E-NOTICE-SAVE' | 'E-NOTICE-WORDS'

export type ErrorInfo = { what: string; fix: string }
