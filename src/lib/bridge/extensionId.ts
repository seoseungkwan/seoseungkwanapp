// 확장 ID는 이 상수 하나뿐이다(commands.json → 여기). 통로 코드는 이 값으로만 확장에 말한다(ADR-017, AC-004.1).
// 웹스토어가 다른 ID를 주면 commands.json의 extensionId·extensionKey만 바꾼다
import commands from './commands.json'

export const EXTENSION_ID: string = commands.extensionId
