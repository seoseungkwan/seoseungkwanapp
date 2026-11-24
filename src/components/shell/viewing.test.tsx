// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReadOnlyArea, ViewingProvider, WriteOnly, useReadOnly, useViewing, type Viewing } from './viewing'

// 읽기만 바탕 (admin-view REQ-8007 AC-8007.1·AC-8007.2, design.md '읽기만 바탕').
// 앱 틀이 보는 중이면 본문을 ViewingProvider로 감싸고, 화면은 useReadOnly()·<WriteOnly>로 쓰기 단추를 숨긴다.
// 의원 비교는 보기와 상관없이 ReadOnlyArea로 읽기만 구역을 만든다. 이 파일은 React 문맥뿐이라 환자 줄 구역에서도 import한다
// (네트워크·브라우저 저장소·쿠키·console 없음). 가짜 의원만 쓴다

const ROOT = process.cwd()
const SRC = readFileSync(join(ROOT, 'src/components/shell/viewing.tsx'), 'utf8')

const FAKE: Viewing = { hospitalId: '00000000-0000-4000-8000-00000000000a', name: '가짜정형외과의원' }

// 훅 값을 글자로 그려 보는 부품
function Probe() {
  const viewing = useViewing()
  const readOnly = useReadOnly()
  return (
    <p data-testid="probe">
      {viewing === null ? 'null' : `${viewing.hospitalId}|${viewing.name}`}/{String(readOnly)}
    </p>
  )
}
// 한 시험 안에서 여러 번 그려도 섞이지 않게 그린 뒤 바로 치운다
const probe = (tree: ReactNode) => {
  const text = within(render(<>{tree}</>).container).getByTestId('probe').textContent
  cleanup()
  return text
}

afterEach(() => cleanup())

describe('AC-8007.1 ViewingProvider · useViewing · useReadOnly', () => {
  it('AC-8007.1: ViewingProvider viewing={{ hospitalId, name }} 안에서는 useViewing()이 그 값, useReadOnly()가 참이다', () => {
    expect(
      probe(
        <ViewingProvider viewing={FAKE}>
          <Probe />
        </ViewingProvider>,
      ),
    ).toBe(`${FAKE.hospitalId}|${FAKE.name}/true`)
  })

  it('AC-8007.1: 받은 viewing을 그대로 준다(같은 객체)', () => {
    let seen: Viewing | null = null
    function Grab() {
      seen = useViewing()
      return null
    }
    render(
      <ViewingProvider viewing={FAKE}>
        <Grab />
      </ViewingProvider>,
    )
    expect(seen).toBe(FAKE)
  })

  it('AC-8007.1: Provider 바깥이면 null·거짓이다', () => {
    expect(probe(<Probe />)).toBe('null/false')
  })

  it('AC-8007.1: viewing={null}이면 null·거짓이다', () => {
    expect(
      probe(
        <ViewingProvider viewing={null}>
          <Probe />
        </ViewingProvider>,
      ),
    ).toBe('null/false')
  })

  it('AC-8007.1: 보는 중 안에 viewing={null}을 다시 두면(관리자 화면) 그 안은 null·거짓이다', () => {
    expect(
      probe(
        <ViewingProvider viewing={FAKE}>
          <ViewingProvider viewing={null}>
            <Probe />
          </ViewingProvider>
        </ViewingProvider>,
      ),
    ).toBe('null/false')
  })

  it('AC-8007.1: ReadOnlyArea 안에서는 useViewing()은 그대로(null)이고 useReadOnly()만 참이다', () => {
    expect(
      probe(
        <ReadOnlyArea>
          <Probe />
        </ReadOnlyArea>,
      ),
    ).toBe('null/true')
    expect(
      probe(
        <ViewingProvider viewing={null}>
          <ReadOnlyArea>
            <Probe />
          </ReadOnlyArea>
        </ViewingProvider>,
      ),
    ).toBe('null/true')
  })

  it('AC-8007.1: 보는 중 안의 ReadOnlyArea에서도 useViewing()은 그 값 그대로, useReadOnly()는 참이다', () => {
    expect(
      probe(
        <ViewingProvider viewing={FAKE}>
          <ReadOnlyArea>
            <Probe />
          </ReadOnlyArea>
        </ViewingProvider>,
      ),
    ).toBe(`${FAKE.hospitalId}|${FAKE.name}/true`)
  })

  it('AC-8007.1: ReadOnlyArea 안에 viewing={null}을 두어도 읽기만은 그대로 참이다', () => {
    expect(
      probe(
        <ReadOnlyArea>
          <ViewingProvider viewing={null}>
            <Probe />
          </ViewingProvider>
        </ReadOnlyArea>,
      ),
    ).toBe('null/true')
  })

  it('AC-8007.1: ViewingProvider·ReadOnlyArea는 감싸는 요소를 더하지 않는다(children 그대로)', () => {
    const bare = render(<p className="a">본문</p>).container.innerHTML
    cleanup()
    const inViewing = render(
      <ViewingProvider viewing={FAKE}>
        <p className="a">본문</p>
      </ViewingProvider>,
    ).container.innerHTML
    cleanup()
    const inArea = render(
      <ReadOnlyArea>
        <p className="a">본문</p>
      </ReadOnlyArea>,
    ).container.innerHTML
    expect(inViewing).toBe(bare)
    expect(inArea).toBe(bare)
  })
})

describe('AC-8007.2 WriteOnly — 읽기만이면 아무것도, 아니면 children 그대로', () => {
  const button = (
    <button type="button" className="btn">
      저장
    </button>
  )

  it('AC-8007.2: 읽기만이 아니면(Provider 없음·viewing={null}) children을 감싸는 요소 없이 그대로 그린다', () => {
    const bare = render(<div data-testid="box">{button}</div>).getByTestId('box').innerHTML
    cleanup()
    const outside = render(
      <div data-testid="box">
        <WriteOnly>{button}</WriteOnly>
      </div>,
    ).getByTestId('box').innerHTML
    cleanup()
    const nullViewing = render(
      <ViewingProvider viewing={null}>
        <div data-testid="box">
          <WriteOnly>{button}</WriteOnly>
        </div>
      </ViewingProvider>,
    ).getByTestId('box').innerHTML
    expect(bare).toBe('<button type="button" class="btn">저장</button>')
    expect(outside).toBe(bare)
    expect(nullViewing).toBe(bare)
  })

  it('AC-8007.2: 여러 children·글자도 그대로다', () => {
    const { container } = render(
      <WriteOnly>
        {button}
        글자
        <span>둘</span>
      </WriteOnly>,
    )
    expect(container.innerHTML).toBe('<button type="button" class="btn">저장</button>글자<span>둘</span>')
  })

  it('AC-8007.2: 보는 중(ViewingProvider viewing 있음)이면 아무것도 그리지 않는다', () => {
    const { getByTestId } = render(
      <ViewingProvider viewing={FAKE}>
        <div data-testid="box">
          <WriteOnly>{button}</WriteOnly>
        </div>
      </ViewingProvider>,
    )
    expect(getByTestId('box').innerHTML).toBe('')
  })

  it('AC-8007.2: ReadOnlyArea 안이면 아무것도 그리지 않는다', () => {
    const { getByTestId } = render(
      <ReadOnlyArea>
        <div data-testid="box">
          <WriteOnly>{button}</WriteOnly>
        </div>
      </ReadOnlyArea>,
    )
    expect(getByTestId('box').innerHTML).toBe('')
  })

  it('AC-8007.2: 보는 중 안의 관리자 화면(viewing={null})에서는 다시 그린다', () => {
    const { getByTestId } = render(
      <ViewingProvider viewing={FAKE}>
        <ViewingProvider viewing={null}>
          <div data-testid="box">
            <WriteOnly>{button}</WriteOnly>
          </div>
        </ViewingProvider>
      </ViewingProvider>,
    )
    expect(getByTestId('box').innerHTML).toBe('<button type="button" class="btn">저장</button>')
  })
})

describe('AC-8007.1·AC-8007.2 viewing.tsx 소스 — React 문맥뿐(환자 줄 구역에서도 import)', () => {
  it('AC-8007.1·AC-8007.2: 첫 줄이 use client이고 import는 react 하나뿐이다', () => {
    expect(SRC.split('\n')[0]).toBe("'use client'")
    const froms = [...SRC.matchAll(/^import\b[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1])
    expect(froms).toEqual(['react'])
    expect(SRC).not.toMatch(/\bimport\s*\(/)
    expect(SRC).not.toMatch(/\brequire\s*\(/)
  })

  it('AC-8007.1·AC-8007.2: 네트워크·브라우저 저장소·쿠키·console·window를 쓰지 않는다', () => {
    const code = SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const word of [
      'fetch',
      'XMLHttpRequest',
      'WebSocket',
      'EventSource',
      'sendBeacon',
      'localStorage',
      'sessionStorage',
      'indexedDB',
      'cookie',
      'console',
      'window',
      'document',
      'navigator',
      'location',
      'supabase',
    ]) {
      expect(code, word).not.toContain(word)
    }
  })

  it('AC-8007.1·AC-8007.2: 내보내는 것은 design.md의 여섯(Viewing·ViewingProvider·ReadOnlyArea·useViewing·useReadOnly·WriteOnly)뿐이다', () => {
    const names = [...SRC.matchAll(/^export\s+(?:type|const|function)\s+(\w+)/gm)].map((m) => m[1]).sort()
    expect(names).toEqual(['ReadOnlyArea', 'Viewing', 'ViewingProvider', 'WriteOnly', 'useReadOnly', 'useViewing'].sort())
  })
})
