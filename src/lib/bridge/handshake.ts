// 버전 맞추기(design.md 4-4, AC-004.4). 웹·확장·도우미 protocol이 같고 버전이 웹 기준 이상이어야 쓴다
import type { WebVersions } from './versions'

export type VersionInfo = { version: string; protocol: number }
export type VersionCheck = { status: 'ok'; helperUpdateAvailable: boolean } | { status: 'update-helper' | 'update-extension' }

const VERSION = /^(\d{1,9})\.(\d{1,9})\.(\d{1,9})$/

function parse(version: string): [number, number, number] | null {
  const m = VERSION.exec(version)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/** x.y.z를 숫자로 비교한다. 읽을 수 없는 버전은 어떤 버전보다도 낮다 */
export function compareVersions(a: string, b: string): number {
  const x = parse(a)
  const y = parse(b)
  if (!x || !y) return x ? 1 : y ? -1 : 0
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

const atLeast = (version: string, min: string) => parse(version) !== null && compareVersions(version, min) >= 0

/** 확장이 앞(웹 바로 다음)에 있으므로 둘 다 맞지 않으면 확장부터 업데이트하게 한다 */
export function checkVersions({ web, extension, helper }: { web: WebVersions; extension: VersionInfo; helper: VersionInfo }): VersionCheck {
  if (extension.protocol !== web.protocol || !atLeast(extension.version, web.minExtension)) return { status: 'update-extension' }
  if (helper.protocol !== web.protocol || !atLeast(helper.version, web.minHelper)) return { status: 'update-helper' }
  return { status: 'ok', helperUpdateAvailable: compareVersions(helper.version, web.latestHelper) < 0 }
}
