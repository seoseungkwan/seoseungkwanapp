import { describe, expect, it } from 'vitest'
import { strToU8, zipSync, type Zippable } from 'fflate'
import { hwpxText, pdfText, planReading, sniffFile } from './attachText'

// 붙임 글자 꺼내기(specs/notices REQ-7408). HWPX·PDF는 시험이 여기서 만든다(진짜 사이트 파일을 쓰지 않는다)

const enc = (s: string) => new TextEncoder().encode(s)
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
const OLE = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0])

function para(inner: string): string {
  return `<hp:p id="0" paraPrIDRef="0" styleIDRef="0"><hp:run charPrIDRef="0">${inner}</hp:run><hp:linesegarray><hp:lineseg textpos="0" vertpos="0"/></hp:linesegarray></hp:p>`
}

function sectionXml(paras: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">' +
    paras.join('') +
    '</hs:sec>'
  )
}

/** 구역 XML들을 HWPX(zip)로 묶는다. order를 주면 그 차례로 zip에 넣는다(구역 번호 차례와 다르게) */
function hwpxFiles(sections: string[], extra: Zippable = {}, order?: number[]): Zippable {
  const files: Zippable = {
    mimetype: strToU8('application/hwp+zip'),
    'Contents/header.xml': strToU8('<hh:head><hh:t>머리 글</hh:t></hh:head>'),
    'Preview/PrvText.txt': strToU8('미리보기 글'),
  }
  for (const i of order ?? sections.map((_, n) => n)) files[`Contents/section${i}.xml`] = strToU8(sections[i])
  return { ...files, ...extra }
}

function makeHwpx(sections: string[], extra: Zippable = {}, order?: number[]): Uint8Array {
  return zipSync(hwpxFiles(sections, extra, order), { level: 1 })
}

const simpleHwpx = (text: string) => makeHwpx([sectionXml([para(`<hp:t>${text}</hp:t>`)])])

/** 쪽마다 글 한 줄(빈 글이면 글 없는 쪽)을 담은 PDF. pad는 머리 뒤 주석 줄 길이(파일 크기 맞추기용) */
function makePdf(pageTexts: string[], pad = 0): Uint8Array {
  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageTexts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ]
  pageTexts.forEach((t, i) => {
    const content = t ? `BT /F1 12 Tf 20 100 Td (${t}) Tj ET` : ''
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    )
    objs.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  if (pad > 0) out += `%${'A'.repeat(pad)}\n`
  const offsets: number[] = []
  objs.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return enc(out)
}

/** 크기가 꼭 size바이트인 PDF */
function pdfOfSize(pageTexts: string[], size: number): Uint8Array {
  let pad = 1
  let bytes = makePdf(pageTexts, pad)
  while (bytes.length !== size) {
    pad += size - bytes.length
    bytes = makePdf(pageTexts, pad)
  }
  return bytes
}

const pagesOf = (n: number, label: string) => Array.from({ length: n }, (_, i) => `${label} page ${i + 1}`)

async function textOf(bytes: Uint8Array): Promise<string> {
  const got = await pdfText(bytes)
  if (!got) throw new Error('시험 PDF를 읽지 못했다')
  return got.text
}

describe('sniffFile', () => {
  it('AC-7408.1: %PDF로 시작하면 pdf다', () => {
    expect(sniffFile(makePdf(['Hello']))).toBe('pdf')
    expect(sniffFile(enc('%PDF-1.7\n'))).toBe('pdf')
  })

  it('AC-7408.1: zip(PK)이고 Contents/section0.xml이 있으면 hwpx다', () => {
    expect(sniffFile(simpleHwpx('글'))).toBe('hwpx')
  })

  it('AC-7408.1: zip이어도 Contents/section0.xml이 없으면 other다(docx·section1만 있는 zip)', () => {
    expect(sniffFile(zipSync({ 'word/document.xml': strToU8('<w:t>글</w:t>') }))).toBe('other')
    expect(sniffFile(zipSync({ 'Contents/section1.xml': strToU8(sectionXml([])) }))).toBe('other')
  })

  it('AC-7408.1: OLE 머리(D0 CF 11 E0)면 hwp다', () => {
    expect(sniffFile(OLE)).toBe('hwp')
  })

  it('AC-7408.1: 그 밖(빈 바이트·HTML·깨진 zip·짧은 머리)은 던지지 않고 other다', () => {
    expect(sniffFile(new Uint8Array(0))).toBe('other')
    expect(sniffFile(enc('<html><body>오류</body></html>'))).toBe('other')
    expect(sniffFile(enc('PK\u0003\u0004 깨진 zip'))).toBe('other')
    expect(sniffFile(enc('%PD'))).toBe('other')
    expect(sniffFile(new Uint8Array([0xd0, 0xcf, 0x11]))).toBe('other')
  })
})

describe('hwpxText', () => {
  it('AC-7408.2: <hp:t> 글자만 문단(</hp:p>)마다 줄을 바꿔 돌려준다(실체 풂·빈 문단 뺌·표 안 문단도 한 줄씩)', () => {
    const xml = sectionXml([
      para('<hp:t>첫 </hp:t></hp:run><hp:run charPrIDRef="1"><hp:t>문단 &amp; &lt;별표&gt;</hp:t>'),
      para('<hp:t/>'),
      para('<hp:t>가<hp:tab width="400"/>나</hp:t>'),
      para(
        '<hp:tbl><hp:tr><hp:tc><hp:subList>' +
          para('<hp:t>칸 하나</hp:t>') +
          '</hp:subList></hp:tc><hp:tc><hp:subList>' +
          para('<hp:t>칸 둘</hp:t>') +
          '</hp:subList></hp:tc></hp:tr></hp:tbl>',
      ),
      para('<hp:t>앞&#1;뒤</hp:t>'),
    ])
    expect(hwpxText(makeHwpx([xml]))).toBe('첫 문단 & <별표>\n가 나\n칸 하나\n칸 둘\n앞뒤')
  })

  it('AC-7408.2: section 번호 차례로 읽는다(zip 안 차례·글자 차례와 상관없이 0, 1, 2, …, 10)', () => {
    const sections = Array.from({ length: 11 }, (_, i) => sectionXml([para(`<hp:t>구역 ${i}</hp:t>`)]))
    const order = [10, 3, 0, 7, 1, 9, 2, 8, 4, 6, 5]
    expect(hwpxText(makeHwpx(sections, {}, order))).toBe(sections.map((_, i) => `구역 ${i}`).join('\n'))
  })

  it('AC-7408.2: 머리·미리보기 등 구역 밖 글자는 담지 않는다', () => {
    const text = hwpxText(simpleHwpx('본문'))
    expect(text).toBe('본문')
  })

  it('AC-7408.2: 풀린 크기 합이 30,000,000바이트를 넘으면 null, 꼭 30,000,000이면 읽는다', { timeout: 60_000 }, () => {
    const sections = [sectionXml([para('<hp:t>큰 파일</hp:t>')])]
    const base = hwpxFiles(sections)
    const used = Object.values(base).reduce((sum, v) => sum + (v as Uint8Array).length, 0)
    const at = zipSync({ ...base, 'BinData/image1.bmp': new Uint8Array(30_000_000 - used) }, { level: 1 })
    expect(hwpxText(at)).toBe('큰 파일')
    const over = zipSync({ ...base, 'BinData/image1.bmp': new Uint8Array(30_000_001 - used) }, { level: 1 })
    expect(hwpxText(over)).toBeNull()
  })

  it('AC-7408.2: 항목이 500개를 넘으면 null, 꼭 500개면 읽는다', () => {
    const sections = [sectionXml([para('<hp:t>항목 많음</hp:t>')])]
    const base = hwpxFiles(sections)
    const fill = (n: number): Zippable =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`BinData/b${i}.bin`, new Uint8Array([i % 256])]))
    const baseCount = Object.keys(base).length
    expect(hwpxText(makeHwpx(sections, fill(500 - baseCount)))).toBe('항목 많음')
    expect(hwpxText(makeHwpx(sections, fill(501 - baseCount)))).toBeNull()
  })

  it('AC-7408.2: zip이 아니거나 구역이 없으면 null이다', () => {
    expect(hwpxText(enc('not a zip'))).toBeNull()
    expect(hwpxText(zipSync({ 'word/document.xml': strToU8('<w:t>글</w:t>') }))).toBeNull()
  })
})

describe('pdfText', () => {
  it('AC-7408.3: 시험 PDF → { text, pages }(쪽 차례대로 글자)', async () => {
    const got = await pdfText(makePdf(['Hello page one', 'Page two text']))
    expect(got).not.toBeNull()
    expect(got?.pages).toBe(2)
    const text = got?.text ?? ''
    expect(text).toContain('Hello page one')
    expect(text).toContain('Page two text')
    expect(text.indexOf('Hello page one')).toBeLessThan(text.indexOf('Page two text'))
  })

  it('AC-7408.3: 글 없는 쪽(스캔 문서 꼴)은 글자 빈칸에 쪽 수만 센다', async () => {
    const got = await pdfText(makePdf(['', '']))
    expect(got).toEqual({ text: '', pages: 2 })
  })

  it('AC-7408.3: 깨진 PDF·PDF가 아닌 바이트·빈 바이트는 null이다(던지지 않는다)', async () => {
    expect(await pdfText(enc('%PDF-1.4\n%garbage only\n'))).toBeNull()
    expect(await pdfText(enc('<html>not pdf</html>'))).toBeNull()
    expect(await pdfText(new Uint8Array(0))).toBeNull()
  })

  it('AC-7408.3: 받은 바이트를 떼어 가지 않는다(읽은 뒤에도 그대로)', async () => {
    const bytes = makePdf(['Keep me'])
    const before = b64(bytes)
    await pdfText(bytes)
    expect(b64(bytes)).toBe(before)
  })
})

describe('planReading', () => {
  it('AC-7408.4: PDF 먼저·그다음 HWPX, HWP·other는 건너뛰고 PDF는 파일째(full), HWPX는 글자로, attachText는 이름을 단 글자', async () => {
    const gosi = makePdf(['Gosi body text'])
    const table = makePdf(['Table text', 'Second page'])
    const files = [
      { name: '옛 고시.hwp', bytes: OLE },
      { name: '안내.hwpx', bytes: simpleHwpx('한글 붙임 글') },
      { name: '그림.png', bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]) },
      { name: '고시.pdf', bytes: gosi },
      { name: '별표.pdf', bytes: table },
    ]
    const before = files.map((f) => b64(f.bytes))
    const got = await planReading(files)
    expect(got.mode).toBe('full')
    expect(got.pdfs).toEqual([
      { name: '고시.pdf', base64: b64(gosi) },
      { name: '별표.pdf', base64: b64(table) },
    ])
    expect(got.texts).toEqual([{ name: '안내.hwpx', text: '한글 붙임 글' }])
    expect(got.attachText).toBe(
      `[고시.pdf]\n${await textOf(gosi)}\n\n[별표.pdf]\n${await textOf(table)}\n\n[안내.hwpx]\n한글 붙임 글`,
    )
    expect(files.map((f) => b64(f.bytes))).toEqual(before)
  })

  it('AC-7408.4: 3개까지만 고른다(PDF가 셋이면 HWPX는 빠짐). 깨진 PDF는 고르지 않고 다음 것을 본다', async () => {
    const p = [1, 2, 3, 4].map((n) => makePdf([`Pdf number ${n}`]))
    const got = await planReading([
      { name: 'h.hwpx', bytes: simpleHwpx('빠질 글') },
      { name: 'broken.pdf', bytes: enc('%PDF-1.4\n%garbage\n') },
      ...p.map((bytes, i) => ({ name: `p${i + 1}.pdf`, bytes })),
    ])
    expect(got.mode).toBe('full')
    expect(got.pdfs.map((f) => f.name)).toEqual(['p1.pdf', 'p2.pdf', 'p3.pdf'])
    expect(got.texts).toEqual([])
    expect(got.attachText).not.toContain('빠질 글')
    expect(got.attachText).not.toContain('Pdf number 4')
  })

  it('AC-7408.4: 고른 PDF 쪽 합이 30쪽이면 full, 31쪽이면 text(PDF는 보내지 않고 뽑은 글자만)', async () => {
    const a = makePdf(pagesOf(15, 'Alpha'))
    const b = makePdf(pagesOf(15, 'Beta'))
    const c = makePdf(pagesOf(16, 'Gamma'))
    const at = await planReading([
      { name: 'a.pdf', bytes: a },
      { name: 'b.pdf', bytes: b },
    ])
    expect(at.mode).toBe('full')
    expect(at.pdfs.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf'])

    const over = await planReading([
      { name: 'a.pdf', bytes: a },
      { name: 'c.pdf', bytes: c },
      { name: 'h.hwpx', bytes: simpleHwpx('한글 글') },
    ])
    expect(over.mode).toBe('text')
    expect(over.pdfs).toEqual([])
    expect(over.texts).toEqual([
      { name: 'a.pdf', text: await textOf(a) },
      { name: 'c.pdf', text: await textOf(c) },
      { name: 'h.hwpx', text: '한글 글' },
    ])
  })

  it('AC-7408.4: 고른 PDF 크기 합이 18,000,000바이트면 full, 18,000,001바이트면 text', { timeout: 60_000 }, async () => {
    const at = await planReading([{ name: 'big.pdf', bytes: pdfOfSize(['Big file'], 18_000_000) }])
    expect(at.mode).toBe('full')
    expect(at.pdfs).toHaveLength(1)
    const over = await planReading([
      { name: 'big.pdf', bytes: pdfOfSize(['Big file'], 9_000_000) },
      { name: 'big2.pdf', bytes: pdfOfSize(['Big file two'], 9_000_001) },
    ])
    expect(over.mode).toBe('text')
    expect(over.pdfs).toEqual([])
    expect(over.texts.map((t) => t.name)).toEqual(['big.pdf', 'big2.pdf'])
  })

  it('AC-7408.4: 보내는 글자는 합 60,000자까지, attachText는 이름을 단 글자 합 20,000자까지다', async () => {
    const long = '가'.repeat(70_000)
    const pdf = makePdf(pagesOf(31, 'Long'))
    const pdfTextValue = await textOf(pdf)
    const got = await planReading([
      { name: 'long.pdf', bytes: pdf },
      { name: 'long.hwpx', bytes: simpleHwpx(long) },
    ])
    expect(got.mode).toBe('text')
    expect(got.texts).toEqual([
      { name: 'long.pdf', text: pdfTextValue },
      { name: 'long.hwpx', text: long.slice(0, 60_000 - pdfTextValue.length) },
    ])
    expect(got.texts.reduce((sum, t) => sum + t.text.length, 0)).toBe(60_000)
    expect(got.attachText).toBe(`[long.pdf]\n${pdfTextValue}\n\n[long.hwpx]\n${long}`.slice(0, 20_000))

    const hwpxOnly = await planReading([{ name: 'only.hwpx', bytes: simpleHwpx(long) }])
    expect(hwpxOnly.mode).toBe('full')
    expect(hwpxOnly.pdfs).toEqual([])
    expect(hwpxOnly.texts).toEqual([{ name: 'only.hwpx', text: long.slice(0, 60_000) }])
    expect(hwpxOnly.attachText).toHaveLength(20_000)
  })

  it('AC-7408.4: 읽을 붙임이 없으면 body(빈 목록·HWP·other·깨진 PDF·깨진 zip뿐)', async () => {
    const body = { mode: 'body', pdfs: [], texts: [], attachText: '' }
    expect(await planReading([])).toEqual(body)
    expect(
      await planReading([
        { name: 'a.hwp', bytes: OLE },
        { name: 'b.zip', bytes: zipSync({ 'a.txt': strToU8('글') }) },
        { name: 'c.pdf', bytes: enc('%PDF-1.4\n%garbage\n') },
        { name: 'd.hwpx', bytes: enc('PK\u0003\u0004 깨짐') },
      ]),
    ).toEqual(body)
  })

  it('AC-7408.4: 글자로 보내야 하는데(text) 뽑은 글자가 하나도 없으면 body다. 파일째(full)는 글 없는 PDF도 보낸다', async () => {
    const scanned = makePdf(Array.from({ length: 31 }, () => ''))
    expect(await planReading([{ name: 'scan.pdf', bytes: scanned }])).toEqual({
      mode: 'body',
      pdfs: [],
      texts: [],
      attachText: '',
    })
    const small = makePdf(['', ''])
    expect(await planReading([{ name: 'scan.pdf', bytes: small }])).toEqual({
      mode: 'full',
      pdfs: [{ name: 'scan.pdf', base64: b64(small) }],
      texts: [],
      attachText: '',
    })
  })
})
