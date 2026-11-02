import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyApiKey, runAiKey, type AiKeyDeps } from './aiKey'

const lines = (text: string) => text.split(/\r?\n/)
const ENV = ['# 주석', 'NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co', "ANTHROPIC_API_KEY='old'", 'OTHER=1', ''].join('\n')

function fake(answers: Array<string | null>, over: Partial<AiKeyDeps> = {}) {
  const printed: string[] = []
  const written: string[] = []
  let asked = 0
  const deps: AiKeyDeps = {
    isTerminal: true,
    ask: async () => {
      asked++
      return answers.shift() ?? null
    },
    read: () => ENV,
    write: (text) => void written.push(text),
    print: (line) => void printed.push(line),
    ...over,
  }
  return { deps, printed, written, asked: () => asked }
}

describe('AC-515.1 applyApiKey는 ANTHROPIC_API_KEY 줄만 바꾼다', () => {
  it('AC-515.1 기존 줄만 새 값, 나머지 줄은 그대로', () => {
    const r = applyApiKey(ENV, 'sk-ant-fake-new')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const before = lines(ENV)
    const after = lines(r.text)
    expect(after).toHaveLength(before.length)
    after.forEach((line, i) => {
      if (i === 2) expect(line).toBe("ANTHROPIC_API_KEY='sk-ant-fake-new'")
      else expect(line).toBe(before[i])
    })
  })
  it('AC-515.1 이름이 없던 글자에는 줄이 더해진다', () => {
    const base = '# 주석\nA=1\n'
    const r = applyApiKey(base, 'sk-ant-fake-new')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(lines(r.text)).toEqual(['# 주석', 'A=1', "ANTHROPIC_API_KEY='sk-ant-fake-new'", ''])
  })
})

describe('AC-515.2 모양이 틀리면 쓰지 않는다', () => {
  it.each(['abc', 'sk-ant-x y', "sk-ant-x'"])('AC-515.2 %s 는 ok:false이고 이유에 값이 없다', (key) => {
    const r = applyApiKey(ENV, key)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).not.toContain(key)
    expect(r.reason).not.toContain('abc')
    expect(r.reason).not.toContain('sk-ant-x')
  })
})

describe('AC-515.2 runAiKey', () => {
  it('AC-515.2 sk-ant-로 시작하지 않으면 쓰지 않고 다시 묻는다', async () => {
    const f = fake(['abc', 'sk-ant-fake-1'])
    expect(await runAiKey(f.deps)).toBe(0)
    expect(f.written).toHaveLength(1)
    expect(f.written[0]).toContain("ANTHROPIC_API_KEY='sk-ant-fake-1'")
    expect(f.asked()).toBe(2)
    expect(f.printed.some((l) => l.includes('저장하지 않았어요') && l.includes('다시'))).toBe(true)
    expect(f.printed.some((l) => l.includes('npm run ai:try'))).toBe(true)
  })
  it('AC-515.2 찍힌 줄에 넣은 글자가 없다', async () => {
    const f = fake(['abc', 'sk-ant-fake-1'])
    await runAiKey(f.deps)
    for (const l of f.printed) {
      expect(l).not.toContain('abc')
      expect(l).not.toContain('sk-ant-fake-1')
    }
  })
  it('AC-515.2 터미널이 아니면 묻지도 쓰지도 않고 1', async () => {
    const f = fake(['sk-ant-fake-1'], { isTerminal: false })
    expect(await runAiKey(f.deps)).toBe(1)
    expect(f.asked()).toBe(0)
    expect(f.written).toHaveLength(0)
  })
  it('AC-515.2 Ctrl+C(null)면 쓰지 않고 130', async () => {
    const f = fake([null])
    expect(await runAiKey(f.deps)).toBe(130)
    expect(f.written).toHaveLength(0)
  })
  it('AC-515.2 빈 입력은 그대로 두고 0', async () => {
    const f = fake([''])
    expect(await runAiKey(f.deps)).toBe(0)
    expect(f.written).toHaveLength(0)
  })
  it('AC-515.2 .env.local이 없어도(null) 새로 만든다', async () => {
    const f = fake(['sk-ant-fake-2'], { read: () => null })
    expect(await runAiKey(f.deps)).toBe(0)
    expect(lines(f.written[0])).toEqual(["ANTHROPIC_API_KEY='sk-ant-fake-2'", ''])
  })
})

describe('AC-515.2 ai-key.ts 이어 붙이기', () => {
  const src = lines(readFileSync(join(__dirname, 'ai-key.ts'), 'utf8'))
  it('AC-515.2 hiddenKeys와 writePrivateFile을 envFile에서 가져다 쓴다', () => {
    const imp = src.find((l) => l.startsWith('import') && l.includes('e2e/lib/envFile')) ?? ''
    expect(imp).toContain('hiddenKeys')
    expect(imp).toContain('writePrivateFile')
    expect(src.some((l) => l.includes('writePrivateFile(ENV_FILE'))).toBe(true)
  })
})
