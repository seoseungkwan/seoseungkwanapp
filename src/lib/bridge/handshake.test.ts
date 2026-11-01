import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkVersions, compareVersions } from './handshake'
import { PROTOCOL } from './protocol'
import { LATEST_HELPER, MIN_EXTENSION, MIN_HELPER, WEB_VERSIONS } from './versions'

// 시험용 웹 기준: 도우미 0.2.0 이상(0.3.0이 최신), 확장 0.2.0 이상
const WEB = { protocol: 1, minHelper: '0.2.0', latestHelper: '0.3.0', minExtension: '0.2.0' }
const ok = (version: string) => ({ version, protocol: 1 })

describe('AC-004.4 checkVersions', () => {
  it('AC-004.4 protocol이 모두 같고 도우미·확장이 최소 이상이면 ok', () => {
    expect(checkVersions({ web: WEB, extension: ok('0.2.0'), helper: ok('0.3.0') })).toEqual({
      status: 'ok',
      helperUpdateAvailable: false,
    })
    expect(checkVersions({ web: WEB, extension: ok('1.0.0'), helper: ok('0.10.0') })).toEqual({
      status: 'ok',
      helperUpdateAvailable: false,
    })
  })

  it('AC-004.4 도우미가 최소 이상·최신 미만이면 ok + helperUpdateAvailable', () => {
    expect(checkVersions({ web: WEB, extension: ok('0.2.0'), helper: ok('0.2.0') })).toEqual({
      status: 'ok',
      helperUpdateAvailable: true,
    })
    expect(checkVersions({ web: WEB, extension: ok('0.2.0'), helper: ok('0.2.9') })).toEqual({
      status: 'ok',
      helperUpdateAvailable: true,
    })
  })

  it.each(['0.1.9', '0.1.10', '0.0.99'])('AC-004.4 도우미 %s(최소 0.2.0보다 낮음)이면 update-helper', (version) => {
    expect(checkVersions({ web: WEB, extension: ok('0.2.0'), helper: ok(version) })).toEqual({ status: 'update-helper' })
  })

  it.each([0, 2])('AC-004.4 도우미 protocol이 %i(웹과 다름)이면 update-helper', (protocol) => {
    expect(checkVersions({ web: WEB, extension: ok('0.2.0'), helper: { version: '0.3.0', protocol } })).toEqual({
      status: 'update-helper',
    })
  })

  it.each(['0.1.0', '0.1.99'])('AC-004.4 확장 %s(최소 0.2.0보다 낮음)이면 update-extension', (version) => {
    expect(checkVersions({ web: WEB, extension: ok(version), helper: ok('0.3.0') })).toEqual({ status: 'update-extension' })
  })

  it.each([0, 2])('AC-004.4 확장 protocol이 %i(웹과 다름)이면 update-extension', (protocol) => {
    expect(checkVersions({ web: WEB, extension: { version: '0.2.0', protocol }, helper: ok('0.3.0') })).toEqual({
      status: 'update-extension',
    })
  })

  it('AC-004.4 둘 다 맞지 않으면 앞에 있는 확장부터 업데이트하게 한다', () => {
    expect(checkVersions({ web: WEB, extension: ok('0.1.0'), helper: ok('0.1.0') })).toEqual({ status: 'update-extension' })
  })

  it.each(['', '1', '1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '01.-2.3'])('AC-004.4 읽을 수 없는 버전 %j는 낮은 것으로 본다', (v) => {
    expect(checkVersions({ web: WEB, extension: ok('0.2.0'), helper: ok(v) })).toEqual({ status: 'update-helper' })
    expect(checkVersions({ web: WEB, extension: ok(v), helper: ok('0.3.0') })).toEqual({ status: 'update-extension' })
  })

  it('AC-004.4 버전은 x.y.z 숫자로 비교한다(글자 비교가 아니다)', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0)
  })
})

describe('AC-004.4 웹 versions.ts 값', () => {
  it('AC-004.4·AC-012.1 LATEST_HELPER는 새 판 0.2.0, MIN_HELPER·MIN_EXTENSION은 0.1.0 그대로이고 MIN ≤ LATEST, protocol은 명령 표와 같다', () => {
    expect(MIN_HELPER).toBe('0.1.0')
    expect(LATEST_HELPER).toBe('0.2.0')
    expect(MIN_EXTENSION).toBe('0.1.0')
    expect(compareVersions(MIN_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
    expect(WEB_VERSIONS).toEqual({
      protocol: PROTOCOL,
      minHelper: MIN_HELPER,
      latestHelper: LATEST_HELPER,
      minExtension: MIN_EXTENSION,
    })
  })

  it('AC-004.4 LATEST_HELPER는 helper/Directory.Build.props의 도우미 버전과 같다(같은 커밋에서 올린다)', () => {
    const props = readFileSync(new URL('../../../helper/Directory.Build.props', import.meta.url), 'utf8')
    expect(props.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe(LATEST_HELPER)
  })

  it('AC-012.2 확장 manifest의 version은 새 판 0.2.0이다', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../extension/manifest.json', import.meta.url), 'utf8'))
    expect(manifest.version).toBe('0.2.0')
  })

  it('AC-004.4 지금 확장(manifest)·도우미는 웹 기준으로 ok다', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../extension/manifest.json', import.meta.url), 'utf8'))
    expect(
      checkVersions({
        web: WEB_VERSIONS,
        extension: { version: manifest.version, protocol: PROTOCOL },
        helper: { version: LATEST_HELPER, protocol: PROTOCOL },
      }),
    ).toEqual({ status: 'ok', helperUpdateAvailable: false })
  })
})
