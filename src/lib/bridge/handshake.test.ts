import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkVersions, compareVersions } from './handshake'
import { PROTOCOL } from './protocol'
import { APPEND_HELPER, CAL_HELPER, LATEST_HELPER, LIST_HELPER, MIN_EXTENSION, MIN_HELPER, SUNAP_HELPER, VALUE_HELPER, WEB_VERSIONS } from './versions'

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
  // 도우미 0.10.0 = 0.9.1 + 예약 탭 비트 찾기·접수·비트 예약(contact.targets kind calfind·calday, 선택 칸 q)·수납일지 답 v:3 건강생활 칸(spec clinic-calendar). 새 명령 없음, MIN·SUNAP·LIST는 그대로
  // 도우미 0.11.0 = 0.10.0 + stats.rows v5(접수 줄 신환 표시 칸, spec new-mark)·v5 extra.pays 환자·날 금액 줄(spec stats-insights). 새 명령 없음, MIN·SUNAP·LIST·CAL은 그대로
  // 도우미 0.12.0 = 0.11.0 + bit.input 항목 appends(비트 메모 뒤에 붙이기)·붙인 메모 견주기·3,000바이트(spec clinic-profile). 새 명령 없음, MIN·SUNAP·LIST·CAL·VALUE는 그대로
  // 도우미 0.13.0 = 0.12.0 + 환불·변경수납·예치금·연결 중복이 있는 날·달도 금액을 다 읽음(spec bit-total). 새 명령·새 칸 없음, MIN·SUNAP·LIST·CAL·VALUE·APPEND는 그대로
  // 도우미 0.13.2 = 0.13.1 + 비트 설치 위치 상관없이 찾기(precheck TASK-45)
  // 도우미 0.13.1 = 0.13.0 + 다른 의원 비트에서도 처음 등록·요양기관번호 없어도 청구(precheck TASK-43). 새 명령·새 칸 없음, 다른 최소 판은 그대로
  it('AC-005.16·AC-004.4·AC-012.1·AC-604.1·AC-3402.1·AC-4101.5·AC-4405.3·AC-4902.6·AC-5002.3·AC-5401.3·AC-5903.5·AC-6106.1·AC-6611.2·AC-6912.6 지금 값은 도우미 최소 0.3.0·최신 0.13.2, 확장 최소 0.1.0이고 MIN ≤ LATEST, protocol은 명령 표와 같다', () => {
    expect(MIN_HELPER).toBe('0.3.0')
    expect(LATEST_HELPER).toBe('0.13.2')
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

  // 0.10.0을 내보낼 때는 CAL = LATEST였다. 0.11.0부터는 CAL(0.10.0)이 LATEST 이하인지만 본다(stats-insights TASK-5)
  it('AC-5903.5 예약 탭이 보는 CAL_HELPER는 0.10.0 그대로이고 LATEST_HELPER 이하다. MIN_HELPER 0.3.0·SUNAP_HELPER 0.8.0·LIST_HELPER 0.5.0은 그대로다(예약 탭만 0.10.0 미만을 비트 없는 기기처럼 그린다)', () => {
    expect(CAL_HELPER).toBe('0.10.0')
    expect(compareVersions(CAL_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
    expect(compareVersions(SUNAP_HELPER, CAL_HELPER)).toBeLessThan(0)
    expect(MIN_HELPER).toBe('0.3.0')
    expect(SUNAP_HELPER).toBe('0.8.0')
    expect(LIST_HELPER).toBe('0.5.0')
  })

  // 0.11.0을 내보낼 때는 VALUE = LATEST였다. 0.12.0부터는 VALUE(0.11.0)가 LATEST 이하인지만 본다(clinic-profile TASK-4)
  it('AC-6106.1 1명당 매출이 보는 VALUE_HELPER는 0.11.0 그대로이고 LATEST_HELPER 이하다. MIN_HELPER 0.3.0·CAL_HELPER 0.10.0·SUNAP_HELPER 0.8.0·LIST_HELPER 0.5.0은 그대로다(금액 줄 pays는 0.11.0부터 온다)', () => {
    expect(VALUE_HELPER).toBe('0.11.0')
    expect(compareVersions(VALUE_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
    expect(compareVersions(CAL_HELPER, VALUE_HELPER)).toBeLessThan(0)
    expect(MIN_HELPER).toBe('0.3.0')
    expect(CAL_HELPER).toBe('0.10.0')
    expect(SUNAP_HELPER).toBe('0.8.0')
    expect(LIST_HELPER).toBe('0.5.0')
  })

  // 0.12.0을 내보낼 때는 APPEND = LATEST였다. 0.13.0부터는 APPEND(0.12.0)가 LATEST 이하인지만 본다(bit-total TASK-9)
  it('AC-6611.2·AC-6912.6 뒤에 붙이기(bit.input appends)를 쓰는 APPEND_HELPER는 0.12.0 그대로이고 LATEST_HELPER 이하다. MIN_HELPER 0.3.0·VALUE_HELPER 0.11.0·CAL_HELPER 0.10.0·SUNAP_HELPER 0.8.0·LIST_HELPER 0.5.0은 그대로다(옛 도우미는 appends 칸을 모르는 칸으로 거절한다)', () => {
    expect(APPEND_HELPER).toBe('0.12.0')
    expect(compareVersions(APPEND_HELPER, LATEST_HELPER)).toBeLessThanOrEqual(0)
    expect(compareVersions(VALUE_HELPER, APPEND_HELPER)).toBeLessThan(0)
    expect(MIN_HELPER).toBe('0.3.0')
    expect(VALUE_HELPER).toBe('0.11.0')
    expect(CAL_HELPER).toBe('0.10.0')
    expect(SUNAP_HELPER).toBe('0.8.0')
    expect(LIST_HELPER).toBe('0.5.0')
  })

  it('AC-004.4·AC-3402.1·AC-4902.6·AC-5002.3·AC-5401.3·AC-5903.5·AC-6106.1·AC-6611.2·AC-6912.6 LATEST_HELPER는 helper/Directory.Build.props의 도우미 버전과 같다(같은 커밋에서 올린다)', () => {
    const props = readFileSync(new URL('../../../helper/Directory.Build.props', import.meta.url), 'utf8')
    expect(props.match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe(LATEST_HELPER)
  })

  it('AC-012.2·AC-038.3·AC-6401.2 확장 manifest의 version은 새 판 0.4.0이다(새 주소 n-medi, 옛 0.3.0보다 높다)', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../extension/manifest.json', import.meta.url), 'utf8'))
    expect(manifest.version).toBe('0.4.0')
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
