// 내용 스크립트(일반 스크립트, design.md 4절): ERP 화면(https://erp.minesolution.com/*)에 들어가 모듈 main.js만 불러 시작한다.
// 화면 안 이동을 보고 /h/closing일 때만 단추를 붙이는 일은 main.js가 한다. 이 파일에는 import·export 문을 두지 않는다
void import(chrome.runtime.getURL('main.js')).then((main: { startPage(): void }) => main.startPage())
