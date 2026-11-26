// 설정 화면이 부르는 도우미 명령 넷(sheet.code·sheet.import·sheet.ping·sheet.catalog)의 답 읽기는 lib/gsheet/settingsReply.ts로 옮겼다
// (spec google-link TASK-23 (라) — 통로 lib/bridge가 화면 폴더를 부르지 않게). 이 파일은 설정 화면 부품이 쓰던 이름 그대로 다시 내보낸다
export { readCatalog, readCode, readImport, readPing } from '@/lib/gsheet/settingsReply'
export type { Catalog, CodeReply, Dept, Hospital, ImportReply, PingReply, Rx } from '@/lib/gsheet/settingsReply'
