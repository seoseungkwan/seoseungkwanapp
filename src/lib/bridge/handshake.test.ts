import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkVersions, compareVersions } from './handshake'
import { PROTOCOL } from './protocol'
import { LATEST_HELPER, LIST_HELPER, MIN_EXTENSION, MIN_HELPER, SUNAP_HELPER, WEB_VERSIONS } from './versions'

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
  // 도우미 0.3.0 = 대시보드·통계·매출 쪽 0.2.0과 청구 쪽 새 명령(입력·저장)을 합친 판. 청구 화면이 새 명령과 정해 둔 사유 글자에 기대므로 MIN도 함께 올렸다.
  // 도우미 0.4.0 = 0.3.0 + 환자 탭 contact.targets. 0.3.0도 다른 화면은 그대로 쓰므로 MIN은 0.3.0에 두고 LATEST만 올린다("새 도우미가 있어요")
  // 도우미 0.5.0 = 0.4.0 + 통계 세 칸(stats.rows v3)·예약 문자 명단·장기 미방문 명단(spec stats-bit-sections·patients-bit-lists). MIN은 그대로 0.3.0
  // 도우미 0.5.1 = 0.5.0 + 긴 기간 통계 읽기 속도(첫 내원 해시 잇기, spec helper-stats-speed). MIN은 그대로 0.3.0
  // 도우미 0.6.0 = 0.5.1 + revenue.days 답에 날마다 처방별 금액 dayCodes(spec stats-revenue). 새 명령 없음, MIN은 그대로 0.3.0
  // 도우미 0.7.0 = 0.6.0 + stats.rows v4(90일초진 칸)·revenue.days 참고 금액 roughTotal(spec first90). 새 명령 없음, MIN은 그대로 0.3.0
  // 도우미 0.8.0 = 0.7.0 + 수납일지 하루 장부(contact.targets kind 'sunap')·달 파일 sunap 칸(spec sunap-ilji). 새 명령 없음, MIN은 그대로 0.3.0
  // 도우미 0.9.0 = 0.8.0 + 수납일지 장부 줄에 원장님(contact.targets sunap 답 v:2, spec sunap-doctors). 새 명령 없음, MIN·SUNAP은 그대로
  // 도우미 0.9.1 = 0.9.0 + 수납일지 장부 미수에서 건강생활유지비(QCV) 뺌(spec sunap-health). 새 명령·새 답 모양 없음(v:2), MIN·SUNAP은 그대로
  it('AC-004.4·AC-012.1·AC-604.1·AC-3402.1·AC-4101.5·AC-4405.3·AC-4902.6·AC-5002.3·AC-5401.3 지금 값은 도우미 최소 0.3.0·최신 0.9.1, 확장 최소 0.1.0이고 MIN ≤ LATEST, protocol은 명령 표와 같다', () => {
    expect(MIN_HELPER).toBe('0.3.0')
    expect(LATEST_HELPER).toBe('0.9.1')
    expect(MIN_EXTENSION).toBe('0.1.0')
    expect(compareVersions(MIN_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
    expect(WEB_VERSIONS).toEqual({
      protocol: PROTOCOL,
      minHelper: MIN_HELPER,
      latestHelper: LATEST_HELPER,
      minExtension: MIN_EXTENSION,
    })
  })

  // 0.5.0을 내보낼 때는 LATEST = LIST였다. 0.5.1부터는 LIST(0.5.0)가 LATEST 이하인지만 본다(helper-stats-speed design.md)
  it('AC-2802.5·AC-3402.1 두 명단 도구가 보는 LIST_HELPER는 0.5.0 그대로이고 LATEST_HELPER 이하다(최신 도우미를 깔면 두 도구가 열린다)', () => {
    expect(LIST_HELPER).toBe('0.5.0')
    expect(compareVersions(LIST_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
  })

  it('AC-4902.6·AC-5002.3·AC-5401.3 수납일지 장부가 보는 SUNAP_HELPER는 0.8.0 그대로이고 LATEST_HELPER 이하다(최신 도우미를 깔면 장부가 열린다)', () => {
    expect(SUNAP_HELPER).toBe('0.8.0')
    expect(compareVersions(SUNAP_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
    expect(compareVersions(LIST_HELPER, SUNAP_HELPER)).toBeLessThan(0)
  })

  it('AC-004.4·AC-3402.1·AC-4902.6·AC-5002.3·AC-5401.3 LATEST_HELPER는 helper/Directory.Build.props의 도우미 버전과 같다(같은 커밋에서 올린다)', () => {
    const props = readFileSync(new URL('../../../helper/Directory.Build.props', import.meta.url), 'utf8')
    expect(props.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe(LATEST_HELPER)
  })

  it('AC-012.2·AC-038.3 확장 manifest의 version은 새 판 0.3.0이다(두 갈래의 0.2.0·0.1.1보다 높다)', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../extension/manifest.json', import.meta.url), 'utf8'))
    expect(manifest.version).toBe('0.3.0')
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

  it.each(['0.1.0', '0.1.1'])('AC-604.2 옛 도우미 %s는 stats.rows를 모르므로 update-helper로 막는다', (version) => {
    expect(
      checkVersions({
        web: WEB_VERSIONS,
        extension: { version: MIN_EXTENSION, protocol: PROTOCOL },
        helper: { version, protocol: PROTOCOL },
      }),
    ).toEqual({ status: 'update-helper' })
  })
})
