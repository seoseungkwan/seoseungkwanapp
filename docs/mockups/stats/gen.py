"""통계 탭 클릭 목업 만들기 (specs/stats TASK-12, REQ-512).

    python3 docs/mockups/stats/gen.py   →   docs/mockups/stats/index.html

- 글꼴·토큰·앱 틀 css는 ui-90 시안(docs/mockups/ui-90/app/)의 파일을 그대로 읽어 넣는다(같은 모양).
- 움직임은 같은 폴더의 app.js다. index.html이 상대 경로(app.js)로 부른다.
- 숫자·처방 이름·보고 글은 모두 지어낸 예시다(고정 씨앗 난수). 환자 이름·차트번호는 없다.
- 기간·평균·증감·재방문·처방 칸의 셈은 specs/stats REQ-511(TASK-11 view.ts 인터페이스)의 규칙을 따른다.
"""
import datetime as dt
import html as H
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
UI90 = os.path.normpath(os.path.join(HERE, '..', 'ui-90', 'app'))


def rd(name):
    with open(os.path.join(UI90, name), encoding='utf-8') as f:
        return f.read()


# ---------------------------------------------------------------- icons · shell (ui-90 시안 그대로)
ICONS = {
    'shield': '<path d="M8 1.75 3 3.6v3.9c0 3 2.1 5.5 5 6.75 2.9-1.25 5-3.75 5-6.75V3.6L8 1.75z"/><path d="m5.9 8 1.5 1.5 2.8-2.9"/>',
    'clock': '<circle cx="8" cy="8" r="6"/><path d="M8 4.75V8l2.25 1.5"/>',
    'user': '<circle cx="8" cy="5.5" r="2.75"/><path d="M2.75 14c.6-2.5 2.7-3.9 5.25-3.9s4.65 1.4 5.25 3.9"/>',
    'chev': '<path d="m4.75 6.25 3.25 3.25 3.25-3.25"/>',
    'check': '<path d="m3.5 8.25 2.9 2.9 6.1-6.65"/>',
    'arrow': '<path d="M2.75 8h10.5M9.25 4l4 4-4 4"/>',
    'monitor': '<rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1"/><path d="M5.5 13.75h5M8 11.25v2.5"/>',
    'stop': '<circle cx="8" cy="8" r="6"/><path d="m3.9 3.9 8.2 8.2"/>',
    'userCheck': '<circle cx="6.5" cy="5.25" r="2.5"/><path d="M1.75 13.5c.5-2.4 2.4-3.75 4.75-3.75 1.15 0 2.2.3 3.05.9"/><path d="m10 12 1.6 1.6 3-3.35"/>',
    'logout': '<path d="M9.5 2.75h2.75a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9.5"/><path d="M6.5 5 3.5 8l3 3M3.5 8h6.5"/>',
    'copy': '<rect x="5.25" y="5.25" width="8" height="8" rx="1"/><path d="M10.75 5.25V3.75a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h1.5"/>',
    'upload': '<path d="M8 10.5V2.75M4.75 6 8 2.75 11.25 6"/><path d="M2.75 10.5v1.75a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V10.5"/>',
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
TABS = ['대시보드', '통계', '청구', '고시·공지', '환자', '매출', 'AI 리포트', '서식', '직원', '업무일지', '재고', '주소록', '설정']
READY = {'대시보드', '통계', '청구', '설정'}   # 이 명세 뒤 통계가 '사용 가능'이 된다 (REQ-515)
CLOCK = '2026년 11월 13일 (금) 18:42 (KST)'


def acct_menu():
    return ('<div class="menu"><div class="menu-h"><span class="menu-n">manager@example.com</span><span class="menu-s">예시정형외과의원</span>'
            '<span class="chip chip-n menu-c">관리자 계정</span></div><div class="menu-l">'
            f'<a href="#" class="menu-i">{ic("userCheck")}가입 승인</a><button type="button" class="menu-i">{ic("logout")}로그아웃</button></div></div>')


def header(kind):
    if kind == 'ph':
        return (f'<header class="a-hdr"><div class="brand">{logo(24)}<span class="clinic">{CLINIC}</span></div>'
                f'<div class="acct-w"><button type="button" class="iconbtn" data-act="acct" aria-expanded="false" aria-label="manager@example.com">{ic("user")}</button>{acct_menu()}</div></header>')
    return (f'<header class="a-hdr"><div class="wa"><div class="brand">{logo(24)}<span class="clinic">{CLINIC}</span></div>'
            f'<div class="hdr-r"><span class="clock">{CLOCK}</span><div class="acct-w">'
            f'<button type="button" class="acct" data-act="acct" aria-expanded="false">{ic("user")}manager@example.com{ic("chev")}</button>{acct_menu()}</div></div></div></header>')


def tab_links(cur):
    return ''.join(f'<a href="#" class="tab" data-tab="{t}"' + (' aria-current="page"' if t == cur else '') + f'>{t}</a>' for t in TABS)


def all_panel(cur):
    items = ''
    for t in TABS:
        c = ' aria-current="page"' if t == cur else ''
        mark = '' if t in READY else '<span class="chip chip-n">준비 중</span>'
        items += f'<li><a href="#" class="allp-i" data-tab="{t}"{c}><span>{t}</span>{mark}</a></li>'
    return f'<div class="allp" hidden><p class="allp-h"><span>모든 탭 13개</span><span>준비 중 {13 - len(READY)}개</span></p><ul class="allp-g">{items}</ul></div>'


def tabs(kind, cur):
    if kind == 'pc':
        return f'<nav class="a-tabs" aria-label="메뉴"><div class="wa"><div class="tabs-in">{tab_links(cur)}</div></div></nav>'
    return (f'<nav class="a-tabs sw" aria-label="메뉴"><div class="tabs-sc"><div class="tabs-in">{tab_links(cur)}</div></div>'
            f'<button type="button" class="allbtn" data-act="allmenu" aria-expanded="false">전체 메뉴{ic("chev")}</button></nav>{all_panel(cur)}')


def shell(kind, body, attrs=''):
    """kind: pc(1024 이상) · tab(768~1023, 탭 줄은 옆으로 밀림) · ph(768 미만)"""
    hk = 'pc' if kind in ('pc', 'tab') else 'ph'
    tk = 'pc' if kind == 'pc' else 'ph'
    cls = 'is-pc' if hk == 'pc' else 'is-ph'
    if kind == 'tab':
        cls += ' is-mid'
    top = f'<div class="shell-top"><div style="position:relative">{header(hk)}</div><div style="position:relative">{tabs(tk, "통계")}</div></div>'
    return f'<div class="ui {cls}"{attrs}>{top}<main class="main"><div class="{"wa" if hk == "pc" else ""}">{body}</div></main></div>'


def frame(kind, inner, w, h, cap, label, title=None, size=None):
    fk = {'ph': 'fig-ph', 'pc': 'fig-pc', 'full': 'fig-full'}[size or kind]
    bb = f'<div class="bbar"><span class="btab">{logo(12)}<span class="btab-t">{title}</span></span></div>' if title else ''
    return (f'<figure class="fig {fk}" data-t="{H.escape(label, quote=True)}"><div class="cap"><span>{cap}</span>'
            f'<button type="button" class="zoom" data-act="zoom">크게 보기</button></div>{bb}'
            f'<div class="scr" data-w="{w}"><div class="vp sc" style="width:{w}px;height:{h}px">{inner}</div></div></figure>')


# ---------------------------------------------------------------- 날짜·글자
TODAY = dt.date(2026, 11, 13)          # 시안의 '오늘' (금요일, 진료 중)
YDAY = TODAY - dt.timedelta(days=1)
WD = '월화수목금토일'
MINUS = '−'


def span(a, b):
    return [a + dt.timedelta(days=i) for i in range((b - a).days + 1)]


def md(d):
    return f'{d.month}월 {d.day}일'


def mdw(d):
    return f'{d.month}월 {d.day}일 ({WD[d.weekday()]})'


def fc(n):
    return f'{n:,}'


def trunc1(x):            # 소수 첫째 자리까지 버림 (UI_GUIDE 차트 '숫자 글자는 버린다')
    return f'{math.floor(abs(x) * 10 + 1e-9) / 10:.1f}'


def month_end(y, m):
    return dt.date(y + (m == 12), m % 12 + 1, 1) - dt.timedelta(days=1)


def months_back(y, m, k):
    i = y * 12 + (m - 1) - k
    return (i // 12, i % 12 + 1)


def compare(cur, prev, unit):
    """앱의 compareNumbers + formatDelta 글자 규칙을 흉내 낸다 (REQ-508.5)."""
    if prev is None:
        return {'dir': 'none', 'text': '비교할 수 없음', 'sr': ''}
    if prev == 0:
        return {'dir': 'none', 'text': '새로 생김' if cur > 0 else '변화 없음', 'sr': ''}
    diff = cur - prev
    if diff == 0:
        return {'dir': 'flat', 'text': '변화 없음', 'sr': ''}
    up = diff > 0
    return {'dir': 'up' if up else 'down', 'text': f"{fc(abs(diff))}{unit} ({'+' if up else MINUS}{trunc1(diff / prev * 100)}%)",
            'sr': '늘어남' if up else '줄어듦'}


# ---------------------------------------------------------------- 예시 자료 (지어낸 숫자)
HOL = {dt.date(*x) for x in [
    (2024, 12, 25), (2025, 1, 1), (2025, 1, 27), (2025, 1, 28), (2025, 1, 29), (2025, 1, 30), (2025, 3, 3), (2025, 5, 5), (2025, 5, 6),
    (2025, 6, 3), (2025, 6, 6), (2025, 8, 15), (2025, 10, 3), (2025, 10, 6), (2025, 10, 7), (2025, 10, 8), (2025, 10, 9), (2025, 12, 25),
    (2026, 1, 1), (2026, 2, 16), (2026, 2, 17), (2026, 2, 18), (2026, 3, 2), (2026, 5, 5), (2026, 5, 25), (2026, 6, 3), (2026, 8, 15),
    (2026, 8, 17), (2026, 9, 24), (2026, 9, 25), (2026, 9, 26), (2026, 10, 3), (2026, 10, 5), (2026, 10, 9)]}
# 코드는 시안 안에서만 쓰는 가짜(R01…). 화면에는 이름만 보인다
RX = [  # code, name, 신환 중 받는 몫, 재진 중 받는 몫, 2년 동안 늘어남, 10월 14일부터 곱
    ('R01', '표층열치료', .52, .62, .05, 1.0), ('R02', '간섭파전류치료', .48, .58, -.02, .68),
    ('R03', '경피적전기신경자극치료', .30, .36, 0, 1.0), ('R04', '단순방사선 촬영', .88, .07, .03, 1.0),
    ('R05', '도수치료 30분', .10, .13, .25, 1.12), ('R06', '관절강내주사', .12, .09, .08, 1.0),
    ('R07', '체외충격파', .05, .06, -.1, .92), ('R08', '초음파 유도 주사', .06, .04, .1, 1.0),
    ('R09', '근막동통유발점주사', .07, .05, 0, 1.0), ('R10', '견인치료', .04, .06, -.05, 1.0),
    ('R11', '테이핑', .05, .03, 0, 1.0), ('R12', '골밀도 검사', .06, .01, 0, 1.0),
    ('R13', '냉동치료', .02, .04, .15, 1.0), ('R14', '신경차단술', .03, .02, 0, 1.0)]
RXNAME = {c: n for c, n, *_ in RX}

rng = random.Random(20261113)
START = dt.date(2024, 12, 1)
BASE = [142, 121, 124, 108, 131, 84]          # 월~토 하루 환자 수 바탕
DAYS = {}
for d in span(START, TODAY):
    if d.weekday() == 6 or d in HOL:
        continue
    t = (d - START).days / 712
    p = BASE[d.weekday()] * (0.95 + 0.07 * t) * (1 + rng.uniform(-0.09, 0.09))
    if d == TODAY:
        p *= 0.94
    p = int(p)
    n = int(p * rng.uniform(0.10, 0.135))
    r = p - n
    w7 = int(n * rng.uniform(.33, .43))
    w14 = w7 + int((n - w7) * rng.uniform(.14, .22))
    w30 = w14 + int((n - w14) * rng.uniform(.18, .27))
    a30 = int((n - w30) * rng.uniform(.10, .20))
    rx = {}
    for code, _nm, sn, sr, g, step in RX:
        m = (1 + g * t) * (step if d >= dt.date(2026, 10, 14) else 1)
        a = min(n, int(round(n * sn * m * rng.uniform(.85, 1.15))))
        b = min(r, int(round(r * sr * m * rng.uniform(.88, 1.12))))
        if a + b:
            rx[code] = (a, b)
    DAYS[d] = dict(p=p, n=n, r=r, c=n, w7=w7, w14=w14, w30=w30, a30=a30, rx=rx, part=d == TODAY)

SETS_SRC = {
    'main': dict(days=DAYS, cover=START),                                                       # 2년치를 불러 둔 의원
    'cur': dict(days={d: v for d, v in DAYS.items() if d >= dt.date(2026, 11, 2)}, cover=dt.date(2026, 11, 2)),   # 이번 달만 불러 둔 의원
}
K = {'w7': 7, 'w14': 14, 'w30': 30}


def known(first, last, k, cover):
    """그 칸의 k일 재방문이 숫자인가: 칸 첫날 ~ 칸 끝날 + k일이 덮였고 끝났을 때만 (AC-501.3)"""
    return first >= cover and last + dt.timedelta(days=K[k]) <= YDAY


def months_of(ds):
    acc = {}
    for d, v in sorted(ds['days'].items()):
        a = acc.setdefault((d.year, d.month), dict(p=0, n=0, c=0, w7=0, w14=0, w30=0, a30=0))
        for k in a:
            a[k] += v[k]
    out = {}
    for (y, m), a in acc.items():
        first, last = dt.date(y, m, 1), month_end(y, m)
        part = last >= TODAY or first < ds['cover']
        pts = int(a['p'] * 0.58)                                  # 달 실환자 = 날마다 환자의 합보다 적다
        rv = {k: (a[k] if not part and known(first, last, k, ds['cover']) else None) for k in K}
        rv['a30'] = a['a30'] if rv['w30'] is not None else None
        out[(y, m)] = dict(p=pts, n=a['n'], r=pts - a['n'], c=a['c'], part=part, first=first, last=last, **rv)
    return out


MONTHS = {k: months_of(v) for k, v in SETS_SRC.items()}
LABEL = {'7d': '최근 7일', '30d': '최근 30일', '90d': '최근 90일', '12m': '최근 12개월'}
CMPNAME = {'7d': '지난 7일', '30d': '지난 30일', '90d': '지난 90일', '12m': '작년 같은 12달'}
GRAIN = {'7d': 'day', '30d': 'day', '90d': 'week', '12m': 'month'}
GRAIN_NAME = {'day': '일', 'week': '주', 'month': '달'}


def prange(per):
    """statsRange: 일 기간 = 어제까지 N일, 비교 = 바로 앞 같은 일수 / 12개월 = 이번 달 포함 12달, 비교 = 작년 같은 12달"""
    if per == '12m':
        cur = [months_back(TODAY.year, TODAY.month, 11 - i) for i in range(12)]
        return cur, [(y - 1, m) for y, m in cur]
    n = int(per[:-1])
    return (TODAY - dt.timedelta(n), YDAY), (TODAY - dt.timedelta(2 * n), TODAY - dt.timedelta(n + 1))


def buckets(a, b, grain):
    if grain == 'day':
        return [(d, d) for d in span(a, b)]
    out = []
    if grain == 'week':
        s = a - dt.timedelta(a.weekday())
        while s <= b:
            out.append((s, s + dt.timedelta(6)))
            s += dt.timedelta(7)
        return out
    y, m = a.year, a.month
    while dt.date(y, m, 1) <= b:
        out.append((dt.date(y, m, 1), month_end(y, m)))
        y, m = (y + (m == 12), m % 12 + 1)
    return out


def point(bk, a, b, code, ds):
    """buildTrend 칸 하나: 덮은 기간 안 빈 날 = 0, 밖·기간 밖·덜 끝난 날이 들면 일부 기간"""
    lo, hi = bk
    n = r = 0
    part = lo < a or hi > b
    for d in span(lo, hi):
        if d < a or d > b:
            continue
        if d < ds['cover'] or d > TODAY:
            part = True
            continue
        v = ds['days'].get(d)
        if v is None:
            continue
        if v['part']:
            part = True
        x = v['rx'].get(code)
        if x:
            n += x[0]
            r += x[1]
    return n, r, part


def covered(bk, a, b, ds):
    """rxDetail covered: 그 칸의 날이 하나라도 덮은 기간 안에 있으면 참 (AC-511.8). 거짓인 비교 칸은 "–" (AC-513.11)"""
    return any(a <= d <= b and ds['cover'] <= d <= TODAY for d in span(*bk))


def blabel(bk, grain, i, nb):
    lo, hi = bk
    if grain == 'day':
        step = 1 if nb <= 7 else 7
        return (f'{lo.month}.{lo.day}' if i % step == 0 else ''), mdw(lo)
    if grain == 'week':
        return (f'{lo.month}.{lo.day}' if i % 3 == 0 else ''), f'{md(lo)} – {md(hi)}'
    return f'{lo.month}월', f'{lo.year}년 {lo.month}월'


def period_data(dsk, per):
    ds, months = SETS_SRC[dsk], MONTHS[dsk]
    days = ds['days']
    cur, prev = prange(per)
    if per == '12m':
        cd, pd = (dt.date(*cur[0], 1), TODAY), (dt.date(*prev[0], 1), month_end(*prev[-1]))
        rng_txt = f'{cur[0][0]}년 {cur[0][1]}월 – {cur[-1][0]}년 {cur[-1][1]}월'
        cmp_txt = f'{prev[0][0]}년 {prev[0][1]}월 – {prev[-1][0]}년 {prev[-1][1]}월'
        rng_note = f'{TODAY.month}월은 {TODAY.day}일까지'
    else:
        cd, pd = cur, prev
        rng_txt, cmp_txt, rng_note = f'{md(cd[0])} – {md(cd[1])}', f'{md(pd[0])} – {md(pd[1])}', '어제까지'
    rows = [(d, days[d]) for d in span(*cd) if d in days]
    prows = [(d, days[d]) for d in span(*pd) if d in days]
    out = {'label': LABEL[per], 'cmpName': CMPNAME[per], 'range': rng_txt, 'cmp': cmp_txt, 'rangeNote': rng_note}

    # 1) 기간 요약 (AC-511.2)
    unit_avg = '한 달' if per == '12m' else '하루'
    if per == '12m':
        cm = [(k, months[k]) for k in cur if k in months]
        fin = [v for _, v in cm if not v['part']]
        skip = {(y - 1, m) for (y, m), v in cm if v['part']}
        pm = [months[k] for k in prev if k in months and k not in skip]
        cells_all = [v for _, v in cm]
        avg_sub = f'끝난 달 {len(fin)}달 평균'
    else:
        fin = [v for _, v in rows if not v['part']]
        pm = [v for _, v in prows if not v['part']]
        cells_all = [v for _, v in rows]
        avg_sub = f'진료한 날 {len(fin)}일 평균'
    if not cells_all:
        out['sum'] = None
    else:
        avg = sum(v['p'] for v in fin) // len(fin) if fin else None
        pavg = sum(v['p'] for v in pm) // len(pm) if pm else None
        anypart = any(v['part'] for v in cells_all)
        d = compare(avg, pavg, '명') if (avg is not None and pavg is not None) else None
        note = ''
        if per == '12m' and anypart:
            note = (f'{TODAY.month}월은 아직 끝나지 않은 달이라 평균과 견주기에서 빼요(작년 {TODAY.month}월도 빼요). 신환·재진 합계에는 넣어요.'
                    if fin else f'끝난 달 숫자가 아직 없어요. {TODAY.month}월은 끝나지 않은 달이라 평균에 넣지 않아요. 12월 1일이 지나면 평균이 보여요.')
        out['sum'] = {
            'desc': f"{out['label']} · {rng_txt}",
            'cells': [
                {'n': f'{unit_avg} 평균 환자 수', 'v': f'{fc(avg)}명' if avg is not None else None, 'sub': avg_sub if avg is not None else '자료 없음'},
                {'n': '신환', 'v': f"{fc(sum(v['n'] for v in cells_all))}명", 'sub': '기간 합계', 'chip': '일부 기간' if anypart else None},
                {'n': '재진', 'v': f"{fc(sum(v['r'] for v in cells_all))}명", 'sub': '기간 합계', 'chip': '일부 기간' if anypart else None},
                {'n': '비교 기간보다', 'd': d,
                 'sub': f"{CMPNAME[per]} {unit_avg} 평균 {fc(pavg)}명" if d else '비교할 자료가 없어요'},
            ],
            'note': note}

    # 2) 환자 수 추이 (AC-511.3)
    if per == '12m':
        bars = [{'l': f'{m}월', 't': f'{y}년 {m}월', 'n': v['n'], 'r': v['r'], 'p': v['part']} for (y, m), v in cm]
        tr_desc, tr_note = '신환·재진, 한 달씩', (f'빗금 칸은 아직 끝나지 않은 달이에요({TODAY.month}월은 {TODAY.day}일까지).' if any(b['p'] for b in bars) else '')
    else:
        step = {7: 1, 30: 7, 90: 21}[int(per[:-1])]
        ticks = {d: f'{d.month}.{d.day}' for i, d in enumerate(span(*cd)) if i % step == 0}
        bars = [{'l': ticks.get(d, ''), 't': mdw(d), 'n': v['n'], 'r': v['r'], 'p': v['part']} for d, v in rows]
        tr_desc, tr_note = '신환·재진, 하루씩', '휴진한 날은 칸이 없어요.'
    out['trend'] = {'desc': tr_desc, 'note': tr_note, 'first': '달' if per == '12m' else '날짜', 'bars': bars} if bars else None

    # 3) 신환 재방문율 + 첫 재방문까지 날수 (AC-511.4 · AC-513.10)
    def day_cells(rs):
        acc = []
        for d, v in rs:
            x = {k: (v[k] if known(d, d, k, ds['cover']) and not v['part'] else None) for k in K}
            x['a30'] = v['a30'] if x['w30'] is not None else None
            acc.append(dict(first=d, last=d, c=v['c'], **x))
        return acc
    if per == '12m':
        cells = [dict(first=v['first'], last=v['last'], c=v['c'], w7=v['w7'], w14=v['w14'], w30=v['w30'], a30=v['a30']) for _, v in cm]
    else:
        cells = day_cells(rows)
    # 최근 30일만: 30일 줄과 첫 재방문까지 날수는 온 뒤 30일이 지난 가장 최근 신환(finishedCohort = 오늘 − 60 ~ 오늘 − 31, 비교 기간과 같은 범위)
    cells30 = day_cells(prows) if per == '30d' else cells
    rv_rows = []
    for k, nm in (('w7', '7일 안에 다시 옴'), ('w14', '14일 안에 다시 옴'), ('w30', '30일 안에 다시 옴')):
        src = cells30 if k == 'w30' else cells
        cnt = [c for c in src if c[k] is not None]
        den = sum(c['c'] for c in cnt)
        if not src:
            rv_rows.append({'n': nm, 'k': 'none', 'sub': '자료 없음'})
        elif not cnt:
            hint = ' 최근 90일이나 최근 12개월에서 볼 수 있어요.' if k == 'w30' and per in ('7d', '30d') else ''
            rv_rows.append({'n': nm, 'k': 'wip', 'sub': f'신환이 온 뒤 {K[k]}일이 지나야 셀 수 있어요.{hint}'})
        elif den == 0:
            rv_rows.append({'n': nm, 'k': 'none', 'sub': '자료 없음'})
        else:
            num = sum(c[k] for c in cnt)
            excl = len(cnt) < len(src)
            unit = '달' if per == '12m' else '날'
            sub = f'신환 {fc(den)}명 가운데 {fc(num)}명' + (f' · 온 뒤 {K[k]}일이 안 된 {unit}의 신환은 빼고 셌어요' if excl else '')
            if per == '30d' and k == 'w30':
                sub = f"{md(cnt[0]['first'])} – {md(cnt[-1]['last'])}에 온 신환 {fc(den)}명 가운데 {fc(num)}명 · 온 뒤 30일이 지난 가장 최근 신환이에요"
            rv_rows.append({'n': nm, 'k': 'rate', 'v': f'{trunc1(num / den * 100)}%', 'w': round(num / den * 100, 2), 'num': fc(num), 'den': fc(den), 'sub': sub})
    c30 = [c for c in cells30 if c['w30'] is not None]
    first = None
    if c30:
        tot = sum(c['c'] for c in c30)
        items = [('7일 안', sum(c['w7'] for c in c30)), ('8~14일', sum(c['w14'] - c['w7'] for c in c30)),
                 ('15~30일', sum(c['w30'] - c['w14'] for c in c30)), ('30일 넘어 다시 옴', sum(c['a30'] for c in c30)),
                 ('아직 다시 안 옴', sum(c['c'] - c['w30'] - c['a30'] for c in c30))]
        mx = max(n for _, n in items) or 1
        a, b = c30[0]['first'], c30[-1]['last']
        base = (f'{a.year}년 {a.month}월 – {b.year}년 {b.month}월에 온 신환 {fc(tot)}명 기준 (온 뒤 30일이 지난 달만)' if per == '12m'
                else f'{md(a)} – {md(b)}에 온 신환 {fc(tot)}명 기준 (온 뒤 30일이 지난 날만)')
        first = {'base': base, 'total': fc(tot),
                 'items': [{'n': nm, 'v': fc(n), 'pct': f'{trunc1(n / tot * 100) if tot else "0.0"}%', 'w': round(n / mx * 100, 2), 'last': nm == '아직 다시 안 옴'} for nm, n in items],
                 'note': f"'30일 넘어 다시 옴'은 불러온 자료 끝날({md(YDAY)})까지 본 수라, 다시 불러오면 늘 수 있어요."}
    out['rv'] = {'rows': rv_rows, 'first': first,
                 'firstMsg': '신환이 온 뒤 30일이 지나야 날수를 셀 수 있어요.' + (' 최근 90일이나 최근 12개월에서 볼 수 있어요.' if per in ('7d', '30d') else '')} if cells else None
    if out['rv'] and not cells30:   # 최근 30일에서 그 날짜의 자료가 아예 없음: 집계 중이 아니라 자료 없음
        out['rv'].update(firstNone=True, firstMsg='불러온 숫자에 이 기간 자료가 없어요.')

    # 4) 처방 추세 (AC-511.6 · AC-511.8 · AC-513.11)
    def rx_sum(rs):
        acc = {}
        for _, v in rs:
            for code, (a, b) in v['rx'].items():
                x = acc.setdefault(code, [0, 0])
                x[0] += a
                x[1] += b
        return acc
    cur_acc = rx_sum(rows)
    top = sorted(cur_acc, key=lambda c: (-sum(cur_acc[c]), c))[:5]
    grain = GRAIN[per]
    ba, bb = (dt.date(*cur[0], 1), month_end(*cur[-1])) if per == '12m' else cd
    pa, pb = pd
    cbk, pbk = buckets(ba, bb, grain), buckets(pa, pb, grain)

    def comparable(code):
        """끝난 칸끼리의 합: 어느 한쪽이라도 일부 기간인 짝(12개월 = 달, 일 기간 = 표시 칸과 상관없이 날)은 양쪽에서 뺀다. 남은 짝이 없으면 None"""
        g = 'month' if per == '12m' else 'day'
        now = then = kept = 0
        for ck, pk in zip(buckets(ba, bb, g), buckets(pa, pb, g)):
            cn, cr, c_part = point(ck, ba, bb, code, ds)
            pn, pr, p_part = point(pk, pa, pb, code, ds)
            if c_part or p_part:
                continue
            kept += 1
            now += cn + cr
            then += pn + pr
        return (now, then) if kept else None
    cmps = {c: comparable(c) for c in top}
    bar_of = {c: cmps[c][0] if cmps[c] else sum(cur_acc[c]) for c in top}     # 막대 = 끝난 칸 합, 견줄 수 없으면 건수
    mx = max(list(bar_of.values()) + [cmps[c][1] for c in top if cmps[c]] + [1])
    rx_rows = []
    for code in top:
        a, b = cur_acc[code]
        pair = cmps[code]
        pts = []
        for i, bk in enumerate(cbk):
            n, r, part = point(bk, ba, bb, code, ds)
            pv = None
            if i < len(pbk) and covered(pbk[i], pa, pb, ds):
                pn, pr, _ = point(pbk[i], pa, pb, code, ds)
                pv = pn + pr
            lab, long_ = blabel(bk, grain, i, len(cbk))
            pts.append({'l': lab, 't': long_, 'n': n, 'r': r, 'p': part, 'pv': pv})
        rx_rows.append({'code': code, 'name': RXNAME[code], 'cnt': f'{fc(a + b)}건', 'partial': per == '12m' and any(p['p'] for p in pts),
                        'd': compare(*pair, '건') if pair else compare(a + b, None, '건'),
                        'nw': fc(a), 'rt': fc(b), 'w': round(bar_of[code] / mx * 100, 2), 'pw': round(pair[1] / mx * 100, 2) if pair else None,
                        'pts': pts})
    notes = {'day': '하루씩 센 건수예요. 회색 막대는 비교 기간의 같은 차례 날이에요.',
             'week': '주는 월요일–일요일이에요. 기간 처음과 끝에 걸린 주는 일부 기간(빗금)이에요. 회색 막대는 비교 기간의 같은 차례 주예요.',
             'month': f'빗금 칸은 아직 끝나지 않은 달이에요({TODAY.month}월은 {TODAY.day}일까지). 회색 막대는 작년 같은 달이에요.'}
    out['rx'] = {'label': LABEL[per], 'cmpName': CMPNAME[per], 'grain': grain, 'grainName': GRAIN_NAME[grain], 'note': notes[grain],
                 'rows': rx_rows} if rx_rows else None

    # 5) 처방별 신환·재진 (비트 PC에서 불러온 직후만, AC-509.4 · AC-513.7) — 사람 수(명)
    vpp = {'7d': 1.3, '30d': 2.1, '90d': 3.2, '12m': 5.6}[per]
    lines = []
    for code, (a, b) in cur_acc.items():
        nw, rt = int(a * 0.93), int(b / vpp)
        lines.append({'code': code, 'name': RXNAME[code], 'nw': nw, 'rt': rt, 'tot': nw + rt})
    lines.sort(key=lambda x: (-x['tot'], x['code']))
    if lines:
        visits = sum(v['p'] for _, v in rows)
        new_t, ret_t = int(sum(v['n'] for _, v in rows) * 0.97), int(sum(v['r'] for _, v in rows) / vpp)
        head = (f"{LABEL[per]} 내원 {fc(visits)}건, 환자 {fc(new_t + ret_t)}명(신환 {fc(new_t)}명 · 재진 {fc(ret_t)}명)이에요. "
                f"가장 많이 받은 처방은 {lines[0]['name']}({fc(lines[0]['tot'])}명)이에요.")
        txt = f'{CLINIC} 처방별 신환·재진 ({cd[0].isoformat()} ~ {cd[1].isoformat()})\n처방\t신환\t재진\t합계\n' + '\n'.join(
            f"{x['name']}\t{x['nw']}\t{x['rt']}\t{x['tot']}" for x in lines)
        out['split'] = {'head': head, 'text': txt,
                        'lines': [{'name': x['name'], 'nw': fc(x['nw']), 'rt': fc(x['rt']), 'tot': fc(x['tot'])} for x in lines]}
    else:
        out['split'] = None

    # 6) 요일별 환자 수 (AC-511.5, 대시보드 weekdayBuckets 규칙)
    by = {}
    for d, v in rows:
        by.setdefault(d.weekday(), []).append(v)
    wk = [{'l': WD[i], 't': f'{WD[i]}요일', 'v': sum(v['p'] for v in by[i]) // len(by[i]), 'days': len(by[i]), 'p': any(v['part'] for v in by[i])}
          for i in range(7) if i in by]
    wk_note = '자료 있는 요일만 보여요. 일요일은 진료한 날이 없어요.'
    if any(b['p'] for b in wk):
        wk_note += ' 빗금 막대에는 오늘(진료 중) 숫자가 들어 있어요.'
    out['wk'] = {'bars': wk, 'note': wk_note} if wk else None
    return out


SETS = {k: {p: period_data(k, p) for p in ('7d', '30d', '90d', '12m')} for k in SETS_SRC}


# ---------------------------------------------------------------- 원장님 보고 문장 (예시 글 — 실제 줄은 TASK-10 골든, 원본 format_report)
def rx_total(d0, d1, code):
    return sum(sum(DAYS[d]['rx'].get(code, (0, 0))) for d in span(d0, d1) if d in DAYS)


def report_numbers(d0, d1, seed):
    r = random.Random(seed)
    rows = [DAYS[d] for d in span(d0, d1) if d in DAYS]
    visits, new = sum(v['p'] for v in rows), sum(v['n'] for v in rows)
    total = visits * r.randint(36200, 39400) // 10 * 10
    ins = total * 62 // 100 // 10 * 10
    paid = total - ins
    cash, trans = paid * 14 // 100 // 10 * 10, paid * 13 // 100 // 10 * 10
    return dict(visits=visits, new=new, ret=visits - new, total=total, ins=ins, nonc=total * 21 // 100 // 10 * 10,
                cash=cash, card=paid - cash - trans, trans=trans,
                manual=rx_total(d0, d1, 'R05'), eswt=rx_total(d0, d1, 'R07'), carm=int(visits * 0.031), sono=int(visits * 0.072), cryo=rx_total(d0, d1, 'R13'))


def report_lines(kind, title, n, la, unconfirmed):
    L, need = [f'[{CLINIC}] {title}', ''], []
    L.append(f"총환 : {fc(n['visits'])}명 (신환 {fc(n['new'])}명 / 재진 {fc(n['ret'])}명)")
    money = [('총진료비', n['total'])]
    if kind == 'monthly':
        money.append(('건당진료비', n['total'] // max(n['visits'], 1)))
    money += [('조합청구액', n['ins']), ('비급여', n['nonc']), ('현금', n['cash']), ('카드', n['card']), ('계좌이체', n['trans'])]
    for name, v in money:
        if unconfirmed:
            need.append(len(L))
            L.append(f'{name} : 확인 필요')
        else:
            L.append(f'{name} : {fc(v)}원')
    L.append('')
    order = ([('도수', 'manual'), ('충격파', 'eswt'), ('씨암블락', 'carm'), ('쏘노', 'sono'), ('크라이오', 'cryo')] if kind == 'daily'
             else [('충격파', 'eswt'), ('도수', 'manual'), ('쏘노', 'sono'), ('씨암블락', 'carm'), ('크라이오', 'cryo')])
    for name, k in order:
        L.append(f'{name} : {fc(n[k])}건')
    L.append('LA : ' + (', '.join(f'{c} {k}건' for c, k in la) if la else '없음'))
    L += ['', '신환 내원경로 :', '', '고생하셨습니다 !!']
    return L, need


def build_reports():
    oct0, oct1 = dt.date(2026, 10, 1), dt.date(2026, 10, 31)
    nov0 = dt.date(2026, 11, 1)
    t, y = report_numbers(TODAY, TODAY, 1), report_numbers(YDAY, YDAY, 2)
    m, pm = report_numbers(nov0, TODAY, 3), report_numbers(oct0, oct1, 4)
    out = []
    lt, _ = report_lines('daily', f'{mdw(TODAY)} 일일보고', t, [('LA001', 2), ('LA002', 1)], False)
    out.append(dict(key='today', btn='오늘 일일보고', date=f'{md(TODAY)} 금요일 · 18:42까지 불러온 숫자예요(오늘은 진료 중)', lines=lt, need=[],
                    notes=['신환 내원경로는 원본처럼 비워 두었어요. 복사한 뒤 직접 적어 주세요.']))
    ly, ny = report_lines('daily', f'{mdw(YDAY)} 일일보고', y, [('LA001', 3)], True)
    out.append(dict(key='yday', btn='어제 일일보고', date=f'{md(YDAY)} 목요일 · 금액 확인 필요', lines=ly, need=ny,
                    notes=['이날 환불·변경수납 자료가 있어 금액은 "확인 필요"로 두었어요. 비트에서 금액을 확인한 뒤 고쳐 써 주세요. 환자 수와 치료 건수는 그대로 써도 돼요.']))
    lm, _ = report_lines('monthly', f'{TODAY.year}년 {TODAY.month}월 월말보고 ({TODAY.month}월 1일 – {TODAY.day}일)', m, [('LA001', 21), ('LA002', 9), ('LA003', 4)], False)
    out.append(dict(key='month', btn='이번 달 월말보고', date=f'{TODAY.month}월 1일 – {md(TODAY)} · 오늘까지 불러온 숫자예요', lines=lm, need=[], notes=[]))
    lp, _ = report_lines('monthly', '2026년 10월 월말보고', pm, [('LA001', 52), ('LA002', 23), ('LA003', 11)], False)
    out.append(dict(key='prev', btn='지난달 월말보고', date='10월 1일 – 10월 31일', lines=lp, need=[], notes=[]))
    return out


REPORTS = build_reports()


def report_section(uid, mode):
    """mode: main(어제는 금액 확인 필요) · incomplete(어제 벌이 ok: false)"""
    default = 'yday' if mode == 'incomplete' else 'today'
    btns = ''.join(f'<button type="button" data-rep="{r["key"]}" aria-pressed="{"true" if r["key"] == default else "false"}">{r["btn"]}</button>' for r in REPORTS)
    blocks = ''
    for r in REPORTS:
        hid = '' if r['key'] == default else ' hidden'
        if mode == 'incomplete' and r['key'] == 'yday':
            blocks += (f'<div class="rp" data-rp="yday" data-ok="0"{hid}><p class="rp-d">{md(YDAY)} 목요일</p>'
                       '<div class="rp-x"><p class="rp-xt">이 기간은 보고를 확정할 수 없어요</p>'
                       f'<p class="rp-xp">비트 원본 통계에서 {md(YDAY)} 숫자를 확인해 주세요. 이유: 치료와 연결하지 못한 진료 기록이 있어요.</p></div></div>')
            continue
        lines = ''.join(f'<span class="ln{" need" if i in r["need"] else ""}">{H.escape(t) if t else "&#8203;"}</span>' for i, t in enumerate(r['lines']))
        nts = ''.join(f'<li>{H.escape(x)}</li>' for x in r['notes'])
        blocks += (f'<div class="rp" data-rp="{r["key"]}" data-ok="1"{hid}><p class="rp-d">{r["date"]}</p>'
                   f'<div class="rp-t" data-copy>{lines}</div>' + (f'<ul class="rp-n">{nts}</ul>' if nts else '') + '</div>')
    dis = ' aria-disabled="true"' if mode == 'incomplete' else ''
    real = (f'<div data-bitv="1"><div class="rp-bar"><div class="seg rp-seg" role="group" aria-label="보고 고르기">{btns}</div>'
            f'<button type="button" class="btn btn-sec btn-sm cpy" data-act="copy"{dis}>{ic("copy", 14)}<span>복사</span></button></div>{blocks}'
            f'<p class="safe">{ic("shield", 14)}<span>보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.</span></p></div>')
    off = ('<p class="none" data-bitv="0"><b>비트 PC에서 불러오면 보여요</b> · 금액은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.</p>')
    return (f'<div class="ss-h"><h2 class="ss-t">원장님 보고 문장</h2><span class="ss-s">비트 PC에서 불러온 숫자로 만든 보고 글</span></div>'
            f'{real}{off}')


# ---------------------------------------------------------------- 통계 화면 몸
STATES = ['empty', 'loading', 'loading0', 'loaded', 'reading', 'readfail', 'savefail', 'incomplete', 'phone']
LOADED = 'loaded loading savefail incomplete phone'
SECS = [('sum', '기간 요약', 'c12'), ('trend', '환자 수 추이', 'c8'), ('rv', '신환 재방문율', 'c4 side'), ('rx', '처방 추세', 'c7'),
        ('split', '처방별 신환·재진', 'c5 side'), ('rep', '원장님 보고 문장', 'c7'), ('wk', '요일별 환자 수', 'c5 side')]
EMPTY_TXT = {
    'sum': '숫자를 불러오면 이 기간의 평균 환자 수와 신환·재진이 보여요.',
    'trend': '불러오면 이 기간의 하루하루가 신환·재진 막대로 그려져요.',
    'rv': '불러오면 처음 온 환자가 7·14·30일 안에 다시 온 비율이 보여요.',
    'rx': '불러오면 많이 낸 처방 5가지와 그 흐름이 보여요.',
    'wk': '불러오면 요일마다 하루 평균 환자 수가 보여요.',
}
BIT_ONLY = {'split': '진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.',
            'rep': '금액은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'}


def static_grid(show, kind):
    out = ''
    for k, t, cls in SECS:
        if kind == 'wait':
            body = f'<p class="wait">{ic("clock", 14)}불러오는 중</p>'
        elif k in BIT_ONLY:
            body = f'<p class="none"><b>비트 PC에서 불러오면 보여요</b> · {BIT_ONLY[k]}</p>'
        else:
            body = f'<p class="none"><b>자료 없음</b> · {EMPTY_TXT[k]}</p>'
        out += f'<section class="ss {cls}"><div class="ss-h"><h2 class="ss-t">{t}</h2></div>{body}</section>'
    return f'<div class="sg" data-show="{show}">{out}</div>'


def loaded_grid(uid, rep_mode):
    out = ''
    for k, _t, cls in SECS:
        if k == 'rep':
            out += f'<section class="ss {cls}">{report_section(uid, rep_mode)}</section>'
        else:
            out += f'<section class="ss {cls}" data-slot="{k}"></section>'
    return f'<div class="sg" data-show="{LOADED}">{out}</div>'


def source_picker(src):
    file_part = (f'<div class="src-f"><button type="button" class="btn btn-sec" data-act="file">{ic("upload")}파일 고르기</button>'
                 '<span class="src-h2">또는 비트에서 내보낸 파일을 여기에 끌어다 놓아요</span>'
                 '<p class="src-h" data-filemsg hidden>시안에서는 파일을 열지 않아요. 실제 화면은 파일을 이 PC 안에서 읽고 숫자만 저장해요.</p></div>')
    if src == 'bit':
        bit = (f'<div class="src-b"><button type="button" class="btn btn-pri" data-act="load">{ic("monitor")}<span class="lbl">비트에서 불러오기</span></button>'
               '<label class="ck"><input type="checkbox" data-act="tdone">오늘 진료 끝</label>'
               f'<p class="src-h" data-tf="off">꺼 두면 오늘({md(TODAY)})은 진료 중이라, 어제까지만 끝난 날로 저장해요.</p>'
               f'<p class="src-h" data-tf="on" hidden>켜고 불러오면 오늘({md(TODAY)}) 숫자도 끝난 날로 저장해요. 진료가 다 끝난 뒤에 켜 주세요.</p></div>')
    elif src == 'nohelper':
        bit = ('<div class="src-b"><p class="src-m"><b>이 PC에서는 아직 비트에서 불러올 수 없어요</b>'
               '<span>도우미 프로그램이 없어요. 비트 PC 연결 화면에서 설치하면 [비트에서 불러오기]가 생겨요.</span></p>'
               f'<a href="#" class="btn btn-sec">비트 PC 연결{GO}</a></div>')
    else:  # noext: 휴대폰·확장 없는 브라우저
        bit = ('<div class="src-b"><p class="src-m"><b>비트 PC의 크롬에서 불러올 수 있어요</b>'
               '<span>이 기기에서는 저장된 숫자만 보여요. 처방별 신환·재진과 보고 문장은 비트 PC에서 볼 수 있어요.</span></p></div>')
    return (f'<div class="src">{bit}{file_part}</div>'
            f'<p class="ldl" data-show="loading loading0">{ic("clock")}<span>비트 PC에서 읽는 중이에요. 기간이 길면 1분쯤 걸려요.</span></p>')


def cards():
    save = (f'<div class="errc" data-show="savefail">{ic("stop")}<div><p class="errc-w">통계 숫자를 저장하지 못했어요</p>'
            '<p class="errc-f">인터넷 연결을 확인하고 [다시 저장]을 눌러 주세요. 방금 불러온 숫자는 화면에 그대로 있어요.</p>'
            '<p class="errc-c">오류 번호 E-STATS-SAVE-FAILED</p>'
            '<div class="errc-a"><button type="button" class="btn btn-sec btn-sm" data-act="resave"><span class="lbl">다시 저장</span></button></div></div></div>')
    read = (f'<div class="errc" data-show="readfail">{ic("stop")}<div><p class="errc-w">저장된 통계를 읽지 못했어요</p>'
            '<p class="errc-f">잠시 뒤 [다시 읽기]를 눌러 주세요. 계속되면 오류 번호를 관리자에게 알려 주세요.</p>'
            '<p class="errc-c">오류 번호 E-STATS-READ-FAILED</p>'
            '<div class="errc-a"><button type="button" class="btn btn-sec btn-sm" data-act="reread">다시 읽기</button></div></div></div>')
    inc = (f'<div class="warnc" data-show="incomplete">{ic("stop")}<div><p class="warnc-w">일부 기록을 확인하지 못해 저장하지 않았어요</p>'
           '<p class="errc-f">차트번호 없는 내원 3건 · 중복 내원 1건 · 첫 내원을 못 찾은 환자 2명이 있어요. 비트에서 이 기록을 고친 뒤 다시 불러와 주세요.</p>'
           f'<p class="errc-f">아래 그래프는 전에 저장한 숫자({md(YDAY)} 18:30 저장)예요. 처방별 신환·재진과 보고 문장은 방금 불러온 숫자예요.</p></div></div>')
    empty = ('<div class="emp" data-show="empty loading0"><p class="emp-t">아직 저장된 통계가 없어요</p>'
             '<p class="emp-p">비트 PC에서 [비트에서 불러오기]를 누르거나, 비트에서 내보낸 파일을 넣으면 숫자가 채워져요. 한 번 저장하면 휴대폰에서도 볼 수 있어요.</p></div>')
    return save + read + inc + empty


def period_head(per):
    btns = ''.join(f'<button type="button" data-per="{p}" aria-pressed="{"true" if p == per else "false"}">{LABEL[p]}</button>' for p in ('7d', '30d', '90d', '12m'))
    srcl = (f'<p class="srcl" data-show="loaded loading phone"><span data-srcl>자료: 비트 PC · {md(TODAY)} 18:42 저장</span>'
            f'<span class="muted" data-cov> · 어제({md(YDAY)})까지 끝난 날로 저장했어요</span></p>'
            '<p class="srcl" data-show="savefail">자료: 비트 PC · 방금 불러옴 <span class="muted">· 아직 저장하지 못했어요</span></p>'
            f'<p class="srcl" data-show="incomplete">자료: 비트 PC · {md(YDAY)} 18:30 저장 <span class="muted">· 방금 불러온 숫자는 저장하지 않았어요</span></p>'
            '<p class="srcl" data-show="empty loading0">자료: <span class="muted">아직 저장된 숫자가 없어요</span></p>')
    return (f'<div class="ph"><div class="seg" role="group" aria-label="기간">{btns}</div><div class="rngs" data-slot="range"></div></div>{srcl}')


def stats_body(uid, src, rep_mode, per):
    head = '<div class="pg"><div class="pg-l"><h1 class="pg-t">통계</h1><span class="chip chip-a">예시 숫자</span></div></div>'
    safe = f'<p class="safe">{ic("shield", 14)}<span>환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.</span></p>'
    return (head + source_picker(src) + safe + cards() + period_head(per)
            + loaded_grid(uid, rep_mode) + static_grid('empty loading0', 'empty') + static_grid('reading', 'wait'))


UID = [0]


def app(kind, st, src='bit', ds='main', per='30d', bit=True, opens='', rep='main'):
    UID[0] += 1
    uid = f'u{UID[0]}'
    attrs = (f' data-stats data-uid="{uid}" data-ds="{ds}" data-per="{per}" data-st="{st}" data-bit="{1 if bit else 0}"'
             + (f' data-open="{opens}"' if opens else ''))
    return shell(kind, stats_body(uid, src, rep, per), attrs)


# ---------------------------------------------------------------- 시안 쪽 (설명·고르기)
TITLE = f'통계 · {CLINIC}'


def pick(group, label, opts, cur):
    b = ''.join(f'<button type="button" data-v="{v}" aria-pressed="{"true" if v == cur else "false"}">{t}</button>' for v, t in opts)
    return f'<div class="pick"><span class="pick-l">{label}</span><div class="pseg" role="group" aria-label="{label}" data-pick="{group}">{b}</div></div>'


def pane(group, v, inner, cur):
    return f'<div data-pane-of="{group}" data-pane="{v}"{"" if v == cur else " hidden"}>{inner}</div>'


def tips(items, title='눌러 볼 것'):
    li = ''.join(f'<li><span>{x}</span></li>' for x in items)
    return f'<div class="notes"><div class="nb"><h3>{title}</h3><ul>{li}</ul></div></div>'


def screen(id_, k, title, lead, body, tip):
    hid = '' if id_ == 's1' else ' hidden'
    return (f'<section class="sec" id="{id_}" data-pane-of="scr" data-pane="{id_}"{hid}><p class="sec-k">{k}</p><h2>{title}</h2>'
            f'<p class="sec-p">{lead}</p>{body}{tip}</section>')


CAP_PC = '기간 단추·[자세히]·처방 줄·보고 고르기·[복사]·[비트에서 불러오기]를 눌러 보세요'
S = []
# 화면 1 · PC 불러온 뒤 (1440 · 1024 · 768)
w1 = pick('w1', '화면 폭', [('1440', 'PC 1440'), ('1024', '작은 PC 1024'), ('768', '태블릿 768')], '1440')
w1 += pane('w1', '1440', frame('pc', app('pc', 'loaded'), 1440, 900, f'<b>PC 1440</b> · {CAP_PC}', '화면 1 · PC 1440', TITLE, 'full'), '1440')
w1 += pane('w1', '1024', frame('pc', app('pc', 'loaded'), 1024, 860, f'<b>작은 PC 1024</b> · 두 칸 짜임은 그대로예요', '화면 1 · 1024', TITLE, 'full'), '1440')
w1 += pane('w1', '768', frame('pc', app('tab', 'loaded'), 768, 900, '<b>태블릿 768</b> · 섹션이 한 줄씩 쌓여요', '화면 1 · 768', TITLE, 'full'), '1440')
S.append(screen('s1', '화면 1', 'PC · 비트에서 불러온 뒤',
                '비트 PC에서 숫자를 불러와 저장한 다음 모습이에요. 위에서부터 기간 요약 → 환자 수 추이 → 신환 재방문율 → 처방 추세 → 처방별 신환·재진 → 원장님 보고 문장 → 요일별 환자 수가 한 쪽에 이어져요. 처음 기간은 최근 30일이에요.',
                w1, tips(['<b>기간 단추</b>(최근 7일·30일·90일·12개월)를 누르면 기간 글자와 모든 섹션 숫자가 그 기간으로 바뀌어요. 12개월은 달마다 칸이고, 이번 달(11월)은 빗금 "일부 기간"이에요.',
                          '그래프 옆 <b>[자세히]</b>를 누르면 그래프 바로 아래에 숫자 표가 열리고, 다시 누르면 닫혀요.',
                          '<b>처방 추세의 줄</b>을 누르면 그 처방의 칸별 건수(신환·재진)가 열려요. 칸은 7·30일 = 하루, 90일 = 주, 12개월 = 달이에요.',
                          '<b>보고 고르기</b>(오늘·어제 일일보고, 이번 달·지난달 월말보고)를 눌러 보세요. 어제는 금액 줄이 "확인 필요"로 표시돼요. <b>[복사]</b>를 누르면 2초 동안 "복사했어요"가 보여요.',
                          '<b>[비트에서 불러오기]</b>를 누르면 단추가 막히고 "불러오는 중"이 보였다가, 새 저장 시각으로 바뀌어요. "오늘 진료 끝"을 켜고 누르면 오늘도 끝난 날로 저장했다고 나와요.',
                          '최근 30일의 "30일 안에 다시 옴"과 첫 재방문까지 날수는 <b>온 뒤 30일이 지난 가장 최근 신환</b>(9월 14일 – 10월 13일)으로 세고 그 날짜를 적어요. 7·14일 줄은 고른 기간 그대로예요. 최근 7일은 셋 다 <b>집계 중</b>이에요.',
                          '<b>최근 12개월의 처방 줄</b>: 건수에는 11월까지 넣고 옆에 <b>일부 기간</b>을 붙여요. 증감과 막대·회색 눈금은 끝난 달끼리만 견줘요(11월과 작년 11월을 빼요).'])))

# 화면 2 · PC 처음 (저장된 숫자 없음)
w2 = pick('w2', '이 PC 상태', [('bit', '비트 PC 연결됨'), ('nohelper', '도우미가 없음')], 'bit')
w2 += pane('w2', 'bit', frame('pc', app('pc', 'empty', bit=False), 1440, 860, '<b>PC 1440 · 처음</b> · [비트에서 불러오기]를 눌러 보세요', '화면 2 · 처음', TITLE, 'full'), 'bit')
w2 += pane('w2', 'nohelper', frame('pc', app('pc', 'empty', src='nohelper', bit=False), 1440, 860, '<b>PC 1440 · 도우미가 없는 PC</b>', '화면 2 · 도우미 없음', TITLE, 'full'), 'bit')
S.append(screen('s2', '화면 2', 'PC · 처음 (저장된 숫자가 없을 때)',
                '아직 한 번도 불러오지 않은 의원이에요. 지어낸 숫자나 빈 그래프 틀 없이 섹션마다 "자료 없음"과 한 줄 안내만 있어요.',
                w2, tips(['<b>[비트에서 불러오기]</b>를 누르면 "불러오는 중"이 보였다가 화면 1처럼 숫자가 채워져요. 처방별 신환·재진과 보고 문장도 이때 생겨요.',
                          '<b>도우미가 없음</b>을 고르면 [비트에서 불러오기] 대신 "이 PC에서는 아직 비트에서 불러올 수 없어요"와 [비트 PC 연결]이 보여요. 파일 넣기는 그대로 쓸 수 있어요.',
                          '<b>[파일 고르기]</b>는 시안에서 파일을 열지 않고 안내만 보여요.'])))

# 화면 3 · 휴대폰
w3 = '<div class="row">' + frame('ph', app('ph', 'phone', src='noext', bit=False), 390, 780, '<b>휴대폰 390</b> · 기간 단추와 [자세히]를 눌러 보세요', '화면 3 · 휴대폰') + '</div>'
S.append(screen('s3', '화면 3', '휴대폰 · 저장된 숫자만',
                '휴대폰에서는 서버에 저장된 숫자만 읽어 그려요. 섹션은 세로로 쌓이고 기간 단추는 44px 높이예요. 처방별 신환·재진과 원장님 보고 문장은 진료 줄·금액이 필요해 "비트 PC에서 불러오면 보여요"로 바뀌어요.',
                w3, tips(['맨 위 자료 고르기 자리에 "비트 PC의 크롬에서 불러올 수 있어요"가 보여요(확장이 없는 브라우저도 같아요).',
                          '<b>기간 단추</b>·<b>[자세히]</b>·<b>처방 줄</b>은 PC와 똑같이 눌러요.',
                          '위쪽 <b>[전체 메뉴]</b>에서 통계는 "준비 중" 없이 보여요.'])))

# 화면 4 · 그래프 자세히 열림
w4 = frame('pc', app('pc', 'loaded', opens='trend,rx:R05'), 1440, 960, '<b>PC 1440</b> · 환자 수 추이 [자세히]와 처방 줄 하나가 열린 모습', '화면 4 · 자세히 열림', TITLE, 'full')
S.append(screen('s4', '화면 4', '그래프 자세히 열림',
                '환자 수 추이의 [자세히]를 눌러 날짜마다 신환·재진·합계 표가 열렸고, 처방 추세에서 "도수치료 30분" 줄을 눌러 그 처방의 하루별 건수(신환·재진)와 지난 30일 같은 차례 날(회색)이 열린 모습이에요. 주소는 바뀌지 않아요.',
                f'<div class="row">{w4}</div>',
                tips(['열린 [자세히]를 다시 누르면 닫혀요. 버튼 글자가 "자세히" ↔ "접기"로 바뀌어요.',
                      '처방 줄 안의 [자세히]를 누르면 그 처방의 칸마다 건수·신환·재진·비교 기간 건수 표가 열려요.',
                      '기간을 최근 90일로 바꾸면 처방 칸이 주(월~일)로, 12개월로 바꾸면 달로 바뀌어요.'])))

# 화면 5 · 불러오는 중 · 저장 실패 · 확인 필요 · 읽기 실패 · 12개월 이번 달만
O5 = [('reading', '처음 여는 중'), ('loading', '비트에서 불러오는 중'), ('savefail', '저장 실패'), ('incomplete', '확인 필요'),
      ('readfail', '읽기 실패'), ('cur12', '12개월 · 이번 달만 있음')]
w5 = pick('w5', '상태', O5, 'reading')
w5 += pane('w5', 'reading', frame('pc', app('pc', 'reading'), 1440, 720, '<b>저장된 숫자를 읽는 동안</b> · 섹션 자리는 "불러오는 중"', '화면 5 · 읽는 중', TITLE, 'full'), 'reading')
w5 += pane('w5', 'loading', frame('pc', app('pc', 'loading'), 1440, 720, '<b>비트에서 불러오는 동안</b> · 단추가 막히고 지금 숫자는 그대로', '화면 5 · 불러오는 중', TITLE, 'full'), 'reading')
w5 += pane('w5', 'savefail', frame('pc', app('pc', 'savefail'), 1440, 720, '<b>저장 실패</b> · [다시 저장]을 눌러 보세요', '화면 5 · 저장 실패', TITLE, 'full'), 'reading')
w5 += pane('w5', 'incomplete', frame('pc', app('pc', 'incomplete', rep='incomplete'), 1440, 900, '<b>확인 필요(일부 기록)</b> · 저장하지 않고 확인 건수를 보여요', '화면 5 · 확인 필요', TITLE, 'full'), 'reading')
w5 += pane('w5', 'readfail', frame('pc', app('pc', 'readfail'), 1440, 560, '<b>읽기 실패</b> · [다시 읽기]를 눌러 보세요', '화면 5 · 읽기 실패', TITLE, 'full'), 'reading')
w5 += pane('w5', 'cur12', frame('pc', app('pc', 'loaded', ds='cur', per='12m'), 1440, 900, '<b>12개월 보기 · 이번 달(11월) 숫자만 있을 때</b> · 평균 칸은 "자료 없음"', '화면 5 · 12개월 이번 달만', TITLE, 'full'), 'reading')
S.append(screen('s5', '화면 5', '불러오는 중 · 저장 실패 · 확인 필요',
                '평소에는 안 보이다가 그때만 나타나는 상태들이에요. 위 단추로 골라 보세요.',
                w5, tips(['<b>처음 여는 중</b>: 저장된 숫자를 읽는 동안 섹션마다 "불러오는 중"이에요.',
                          '<b>비트에서 불러오는 중</b>: [비트에서 불러오기]가 막히고 "비트 PC에서 읽는 중이에요"가 보여요. 지금 있는 숫자는 그대로 둬요.',
                          '<b>저장 실패</b>: 빨간 오류 카드(E-STATS-SAVE-FAILED)와 [다시 저장]이에요. 방금 불러온 숫자는 화면에 그대로 있어요. [다시 저장]을 누르면 같은 숫자를 다시 보내요.',
                          '<b>확인 필요</b>: 차트번호 없는 내원 같은 기록이 있으면 저장하지 않고 건수를 보여요. 어제 일일보고처럼 확정할 수 없는 보고는 "이 기간은 보고를 확정할 수 없어요"로 바뀌어요.',
                          '<b>읽기 실패</b>: 오류 카드(E-STATS-READ-FAILED)와 [다시 읽기]예요.',
                          '<b>12개월 · 이번 달만</b>: 끝나지 않은 이번 달 숫자만 있으면 평균 칸은 "자료 없음"이에요(덜 끝난 달은 평균과 견주기에서 빼는 규칙). 신환·재진 합계에는 "일부 기간"이 붙어요. 처방 줄은 회색 눈금 없이 막대만 있고 증감은 <b>비교할 수 없음</b>이에요.'])))

DECIDE = ('<section class="sec" id="decide"><div class="decide"><p class="sec-k">정해 주실 것</p><h2>이대로 만들어도 될까요?</h2><ol>'
          '<li><div><p class="q">처방별 신환·재진과 원장님 보고 문장은 비트 PC에서 불러온 화면에서만</p><p class="a">진료 줄과 금액은 서버에 저장하지 않아서, 휴대폰에서는 "비트 PC에서 불러오면 보여요"로 보여요.</p></div></li>'
          '<li><div><p class="q">처방 추세는 건수만</p><p class="a">처방별 금액·소모량은 매출 탭에서 보도록 "금액·소모량은 매출 탭에서 볼 수 있어요"라고 적어 둬요.</p></div></li>'
          '<li><div><p class="q">"오늘 진료 끝"은 직접 켜기</p><p class="a">켜고 불러오면 오늘 숫자를 끝난 날로 저장해요. 꺼 두면 어제까지만 끝난 날이에요.</p></div></li>'
          '<li><div><p class="q">보고 고르기 넷: 오늘·어제 일일보고, 이번 달·지난달 월말보고</p><p class="a">보고 글의 줄은 지금 쓰시는 일일·월말 보고 양식 그대로 옮겨요. 시안의 보고 글은 모양만 보여 드리는 예시예요.</p></div></li>'
          '<li><div><p class="q">기간 단추 넷: 최근 7일 · 30일(처음) · 90일 · 12개월</p><p class="a">최근 30일의 "30일 안에 다시 옴"은 온 뒤 30일이 지난 가장 최근 신환(9월 14일 – 10월 13일)으로 세어 그 날짜와 함께 보여 줘요. 최근 7일은 셋 다 "집계 중"이에요.</p></div></li>'
          '<li><div><p class="q">최근 12개월의 처방 증감은 끝난 달끼리만</p><p class="a">11월과 작년 11월을 빼고 견줘요. 건수 글자에는 11월까지 넣고 옆에 "일부 기간"을 붙여요. 견줄 달이 없으면 "비교할 수 없음"이에요.</p></div></li></ol>'
          '<p class="reply">이렇게 답해 주시면 돼요: <b>통계 목업 좋아요</b> (고칠 곳이 있으면 화면 번호와 함께 말씀해 주세요)</p></div></section>')

NAV = [('s1', '1 PC · 불러온 뒤'), ('s2', '2 PC · 처음'), ('s3', '3 휴대폰'), ('s4', '4 그래프 자세히'), ('s5', '5 불러오는 중·저장 실패·확인 필요')]
nav = ''.join(f'<button type="button" data-v="{i}" aria-pressed="{"true" if i == "s1" else "false"}">{n}</button>' for i, n in NAV)

# ---------------------------------------------------------------- css (ui-90 css 뒤에 더하는 통계 몫)
STATS_CSS = '''
:root { --chart-1: #DBE7FD; --chart-2: #B4CDFA; --chart-3: #8DB0F4; --chart-4: #2563EB; --chart-5: #1D4ED8; --chart-prev: #9CA3AF; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.chip-w { background: var(--warning-soft); color: var(--warning); }
/* page: example band, pickers */
.exb { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-top: 20px; padding: 10px 12px; background: var(--accent-soft); border-radius: var(--r-control); font-size: 14px; line-height: 22px; color: var(--ink-2); max-width: 860px; }
.exb b { font-weight: 600; color: var(--ink); }
.exb > span:last-child { flex: 1 1 320px; min-width: 0; }
.secnav button { position: relative; flex: none; display: inline-flex; align-items: center; height: 44px; padding: 0 12px; border: 0; background: none; font-size: 14px; font-weight: 500; color: var(--ink-2); white-space: nowrap; cursor: pointer; transition: color 150ms; }
.secnav button:hover { color: var(--ink); }
.secnav button[aria-pressed=true] { color: var(--ink); font-weight: 600; }
.secnav button[aria-pressed=true]::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 2px; background: var(--accent); }
.secnav .ex { margin-left: auto; align-self: center; }
.pick { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-top: 20px; }
.pick-l { font-size: 13px; line-height: 20px; font-weight: 600; color: var(--muted); }
.pseg { display: inline-flex; flex-wrap: wrap; border: 1px solid var(--line-strong); border-radius: var(--r-control); overflow: hidden; }
.pseg button { height: 36px; padding: 0 14px; border: 0; background: var(--surface); font-size: 14px; font-weight: 500; color: var(--ink-2); cursor: pointer; transition: background-color 150ms; }
.pseg button + button { border-left: 1px solid var(--line-strong); }
.pseg button:hover { background: var(--canvas); }
.pseg button[aria-pressed=true] { background: var(--accent-soft); color: var(--accent-strong); font-weight: 600; }
[data-pane-of] > .fig { margin-top: 16px; }
/* app: stats screen */
.pg { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.pg-l { display: flex; align-items: center; gap: 8px; }
.pg-t { font-size: 20px; line-height: 28px; font-weight: 600; }
.src { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px 32px; margin-top: 16px; padding: 16px 20px; background: var(--canvas); border-radius: var(--r-control); }
.src-b { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; flex: 1 1 420px; min-width: 0; }
.src-f { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; flex: 1 1 320px; min-width: 0; padding-left: 32px; border-left: 1px solid var(--line-strong); }
.src-h { flex-basis: 100%; font-size: 13px; line-height: 20px; color: var(--ink-2); }
.src-h2 { font-size: 13px; line-height: 20px; color: var(--ink-2); }
.src-m { flex: 1 1 280px; display: grid; gap: 2px; color: var(--ink-2); font-size: 13px; line-height: 20px; }
.src-m b { font-size: 14px; line-height: 22px; font-weight: 600; color: var(--ink); }
.ck { display: inline-flex; align-items: center; gap: 8px; min-height: 36px; font-weight: 500; cursor: pointer; }
.ck input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); cursor: pointer; }
.is-ph .src { flex-direction: column; gap: 12px; padding: 12px 16px; }
.is-ph .src-b, .is-ph .src-f { flex: none; width: 100%; }
.is-ph .src-f { padding: 12px 0 0; border-left: 0; border-top: 1px solid var(--line-strong); }
.is-ph .src-f .btn { width: 100%; }
.is-ph .ck { min-height: 44px; }
.ldl { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 14px; line-height: 22px; color: var(--ink-2); }
.ldl .ic { color: var(--accent); }
.ui .btn[aria-disabled=true] { background: var(--line); border-color: var(--line); color: var(--muted); cursor: default; }
.ui .btn[aria-disabled=true] .ic { color: var(--muted); }
.ui .safe .ic { color: var(--positive); }
.ui .errc, .ui .warnc { margin-top: 16px; }
.warnc { display: grid; grid-template-columns: 16px minmax(0, 1fr); column-gap: 10px; padding: 12px 16px; background: var(--warning-soft); border-radius: var(--r-control); }
.warnc .ic { color: var(--warning); margin-top: 3px; }
.warnc-w { font-size: 14px; line-height: 22px; font-weight: 600; color: var(--warning); }
.warnc .errc-f + .errc-f { margin-top: 4px; }
.emp { margin-top: 24px; }
.emp-t { font-size: 20px; line-height: 28px; font-weight: 600; }
.emp-p { margin-top: 4px; color: var(--ink-2); max-width: 44em; }
.ph { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--line-strong); }
.is-ph .ph { flex-direction: column; align-items: stretch; }
.rngs { display: flex; flex-wrap: wrap; gap: 0 12px; font-size: 13px; line-height: 20px; color: var(--muted); }
.rngs b { font-weight: 600; color: var(--ink); }
.srcl { margin-top: 8px; font-size: 13px; line-height: 20px; color: var(--ink-2); }
/* sections */
.sg { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 24px; }
.ss { grid-column: span 12; min-width: 0; margin-top: 40px; padding-top: 20px; border-top: 1px solid var(--line-strong); }
.c8 { grid-column: span 8; } .c4 { grid-column: span 4; } .c7 { grid-column: span 7; } .c5 { grid-column: span 5; }
.ss.side { padding-left: 24px; border-left: 1px solid var(--line); }
.is-mid .ss, .is-ph .ss { grid-column: span 12; }
.is-mid .ss.side, .is-ph .ss.side { padding-left: 0; border-left: 0; }
.is-ph .sg { display: block; }
.is-ph .ss { margin-top: 32px; padding-top: 16px; }
.ss-h { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; min-height: 32px; }
.ss-t { font-size: 20px; line-height: 28px; font-weight: 600; }
.ss-s { font-size: 13px; line-height: 20px; color: var(--muted); }
.ss-a { margin-left: auto; }
.ui .dtb { min-height: 32px; font-size: 14px; }
.is-ph .ui .dtb, .ui.is-ph .dtb { min-height: 44px; }
.dtb .ic { transition: transform 150ms; }
.dtb[aria-expanded=true] .ic { transform: rotate(180deg); }
.none { margin-top: 12px; color: var(--ink-2); }
.none b { font-weight: 600; color: var(--ink); }
.wait { display: flex; align-items: center; gap: 6px; margin-top: 12px; color: var(--muted); }
.d-note { margin-top: 12px; font-size: 13px; line-height: 20px; color: var(--muted); max-width: 52em; }
/* kpi */
.st-k { margin-top: 8px; }
.st-k .kpi-v { color: var(--ink); }
.st-k .kpi-v.no { color: var(--muted); }
.st-k .kpi-s .chip { margin-left: 6px; vertical-align: 1px; }
.dl { display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 0 6px; color: var(--muted); }
.dl.up { color: var(--positive); } .dl.down { color: var(--negative); }
.dl .w { font-size: 13px; line-height: 20px; font-weight: 500; }
.dl .nw { white-space: nowrap; }
.is-ph .ch.many .tt:not(.last) { visibility: hidden; }
.kpi-v .dl { font-weight: 600; }
/* charts (components/charts 모양을 흉내) */
.lg { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 12px; line-height: 16px; color: var(--ink-2); }
.lg span { display: inline-flex; align-items: center; gap: 6px; }
.lg i { position: relative; display: inline-block; width: 8px; height: 8px; overflow: hidden; }
.lg .n { background: var(--accent); } .lg .r { background: var(--chart-3); } .lg .p { background: var(--faint); }
.lg .h { border: 1px solid var(--accent); color: var(--accent); }
.ch { margin-top: 8px; }
.ch-u { display: block; font-size: 12px; line-height: 16px; color: var(--muted); }
.ch-a { position: relative; height: var(--h); margin: 24px 0 0 36px; }
.is-ph .ch-a { height: var(--hp); }
.ch-g { position: absolute; left: -36px; right: 0; border-top: 1px solid var(--line); }
.ch-g.z { border-color: var(--line-strong); }
.ch-g span { position: absolute; left: 0; top: -8px; width: 30px; text-align: right; font-size: 12px; line-height: 16px; color: var(--muted); }
.ch-c { position: absolute; inset: 0; display: flex; align-items: flex-end; }
.col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px; }
.stk { display: flex; flex-direction: column; justify-content: flex-end; align-items: center; height: 100%; width: 50%; max-width: 40px; min-width: 1px; }
.col.two .stk { width: 40%; max-width: 28px; }
.pv { flex: none; width: 18%; max-width: 10px; background: var(--faint); }
.bar { display: flex; flex-direction: column; gap: 2px; width: 100%; min-height: 1px; }
.bar i { display: block; flex-basis: 0; min-height: 1px; }
.bn { background: var(--accent); } .br { background: var(--chart-3); }
.bar.part { position: relative; overflow: hidden; border: 1px solid var(--accent); color: var(--accent); background: var(--surface); }
.hatch { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.tt { margin-bottom: 4px; font-size: 12px; line-height: 16px; color: var(--ink-2); white-space: nowrap; }
.tt.last { color: var(--ink); font-weight: 600; }
.ch-x { display: flex; margin: 6px 0 0 36px; }
.ch-x span { flex: 1 1 0; min-width: 0; display: flex; justify-content: center; font-size: 12px; line-height: 16px; color: var(--muted); white-space: nowrap; }
.ch-n { margin-top: 8px; font-size: 13px; line-height: 20px; color: var(--muted); }
/* 숫자 표 ([자세히]) */
.dtw { margin-top: 16px; max-height: 336px; overflow: auto; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.dt { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 20px; }
.dt th { position: sticky; top: 0; height: 36px; padding: 0 12px; background: var(--surface); text-align: left; font-weight: 500; color: var(--muted); border-bottom: 1px solid var(--line); white-space: nowrap; }
.dt td { height: 36px; padding: 0 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.dt tr:last-child td { border-bottom: 0; }
.dt .n { text-align: right; }
.dt th:first-child, .dt td:first-child { padding-left: 0; }
.dt td b { font-weight: 600; }
.dt .chip { margin-left: 6px; }
/* InlineBar */
.ib { position: relative; display: block; height: 8px; background: var(--canvas); border: 1px solid var(--line); }
.ib i { position: absolute; left: -1px; top: -1px; bottom: -1px; background: var(--accent); }
.ib b { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--faint); }
/* 재방문율 */
.rv { margin-top: 8px; }
.rv li { padding: 12px 0; border-top: 1px solid var(--line); }
.rv-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.rv-n { color: var(--ink-2); }
.rv-v { font-size: 16px; line-height: 24px; font-weight: 600; white-space: nowrap; }
.rv-v.no { color: var(--muted); }
.rv .ib { margin-top: 6px; }
.rv-s { margin-top: 4px; font-size: 12px; line-height: 16px; color: var(--muted); }
.h3 { margin-top: 20px; font-size: 16px; line-height: 24px; font-weight: 600; }
.rk { margin-top: 8px; }
.rk li { display: grid; grid-template-columns: 112px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 36px; border-top: 1px solid var(--line); }
.rk-n { font-size: 13px; line-height: 20px; color: var(--ink-2); }
.rk-b i { display: block; height: 10px; background: var(--accent); }
.rk li.last .rk-b i { background: var(--line-strong); }
.rk-v { font-size: 13px; line-height: 20px; white-space: nowrap; }
.rk-v b { font-weight: 600; }
.rk-v span { margin-left: 4px; color: var(--muted); }
/* 처방 추세 */
.rxh, .ui .rxr { display: grid; grid-template-columns: minmax(0, 1fr) 84px 176px 132px 16px; gap: 12px; align-items: center; }
.rxh { height: 36px; margin-top: 8px; border-bottom: 1px solid var(--line); font-size: 13px; line-height: 20px; font-weight: 500; color: var(--muted); }
.rxh .n { text-align: right; }
.ui .rxr { width: 100%; padding: 12px 0; border-bottom: 1px solid var(--line); transition: background-color 150ms; }
.ui .rxr:hover { background: var(--canvas); }
.rx-nm { min-width: 0; }
.rx-t { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rx-nm .ib { margin-top: 6px; }
.rx-c { text-align: right; font-weight: 600; white-space: nowrap; }
.rx-d { font-size: 13px; line-height: 20px; font-weight: 600; }
.rx-s { font-size: 13px; line-height: 20px; color: var(--ink-2); white-space: nowrap; }
.rxr > .ic { color: var(--muted); transition: transform 150ms; }
.rxr[aria-expanded=true] > .ic { transform: rotate(180deg); }
.rxd { padding: 16px; background: var(--canvas); border-bottom: 1px solid var(--line); }
.rxd .ch-g span, .rxd .dt th { background: var(--canvas); }
.rxd-h { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px 12px; }
.rxd-t { font-weight: 600; }
.rxd .lg { margin-top: 0; }
.rx-note { margin-top: 12px; font-size: 13px; line-height: 20px; color: var(--muted); }
.rx-money { margin-top: 4px; font-size: 13px; line-height: 20px; color: var(--ink-2); }
.is-mid .rxh, .is-mid .ui .rxr, .ui.is-mid .rxr { grid-template-columns: minmax(0, 1fr) 84px 176px 132px 16px; }
.rxh.has-part, .ui .rxl.has-part .rxr { grid-template-columns: minmax(96px, 1fr) minmax(84px, 140px) 176px 132px 16px; }
.ui .rxl.has-part .rx-c { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 2px 6px; }
.is-ph .rxh { display: none; }
.ui.is-ph .rxr, .ui.is-ph .rxl.has-part .rxr { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; }
.ui.is-ph .rx-s { text-align: right; }
.ui.is-ph .rxr > .ic { display: none; }
.is-ph .rxd { margin: 0 -16px; padding: 16px; }
/* 처방별 신환·재진 */
.sp-h { margin-top: 8px; color: var(--ink-2); }
.spw { margin-top: 12px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
.spw .dt th { position: static; }
.sp-a { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.ui .cpy { min-width: 112px; }
.cpy .ok { color: var(--positive); }
/* 원장님 보고 문장 */
.rp-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; margin-top: 12px; }
.ui .rp-seg { flex-wrap: wrap; }
.rp-d { margin-top: 16px; font-size: 13px; line-height: 20px; color: var(--muted); }
.rp-t { margin-top: 8px; padding: 16px 20px; background: var(--canvas); border-radius: var(--r-control); font-size: 14px; line-height: 22px; white-space: pre-wrap; }
.ln { display: block; min-height: 22px; }
.ln.need { margin: 0 -8px; padding: 0 8px; background: var(--warning-soft); color: var(--warning); font-weight: 500; }
.rp-n { margin-top: 8px; display: grid; gap: 4px; }
.rp-n li { display: grid; grid-template-columns: 12px 1fr; font-size: 13px; line-height: 20px; color: var(--ink-2); }
.rp-n li::before { content: '·'; color: var(--muted); }
.rp-x { margin-top: 8px; padding: 12px 16px; background: var(--warning-soft); border-radius: var(--r-control); }
.rp-xt { font-weight: 600; color: var(--warning); }
.rp-xp { margin-top: 2px; font-size: 13px; line-height: 20px; color: var(--ink-2); }
.ui .safe { margin-top: 12px; }
.is-ph .rp-bar .cpy { width: 100%; }
'''
STATE_CSS = ''.join(f'.ui[data-st={s}] [data-show]:not([data-show~={s}]) {{ display: none !important; }}\n' for s in STATES)
STATE_CSS += '.ui[data-bit="0"] [data-bitv="1"], .ui[data-bit="1"] [data-bitv="0"] { display: none !important; }\n'

DATA = {
    'sets': SETS,
    'icons': {'chev': ic('chev', 14), 'check': ic('check', 14), 'copy': ic('copy', 14), 'clock': ic('clock', 14)},
    'text': {'srcNow': f'자료: 비트 PC · {md(TODAY)} 18:43 저장 · 방금',
             'covOn': f' · 오늘({md(TODAY)})까지 끝난 날로 저장했어요',
             'covOff': f' · 어제({md(YDAY)})까지 끝난 날로 저장했어요'},
}

page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>통계 탭 클릭 목업</title>
<style>
{rd('fonts.css')}
{rd('css_page.css')}
{rd('css_app.css')}
{STATS_CSS}
{STATE_CSS}
</style>
</head>
<body>
<header class="wrap intro">
<p class="eyebrow">통계 탭 · 눌러 볼 수 있는 시안</p>
<h1>통계 탭을 이렇게 만들려고 해요</h1>
<p class="lead">비트 PC에서 불러온 숫자로 환자 수 추이, 신환 재방문율, 처방 추세, 처방별 신환·재진, 원장님 보고 문장, 요일별 환자 수를 한 쪽에 이어서 보여 줘요. 그림 속 단추는 실제로 눌러 볼 수 있어요. 아직 실제 앱은 바뀌지 않았어요.</p>
<p class="exb"><span class="chip chip-a">예시 숫자</span><span>그림 속 숫자·처방 이름·보고 글은 모두 지어낸 <b>예시</b>예요. 환자 이름과 차트번호는 없어요. 시안의 '오늘'은 2026년 11월 13일(금) 18시 42분이에요.</span></p>
</header>
<nav class="secnav" aria-label="화면 고르기"><div class="secnav-in" data-pick="scr" role="group" aria-label="화면 고르기">{nav}<span class="chip chip-a ex">예시 숫자</span></div></nav>
<main class="wrap">
{''.join(S)}
{DECIDE}
</main>
<footer class="wrap foot"><p>그림 속 의원 이름, 이메일, 숫자, 처방 이름, 보고 글은 모두 예시예요. 실제 환자 정보는 들어 있지 않아요.</p>
<p>승인해 주시면 이 그림대로 통계 화면을 만들어요.</p></footer>
<dialog id="zoom" aria-labelledby="zt"><div class="zh"><span id="zt"></span><button type="button" class="zc" data-act="zclose">닫기</button></div><div class="zb"></div></dialog>
<script type="application/json" id="stats-data">{json.dumps(DATA, ensure_ascii=False, separators=(',', ':')).replace('</', '<' + chr(92) + '/')}</script>
<script src="app.js"></script>
</body>
</html>'''

with open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(page)
print('index.html bytes', len(page.encode()), '· data bytes', len(json.dumps(DATA, ensure_ascii=False)))
