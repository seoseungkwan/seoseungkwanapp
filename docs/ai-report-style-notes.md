# Style notes: "그래프 보고서 목업" (artifact DYcLGZSHKfZkPn42eZg2UK)

Source: published files `project/*.dc.html` + `project/canvas.json`, version 1793247943-1e23, saved under
`/tmp/claude-1000/-home-developer/c846313c-65d3-4865-af09-ac6a567ca034/scratchpad/report-style/project/`.
Read-only research. artifact-type/ files skipped.

Big picture: **two themes share one system.** Screen boards are a dark "night console" theme
(bg #0A0E17, violet accent #A78BFA). Print boards are the light A4 translation of the same layout
(bg #FFFFFF, violet accent #5B4BC4). Same fonts, same section order, same color *roles*, darker
values for print. No shadows anywhere; separation is done with 1px borders and surface steps.

Canvas note (title1): "D3-1 그래프 보고서 v2 · 치료 묶음(병원 공통) · 30일 = 첫 내원 당일 포함 (숫자는 모두 가짜)".

---

## 1. Artboards

| # | File | Size (px) | Theme | Purpose |
|---|------|-----------|-------|---------|
| ① | Main.dc.html | 1280 × 3400 (fill, interactive) | dark | "처방 소모 추이 보고서 (화면) v2" — prescription volume/amount trend report, current vs same period last year |
| ② | Cohort.dc.html | 1280 × 3200 (fill, interactive) | dark | "신환·재방문·치료 현황 (화면) v2" — new patients, 30-day revisit, treatment-group repeat rate |
| ③ | Print.dc.html | 794 × 1123 | light | "인쇄 / PDF · 처방 추이 (A4 첫 장)" — first A4 page of report ① |
| ③-2 | PrintCohort.dc.html | 794 × 1123 | light | "인쇄 / PDF · 신환 (요약만, A4)" — A4 summary of report ② |
| ④ | Groups.dc.html | 1280 × 1400 (fill, interactive) | dark | "치료 묶음 편집 (통계 창) v2" — app settings UI (edit treatment groups). Not report content |
| ⑤ | DashPick.dc.html | 1280 × 1000 (fill, interactive) | dark | "대시보드에서 묶음 고르기" — app UI (pick groups/codes for dashboard, max 6). Not report content |

794 × 1123 px = A4 (210 × 297 mm) at 96 dpi. Screen content column: `max-width: 1200px`, side padding 24px.

---

## 2. Color palette

Counts = occurrences across the 4 screen files (Main, Cohort, Groups, DashPick) or 2 print files.

### 2a. Screen (dark) — neutrals
| Hex | Count | Role |
|-----|------:|------|
| #0A0E17 | 17 | page background; also dark text on bright tag pills / checkmarks |
| #111725 | 29 | card surface (all cards, table wrappers) |
| #0D121D | 8 | inner surface: insight rows, unselected chips, list boxes |
| #0B0F1A | 10 | segmented-control track, input background, proportion-bar track |
| #232B3D | 36 | **default card border** (1px), table head bottom border |
| #2E3850 | 19 | control border (chips, inputs, tabs); chart baseline; "재진" part of proportion bar |
| #1E2536 | 12 | section-heading divider (border-bottom under h2); chart top/mid gridlines |
| #1A2131 | 5 | table row divider |
| #F3F4F8 | 19 | primary text; chart end-value label |
| #E6E9F0 | 2 | insight sentence text |
| #C9CEDA | 22 | secondary text: table names, comparison line, legend text |
| #9AA3B5 | 80 | **muted text** (most used color): subtitles, labels, units, table heads, axis labels, footnotes |
| #7C859A | 2 | input placeholder |
| #4B5568 | 7 | breadcrumb "›", unchecked checkbox border |
| #3B4560 | 3 | comparison-period bar fill; disabled button |
| #8B93A7 | 2 | comparison-period dashed line + legend swatch |

### 2b. Screen — accent (violet family)
| Hex | Count | Role |
|-----|------:|------|
| #A78BFA | 33 | **primary accent**: card eyebrow labels (COUNT, NOW…), current-period line/bars, links, checked box, breadcrumb hospital name |
| #C4B5FD | 21 | light violet: prescription-code text in tables (tbody th), eyebrow pill text, link hover, group series 1 |
| #6D5BD0 | 12 | primary button bg ("인쇄 / PDF 저장"), selected pill/chip border |
| #1E2242 | 8 | selected pill/chip/tab background |
| #4C3F8F | 10 | eyebrow pill border, dashed logo border, secondary button border |
| #16142E | 5 | eyebrow pill + logo placeholder background |
| #12142A / #E9E5FF | 3 / 3 | secondary button bg / text ("전체 선택") |
| gradient #A78BFA → #60A5FA | 2 | `.grad` text gradient on the last words of the H1 only |

### 2c. Screen — semantic
| Hex | Count | Role |
|-----|------:|------|
| #60A5FA | 12 | **increase / up delta** (+11.5%), "가장 많이 늘었음" tag |
| #F59E0B | 13 | **decrease / down delta** (−9.0%) AND **신환 (new patients) numbers**, 신환율 line, "엇갈림"/"살펴보기" tags, warnings text. (Double role — see caveat) |
| #2DD4BF | 10 | **good ratio / retention**: 신환 비율, 30일 재방문율, 2회+ 비율, "좋아짐" tag |
| #F6D55C | 9 | **provisional (잠정) / watching**: WATCHING KPI, "09월 잠정" axis label, "최고 달"/"잠정" tags, "관찰 중" pill |
| #1A1810 | 5 | provisional band/row background (chart shaded column, table row) |
| #12302C / #5EEAD4 | 2 / 2 | "관찰 끝" (done) status pill bg / text; migrated-notice box |
| #C9CEDA | — | neutral series ("1일만 내원" line) |
| #9AA3B5 | — | neutral tag ("단위") |
| Danger (Groups only): #DC2626 btn, #FCA5A5 text, #FECACA msg, #2A1414 bg, #5A2A2A border | | delete/reset confirmations |
| Warning box (Groups): #1A1810 bg, #4A3F17 border, #F3E7B6 text, #F6D55C "확인" tag | | |

Up = blue, down = amber (not green/red) — color-blind friendly, and never implies "bad" in red.

### 2d. Screen — categorical series
- Treatment groups (Cohort/Groups, ordered): **#C4B5FD** 체외충격파, **#3B82F6** 도수, **#FBBF24** Block, **#DB2777** 견인, then #2DD4BF, #A3E635, #F97316, #E5E7EB.
- Dashboard selection slots (DashPick, ordered): #60A5FA, #F59E0B, #2DD4BF, #C084FC, #F472B6, #A3E635 (max 6).
- Two-series compare (Main): current #A78BFA solid vs comparison #8B93A7 dashed (line) / #3B4560 (bar).

### 2e. Print (light) — 15 colors total
| Hex | Count | Role | Screen equivalent |
|-----|------:|------|-------------------|
| #FFFFFF | 4 | page bg | #0A0E17 |
| #111827 | 10 | primary text; **2px header rule**; table cell text | #F3F4F8 |
| #374151 | 6 | secondary: meta date block, KPI comparison line, legend | #C9CEDA |
| #4B5563 | 23 | **muted labels** (most used): KPI labels, table heads, axis labels, footer | #9AA3B5 |
| #6B7280 | 5 | tertiary: "생성" timestamp, sub-codes | — |
| #9CA3AF | 7 | table head bottom border, chart baseline, comparison dashed line, dashed logo border | #8B93A7 / #2E3850 |
| #D5D9E2 | 10 | card border, footer top rule | #232B3D |
| #E3E6EC | 4 | table row divider, chart gridlines | #1A2131 / #1E2536 |
| #5B4BC4 | 7 | accent: eyebrow, current line, legend swatch, links | #A78BFA |
| #3F3394 | 3 | prescription-code column text, link hover | #C4B5FD |
| #1D4ED8 | 7 | increase delta | #60A5FA |
| #B45309 | 2 | decrease delta; 신환 합계 KPI value | #F59E0B |
| #0F766E | 4 | 신환 비율, 30일 재방문율 | #2DD4BF |
| #A16207 | 3 | provisional text ("잠정 · 64명", 09월 잠정 header, 관찰 중 신환 KPI) | #F6D55C |
| #FEF9C3 | 5 | provisional row / cell background | #1A1810 |

---

## 3. Typography

- **Fonts** (Google Fonts): `Noto Sans KR` 400/500/700/900 for all Korean text and big KPI numbers;
  `JetBrains Mono` 500/700 for every "data" string: dates, codes, table numbers, axis labels, legends,
  eyebrow labels, comparison lines, page number. Fallback `system-ui, sans-serif` / `monospace`.
- **Weights in use**: 900 (all headings and big numbers), 700 (labels, buttons, emphasised deltas, codes), 500 (table heads on screen, inline sub-captions). 400 body.
- **tabular-nums: not used anywhere.** Column alignment comes from using JetBrains Mono for numbers + `text-align: right` + `white-space: nowrap`. Big KPI numbers (Noto Sans KR 900) are proportional.
- **Letter-spacing**: H1 −1px (screen) / −0.5px (print); mono eyebrow pill +4px (screen) / +3px (print); card eyebrow labels +2px; table heads +1px (screen).
- **Line-height**: H1 1.15; chart headline 1.4; insight text 1.6; print bullets 1.7; footnotes 1.8. Default elsewhere.

### Size scale
| Role | Screen (px) | Print (px) |
|------|-------------|------------|
| H1 report title | 44 / 900 | 28 / 900 (26 in cohort) |
| Eyebrow pill ("RX · TREND REPORT") | mono 14 / 700, ls 4px | mono 11 / 700, ls 3px, no pill, accent color |
| Subtitle / scope line | 18, muted | 12, muted |
| Section H2 | 26 / 900 + 1px divider below | 15 / 900 (14 in cohort), no divider |
| Card H2 ("한눈에") / chart headline H3 | 20 / 900 | 15 / 900 (chart headline is the H2) |
| KPI big number | 34 / 900 (unit 16 / 700 muted) | 22 / 900 (20 cohort), unit 12 muted |
| Secondary KPI number | 22–24 / 900 | 17 / 900 |
| KPI eyebrow / label | mono 12–13 / 700, ls 2px, accent | 11 / 700 (10.5 cohort), muted |
| KPI comparison line | mono 13 | mono 11 |
| Body / insight sentence | 15, lh 1.6 | 12, lh 1.7 |
| Buttons / chips | 14–15 / 700 | n/a |
| Table body | mono 14 (13 in chart month table) | mono 12 |
| Table head | mono 12 / 500, ls 1px, muted | mono 10.5 / 700, muted |
| Caption under charts/tables | 12, muted | — |
| Footnotes (계산 기준) | 13, lh 1.8, muted | 10 (footer) |
| Meta line (생성…) | mono 12, muted | mono 11 right-aligned block |
| Chart axis labels | mono 12 | mono 10 |
| Chart end-value label | mono 14 / 700 | mono 10 / 700 |
| Tag pill | 12 / 700 | — |

---

## 4. Shape, borders, spacing

- **Radii (screen)**: cards 18px; period cards & dashed empty states 14px; insight rows 12px; logo 12px; pills/buttons/tags/segmented controls/chips 999px; checkbox 5–6px; bar rx 4; legend swatch 2px.
- **Radii (print)**: 10px for everything (cards, logo).
- **Borders**: always 1px solid. Screen cards `1px solid #232B3D` (33×), controls `#2E3850`, section divider `border-bottom: 1px solid #1E2536` under every H2 row. Logo placeholder and empty states use 1px **dashed** (#4C3F8F screen / #9CA3AF print). Print header rule `border-bottom: 2px solid #111827` (only 2px line in the system). Print footer `border-top: 1px solid #D5D9E2`.
- **Shadows**: none. No `box-shadow` in any file.
- **Spacing rhythm**: even numbers on a ~2/4px step: 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32.
  - Screen: header padding 32/24/8; main padding 24; **gap between sections 28**; inside a section 16; card padding 20–22 (table cards 8px 18px); gap between cards 14 (12 for period cards); insight list gap 12; chip gap 8.
  - Print: page padding 48px (top/bottom) × 52px (sides); column gap 18 (16 cohort); KPI grid gap 10 (8 cohort); KPI card padding 12×14 (10×12); chart card padding 14×16; table cell padding 7px 6px; section heading→table gap 6.
- **Layout**: screen cards use flex-wrap with `flex: 1 1 240–300px` (responsive rows of 3–4). Print uses `grid-template-columns: repeat(3|4, minmax(0,1fr))`. Tables wrapped in `overflow-x: auto` with min-width 560–900px.

---

## 5. Charts (hand-written inline SVG)

- **Types**: line (default) and grouped bar (toggle "꺾은선 / 막대") on ①; multi-series line on ② (tabs: 신환율 / 30일 재방문율 / 치료별 신환 / 1일만 내원); a 10px stacked proportion bar (신환 vs 재진) per code card. Print ③ has one line chart; print ③-2 has **no chart** (tables only).
- **Canvas**: screen viewBox 1000×280, plot x 60→960, y 20→240, x-labels at y 266. Print viewBox 680×190, plot x 40→680, y 10→180, x-labels as an HTML grid under the SVG.
- **Gridlines**: exactly 3 horizontal lines — top solid (#1E2536 / #E3E6EC), middle **dashed** ("6 6" screen, "4 4" print) same color, baseline stronger (#2E3850 / #9CA3AF). No vertical gridlines, no axis lines.
- **Y-axis**: only 3 labels (top, half, 0), mono, right-aligned 8px left of plot. Top = rounded up from max × 1.15 to a 1-significant-digit step; amount in "만". Units appended for % charts ("20%", "10%").
- **X-axis**: month labels "04월"…"09월", mono, centered on bands. Provisional month gets " 잠정" and gold color.
- **Series styling**: current = solid accent, stroke 3.5 (screen) / 2.5 (print); comparison = dashed grey, stroke 2.5 "8 7" (screen) / 2 "6 5" (print). Bars: width 46, prev #3B4560 left, current #A78BFA right, rx 4. Line ends with a dot (r 6 / 5 / 4).
- **Annotation**: only the **last point** is labelled (value above the dot, mono bold). In multi-series charts, **direct labels at line ends** ("체외충격파 96명", series color, 13/700, 16px collision offset) instead of a legend.
- **Legend**: only for current-vs-compare: a row above the chart, short line swatch (22×4 solid / 22 dashed) + mono text "현재 2026.04~09" / "비교 2025.04~09".
- **Headline**: every chart has a sentence headline above it that states the takeaway with numbers, e.g. "선택 처방 건수 2,761건 · 작년 같은 기간 2,476건보다 11.5% ↑".
- **Provisional data**: shaded column (#1A1810) behind the last month + caption "금색 칸 = 30일 관찰이 끝나지 않은 달(잠정)".
- **Data table under chart** (screen ①): rows 현재 / 비교 / 증감률 by month, deltas colored up/down.
- Accessibility: `<svg role="img" aria-label="{headline}">`; decorative swatches `aria-hidden`.

---

## 6. Page structure

### ① Main screen report (order)
1. Top bar: dashed LOGO placeholder (44px) + breadcrumb "[병원 이름] › 통계 · 그래프 보고서"; right: segmented "요약만 | 전부" (print scope) + primary pill "인쇄 / PDF 저장".
2. Eyebrow pill `RX · TREND REPORT`.
3. H1 "처방 소모 **추이 보고서**" (gradient on last words).
4. Scope line: "등록 처방코드 3개 · 외래·입원 전체 · 월별 (달력 기준)".
5. Two period cards: `NOW · 현재 기간` 2026-04-01 ~ 2026-09-30 (183일) | `VS · 비교 기간 (작년 같은 기간)`.
6. Meta line (mono 12): "생성 2026-10-22 19:44 · 비트는 읽기만 했습니다 · 환자 이름·차트번호 없음".
7. **한눈에** card: 4 insight rows, each = colored tag pill + one sentence.
8. **KPI row**: 3 cards `COUNT · 처방 건수`, `QTY · 소모량`, `AMOUNT · 처방 금액` → big number + unit → "비교 2,476 · +285 · +11.5%".
9. **기간별 추이** (H2 + divider + metric/shape toggles) → card: RX code chips → chart headline → legend → chart → month table.
10. **처방별 비교** (H2 + right-aligned formula note "증감률 = 현재 ÷ 비교 − 1 · 비교가 0이면 '신규'") → table: 처방코드 | 처방명 | 건수 | 증감률 | 소모량 | 금액 (원) | 금액 증감률.
11. **처방별 신환·재진** (H2 + inline muted sub-caption) → one card per code: 신환 / 재진 / 신환 비율 + "비교 n" + proportion bar.
12. **상세 표** → tabs 월별 상세 / 처방 등락 / 구성비 / 요일 평균 + metric toggle → table → caption "표는 위 RX에서 고른 처방 기준입니다."
13. **계산 기준** footnotes ("· " bullets): definitions, formulas, privacy line "이 보고서에는 환자 이름·차트번호가 없고 숫자만 있습니다."

### ② Cohort screen report
Same header (eyebrow `NEW · COHORT REPORT`, H1 "신환·재방문 **치료 현황**", cards `WATCH · 관찰 방식` / `AS OF · 기준일`) → 한눈에 (tags 좋아짐 / 가장 많음 / 살펴보기 / 잠정) → 4 KPI cards (`NEW` 1,185명, `30D` 58.9%, `ONCE` 32.8%, `WATCHING` 64명; each with a one-line label) → 월별 그래프 (tabs) → 월별 신환·기존 환자·재방문 table (status pill per row, provisional row tinted) → 신환의 치료별 현황 (SHOW chips; summary matrix or detail cards) → 계산 기준.

### ③ Print A4 — 처방 추이 (794×1123, padding 48/52, single column)
1. Header band: dashed LOGO 40px + [eyebrow mono "RX · TREND REPORT" / H1 28 / meta "[병원 이름] · 등록 처방코드 3개 · 외래·입원 전체 · 월별"]; right-aligned mono block "현재 …", "비교 …", "생성 …"; closed by **2px #111827 rule**.
2. 2 summary bullets ("· …"), no heading.
3. KPI grid ×3 (처방 건수 / 소모량 / 처방 금액), bordered 10px cards.
4. Chart card: H2 = headline sentence, legend, line chart, month labels.
5. 처방별 비교 table.
6. 처방별 신환·재진 table (+ inline sub-caption "외래 환자 수 · 중복 없이").
7. Footer pinned to bottom (`margin-top: auto`, 1px top rule, 10px): left "숫자만 담았습니다 · 환자 이름·차트번호 없음 · '전부'로 인쇄하면 다음 쪽에 상세 표(건수·소모량·금액)"; right mono "1 / 1 · 요약만".

### ③-2 Print A4 — 신환 (요약만)
Header (eyebrow `NEW · COHORT REPORT`, H1 26, meta with 30-day rule; right block 기준일 / 생성 / 인쇄 범위: 요약만) → **한눈에** H2 + 4 bullets → KPI grid ×4 (values colored by role) → 월별 신환·재방문 table (provisional row #FEF9C3, status text "관찰 끝" / "잠정 · 64명") → 치료 묶음별 30일 안 2회 이상 비율 table (09월 잠정 column tinted) → footer "1 / 1".

### Print mechanics
- Page = fixed 794×1123 px box (A4 @96dpi). Margins expressed as padding 48px ≈ 12.7 mm top/bottom, 52px ≈ 13.8 mm left/right.
- **No `@page`, no mm units, no `page-break-*` / `break-*` CSS, no `@media print`.** Multi-page behaviour exists only as copy: "요약만" = 1 page; "전부" appends detail tables (cohort: "그래프 4개와 묶음별 자세한 표") on following pages.
- Print drops all interactive controls, card radii shrink to 10px, sizes roughly ×0.6.

---

## 7. Writing tone

- **Insights / summary bullets**: one sentence each, friendly polite **해요체**, number first, then em dash, then meaning, sometimes an action hint.
- **Footnotes, captions, footers**: 개조식 "· " bullets ending in 합니다체 or noun phrases ("~더합니다", "~뺐습니다", "환자 이름·차트번호 없음").
- **Labels**: bilingual eyebrows (English mono code + Korean) — "COUNT · 처방 건수", "NOW · 현재 기간", "VS · 비교 기간 (작년 같은 기간)", "AS OF · 기준일". Short Korean tag words: 가장 많이 늘었음 / 엇갈림 / 최고 달 / 단위 / 좋아짐 / 가장 많음 / 살펴보기 / 잠정.
- **Uncertainty label**: "잠정" (provisional) is the only one; "예시" / "추정" do not appear. Base 0 → "신규".
- **Numbers & deltas**: ko-KR thousands separators; unit after a space (건, 명, 회, mL, 만원); percent with 1 decimal; signed "+11.5%" and real minus "−9.0%" (U+2212); absolute + rate "+285 · +11.5%"; percentage points "0.6%p"; arrows ↑ ↓ in headlines; comparison phrased "작년 같은 기간보다 … 늘었어요" or "비교 2,476". Print shortens money to "3,552만"; screen tables show full 원.
- Sample lines:
  - "ESWT10 처방 건수 1,184건 — 작년 같은 기간보다 18.2% 늘어 가장 많이 늘었어요."
  - "A15는 건수가 7.5% 늘었지만 금액은 9.0% 줄었어요. 단가가 낮아졌는지 확인해 보세요."
  - "09월 신환 64명은 아직 30일이 지나지 않아 재방문율이 잠정이에요."
  - "· 소모량은 단위가 같은 코드끼리만 더합니다."
  - "숫자만 담았습니다 · 환자 이름·차트번호 없음"
- **Personal data check**: none found. Hospital is the placeholder "[병원 이름]"; only prescription codes, aggregates and fake dates; canvas note says all numbers are fake. "비트" (the EMR being read) is a product name, not personal data.

---

## 8. 16:9 slide-friendly vs A4-only

Slide-friendly (lift as-is into a 16:9 deck, one block per slide):
- Title block: eyebrow pill + H1 (gradient words) + scope line + NOW/VS period cards + meta line → title slide.
- 한눈에 card (4 tagged insight rows) → "key findings" slide.
- KPI row (3–4 cards, big 34px numbers, eyebrow + comparison line) → KPI slide.
- Each chart block: headline sentence as slide title + legend + 1000×280 chart (≈3.6:1, fits 16:9 with room for headline/caption). Direct end-labels mean no legend needed for multi-series.
- Per-code cards with proportion bar (3-up row).
- Short tables (3–6 rows) such as 처방별 비교.

A4-only (do not reuse on slides):
- 794×1123 fixed page, 2px header rule, right-aligned mono date block, pinned footer with page number "1 / 1 · 요약만" and print-scope note.
- Dense 12px / 10.5px tables and 10px axis labels (too small for projection).
- 계산 기준 footnote block (better as speaker notes or an appendix slide).

Screen-only (drop for both print and slides): segmented toggles, RX chips, tabs, "인쇄 / PDF 저장" button, and boards ④ Groups / ⑤ DashPick (app settings UI, not report content).

## Caveats worth deciding before freezing the template
- #F59E0B (print #B45309) carries two meanings: "decrease" and "신환". A report that shows a falling 신환 count will be ambiguous.
- No tabular-nums on Noto Sans KR KPI numbers; if KPI numbers are stacked/compared, consider `font-variant-numeric: tabular-nums` or keep mono.
- Screen is dark-only; a light screen theme would need to be derived from the print palette.
- Print has no real page-break CSS; multi-page "전부" output is undefined in the mockup.
