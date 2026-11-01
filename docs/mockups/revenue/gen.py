# 매출 탭 시안 만들기. 실행: python3 docs/mockups/revenue/gen.py  →  같은 폴더 index.html (파일 하나, 바깥 요청 없음)
# 앱 틀(위쪽 띠·탭 줄)·단추·칩·글꼴은 승인된 ui-90 시안(docs/mockups/ui-90/app/)의 CSS와 같은 모양을 그대로 쓴다.
# 그림 속 숫자는 모두 예시다(지어낸 숫자, 화면마다 "예시 숫자" 칩).
import html as H
from pathlib import Path

HERE = Path(__file__).resolve().parent
UI90 = HERE.parent / 'ui-90' / 'app'

ICONS = {
 'shield': '<path d="M8 1.75 3 3.6v3.9c0 3 2.1 5.5 5 6.75 2.9-1.25 5-3.75 5-6.75V3.6L8 1.75z"/><path d="m5.9 8 1.5 1.5 2.8-2.9"/>',
 'user': '<circle cx="8" cy="5.5" r="2.75"/><path d="M2.75 14c.6-2.5 2.7-3.9 5.25-3.9s4.65 1.4 5.25 3.9"/>',
 'chev': '<path d="m4.75 6.25 3.25 3.25 3.25-3.25"/>',
 'left': '<path d="m9.75 4.75-3.25 3.25 3.25 3.25"/>',
 'right': '<path d="m6.25 4.75 3.25 3.25-3.25 3.25"/>',
 'arrow': '<path d="M2.75 8h10.5M9.25 4l4 4-4 4"/>',
 'up': '<path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7"/>',
 'down': '<path d="M8 3.5v9M4.5 9 8 12.5 11.5 9"/>',
 'monitor': '<rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1"/><path d="M5.5 13.75h5M8 11.25v2.5"/>',
 'userCheck': '<circle cx="6.5" cy="5.25" r="2.5"/><path d="M1.75 13.5c.5-2.4 2.4-3.75 4.75-3.75 1.15 0 2.2.3 3.05.9"/><path d="m10 12 1.6 1.6 3-3.35"/>',
 'logout': '<path d="M9.5 2.75h2.75a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9.5"/><path d="M6.5 5 3.5 8l3 3M3.5 8h6.5"/>',
 'clock': '<circle cx="8" cy="8" r="6"/><path d="M8 4.75V8l2.25 1.5"/>',
}
def ic(n, s=16, cls=''):
    c = f'ic {cls}'.strip()
    return (f'<svg class="{c}" aria-hidden="true" width="{s}" height="{s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" '
            f'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{ICONS[n]}</svg>')
def logo(s=24):
    return (f'<svg class="logo" aria-hidden="true" width="{s}" height="{s}" viewBox="0 0 30 30"><rect x="3" y="3" width="24" height="24" rx="6" fill="none" stroke="#14C8BA" stroke-width="2.4"/>'
            '<path d="M13.5 8h3a1 1 0 0 1 1 1v3.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3.5H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3.5V9a1 1 0 0 1 1-1z" fill="#6D5DF5"/></svg>')
GO = ic('arrow', 16, 'ic-go')
CLINIC = '예시정형외과의원'
TABS = ['대시보드','통계','청구','고시·공지','환자','매출','AI 리포트','서식','직원','업무일지','재고','주소록','설정']
READY = {'대시보드','청구','설정','매출'}

# ---------- 앱 틀 (ui-90 시안과 같은 마크업) ----------
def acct_menu():
    return ('<div class="menu"><div class="menu-h"><span class="menu-n">manager@example.com</span><span class="menu-s">예시정형외과의원</span>'
            '<span class="chip chip-n menu-c">관리자 계정</span></div><div class="menu-l">'
            f'<a href="#" class="menu-i hl">{ic("userCheck")}가입 승인</a><button type="button" class="menu-i">{ic("logout")}로그아웃</button></div></div>')

def header(kind):
    if kind == 'ph':
        return (f'<header class="a-hdr"><div class="brand">{logo(24)}<span class="clinic">{CLINIC}</span></div>'
                f'<div class="acct-w"><button type="button" class="iconbtn" data-act="acct" aria-expanded="false" aria-label="manager@example.com">{ic("user")}</button>{acct_menu()}</div></header>')
    return (f'<header class="a-hdr"><div class="wa"><div class="brand">{logo(24)}<span class="clinic">{CLINIC}</span></div>'
            f'<div class="hdr-r"><span class="clock">2026년 11월 1일 (일) 07:12 (KST)</span><div class="acct-w">'
            f'<button type="button" class="acct" data-act="acct" aria-expanded="false">{ic("user")}manager@example.com{ic("chev")}</button>{acct_menu()}</div></div></div></header>')

def tab_links(cur):
    return ''.join(f'<a href="#" class="tab" data-tab="{t}"' + (' aria-current="page"' if t == cur else '') + f'>{t}</a>' for t in TABS)

def all_panel(cur):
    items = ''
    for t in TABS:
        c = ' aria-current="page"' if t == cur else ''
        mark = '' if t in READY else '<span class="chip chip-n">준비 중</span>'
        items += f'<li><a href="#" class="allp-i" data-tab="{t}"{c}><span>{t}</span>{mark}</a></li>'
    n = len([t for t in TABS if t not in READY])
    return f'<div class="allp" hidden><p class="allp-h"><span>모든 탭 13개</span><span>준비 중 {n}개</span></p><ul class="allp-g">{items}</ul></div>'

def tabs(kind, cur):
    bar = '<i class="ldbar" aria-hidden="true"></i>'
    if kind == 'pc':
        return f'<nav class="a-tabs" aria-label="메뉴"><div class="wa"><div class="tabs-in">{tab_links(cur)}</div></div>{bar}</nav>'
    return (f'<nav class="a-tabs sw" aria-label="메뉴"><div class="tabs-sc"><div class="tabs-in">{tab_links(cur)}</div></div>'
            f'<button type="button" class="allbtn" data-act="allmenu" aria-expanded="false">전체 메뉴{ic("chev")}</button>{bar}</nav>{all_panel(cur)}')

def shell(kind, body):
    cls = 'is-pc' if kind == 'pc' else 'is-ph'
    top = f'<div class="shell-top"><div style="position:relative">{header(kind)}</div><div style="position:relative">{tabs(kind, "매출")}</div></div>'
    inner = f'<div class="wa">{body}</div>' if kind == 'pc' else body
    return f'<div class="ui {cls}">{top}<main class="main">{inner}</main></div>'

def frame(kind, inner, w, h=None, scroll=False, cap='', title=None, size='', label=''):
    fk = {'ph': 'fig-ph', 'pc': 'fig-pc', 'sm': 'fig-sm', 'full': 'fig-full'}[size or kind]
    st = f'width:{w}px;' + (f'height:{h}px;' if h else '')
    sc = ' sc' if scroll else ''
    bb = f'<div class="bbar"><span class="btab">{logo(12)}<span class="btab-t">{title}</span></span></div>' if title else ''
    lab = H.escape(label or cap.replace('<b>', '').replace('</b>', ''), quote=True)
    return (f'<figure class="fig {fk}" data-t="{lab}"><div class="cap"><span>{cap}</span><button type="button" class="zoom" data-act="zoom">크게 보기</button></div>{bb}'
            f'<div class="scr" data-w="{w}"><div class="vp{sc}" style="{st}">{inner}</div></div></figure>')

# ---------- 예시 숫자 (모두 지어낸 값) ----------
# 달: 2025-11 … 2026-10 (13달). 고른 달 = 2026년 10월(어제가 속한 달), 작년 같은 달 = 2025년 10월
MONTHS = ['2025-10','2025-11','2025-12','2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']
TOTAL = [148_204_120, 152_118_300, 146_305_880, 139_402_150, 135_809_640, 157_603_210, 159_207_730, 154_411_090, 158_806_420,
         163_509_870, 159_702_660, 156_104_530, 162_480_350]
NONCOV = [60_102_400, 62_880_150, 59_204_300, 56_011_820, 55_120_440, 64_330_700, 65_701_220, 63_140_880, 65_402_310,
          67_903_150, 65_880_040, 63_801_770, 67_284_150]
INSURER = 68_604_120          # 2026-10 공단부담
VISITS = [2_780, 2_851, 2_744, 2_633, 2_571, 2_903, 2_925, 2_846, 2_902, 2_977, 2_901, 2_846, 2_904]
PATIENTS = [1_771, 1_802, 1_745, 1_690, 1_655, 1_838, 1_851, 1_812, 1_840, 1_886, 1_843, 1_809, 1_872]   # 달마다 다녀간 환자 수(한 명은 한 번)
TREAT = [('도수치료', 49_812_000, 1_245), ('체외충격파', 16_204_500, 540), ('C-arm 주사', 13_508_200, 410),
         ('초음파', 7_806_900, 981), ('냉동치료', 2_604_000, 320)]
TREAT_OTHER = 64_115_730
SEL = 12                      # 고른 달 자리(2026-10)
PREV = 11                     # 지난달(2026-09)
LY = 0                        # 작년 같은 달(2025-10)

def won(n):      # 원 단위 그대로(표·작은 글자)
    return f'{n:,}원'
def man(n):      # 만 원 아래는 버린다(반올림 없음)
    m = n // 10_000
    eok, rest = divmod(m, 10_000)
    if eok and rest:
        return f'{eok}억 {rest:,}만 원'
    if eok:
        return f'{eok}억 원'
    return f'{rest:,}만 원'
def man_short(n):
    return f'{n // 10_000:,}'
def trunc1(x):   # 소수 첫째 자리 버림
    neg = x < 0
    v = int(abs(x) * 10 + 1e-9) / 10
    return -v if neg else v
def delta(a, b):
    d = trunc1((a - b) / b * 100)
    if d > 0:
        return 'up', f'+{d:.1f}%', '늘어남'
    if d < 0:
        return 'dn', f'−{abs(d):.1f}%', '줄어듦'
    return 'eq', '변화 없음', '변화 없음'
def share(a, t):
    return f'{trunc1(a / t * 100):.1f}%'
def mlabel(m):
    return f'{int(m[5:])}월'

# 기타 = 100/100미만총액 + 전액본인부담(2026-11-01 사용자: 매출 = 총진료비 = 급여 + 비급여 + 기타)
OTHER = [3_702_100, 3_840_220, 3_655_010, 3_480_300, 3_402_660, 3_940_080, 3_980_190, 3_861_270, 3_970_150,
         4_088_740, 3_993_060, 3_902_610, 4_206_300]
COV = [t - n - o for t, n, o in zip(TOTAL, NONCOV, OTHER)]   # 급여 = 요양비용총액 = 공단부담 + 급여 본인부담
SELF = COV[SEL] - INSURER     # 급여 본인부담 = 급여 − 공단부담

EX = '<span class="chip chip-a">예시 숫자</span>'

def dkpi(name, d, sub):
    arr = ic('up', 20) if d[0] == 'up' else ic('down', 20) if d[0] == 'dn' else ''
    return (f'<div class="kpi"><p class="kpi-n">{name}</p><p class="kpi-v dv {d[0]}">{arr}<span>{d[1]}</span><span class="sr">{d[2]}</span></p>'
            f'<p class="kpi-s">{sub}</p></div>')

# ---------- 막대 그래프 (HTML 막대, 가로 눈금선만) ----------
def bars(values, colors, labels, years, top=20000, ticks=(0, 5000, 10000, 15000, 20000), unit='(만 원)', show_vals='all', ph=False,
         stack=None, h=200):
    n = len(values)
    grid = ''
    for t in ticks:
        b = t / top * 100
        z = ' zero' if t == 0 else ''
        grid += f'<div class="bc-g{z}" style="bottom:{b:.2f}%"><span>{t:,}</span></div>'
    cols = ''
    for i, v in enumerate(values):
        if stack:   # 아래에서 위로 쌓을 칸들(stack[i])과 색(colors[i]), 그릴 때는 위 칸부터
            seg = ''.join(f'<i class="bar {c}" style="height:{v / top * 100:.2f}%"></i>'
                          for v, c in reversed(list(zip(stack[i], colors[i]))))
        else:
            seg = f'<i class="bar {colors[i]}" style="height:{v / top * 100:.2f}%"></i>'
        sv = (show_vals == 'all') or (show_vals == 'sel' and i in (SEL,))
        strong = ' strong' if i == SEL else ''
        val = f'<span class="bc-v{strong}">{v:,}</span>' if sv else ''
        cols += f'<div class="bc-c"><div class="bc-st">{val}{seg}</div></div>'
    xs = ''
    for i, l in enumerate(labels):
        hide = ph and i % 2 == 1 and i != SEL
        cur = ' cur' if i == SEL else ''
        xs += f'<span class="{cur.strip()}">{"" if hide else l}</span>'
    ys = ''.join(f'<span>{y}</span>' for y in years)
    return (f'<div class="bc{" ph" if ph else ""}" style="--n:{n}" aria-hidden="true"><p class="bc-u">{unit}</p>'
            f'<div class="bc-p" style="height:{h}px">{grid}<div class="bc-cs">{cols}</div></div>'
            f'<div class="bc-x">{xs}</div><div class="bc-y">{ys}</div></div>')

def legend(items):
    return '<p class="lg">' + ''.join(f'<span><i class="sw {c}"></i>{t}</span>' for c, t in items) + '</p>'

def sr_table(caption, head, rows):
    th = ''.join(f'<th>{h}</th>' for h in head)
    tr = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<table class="sr"><caption>{caption}</caption><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'

LABELS = [mlabel(m) for m in MONTHS]
YEARS = ['2025년'] + [''] * 2 + ['2026년'] + [''] * 9

# ---------- 매출 화면 (자료 있음) ----------
def top_row(kind):
    if kind == 'ph':
        return (f'<div class="rv-top"><h1 class="rv-h1">매출 {EX}</h1></div>'
                f'<p class="rv-meta">{ic("clock", 14)}<span>의원 PC에서 11월 1일 07:10에 가져온 숫자예요</span></p>')
    return (f'<div class="rv-top"><h1 class="rv-h1">매출 {EX}</h1><div class="rv-act"><span class="rv-meta">{ic("clock", 14)}'
            '<span>11월 1일 07:10에 비트에서 가져왔어요</span></span>'
            '<button type="button" class="btn btn-sec btn-sm">다시 가져오기</button></div></div>')

def period_row(kind):
    st = (f'<div class="stepper"><button type="button" aria-label="지난달">{ic("left")}</button>'
          f'<span class="cur">2026년 10월</span><button type="button" aria-label="다음 달">{ic("right")}</button></div>')
    note = '<span class="rv-note">10월 1일 – 31일 · 수납한 날 기준</span>'
    return f'<div class="rv-per">{st}{note}</div>'

def trend(kind):
    ph = kind == 'ph'
    d1 = delta(TOTAL[SEL], TOTAL[PREV]); d2 = delta(TOTAL[SEL], TOTAL[LY])
    avg = TOTAL[SEL] // 31
    k = (f'<div class="kpi"><p class="kpi-n">10월 매출</p><p class="kpi-v ink">{man(TOTAL[SEL])}</p><p class="kpi-s">하루 평균 {man(avg)}</p></div>'
         + dkpi('9월보다', d1, '9월 ' + man(TOTAL[PREV]))
         + dkpi('작년 10월보다', d2, '2025년 10월 ' + man(TOTAL[LY]))
         + '<div class="kpi"><p class="kpi-n">확인 필요한 날</p><p class="kpi-v warn">2일</p><p class="kpi-s">10월 14일·27일. 그날 금액은 합계에 넣지 않았어요</p></div>')
    vals = [t // 10_000 for t in TOTAL]
    cols = []
    for i in range(len(vals)):
        cols.append('b-sel' if i == SEL else 'b-prev' if i == LY else 'b-oth')
    chart = bars(vals, cols, LABELS, YEARS, show_vals=('sel' if ph else 'all'), ph=ph, h=(160 if ph else 200))
    lg = legend([('b-sel', '고른 달'), ('b-prev', '작년 같은 달'), ('b-oth', '다른 달')])
    srt = sr_table('달마다 매출 (원)', ['달', '매출'], [(m, won(t)) for m, t in zip(MONTHS, TOTAL)])
    return (f'<section class="dsec"><div class="dsec-h sp"><h2 class="dsec-t">매출 추이</h2><span class="dsec-s">매출 = 총진료비 · 지난달 · 작년 같은 때와 견줘요</span></div>'
            f'<div class="kpis">{k}</div>'
            f'<div class="cbox"><div class="c-h"><h3 class="c-t">달마다 매출 · 최근 13달</h3>{lg}</div>{chart}{srt}</div></section>')

def split(kind):
    ph = kind == 'ph'
    cov, non, oth, tot = COV[SEL], NONCOV[SEL], OTHER[SEL], TOTAL[SEL]
    dc = delta(COV[SEL], COV[PREV]); dn = delta(NONCOV[SEL], NONCOV[PREV]); do = delta(OTHER[SEL], OTHER[PREV])
    def dcell(d):
        arr = ic('up', 12) if d[0] == 'up' else ic('down', 12) if d[0] == 'dn' else ''
        return f'<span class="dl {d[0]}">{arr}{d[1]}<span class="sr">{d[2]}</span></span>'
    tb = ('<table class="tb"><thead><tr><th>나눔</th><th class="n">10월</th><th class="n">몫</th><th class="n">9월보다</th></tr></thead><tbody>'
          f'<tr class="em"><td>급여</td><td class="n">{man(cov)}</td><td class="n">{share(cov, tot)}</td><td class="n">{dcell(dc)}</td></tr>'
          f'<tr class="in"><td>공단부담</td><td class="n">{man(INSURER)}</td><td class="n">{share(INSURER, tot)}</td><td class="n muted">–</td></tr>'
          f'<tr class="in"><td>본인부담</td><td class="n">{man(SELF)}</td><td class="n">{share(SELF, tot)}</td><td class="n muted">–</td></tr>'
          f'<tr class="em"><td>비급여</td><td class="n">{man(non)}</td><td class="n">{share(non, tot)}</td><td class="n">{dcell(dn)}</td></tr>'
          f'<tr class="em"><td>기타</td><td class="n">{man(oth)}</td><td class="n">{share(oth, tot)}</td><td class="n">{dcell(do)}</td></tr>'
          f'<tr class="sum"><td>합계 · 매출</td><td class="n">{man(tot)}</td><td class="n">100%</td><td class="n">{dcell(delta(TOTAL[SEL], TOTAL[PREV]))}</td></tr>'
          '</tbody></table>')
    vals = [t // 10_000 for t in TOTAL]
    stack = [(c // 10_000, n // 10_000, o // 10_000) for c, n, o in zip(COV, NONCOV, OTHER)]   # 아래부터 급여 · 비급여 · 기타
    cols = [('b-cov', 'b-non', 'b-oth2')] * len(vals)
    chart = bars(vals, cols, LABELS, YEARS, show_vals='none', ph=ph, stack=stack, h=(140 if ph else 180))
    lg = legend([('b-oth2', '기타'), ('b-non', '비급여'), ('b-cov', '급여')])
    srt = sr_table('달마다 급여·비급여·기타 (원)', ['달', '급여', '비급여', '기타'], [(m, won(c), won(n), won(o)) for m, c, n, o in zip(MONTHS, COV, NONCOV, OTHER)])
    note = ('<p class="d-note">매출은 총진료비예요. 급여(요양비용총액)는 공단이 내는 몫과 환자가 내는 몫(본인부담)을 더한 금액, 비급여는 환자가 모두 내는 금액, '
            '기타는 100/100 미만 항목과 전액 본인부담 금액이에요. 셋을 더하면 매출이에요.</p>')
    left = f'<div class="sp-l">{tb}{note}</div>'
    right = f'<div class="sp-r"><div class="c-h"><h3 class="c-t">달마다 급여·비급여·기타</h3>{lg}</div>{chart}{srt}</div>'
    return (f'<section class="dsec"><div class="dsec-h sp"><h2 class="dsec-t">급여·비급여·기타</h2>'
            f'<span class="dsec-s">10월 비급여 몫 {share(non, tot)} · 기타 몫 {share(oth, tot)}</span></div><div class="split">{left}{right}</div></section>')

def treat(kind):
    allsum = sum(a for _, a, _ in TREAT) + TREAT_OTHER
    mx = max(a for _, a, _ in TREAT)
    rows = ''
    for name, amt, cnt in TREAT:
        rows += (f'<li><span class="rk-n">{name}</span><span class="rk-b"><i style="width:{amt / mx * 100:.2f}%"></i></span>'
                 f'<span class="rk-v"><b>{man(amt)}</b><span>{share(amt, allsum)}</span><span>{cnt:,}건</span></span></li>')
    rows += (f'<li class="oth"><span class="rk-n">그 밖 처방</span><span class="rk-b"><i style="width:{min(100, TREAT_OTHER / mx * 100):.2f}%"></i></span>'
             f'<span class="rk-v"><b>{man(TREAT_OTHER)}</b><span>{share(TREAT_OTHER, allsum)}</span><span>진찰료·약·검사 등</span></span></li>')
    return (f'<section class="dsec"><div class="dsec-h sp"><h2 class="dsec-t">치료별 매출</h2><div class="rv-act"><span class="dsec-s">10월 · 처방한 날 기준 · 내가 만든 묶음</span>'
            '<button type="button" class="btn btn-sec btn-sm">묶음 고치기</button></div></div>'
            f'<ol class="rk">{rows}</ol>'
            '<p class="d-note">처방 금액(단가 × 수량 × 일수)으로 세요. 환불·할인이 빠지지 않아 위 매출 합계와 조금 달라요. 어느 묶음에도 넣지 않은 처방은 \'그 밖 처방\'으로 세요.</p></section>')

def per_patient(kind):
    ph = kind == 'ph'
    avg = [t // n for t, n in zip(TOTAL, PATIENTS)]
    d1 = delta(avg[SEL], avg[PREV]); d2 = delta(avg[SEL], avg[LY])
    k = (f'<div class="kpi"><p class="kpi-n">10월 1인당 평균</p><p class="kpi-v ink">{avg[SEL]:,}원</p><p class="kpi-s">매출 ÷ 환자 {PATIENTS[SEL]:,}명</p></div>'
         + dkpi('9월보다', d1, '9월 ' + format(avg[PREV], ',') + '원')
         + dkpi('작년 10월보다', d2, '2025년 10월 ' + format(avg[LY], ',') + '원')
         + f'<div class="kpi"><p class="kpi-n">10월 환자 수</p><p class="kpi-v ink">{PATIENTS[SEL]:,}명</p><p class="kpi-s">내원은 {VISITS[SEL]:,}번 · 9월 {PATIENTS[PREV]:,}명</p></div>')
    vals = [a // 1000 for a in avg]
    cols = ['b-sel' if i == SEL else 'b-prev' if i == LY else 'b-oth' for i in range(len(vals))]
    chart = bars(vals, cols, LABELS, YEARS, top=100, ticks=(0, 25, 50, 75, 100), unit='(천 원)', show_vals=('sel' if ph else 'all'), ph=ph,
                 h=(120 if ph else 140))
    srt = sr_table('달마다 환자 1인당 평균 진료비 (원)', ['달', '평균', '환자 수'], [(m, f'{a:,}원', f'{n:,}명') for m, a, n in zip(MONTHS, avg, PATIENTS)])
    return (f'<section class="dsec"><div class="dsec-h sp"><h2 class="dsec-t">환자 1인당 평균 진료비</h2><span class="dsec-s">환자 한 명 기준 · 그 달에 낸 진료비의 평균</span></div>'
            f'<div class="kpis">{k}</div><div class="cbox"><div class="c-h"><h3 class="c-t">달마다 1인당 평균 · 최근 13달</h3></div>{chart}{srt}</div>'
            '<p class="d-note">매출을 그 기간에 다녀간 환자 수로 나눠요. 같은 환자가 한 달에 여러 번 와도 한 명으로 세요. 환자 수는 비트 PC 안에서 세고 숫자만 가져와요. 확인 필요한 날이 있으면 그날 매출이 빠져 실제보다 조금 낮게 보일 수 있어요.</p></section>')

def safe():
    return (f'<p class="safe rv-safe">{ic("shield", 14)}<span>환자 이름·차트번호는 가져오지 않아요. 날짜별 합계 금액만 비트 PC에서 읽어 저장해요.</span></p>')

def revenue_body(kind):
    return top_row(kind) + period_row(kind) + trend(kind) + split(kind) + treat(kind) + per_patient(kind) + safe()

# ---------- 상황별 화면 ----------
GAINS = [('매출 추이', '달마다 매출을 막대로, 지난달·작년 같은 때와 견줘요.'), ('급여·비급여·기타', '급여(공단부담·본인부담)·비급여·기타 셋으로 나눠 봐요.'),
         ('치료별 매출', '도수치료·체외충격파 같은 치료마다 금액과 건수예요.'), ('환자 1인당 평균 진료비', '매출을 다녀간 환자 수로 나눈 값이에요(한 명은 한 번).')]

def gains(ph):
    gl = ''.join(f'<li><p class="gain-n"><span class="num">{i}</span>{n}</p><p class="gain-d">{d}</p></li>' for i, (n, d) in enumerate(GAINS, 1))
    return f'<p class="gain-t">연결하면 생기는 것 4가지</p><ol class="gain">{gl}</ol>'

def not_connected(kind):
    ph = kind == 'ph'
    blk = ' btn-block' if ph else ''
    return ('<div class="rv-top"><h1 class="rv-h1">매출 <span class="chip chip-n">비트 PC 연결 전</span></h1></div>'
            '<div class="nc"><h2 class="nc-h">비트 PC를 연결하면 매출이 여기에 채워져요</h2>'
            '<p class="nc-p">매출은 비트 PC에서 날짜별 합계 금액을 읽어 와요. 연결은 설정 탭에서 처음 한 번만 하면 돼요.</p>'
            f'<div class="nc-a"><a href="#" class="btn btn-pri btn-lg{blk}">비트 PC 연결{GO}</a></div></div>'
            + gains(ph) + safe())

def fetching(kind):
    return (f'<div class="rv-top"><h1 class="rv-h1">매출</h1></div>'
            '<div class="nc" role="status"><h2 class="nc-h">비트에서 매출을 가져오고 있어요</h2>'
            '<p class="nc-p">처음 한 번은 최근 13달을 읽느라 몇 분 걸려요. 이 창을 닫지 말아 주세요. 다음부터는 새로 생긴 날만 읽어요.</p>'
            '<div class="pg"><p class="pg-t"><span>13달 가운데 <b>4달</b>을 가져왔어요</span><span class="muted">2026년 2월 읽는 중</span></p>'
            '<div class="pg-b"><i style="width:30.76%"></i></div></div>'
            '<p class="d-note">다 가져오면 그래프 4가지가 한 번에 그려져요.</p></div>' + safe())

def empty_month(kind):
    ph = kind == 'ph'
    st = (f'<div class="rv-per"><div class="stepper"><button type="button" aria-label="지난달">{ic("left")}</button>'
          f'<span class="cur">2024년 10월</span><button type="button" aria-label="다음 달">{ic("right")}</button></div>'
          '<span class="rv-note">10월 1일 – 31일 · 수납한 날 기준</span></div>')
    kp = ''.join(f'<div class="kpi"><p class="kpi-n">{n}</p><p class="kpi-v">–</p><p class="kpi-s">자료 없음</p></div>'
                 for n in ['10월 매출', '9월보다', '작년 10월보다', '1인당 평균'])
    return (f'<div class="rv-top"><h1 class="rv-h1">매출</h1></div>{st}'
            f'<section class="dsec"><div class="dsec-h"><h2 class="dsec-t">자료 없음</h2></div><div class="kpis">{kp}</div>'
            '<p class="d-note">이 달에는 비트에 수납 기록이 없어요. 그래프는 자료가 있는 달만 그려요. 숫자를 지어 넣지 않아요.</p></section>')

def phone_nodata():
    return ('<div class="rv-top"><h1 class="rv-h1">매출</h1></div>'
            '<div class="nc"><h2 class="nc-h">아직 가져온 매출이 없어요</h2>'
            '<p class="nc-p">매출은 비트 PC에서만 가져올 수 있어요. 의원 PC에서 매출 탭을 한 번 열면 폰에서도 보여요.</p></div>'
            '<div class="kpis">' + ''.join(f'<div class="kpi"><p class="kpi-n">{n}</p><p class="kpi-v">–</p><p class="kpi-s">자료 없음</p></div>'
                                          for n in ['이번 달 매출', '지난달보다', '작년보다', '1인당 평균']) + '</div>')

def saved_only():
    return (top_row_saved() + period_row('pc') +
            '<div class="ban" role="note"><p><b>이 PC는 비트와 연결되어 있지 않아요.</b> 의원 PC에서 11월 1일 07:10에 가져온 숫자를 보여 드려요.</p>'
            f'<a href="#" class="btn btn-sec btn-sm">비트 PC 연결</a></div>' + trend('pc'))

def top_row_saved():
    return (f'<div class="rv-top"><h1 class="rv-h1">매출 {EX}</h1><div class="rv-act"><span class="rv-meta">{ic("clock", 14)}'
            '<span>의원 PC에서 11월 1일 07:10에 가져온 숫자예요</span></span></div></div>')

def helper_old(kind):
    return ('<div class="rv-top"><h1 class="rv-h1">매출</h1></div>'
            '<div class="nc"><h2 class="nc-h">매출을 읽으려면 도우미를 새로 깔아야 해요</h2>'
            '<p class="nc-p">지금 이 PC의 도우미는 매출 읽기를 아직 몰라요. 설정 탭에서 새 도우미를 받아 다시 깔면 바로 읽어요.</p>'
            f'<div class="nc-a"><a href="#" class="btn btn-pri">설정에서 새 도우미 받기{GO}</a></div>'
            '<p class="err">오류 번호 E-HELPER-UNKNOWN-COMMAND</p></div>')

def ext_old(kind):
    return ('<div class="rv-top"><h1 class="rv-h1">매출</h1></div>'
            '<div class="nc"><h2 class="nc-h">매출을 읽으려면 확장 프로그램을 새 버전으로 바꿔야 해요</h2>'
            '<p class="nc-p">지금 이 PC의 크롬 확장 프로그램은 매출 읽기를 아직 몰라요. 설정 탭에서 확장 프로그램 새 버전을 받으면 바로 읽어요. 청구 점검은 지금 그대로 쓸 수 있어요.</p>'
            f'<div class="nc-a"><a href="#" class="btn btn-pri">설정에서 확인{GO}</a></div>'
            '<p class="err">오류 번호 E-BRIDGE-REJECTED</p></div>')

def failed_months():
    return (top_row('pc') + period_row('pc') +
            '<div class="ban" role="status"><p><b>2025년 11월·12월을 가져오지 못했어요.</b> 나머지 달은 그대로 볼 수 있어요.</p>'
            '<button type="button" class="btn btn-sec btn-sm">다시 가져오기</button></div>' + trend('pc'))

# ---------- 묶음 고치기 (2026-11-01 사용자 결정: "처방묶는건 내가 골라서 묶게해") ----------
# 예시 처방 코드·이름(지어낸 값, 환자 자료 아님)
G_GROUPS = [
 ('도수치료', [('도수', '도수치료', 49_812_000)]),
 ('체외충격파', [('ESWT1', '체외충격파 1부위', 11_204_500), ('ESWT2', '체외충격파 2부위', 5_000_000)]),
 ('C-arm 주사', [('CARM1', 'C-arm 영상 유도 주사', 13_508_200)]),
 ('초음파', [('SONO1', '초음파 유도', 7_806_900)]),
 ('냉동치료', [('CRYO', '냉동치료', 2_604_000)]),
]
G_REST = [('MT101', '신장분사 1', 3_120_000), ('MT102', '신장분사 2', 2_480_000), ('HP01', '핫팩', 1_960_000),
          ('IC01', '간섭파 전류치료', 1_540_000), ('AA154', '재진 진찰료', 21_330_000)]
G_NAMES = [g for g, _ in G_GROUPS]

def gsel(cur, ph):
    opts = ''.join(f'<option{" selected" if n == cur else ""}>{n}</option>' for n in G_NAMES) + f'<option{" selected" if cur is None else ""}>묶음 없음</option>'
    return f'<select class="gsel" aria-label="옮길 묶음">{opts}</select>'

def gcode_row(code, name, amt, cur, ph):
    return (f'<li class="gc"><span class="gc-c">{code}</span><span class="gc-n">{name}</span>'
            f'<span class="gc-a">10월 {man(amt)}</span><span class="gc-s">{gsel(cur, ph)}</span></li>')

def group_editor(kind, suggestion=True, name_error=None, confirm=False):
    ph = kind == 'ph'
    chip = '<span class="chip chip-a">제안 묶음 · 아직 저장 안 함</span>' if suggestion else ''
    head = (f'<div class="rv-top"><h1 class="rv-h1">치료 묶음 고치기 {chip}</h1>'
            + ('' if ph else '<div class="rv-act"><button type="button" class="btn btn-ghost">취소</button><button type="button" class="btn btn-pri">저장</button></div>')
            + '</div>'
            '<p class="ge-p">묶음 이름을 짓고, 묶음에 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 어느 묶음에도 없는 처방은 \'그 밖 처방\'으로 세요. '
            '처음에는 지금 쓰시는 일일 보고의 다섯 가지로 채워 두었어요.</p>')
    groups = ''
    for gi, (gname, codes) in enumerate(G_GROUPS):
        rows = ''.join(gcode_row(c, n, a, gname, ph) for c, n, a in codes)
        shown = '도수치료' if name_error == gi else gname
        bad = name_error == gi
        err = f'<p class="ge-err" id="ge-err-{gi}">같은 이름의 묶음이 있어요. 다른 이름을 써 주세요.</p>' if bad else ''
        aria = f' aria-invalid="true" aria-describedby="ge-err-{gi}"' if bad else ''
        groups += (f'<section class="ge-g"><div class="ge-gh"><label class="ge-l"><span class="sr">묶음 이름</span>'
                   f'<input class="ge-in{" bad" if bad else ""}" value="{shown}" maxlength="30"{aria}></label><span class="ge-cnt">처방 {len(codes)}개</span>'
                   '<button type="button" class="btn btn-ghost ge-del">묶음 지우기</button></div>'
                   f'{err}<ul class="gcs">{rows}</ul></section>')
    left = (f'<div class="ge-l1"><div class="ge-bar"><h2 class="ge-t">묶음 {len(G_GROUPS)}개</h2>'
            '<button type="button" class="btn btn-sec btn-sm">새 묶음</button></div>' + groups + '</div>')
    rest = ''.join(gcode_row(c, n, a, None, ph) for c, n, a in G_REST)
    right = (f'<div class="ge-r"><div class="ge-bar"><h2 class="ge-t">그 밖 처방 {len(G_REST)}개</h2></div>'
             '<label class="ge-find"><span class="sr">처방 찾기</span><input class="ge-in" placeholder="처방 이름이나 코드로 찾기"></label>'
             f'<ul class="gcs">{rest}</ul>'
             '<p class="d-note">최근 13달 동안 비트에서 나온 처방만 보여요. 처방 이름과 코드만 쓰고, 환자 정보는 없어요.</p></div>')
    foot = ('<div class="ge-foot"><button type="button" class="btn btn-sec btn-block">취소</button><button type="button" class="btn btn-pri btn-block">저장</button></div>' if ph else '')
    dlg = ''
    if confirm:
        dlg = ('<div class="dlg-bg"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">'
               '<h3 class="dlg-t" id="dlg-t">\'체외충격파\' 묶음을 지울까요?</h3>'
               '<p class="dlg-p">이 묶음의 처방 2개는 \'그 밖 처방\'으로 가요. [저장]을 누르기 전에는 되돌릴 수 있어요.</p>'
               '<div class="dlg-a"><button type="button" class="btn btn-sec">취소</button><button type="button" class="btn btn-danger">지우기</button></div></div></div>')
    return head + f'<div class="ge">{left}{right}</div>' + foot + dlg

def treat_load_failed():
    return (top_row('pc') + period_row('pc') +
            '<section class="dsec"><div class="dsec-h sp"><h2 class="dsec-t">치료별 매출</h2><div class="rv-act"><span class="dsec-s">10월 · 처방한 날 기준</span>'
            '<button type="button" class="btn btn-sec btn-sm" disabled aria-disabled="true">묶음 고치기</button></div></div>'
            '<div class="ban neg" role="alert"><p><b>치료 묶음을 불러오지 못했어요.</b> 인터넷 연결을 확인하고 다시 불러와 주세요. 묶음 없이 제안으로 바꿔 보이지 않아요.</p>'
            '<button type="button" class="btn btn-sec btn-sm">다시 불러오기</button></div>'
            '<p class="err">오류 번호 E-REVENUE-GROUP-LOAD-FAILED</p></section>')

# ---------- 이 시안만의 CSS (토큰은 ui-90 css_page.css의 :root + 차트 토큰) ----------
RV_CSS = r'''
:root { --chart-1: #DBE7FD; --chart-2: #B4CDFA; --chart-3: #8DB0F4; --chart-4: #2563EB; --chart-5: #1D4ED8; --chart-prev: #9CA3AF; }
.ui .sr, .sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.rv-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 24px; }
.rv-h1 { display: flex; align-items: center; gap: 8px; font-size: 20px; line-height: 28px; font-weight: 600; }
.rv-act { display: flex; align-items: center; gap: 16px; }
.rv-meta { display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 20px; color: var(--muted); }
.is-ph .rv-meta { margin-top: 4px; }
.rv-meta .ic { color: var(--muted); }
.rv-per { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin-top: 16px; }
.rv-note { font-size: 13px; line-height: 20px; color: var(--muted); }
.stepper { display: inline-flex; align-items: stretch; height: 36px; border: 1px solid var(--line-strong); border-radius: var(--r-control); }
.is-ph .stepper { height: 44px; width: 100%; }
.ui .stepper button { width: 36px; display: grid; place-items: center; color: var(--ink-2); transition: background-color 150ms; }
.is-ph .stepper button { width: 44px; }
.ui .stepper button:hover { background: var(--canvas); }
.stepper .cur { display: flex; align-items: center; justify-content: center; padding: 0 16px; border-left: 1px solid var(--line-strong); border-right: 1px solid var(--line-strong); font-size: 14px; font-weight: 600; white-space: nowrap; }
.is-ph .stepper .cur { flex: 1; }
.kpi-v.ink { color: var(--ink); }
.kpi-v.warn { color: var(--warning); }
.dl { display: inline-flex; align-items: center; gap: 2px; font-size: 13px; line-height: 20px; font-weight: 500; }
.dl.up { color: var(--positive); }
.dl.dn { color: var(--negative); }
.dl.eq { color: var(--muted); }
.kpi-v.dv { display: flex; align-items: center; gap: 4px; }
.kpi-v.dv.up { color: var(--positive); }
.kpi-v.dv.dn { color: var(--negative); }
.kpi-v.dv.eq { color: var(--muted); }
.cbox { margin-top: 24px; }
.c-h { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px 16px; }
.c-t { font-size: 16px; line-height: 24px; font-weight: 600; }
.lg { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; line-height: 20px; color: var(--ink-2); }
.lg span { display: inline-flex; align-items: center; gap: 6px; }
.lg .sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.b-sel { background: var(--accent); }
.b-prev { background: var(--chart-prev); }
.b-oth { background: var(--chart-2); }
.b-cov { background: var(--chart-3); }
.b-non { background: var(--accent); }
.b-oth2 { background: var(--line-strong); }
.bc { margin-top: 12px; }
.bc-u { font-size: 12px; line-height: 16px; color: var(--muted); }
.bc-p { position: relative; margin: 8px 0 0 48px; }
.bc.ph .bc-p { margin-left: 32px; }
.bc-g { position: absolute; left: 0; right: 0; border-top: 1px solid var(--line); }
.bc-g.zero { border-color: var(--line-strong); }
.bc-g span { position: absolute; right: 100%; top: -8px; padding-right: 8px; font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; }
.bc.ph .bc-g span { font-size: 11px; }
.bc-cs { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); }
.bc-c { position: relative; height: 100%; }
.bc-st { position: absolute; left: 25%; right: 25%; bottom: 0; top: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 2px; }
.bc-st .bar { display: block; width: 100%; max-width: 40px; }
.bc-v { font-size: 12px; line-height: 16px; color: var(--ink-2); white-space: nowrap; margin-bottom: 2px; }
.bc-v.strong { color: var(--ink); font-weight: 600; }
.bc-x, .bc-y { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); margin-left: 48px; }
.bc.ph .bc-x, .bc.ph .bc-y { margin-left: 32px; }
.bc-x span { padding-top: 6px; text-align: center; font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; }
.bc-x span.cur { color: var(--ink); font-weight: 600; }
.bc-y span { text-align: center; font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; }
.split { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; margin-top: 16px; }
.sp-l { grid-column: 1 / 6; }
.sp-r { grid-column: 7 / 13; }
.is-ph .split { display: block; }
.is-ph .sp-r { margin-top: 24px; }
.tb { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 20px; }
.tb th { height: 36px; padding: 0 8px; border-bottom: 1px solid var(--line); text-align: left; font-weight: 500; color: var(--muted); }
.tb td { height: 44px; padding: 0 8px; border-bottom: 1px solid var(--line); color: var(--ink); }
.tb th:first-child, .tb td:first-child { padding-left: 0; }
.tb th:last-child, .tb td:last-child { padding-right: 0; }
.tb .n { text-align: right; white-space: nowrap; }
.tb tr.em td:first-child { font-weight: 600; }
.tb tr.in td { height: 36px; color: var(--ink-2); }
.tb tr.in td:first-child { padding-left: 16px; }
.tb tr.sum td { font-weight: 600; border-bottom: 0; border-top: 1px solid var(--line-strong); }
.tb .muted { color: var(--muted); }
.is-ph .tb th:nth-child(4), .is-ph .tb td:nth-child(4) { display: none; }
.rk { margin-top: 12px; border-top: 1px solid var(--line); }
.rk li { display: grid; grid-template-columns: 140px minmax(0, 1fr) 280px; align-items: center; gap: 16px; min-height: 48px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.rk-n { font-size: 14px; line-height: 22px; color: var(--ink-2); font-weight: 500; }
.rk-b { display: block; height: 10px; }
.rk-b i { display: block; height: 100%; background: var(--accent); }
.rk li.oth .rk-b i { background: var(--line-strong); }
.rk-v { display: flex; align-items: baseline; justify-content: flex-end; gap: 12px; font-size: 13px; line-height: 20px; color: var(--muted); white-space: nowrap; }
.rk-v b { font-weight: 600; color: var(--ink); }
.is-ph .rk li { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
.is-ph .rk-b { grid-column: 1 / -1; grid-row: 2; }
.is-ph .rk-v { gap: 8px; }
.is-ph .rk-v span:last-child { display: none; }
.rv-safe { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--line); max-width: none; }
.nc { margin-top: 24px; padding-bottom: 8px; }
.nc-h { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; max-width: 22em; text-wrap: balance; }
.is-ph .nc-h { font-size: 20px; line-height: 28px; }
.nc-p { margin-top: 8px; font-size: 16px; line-height: 24px; color: var(--ink-2); max-width: 36em; }
.nc-a { margin-top: 20px; }
.err { margin-top: 12px; font-size: 12px; line-height: 16px; color: var(--ink-2); }
.pg { margin-top: 20px; max-width: 520px; }
.pg-t { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; line-height: 22px; color: var(--ink-2); }
.pg-t b { color: var(--ink); font-weight: 600; }
.pg-b { margin-top: 8px; height: 8px; background: var(--line); border-radius: 2px; overflow: hidden; }
.pg-b i { display: block; height: 100%; background: var(--accent); }
.ban { display: flex; align-items: center; justify-content: space-between; gap: 12px 24px; flex-wrap: wrap; margin-top: 16px; padding: 12px 16px; background: var(--warning-soft); border-radius: var(--r-control); font-size: 14px; line-height: 22px; color: var(--ink-2); }
.ban b { color: var(--ink); font-weight: 600; }
.is-ph .kpi-s { font-size: 12px; line-height: 16px; }
.qs { margin-top: 16px; display: grid; gap: 16px; }
.ge-p { margin-top: 8px; font-size: 14px; line-height: 22px; color: var(--ink-2); max-width: 52em; }
.ge { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; margin-top: 24px; }
.ge-l1 { grid-column: 1 / 8; }
.ge-r { grid-column: 8 / 13; }
.is-ph .ge { display: block; }
.is-ph .ge-r { margin-top: 32px; }
.ge-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--line-strong); }
.ge-t { font-size: 16px; line-height: 24px; font-weight: 600; }
.ge-g { padding: 16px 0 8px; border-bottom: 1px solid var(--line); }
.ge-gh { display: flex; align-items: center; gap: 12px; }
.ge-l { flex: 1; min-width: 0; }
.ge-in { width: 100%; height: 36px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--r-control); font: inherit; font-size: 14px; color: var(--ink); background: var(--surface); }
.is-ph .ge-in { height: 44px; font-size: 16px; }
.ge-find { display: block; margin-top: 12px; }
.ge-cnt { font-size: 13px; line-height: 20px; color: var(--muted); white-space: nowrap; }
.ui .ge-del { color: var(--negative); font-size: 13px; }
.gcs { margin-top: 4px; }
.gc { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto 168px; align-items: center; gap: 12px; min-height: 44px; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 20px; }
.gc:last-child { border-bottom: 0; }
.ge-r .gc { grid-template-columns: 64px minmax(0, 1fr) 150px; }
.ge-r .gc-a { display: none; }
.gc-c { color: var(--muted); }
.gc-n { color: var(--ink); }
.gc-a { color: var(--muted); white-space: nowrap; }
.gsel { width: 100%; height: 32px; padding: 0 8px; border: 1px solid var(--line-strong); border-radius: var(--r-control); font: inherit; font-size: 13px; color: var(--ink); background: var(--surface); }
.is-ph .gc, .is-ph .ge-r .gc { grid-template-columns: 56px minmax(0, 1fr); row-gap: 4px; padding: 8px 0; }
.is-ph .gc-a { display: none; }
.is-ph .gc-s { grid-column: 1 / -1; }
.is-ph .gsel { height: 44px; font-size: 16px; }
.ge-foot { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 24px; }
.ge-in.bad { border-color: var(--negative); }
.ge-err { margin-top: 6px; font-size: 12px; line-height: 16px; color: var(--negative); }
.dlg-bg { position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; background: rgb(17 24 39 / 0.36); }
.dlg { width: 400px; max-width: calc(100% - 32px); padding: 24px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-float); box-shadow: var(--elev-float); }
.dlg-t { font-size: 16px; line-height: 24px; font-weight: 600; }
.dlg-p { margin-top: 8px; font-size: 14px; line-height: 22px; color: var(--ink-2); }
.dlg-a { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 20px; }
.ui .btn-danger { background: var(--surface); border-color: var(--line-strong); color: var(--negative); font-weight: 600; }
.is-ph .dlg-a .btn { height: 44px; }
.ban.neg { background: var(--negative-soft); }
.ui .btn[disabled] { opacity: .5; cursor: not-allowed; }
'''

# ---------- 시안 페이지 ----------
S = []
row_main = ('<div class="row">'
            + frame('ph', shell('ph', revenue_body('ph')), 390, 760, True, cap='<b>폰</b> · 예시 숫자 · 아래로 밀어 보세요', label='매출 · 폰')
            + frame('pc', shell('pc', revenue_body('pc')), 1440, 860, True, cap='<b>PC</b> · 예시 숫자 · 아래로 밀어 보세요',
                    title='매출 · 예시정형외과의원', label='매출 · PC')
            + '</div>')
S.append('<section class="sec" id="main-view"><p class="sec-k">1 · 자료가 있을 때 · 바뀐 곳을 확인해 주세요</p><h2>매출 한 쪽: 추이 · 급여·비급여·기타 · 치료별 · 1인당 평균</h2>'
         '<p class="sec-p">통계처럼 도구 단추 줄 없이 그래프가 위에서 아래로 이어지는 한 쪽이에요. 맨 위에서 달을 고르면 네 덩어리가 모두 그 달로 바뀌어요. '
         '처음에는 어제가 속한 달을 보여 드려요(오늘은 11월 1일이라 10월). '
         '승인 뒤 바뀐 곳은 \'급여·비급여·기타\' 덩어리와 \'확인 필요한 날\' 글자예요.</p>' + row_main +
         '<div class="notes"><div class="nb"><h3>이렇게 읽어요</h3><ul>'
         '<li><span><b>매출 추이</b>: 고른 달의 매출과, 지난달 같은 기간·작년 같은 달 같은 기간과 견준 늘고 준 비율이에요. 막대는 최근 13달이고 작년 같은 달은 회색이에요.</span></li>'
         '<li><span><b>급여·비급여·기타</b>: 매출(총진료비)을 셋으로 나눠요 — 급여(요양비용총액 = 공단부담 + 본인부담), 비급여, 기타(100/100 미만 항목 + 전액 본인부담). 셋을 더하면 매출이에요. 오른쪽은 13달 세 겹 쌓은 막대예요(2026-11-01 바뀜).</span></li>'
         '<li><span><b>치료별 매출</b>: 도수치료·체외충격파·C-arm 주사·초음파·냉동치료 다섯 가지와 그 밖 처방이에요. 처방 금액으로 세서 매출 합계와 조금 달라요.</span></li>'
         '<li><span><b>환자 1인당 평균 진료비</b>: 매출을 그 기간에 다녀간 환자 수로 나눈 값이에요. 같은 환자가 여러 번 와도 한 명으로 세요. 환자 수는 비트 PC 안에서 세고, 이름·차트번호 없이 숫자만 가져와요.</span></li>'
         '<li><span><b>확인 필요한 날</b>: 환불·예치금이 있거나 금액이 서로 맞지 않는 날은 금액을 자동으로 세지 않고 날짜만 알려 드려요. 그날 금액은 합계에 넣지 않아요(2026-11-01 글자 바뀜).</span></li>'
         '<li><span>금액은 원 단위로 저장하고, 화면의 큰 숫자는 만 원 아래를 버려서 보여요(반올림 안 함). 비율은 소수 첫째 자리까지 버려요.</span></li>'
         '<li><span>PC에서는 [다시 가져오기]로 비트에서 새로 읽어요. 폰은 비트에 닿을 수 없어서, 의원 PC가 마지막으로 가져온 숫자를 보여요.</span></li>'
         '</ul></div></div></section>')

row_states1 = ('<div class="row">'
               + frame('pc', shell('pc', not_connected('pc')), 1440, 640, False, cap='<b>비트 PC 연결 필요</b> · 저장된 숫자도 없을 때', label='비트 PC 연결 필요 · PC')
               + frame('ph', shell('ph', not_connected('ph')), 390, 640, True, cap='<b>비트 PC 연결 필요</b> · 폰', label='비트 PC 연결 필요 · 폰')
               + '</div>')
row_states2 = ('<div class="row">'
               + frame('pc', shell('pc', fetching('pc')), 1440, 520, False, cap='<b>처음 가져오는 중</b> · 13달을 한 번에', label='가져오는 중')
               + frame('ph', shell('ph', phone_nodata()), 390, 520, False, cap='<b>폰 · 아직 가져온 숫자 없음</b>', label='폰 자료 없음')
               + '</div>')
row_states3 = ('<div class="row">'
               + frame('pc', shell('pc', empty_month('pc')), 1440, 520, False, cap='<b>자료 없음</b> · 비트에 기록이 없는 달을 골랐을 때', label='자료 없음')
               + frame('pc', shell('pc', helper_old('pc')), 1440, 520, False, cap='<b>도우미가 옛것일 때</b>', label='도우미 새로 깔기')
               + '</div><div class="row">'
               + frame('pc', shell('pc', ext_old('pc')), 1440, 520, False, cap='<b>확장 프로그램이 옛것일 때</b> · 명세 검토에서 더함', label='확장 새 버전')
               + frame('pc', shell('pc', failed_months()), 1440, 620, True, cap='<b>몇 달을 가져오지 못했을 때</b> · 예시 숫자 · 명세 검토에서 더함', label='가져오지 못한 달')
               + '</div>')
row_states4 = ('<div class="row">'
               + frame('full', shell('pc', saved_only()), 1440, 700, True, cap='<b>비트와 연결 안 된 PC</b> · 예시 숫자 · 저장된 숫자는 볼 수 있어요',
                       size='full', label='연결 안 된 PC')
               + '</div>')
S.append('<section class="sec" id="states"><p class="sec-k">2 · 상황마다</p><h2>연결 전 · 가져오는 중 · 자료 없음</h2>'
         '<p class="sec-p">자료가 없으면 빈 그래프 틀을 그리지 않고, 무엇을 하면 되는지 한 가지만 알려 드려요. 숫자를 지어 넣지 않아요.</p>'
         + row_states1 + row_states2 + row_states3 + row_states4 +
         '<div class="notes"><div class="nb"><h3>상황마다 달라지는 것</h3><ul>'
         '<li><span><b>비트 PC 연결 필요</b>: 이 PC에 확장 프로그램·도우미가 없고 저장된 숫자도 없을 때예요. [비트 PC 연결]은 설정 탭으로 가요.</span></li>'
         '<li><span><b>처음 가져오는 중</b>: 처음 한 번은 최근 13달을 한 달씩 읽어요. 몇 분 걸릴 수 있어요. 한 달을 읽을 때마다 바로 저장해서, 도중에 멈춰도 다음에 이어서 읽어요.</span></li>'
         '<li><span><b>자료 없음</b>: 고른 달에 비트 수납 기록이 없을 때예요. 숫자 자리는 "–"와 "자료 없음"이에요.</span></li>'
         '<li><span><b>도우미가 옛것일 때</b>: 매출 읽기는 새 도우미가 있어야 해요. 설정 탭에서 새로 받아 깔면 돼요.</span></li>'
         '<li><span><b>확장 프로그램이 옛것일 때</b>: 같은 모양으로 "확장 프로그램을 새 버전으로" 알려 드려요. 청구 점검은 그대로 써요.</span></li>'
         '<li><span><b>몇 달을 가져오지 못했을 때</b>: 최근 달부터 가져오고, 못 가져온 달은 건너뛰고 알려 드려요. [다시 가져오기]로 그 달만 다시 읽어요.</span></li>'
         '<li><span><b>비트와 연결 안 된 PC</b>(원장님 방 PC 등)와 <b>폰</b>은 의원 PC가 마지막으로 가져와 저장한 숫자를 보여요.</span></li>'
         '</ul></div></div></section>')

row_groups = ('<div class="row">'
              + frame('ph', shell('ph', group_editor('ph')), 390, 760, True, cap='<b>폰</b> · 예시 처방 · 아래로 밀어 보세요', label='묶음 고치기 · 폰')
              + frame('pc', shell('pc', group_editor('pc')), 1440, 860, True, cap='<b>PC</b> · 예시 처방 · 이름 칸과 옮기기 칸을 눌러 보세요',
                      title='매출 · 예시정형외과의원', label='묶음 고치기 · PC')
              + '</div><div class="row">'
              + frame('ph', shell('ph', group_editor('ph', name_error=1)), 390, 640, True, cap='<b>이름이 겹칠 때</b> · 이름 칸 아래에 이유', label='이름 겹침')
              + frame('pc', shell('pc', group_editor('pc', confirm=True)), 1440, 700, False, cap='<b>묶음 지우기</b> · 확인 창', label='묶음 지우기 확인')
              + '</div><div class="row">'
              + frame('full', shell('pc', treat_load_failed()), 1440, 420, False, cap='<b>묶음을 불러오지 못했을 때</b> · 제안으로 바꾸지 않아요', size='full', label='묶음 읽기 실패')
              + '</div>')
S.append('<section class="sec" id="groups"><p class="sec-k">3 · 2026년 11월 1일 확인함</p><h2>치료 묶음 고치기: 처방을 내가 골라 묶어요</h2>'
         '<p class="sec-p">치료별 매출 머리의 [묶음 고치기]를 누르면 열려요. 묶음 이름을 짓고, 처방마다 어느 묶음에 넣을지 골라요. 처음에는 일일 보고의 다섯 가지를 제안으로 채워 두고, [저장]을 누르면 그때부터 치료별 매출이 내 묶음으로 세요.</p>'
         + row_groups +
         '<div class="notes"><div class="nb"><h3>이렇게 써요</h3><ul>'
         '<li><span><b>묶음 이름</b>은 칸에서 바로 고쳐요(30자까지, 같은 이름은 안 돼요. 주민번호·전화번호 같은 모양을 막으려고 숫자를 6개 이상 잇거나 줄바꿈 같은 제어 문자를 넣을 수 없어요). 맞지 않으면 칸 아래에 이유가 나와요. [새 묶음]으로 더하고, [묶음 지우기]를 누르면 확인 창을 거쳐 그 묶음의 처방은 \'그 밖 처방\'으로 가요.</span></li>'
         '<li><span><b>처방 옮기기</b>: 처방마다 오른쪽 칸에서 묶음을 고르면 그 묶음으로 옮겨요. 처방 하나는 한 묶음에만 들어가서 매출이 두 번 세어지지 않아요.</span></li>'
         '<li><span><b>그 밖 처방</b>: 어느 묶음에도 없는 처방이 오른쪽에 모여요. 이름이나 코드로 찾아 묶음에 넣을 수 있어요.</span></li>'
         '<li><span>처방 목록은 최근 13달 동안 비트에서 나온 처방 코드와 이름이에요. 저장하는 것은 묶음 이름과 처방 코드 목록뿐이고 환자 정보는 없어요. 폰에서도 고칠 수 있어요.</span></li>'
         '<li><span>폰에서는 처방 줄의 금액을 숨기고 코드·이름·옮기기만 보여요.</span></li>'
         '<li><span>묶음을 불러오지 못하면 제안으로 바꿔 보이지 않고 [다시 불러오기]만 보여요. 저장은 한꺼번에 되어서, 도중에 끊겨도 반쪽만 저장되지 않아요.</span></li>'
         '<li><span>나중에 통계 탭도 같은 묶음을 쓸 수 있게 만들어 둬요.</span></li>'
         '</ul></div></div></section>')

decide = ('<section class="sec" id="decide"><div class="decide"><p class="sec-k">정한 것 · 2026년 11월 1일</p><h2>시안 승인과 결정</h2><ol>'
          '<li><div><p class="q">시안: 이대로 만들어요</p><p class="a">이 그림대로 작업을 나눠 하나씩 만들어요.</p></div></li>'
          '<li><div><p class="q">1인당 평균 진료비: 환자 한 명마다</p>'
          '<p class="a">매출 ÷ 그 기간에 다녀간 환자 수예요. 한 달에 여러 번 온 분도 한 명으로 세요. 환자 수는 비트 PC 안에서 세고 숫자만 가져와요.</p></div></li>'
          '<li><div><p class="q">치료 묶음: 내가 골라서 묶어요</p>'
          '<p class="a">묶음 이름과 넣을 처방을 직접 정해요. 처음에는 일일 보고의 다섯 가지(도수치료·체외충격파·C-arm 주사·초음파·냉동치료)를 고칠 수 있는 제안으로 채워 둬요.</p></div></li>'
          '<li><div><p class="q">치료 묶음 고치기 화면: 좋아요</p>'
          '<p class="a">3번 그림대로 만들어요. 묶음은 50개까지 만들 수 있어요.</p></div></li>'
          '<li><div><p class="q">매출은 총진료비, 급여·비급여는 셋으로(급여·비급여·기타)</p>'
          '<p class="a">비트 외래환자경영통계와 같은 식이에요: 총진료비 = 요양비용총액(급여) + 비급여 + 100/100 미만 + 전액 본인부담. 기타 = 100/100 미만 + 전액 본인부담.</p></div></li>'
          '<li><div><p class="q">환불·예치금이 있는 날: 합계에서 빼고 날짜만 알림</p>'
          '<p class="a">지금 일일 보고처럼 그날 금액은 비워 두고 "확인 필요한 날"로 알려 드려요. 금액이 서로 맞지 않는 날도 똑같이 해요. 이런 날은 매출뿐 아니라 업무일지 자동 채우기에서도 금액이 비어서 직접 적어요. 이런 날이 많으면 직접 입력 칸을 다시 의논해요.</p></div></li></ol>'
          '<p class="reply">승인 뒤 바뀐 곳만 확인해 주세요: 1번의 \'급여·비급여·기타\' 덩어리(표·세 겹 막대·안내 글)와 \'확인 필요한 날\' 칸의 글자, 같은 말로 바뀐 매출 추이 설명과 연결 전 화면의 소개 줄이에요. \'확인 필요한 날\'에는 매출뿐 아니라 업무일지 자동 채우기에서도 금액이 비어서, 그날 금액은 직접 적게 돼요. 이렇게 답해 주시면 돼요: <b>매출 바뀐 곳 좋아요</b> (바꿀 것이 있으면 함께 말씀해 주세요)</p></div></section>')

NAV = [('main-view', '자료가 있을 때 (바뀐 곳 확인)'), ('states', '상황마다'), ('groups', '묶음 고치기'), ('decide', '정한 것')]
nav = ''.join(f'<a href="#{i}"{" class=dec" if i == "decide" else ""}>{n}</a>' for i, n in NAV)

page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>매출 탭 시안</title>
<style>
{(UI90 / 'fonts.css').read_text(encoding='utf-8')}
{(UI90 / 'css_page.css').read_text(encoding='utf-8')}
{(UI90 / 'css_app.css').read_text(encoding='utf-8')}
{RV_CSS}
</style>
</head>
<body>
<header class="wrap intro">
<p class="eyebrow">매출 탭 · 승인된 시안 (2026년 11월 1일) · 바뀐 곳 확인 중</p>
<h1>매출을 그래프 한 쪽으로: 추이, 급여·비급여·기타, 치료별, 1인당 평균</h1>
<p class="lead">비트 PC에서 날짜별 합계 금액만 읽어 와서 매출 탭을 채우는 모습이에요. 폰과 PC를 나란히 그렸고, 그림 속 숫자는 모두 예시예요. 2026년 11월 1일에 이대로 만들기로 정했어요. 그 뒤 바뀐 곳만 맨 아래에서 확인해 주세요.</p>
</header>
<nav class="secnav" aria-label="시안 목록"><div class="secnav-in">{nav}</div></nav>
<main class="wrap">
{''.join(S)}
{decide}
</main>
<footer class="wrap foot"><p>그림 속 의원 이름, 이메일, 금액, 건수, 날짜는 모두 예시예요. 실제 환자 정보와 실제 매출은 들어 있지 않아요.</p>
<p>이 그림대로 작업을 나눠 하나씩 만들어요.</p></footer>
<dialog id="zoom" aria-labelledby="zt"><div class="zh"><span id="zt"></span><button type="button" class="zc" data-act="zclose">닫기</button></div><div class="zb"></div></dialog>
<script>
{(UI90 / 'app.js').read_text(encoding='utf-8')}
</script>
</body>
</html>'''
(HERE / 'index.html').write_text(page, encoding='utf-8')
print('bytes', len(page.encode()))
