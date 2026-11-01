# 비트 연결하면 대시보드 숫자 자동 채움 — 클릭 시안 만들기. 실행: python gen.py → 같은 폴더에 index.html
# 앱 틀·연결 전 모양은 승인된 ui-90 시안(gen.py)의 함수를 그대로 불러 쓴다. 여기서는 새로 생기는 상태만 그린다.
import datetime as dt
import json
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
UI90 = os.path.join(HERE, '..', 'ui-90', 'app')


def read(*p):
    with open(os.path.join(*p), encoding='utf-8') as f:
        return f.read()


src = read(UI90, 'gen.py')
exec(src[:src.index('# ---------- admin ----------')])  # noqa: S102 — 저장소 안의 승인 시안 코드

TODAY_LONG = '11월 2일 월요일'
READ_AT = '오늘 오후 3:42에 읽었어요'
READ_AT_NEW = '오늘 오후 3:45에 읽었어요'
SAFE = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.'


def to_today(s):
    return (s.replace('2026년 11월 1일 (일) 07:11 (KST)', '2026년 11월 2일 (월) 15:42 (KST)')
             .replace('11월 1일 일요일', TODAY_LONG))


def date_line():
    return f'<p class="date">{TODAY_LONG}</p>'


def date_ctl():
    prev_ic = ic('chev', 16, 'dp-prev')
    next_ic = ic('chev', 16, 'dp-next')
    return ('<div class="dp" role="group" aria-label="날짜 고르기">'
            f'<button type="button" class="dp-b" data-day="prev" aria-label="이전 날">{prev_ic}</button>'
            f'<label class="dp-l"><span class="dp-t">{TODAY_LONG}</span>{ic("chev", 14)}'
            '<input class="dp-i" type="date" aria-label="날짜 고르기" min="2026-07-25" max="2026-11-02" value="2026-11-02"></label>'
            f'<button type="button" class="dp-b" data-day="next" aria-label="다음 날" disabled>{next_ic}</button>'
            '<button type="button" class="btn btn-sec btn-sm dp-today" data-day="today" hidden>오늘로</button></div>')


def safe(text=SAFE):
    return f'<p class="safe">{ic("shield", 14)}<span>{text}</span></p>'


def btn(label, go, kind='sec', ph=False, extra='', icon=''):
    blk = ' btn-block' if ph else ''
    return f'<button type="button" class="btn btn-{kind}{blk}{extra}" data-go="{go}">{label}{icon}</button>'


# ---------- 맨 위 브리핑 왼쪽 ----------
def left_reading(ph):
    return (date_line() + '<h1 class="d-h1">비트에서 오늘 숫자를 읽고 있어요</h1>'
            '<p class="d-lead">최근 100일 자료를 읽어요. 길면 3분쯤 걸려요. 다 읽을 때까지 이 화면을 열어 두세요.</p>'
            '<div class="rd-bar" role="progressbar" aria-label="비트 자료 읽는 중"><i></i></div>' + safe())


def report(ph, copy=True):
    return ('<div class="rp-h"><p class="rp-t">원장님 보고 문장</p>'
            f'<button type="button" class="btn btn-sec btn-sm rp-c" data-act="copy">복사</button></div>'
            '<h1 class="d-h1 rp-1">오늘 지금까지 환자 64명이 왔습니다.</h1>'
            '<p class="d-lead rp-2">신환 9명, 재진 55명입니다.</p>' + safe('보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요.'))


def read_line(ph, label=READ_AT, state='idle'):
    if state == 'busy':
        b = f'<button type="button" class="btn btn-sec btn-sm" disabled aria-disabled="true"><i class="spin" aria-hidden="true"></i>다시 읽는 중</button>'
    elif state == 'none':
        b = ''
    else:
        b = '<button type="button" class="btn btn-sec btn-sm" data-go="rereading">다시 읽기</button>'
    return f'<div class="rl"><p class="rl-t">{ic("clock", 14)}<span>{label}</span></p>{b}</div>'


def left_data(ph, read_at=READ_AT):
    return date_ctl() + report(ph) + read_line(ph, read_at)


def left_rereading(ph):
    return date_ctl() + report(ph) + read_line(ph, READ_AT, 'busy')


def err_box(ph, what, fix, code, buttons):
    return (f'<div class="errc rl-e" role="alert">{ic("stop")}<div><p class="errc-w">{what}</p><p class="errc-f">{fix}</p>'
            f'<p class="errc-c">오류 번호 {code}</p><div class="errc-a">{buttons}</div></div></div>')


def left_reread_fail(ph):
    box = err_box(ph, '비트 자료를 읽지 못했어요',
                  '아래 숫자는 오후 3:42에 읽은 그대로예요. 잠시 뒤 [다시 확인]을 눌러 주세요. 계속되면 비트가 업데이트됐을 수 있으니 오류 번호와 함께 문의해 주세요.',
                  'E-BIT-READ-FAILED',
                  btn('다시 확인', 'rereading', 'pri', ph) + btn('연결 확인', 'setup-ok', 'sec', ph))
    return date_ctl() + report(ph) + read_line(ph, READ_AT, 'none') + box


def left_fail(ph):
    blk = ph
    return (date_line() + '<h1 class="d-h1">비트 자료를 읽지 못했어요</h1>'
            '<p class="d-lead">잠시 뒤 [다시 확인]을 눌러 주세요. 계속되면 비트가 업데이트됐을 수 있으니 오류 번호와 함께 문의해 주세요.</p>'
            '<p class="ec">오류 번호 E-BIT-READ-FAILED</p>'
            f'<div class="d-cta d-acts">{btn("다시 확인", "reading", "pri", blk, " btn-lg")}{btn("연결 확인", "setup-ok", "sec", blk, " btn-lg")}</div>' + safe())


def left_busy(ph):
    return (date_line() + '<h1 class="d-h1">다른 창이 비트 자료를 쓰고 있어요</h1>'
            '<p class="d-lead">한 번에 한 창만 비트를 읽을 수 있어요. 그 창의 일이 끝나거나 창을 닫은 뒤 [다시 확인]을 눌러 주세요.</p>'
            '<p class="ec">오류 번호 E-BIT-IN-USE</p>'
            f'<div class="d-cta d-acts">{btn("다시 확인", "reading", "pri", ph, " btn-lg")}</div>' + safe())


# ---------- 브리핑 오른쪽(연결 뒤) ----------
def ready_side(ph):
    blk = ' btn-block' if ph else ''
    return ('<div class="rs"><div class="rs-h"><span>지금 바로 쓸 수 있어요</span><span class="muted">청구 탭</span></div>'
            '<p class="rs-n">삭감 예방 사전점검</p><p class="rn-d">청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.</p>'
            '<p class="rn-x">청구 점검은 비트 PC의 크롬에서 열려요.</p>'
            f'<div class="rs-a"><a href="#" class="btn btn-sec{blk}">사전점검 열기{GO}</a>'
            '<button type="button" class="lnk" data-go="setup-ok">비트 PC 연결 다시 확인</button></div></div>')


def brief(ph, left):
    if ph:
        return left + f'<div class="rs-w">{ready_side(ph)}</div>'
    return f'<div class="d-grid"><div class="d-l">{left}</div><div class="d-r">{ready_side(ph)}</div></div>'


# ---------- 오늘 하루 분석 ----------
KPI_NAMES = ['오늘 환자 수', '신환', '재진', '지난주 같은 요일보다']


def today_sec(mode):
    if mode == 'data':
        vals = [('64', '명'), ('9', '명'), ('55', '명')]
        kp = ''.join(f'<div class="kpi"><p class="kpi-n">{n}</p><p class="kpi-v on">{v}<span class="kpi-u">{u}</span></p></div>'
                     for n, (v, u) in zip(KPI_NAMES, vals))
        kp += f'<div class="kpi"><p class="kpi-n">{KPI_NAMES[3]}</p><p class="kpi-v">–</p><p class="kpi-s">오늘 진료가 끝나면 비교해요</p></div>'
        return f'<section class="dsec"><div class="dsec-h"><h2 class="dsec-t day-t">오늘 하루 분석</h2></div><div class="kpis day-k">{kp}</div></section>'
    chip, text, note = {
        'reading': ('읽는 중', '읽는 중', '읽기가 끝나면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.'),
        'fail': ('읽지 못함', '읽지 못했어요', ''),
        'busy': ('기다리는 중', '아직 못 읽었어요', ''),
    }[mode]
    kp = ''.join(f'<div class="kpi"><p class="kpi-n">{n}</p><p class="kpi-v">–</p><p class="kpi-s">{text}</p></div>' for n in KPI_NAMES)
    nt = f'<p class="d-note">{note}</p>' if note else ''
    return f'<section class="dsec"><div class="dsec-h"><h2 class="dsec-t">오늘 하루 분석</h2><span class="chip chip-n">{chip}</span></div><div class="kpis">{kp}</div>{nt}</section>'


# ---------- 기간별 흐름 ----------
PERIOD_LABEL = {'7': '10월 26일 – 11월 1일', '30': '10월 3일 – 11월 1일', '90': '8월 4일 – 11월 1일'}


def seg(active='30'):
    bs = ''.join(f'<button type="button" data-per="{p}" aria-pressed="{"true" if p == active else "false"}">최근 {p}일</button>' for p in ['7', '30', '90'])
    return f'<div class="seg">{bs}</div>'


def flow_head(active='30'):
    return f'<div class="dsec-h sp"><h2 class="dsec-t">기간별 흐름</h2><div class="per"><span class="rng">{PERIOD_LABEL[active]}</span>{seg(active)}</div></div>'


def flow_empty(mode):
    gains = [('환자 수 추이', '신환과 재진을 하루씩 막대로 보여 줘요.'), ('신환 재방문율', '처음 온 환자가 7·14일 안에 다시 온 비율이에요.'),
             ('요일별 환자 수', '요일마다 하루 평균 환자 수예요.'), ('처방 상위', '많이 낸 처방 5가지를 차례로 적어요.')]
    gl = ''.join(f'<li><p class="gain-n"><span class="num">{i}</span>{n}</p><p class="gain-d">{d}</p></li>' for i, (n, d) in enumerate(gains, 1))
    return (f'<section class="dsec">{flow_head()}<p class="gain-t">읽기가 끝나면 생기는 것 4가지</p><ol class="gain">{gl}</ol>'
            '<p class="d-note">읽기가 끝나면 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.</p></section>')


def flow_data():
    return f'<section class="dsec">{flow_head()}<div class="flow-slot" data-per="30"></div></section>'


# 시안용 가짜 숫자. 실제 자료가 아니다. 씨앗을 고정해 다시 만들어도 같다.
random.seed(20261102)
DAYS = []
base_weekday = [78, 68, 62, 66, 72, 41, 0]  # 월~일
YESTERDAY = dt.date(2026, 11, 1)
for back in range(100):
    day = YESTERDAY - dt.timedelta(days=back)
    wd = day.weekday()
    total = 0 if wd == 6 else max(18, base_weekday[wd] + random.randint(-11, 11))
    new = round(total * random.uniform(0.09, 0.18))
    DAYS.append({'back': back, 'day': day.isoformat(), 'wd': wd, 'total': total, 'new': new, 'ret': total - new})
DAYS.reverse()  # 오래된 날부터

# 날짜를 고를 때 쓰는 하루 숫자. 일요일(자료 없는 날)은 줄이 없다
DAY_DATA = {r['day']: {'t': r['total'], 'n': r['new'], 'r': r['ret']} for r in DAYS if r['total'] > 0}
DAY_DATA['2026-11-02'] = {'t': 64, 'n': 9, 'r': 55, 'open': True}


def md(back):
    d = YESTERDAY - dt.timedelta(days=back)
    return f'{d.month}.{d.day}'


def trend(period):
    rows = DAYS[-period:]
    top = max(r['total'] for r in rows)
    scale = 100 if top > 75 else 80
    ticks = [scale, scale * 3 // 4, scale // 2, scale // 4, 0]
    axis = ''.join(f'<span style="bottom:{t * 100 / scale:.2f}%">{t}</span>' for t in ticks)
    lines = ''.join(f'<i class="{"z" if t == 0 else ""}" style="bottom:{t * 100 / scale:.2f}%"></i>' for t in ticks)
    bars = ''
    for r in rows:
        bars += (f'<div class="sb-c"><i class="s-r" style="height:{r["ret"] * 100 / scale:.2f}%"></i>'
                 f'<i class="s-n" style="height:{r["new"] * 100 / scale:.2f}%"></i></div>')
    step = {7: 1, 30: 5, 90: 14}[period]
    labels = ''
    for idx, r in enumerate(rows):
        labels += f'<span>{md(r["back"]) if idx % step == 0 else ""}</span>'
    return (f'<div class="sb"><div class="sb-y">{axis}</div><div class="sb-p">{lines}<div class="sb-b g{period}">{bars}</div></div></div>'
            f'<div class="sb-x g{period}">{labels}</div>')


def weekday_chart(period):
    rows = DAYS[-period:]
    names = ['월', '화', '수', '목', '금', '토', '일']
    avg = []
    for wd in range(7):
        vals = [r['total'] for r in rows if r['wd'] == wd]
        avg.append(round(sum(vals) / len(vals)) if vals else 0)
    scale = 100
    ticks = [100, 75, 50, 25, 0]
    axis = ''.join(f'<span style="bottom:{t}%">{t}</span>' for t in ticks)
    lines = ''.join(f'<i class="{"z" if t == 0 else ""}" style="bottom:{t}%"></i>' for t in ticks)
    bars = ''.join(f'<div class="sb-c"><i class="s-n" style="height:{v * 100 / scale:.2f}%"></i></div>' for v in avg)
    labels = ''.join(f'<span>{n}</span>' for n in names)
    return (f'<div class="sb sb-s"><div class="sb-y">{axis}</div><div class="sb-p">{lines}<div class="sb-b gw">{bars}</div></div></div>'
            f'<div class="sb-x gw">{labels}</div>')


RX = [('표층열 치료', 0.82), ('심층열 치료', 0.61), ('경피 전기자극', 0.44), ('관절강내 주사', 0.13), ('도수치료', 0.09)]


def rank_chart(period):
    total = sum(r['total'] for r in DAYS[-period:])
    items = [(n, round(total * s)) for n, s in RX]
    top = items[0][1]
    return '<ol class="rk">' + ''.join(
        f'<li><span class="rk-n">{n}</span><span class="rk-b"><i style="width:{v * 100 / top:.1f}%"></i></span><span class="rk-v">{v:,}건</span></li>'
        for n, v in items) + '</ol>'


def revisit(period):
    r7, r14 = {7: (31, None), 30: (34, 46), 90: (36, 49)}[period]
    def row(name, v):
        if v is None:
            return f'<div class="rv"><span class="rv-n">{name}</span><span class="rv-w">집계 중</span><span class="rv-b"></span></div>'
        return f'<div class="rv"><span class="rv-n">{name}</span><span class="rv-v">{v}%</span><span class="rv-b"><i style="width:{v}%"></i></span></div>'
    return ('<div class="rvs">' + row('7일 안에 다시 옴', r7) + row('14일 안에 다시 옴', r14) +
            '<div class="rv"><span class="rv-n">30일 안에 다시 옴</span><span class="rv-w">자료 없음</span><span class="rv-d">30일 기록은 아직 모으지 않아요</span></div></div>')


def chart_block(title, desc, body, cls, aside=''):
    return (f'<div class="ch {cls}"><div class="ch-h"><h3 class="ch-t">{title}</h3>{aside}</div><p class="ch-d">{desc}</p>{body}</div>')


def charts(period):
    legend = '<span class="lg"><span><i class="s-n"></i>신환</span><span><i class="s-r"></i>재진</span></span>'
    return ('<div class="charts">'
            + chart_block('환자 수 추이', '신환·재진, 하루씩', trend(period), 'c-8', legend)
            + chart_block('신환 재방문율', '처음 온 환자가 다시 온 비율', revisit(period), 'c-4 c-side')
            + chart_block('요일별 환자 수', '하루 평균, 요일마다', weekday_chart(period), 'c-6')
            + chart_block('처방 상위', '많이 낸 처방 5가지', rank_chart(period), 'c-6 c-side')
            + '</div>')


# ---------- 기능 목차(연결 뒤) ----------
def idx_connected():
    fi = ''
    for n, d in FEATS:
        s = f'<span class="fi-s go">사용 가능{ic("arrow", 14)}</span>' if n in ('청구', '설정') else '<span class="fi-s">준비 중</span>'
        fi += f'<a href="#"><span class="fi-h"><span class="fi-n">{n}</span>{s}</span><span class="fi-d" style="display:block">{d}</span></a>'
    return f'<section class="dsec"><div class="dsec-h"><h2 class="dsec-t">기능 목차</h2><span class="dsec-s">12개 가운데 2개를 지금 쓸 수 있어요</span></div><div class="fi">{fi}</div></section>'


# ---------- 비트 PC 연결 화면 ----------
HELPER_SDESC = SDESC


def setup_v(kind, mode):
    ph = kind == 'ph'
    blk = ph
    done = f'<span class="chip chip-pos">{ic("check", 12)}완료</span>'
    wait = '<span class="chip chip-n">대기</span>'
    bad = f'<span class="chip chip-neg">{ic("x", 12)}버전 안 맞음</span>'
    steps = ''
    for i, (t, d) in enumerate(zip(STEPS5, HELPER_SDESC), 1):
        cls, extra = '', ''
        if mode == 'ok':
            chip = done
        elif i == 1:
            chip = done
        elif i == 2:
            chip = bad
            extra = (f'<div class="howto"><p class="ht-w">도우미를 업데이트하세요</p><p class="ht-f">이 PC의 도우미(0.1.1)가 예전 버전이라 대시보드 숫자와 청구 화면을 쓸 수 없어요. 처음부터 다시 등록하지 않아도 돼요.</p><ol>'
                     '<li><span>[새 도우미 내려받기]를 눌러 precheck-helper-버전.zip을 받으세요.</span></li>'
                     '<li><span>받은 zip을 오른쪽 클릭 → [모두 압축 풀기]로 푼 뒤, 푼 폴더의 install.cmd를 두 번 누르세요. "Windows의 PC 보호" 창이 뜨면 [추가 정보]를 누른 뒤 [실행]을 누르세요.</span></li>'
                     '<li><span>설치가 끝나면 [다시 확인]을 누르세요. 크롬은 다시 켤 필요가 없어요.</span></li></ol>'
                     f'<div class="howto-a"><a href="#" class="btn btn-pri{" btn-block" if blk else ""}">새 도우미 내려받기</a>{btn("다시 확인", "setup-ok", "sec", blk)}</div></div>')
        else:
            chip, cls = wait, ' wait'
        if ph:
            steps += f'<div class="step{cls}"><span class="num">{i}</span><div><p class="step-t">{t}</p><div class="step-s">{chip}</div><p class="step-d">{d}</p></div>{extra}</div>'
        else:
            steps += f'<div class="step{cls}"><span class="num">{i}</span><div><p class="step-t">{t}</p><p class="step-d">{d}</p></div><div class="step-s">{chip}</div>{extra}</div>'
    ok_v = f'<dd class="ok">{ic("check", 12)}맞아요</dd>'
    if mode == 'ok':
        kv = f'<dt>크롬 확장 프로그램</dt>{ok_v}<dt>도우미</dt>{ok_v}<dt>요양기관기호</dt>{ok_v}<dt>마지막 확인</dt><dd>방금</dd>'
    else:
        kv = (f'<dt>크롬 확장 프로그램</dt>{ok_v}<dt>도우미</dt><dd class="bad">{ic("x", 12)}버전이 안 맞아요</dd>'
              '<dt>요양기관기호</dt><dd>확인 전</dd><dt>마지막 확인</dt><dd>방금</dd>')
    side = (f'<div class="st-side"><section class="panel"><div class="p-h"><h2 class="p-t">이 PC</h2></div><div class="p-b"><dl class="kv">{kv}</dl></div></section>'
            '<section class="panel"><div class="p-h"><h2 class="p-t">이렇게 지켜요</h2></div><div class="p-b"><ul class="keep">'
            '<li>환자 자료는 이 PC 밖으로 나가지 않아요. 우리 사이트에는 건수와 설정만 가요.</li>'
            '<li>비트는 읽기만 해요. 메모를 넣을 때만 이 PC에 확인 창이 뜨고, 거기서 [확인]을 눌러야 들어가요.</li>'
            '<li>확장 프로그램과 도우미는 이 비트 PC 한 대에만 설치해요.</li></ul></div></section></div>')
    banner = ''
    if mode == 'ok':
        banner = f'<div class="back" role="status">{ic("check")}<p><b>5단계를 모두 마쳤어요.</b> 대시보드로 돌아가요.</p></div>'
    sub = ('<div class="subtabs"><span class="subtab">청구·연락 <span class="chip chip-n">준비 중</span></span>'
           '<span class="subtab on">비트 PC 연결</span></div>')
    stp = f'<section class="panel"><div class="p-h"><h2 class="p-t">준비 순서</h2><span class="p-s">5단계</span></div><div class="p-b">{steps}</div></section>'
    return f'<h1 class="pg-h1">설정</h1>{sub}{banner}<div class="st-grid">{stp}{side}</div>'


# ---------- 상태 묶기 ----------
def state_body(state, kind):
    ph = kind == 'ph'
    if state == 'before':
        return to_today(dash_body(kind)).replace('<a href="#" class="btn btn-pri btn-lg', '<a href="#" data-go="setup-ok" class="btn btn-pri btn-lg', 1)
    if state == 'setup-ok':
        return setup_v(kind, 'ok')
    if state == 'update':
        return setup_v(kind, 'old')
    if state == 'reading':
        return brief(ph, left_reading(ph)) + today_sec('reading') + flow_empty('reading') + idx_connected()
    if state == 'data':
        return brief(ph, left_data(ph)) + today_sec('data') + flow_data() + idx_connected()
    if state == 'data2':
        return brief(ph, left_data(ph, READ_AT_NEW)) + today_sec('data') + flow_data() + idx_connected()
    if state == 'rereading':
        return brief(ph, left_rereading(ph)) + today_sec('data') + flow_data() + idx_connected()
    if state == 'reread-fail':
        return brief(ph, left_reread_fail(ph)) + today_sec('data') + flow_data() + idx_connected()
    if state == 'first-fail':
        return brief(ph, left_fail(ph)) + today_sec('fail') + flow_empty('fail') + idx_connected()
    if state == 'busy':
        return brief(ph, left_busy(ph)) + today_sec('busy') + flow_empty('busy') + idx_connected()
    raise ValueError(state)


STATES = ['before', 'setup-ok', 'reading', 'data', 'data2', 'rereading', 'reread-fail', 'first-fail', 'busy', 'update']
TAB_OF = {'setup-ok': '설정', 'update': '설정'}

screens = {}
for st in STATES:
    cur = TAB_OF.get(st, '대시보드')
    screens[st] = {
        'pc': to_today(shell('pc', cur, state_body(st, 'pc'))),
        'ph': to_today(shell('ph', cur, state_body(st, 'ph'))),
    }
chart_html = {p: charts(int(p)) for p in ['7', '30', '90']}

STRIP = [
    ('before', '연결 전', '처음 여는 모습. 지금 화면 그대로예요.'),
    ('update', '도우미 업데이트', '비트 PC에 0.1.1이 깔려 있으니 첫 시험 때 한 번 보게 돼요.'),
    ('setup-ok', '연결 끝', '5단계가 모두 되면 누르지 않아도 대시보드로 돌아가요.'),
    ('reading', '읽는 중', '숫자 칸에 지어낸 값 없이 "읽는 중"만 나와요.'),
    ('data', '숫자 나옴', '맨 위 날짜 줄에서 다른 날을 골라 보세요. 그 날의 보고 문장과 숫자로 바뀌어요. 그림 속 숫자는 모두 가짜예요.'),
    ('rereading', '다시 읽는 중', '이전 숫자를 둔 채 읽고, 그동안 단추는 막혀요.'),
    ('reread-fail', '다시 읽기 실패', '이전 숫자와 읽은 시각은 그대로 두고 그 아래에 오류를 보여요.'),
    ('first-fail', '처음 읽기 실패', '숫자를 지어내지 않고 오류 문구와 번호만 보여요.'),
    ('busy', '다른 창이 사용 중', '한 번에 한 창만 비트를 읽어요.'),
]
strip_html = ''.join(
    f'<button type="button" class="st-b" data-state="{s}" aria-pressed="{"true" if s == "before" else "false"}">{n}</button>' for s, n, _ in STRIP)
hints = {s: h for s, _, h in STRIP}
hints['data2'] = hints['data']

EXTRA_CSS = read(HERE, 'css_extra.css')

demo = (f'<section class="sec" id="demo"><p class="sec-k">눌러 보기</p><h2>[비트 PC 연결 시작]부터 숫자가 나올 때까지</h2>'
        '<p class="sec-p">화면 속 단추를 누르면 실제 순서대로 넘어가요. 처음에는 파란 [비트 PC 연결 시작]을 눌러 보세요. 아래 단추로 원하는 상황을 바로 볼 수도 있어요.</p>'
        f'<div class="st-strip" role="group" aria-label="상황 고르기">{strip_html}</div>'
        f'<p class="st-hint" id="hint" aria-live="polite">{hints["before"]}</p>'
        '<div class="row">'
        + frame('ph', '<div class="stage" data-kind="ph"></div>', 390, 640, True, cap='<b>좁은 창</b> · 비트 PC에서 창을 줄였을 때', label='좁은 창', zoom=False)
        + frame('pc', '<div class="stage" data-kind="pc"></div>', 1440, 900, True, cap='<b>비트 PC 크롬</b>', title=ttl('대시보드'), label='비트 PC 크롬')
        + '</div></section>')

phone_note = (
    '<section class="sec" id="phone"><p class="sec-k">휴대폰·집 PC</p><h2>휴대폰에서는 아직 숫자가 안 보여요</h2>'
    '<p class="sec-p">이번 작업은 숫자를 서버에 저장하지 않아요. 숫자는 비트 PC 크롬에서 읽어 그 화면에만 그려요. 그래서 휴대폰과 집 PC에서는 지금처럼 "연결 전" 화면이 그대로 나와요. '
    '휴대폰에서도 보려면 집계 숫자를 서버에 올리는 다음 작업이 필요해요.</p></section>')

notes_html = (
    '<section class="sec" id="notes"><p class="sec-k">바뀌는 곳</p><h2>지금 화면과 달라지는 것</h2><div class="notes"><div class="nb"><h3>새로 생겨요</h3><ul>'
    '<li><b>맨 위 큰 문장 자리</b>에 읽는 중과 실패 모습이 생겨요.</li>'
    '<li><b>날짜 고르기:</b> 숫자를 읽은 뒤에는 맨 위 날짜 줄에서 오늘부터 100일 전까지 고를 수 있어요. 고른 날의 보고 문장과 숫자 칸만 바뀌고, 비트를 다시 읽지 않아요. 기간별 흐름은 그대로예요. 대시보드를 새로 열면 오늘로 돌아와요.</li>'
    '<li><b>읽은 시각 줄과 [다시 읽기]</b>가 보고 문장 아래에 생겨요. 다시 읽기는 직접 누를 때와 대시보드를 새로 열 때만 돌아요.</li>'
    '<li><b>연결 화면</b>에 "5단계를 모두 마쳤어요. 대시보드로 돌아가요."가 잠깐 보여요. 대시보드의 [비트 PC 연결 시작]으로 왔을 때만 돌아가고, 설정 탭에서 직접 열면 그 자리에 머물러요.</li>'
    '</ul></div><div class="nb rule"><h3>글자를 고쳐요</h3><ul>'
    '<li><b>다른 창 사용 중:</b> 지금 문구는 "청구 화면이 다른 창에서 열려 있어요"라서, 다른 창이 대시보드일 때는 맞지 않아요. 대시보드에서는 "다른 창이 비트 자료를 쓰고 있어요"로 보여 줘요. 청구 화면의 문구는 그대로예요.</li>'
    '<li><b>도우미 업데이트:</b> 지금 문구는 "청구 화면을 쓸 수 없어요"만 말해요. "대시보드 숫자와 청구 화면을 쓸 수 없어요"로 바꿔요.</li>'
    '<li><b>신환 재방문율 설명:</b> 30일 줄은 아직 값이 없어 설명을 "7·14일 안에"로 줄였어요. 연결 전 화면의 "7·14·30일" 글은 그대로예요.</li>'
    '<li><b>다시 읽기 실패:</b> [다시 읽기] 대신 오류 칸의 [다시 확인]·[연결 확인]만 남겨요. 같은 일을 하는 단추가 나란히 있지 않게 하려는 거예요.</li>'
    '</ul></div></div></section>')

# 목록 줄은 격자라서 글을 한 덩어리로 묶어야 세로로 쪼개지지 않는다
notes_html = notes_html.replace('<li>', '<li><span>').replace('</li>', '</span></li>')

decide = (
    '<section class="sec" id="decide"><div class="decide"><p class="sec-k">정해 주실 것</p><h2>이 시안대로 만들어도 될까요?</h2><ol>'
    '<li><div><p class="q">화면 흐름과 글자</p><p class="a">위 9가지 상황과 날짜 고르기를 눌러 보고, 고칠 곳이 있으면 알려 주세요.</p></div></li>'
    '</ol><p class="reply">이렇게 답해 주시면 돼요: <b>시안 좋아요</b> (고칠 곳이 있으면 <b>읽는 중 글자 바꿔 줘</b>처럼)</p></div></section>')

nav = ''.join(f'<a href="#{i}"{" class=dec" if i == "decide" else ""}>{n}</a>' for i, n in [('demo', '눌러 보기'), ('phone', '휴대폰'), ('notes', '바뀌는 곳'), ('decide', '정해 주실 것')])

JS = '''
(function () {
  var SCREENS = %s, CHARTS = %s, HINTS = %s, RANGE = %s, DAYS = %s;
  var AUTO = { 'setup-ok': ['reading', 1800], 'reading': ['data', 2600], 'rereading': ['data2', 2200] };
  var timer = null, period = '30', TODAY = '2026-11-02', MIN = '2026-07-25', selected = TODAY;
  var stages = Array.prototype.slice.call(document.querySelectorAll('.stage'));
  var strip = Array.prototype.slice.call(document.querySelectorAll('.st-b'));
  var hint = document.getElementById('hint');
  function setPeriod(p) {
    period = p;
    document.querySelectorAll('.flow-slot').forEach(function (s) { s.innerHTML = CHARTS[p]; });
    document.querySelectorAll('.stage .seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.per === p ? 'true' : 'false'); });
    document.querySelectorAll('.stage .rng').forEach(function (r) { r.textContent = RANGE[p]; });
  }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  function parts(ymd) { var p = ymd.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function shift(ymd, n) { var d = parts(ymd); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function md(ymd) { var d = parts(ymd); return (d.getUTCMonth() + 1) + '월 ' + d.getUTCDate() + '일'; }
  function wd(ymd) { return WD[parts(ymd).getUTCDay()]; }
  function kpi(name, value, sub, cls) {
    return '<div class="kpi"><p class="kpi-n">' + name + '</p><p class="kpi-v ' + (cls || '') + '">' + value + '</p>' + (sub ? '<p class="kpi-s">' + sub + '</p>' : '') + '</div>';
  }
  function count(n) { return n + '<span class="kpi-u">명</span>'; }
  function applyDay() {
    var isToday = selected === TODAY, row = DAYS[selected], prev = DAYS[shift(selected, -7)];
    var first, rest, cmp = '', cards;
    if (!row) {
      first = '이 날은 진료 자료가 없어요'; rest = '진료가 없었거나 비트에 접수 기록이 없는 날이에요.';
      cards = kpi('환자 수', '–', '자료 없음') + kpi('신환', '–', '자료 없음') + kpi('재진', '–', '자료 없음') + kpi('지난주 같은 요일보다', '–', '자료 없음');
    } else {
      first = isToday ? '오늘 지금까지 환자 ' + row.t + '명이 왔습니다.' : md(selected) + ' 환자 ' + row.t + '명이 왔습니다.';
      rest = '신환 ' + row.n + '명, 재진 ' + row.r + '명입니다.';
      var last;
      if (isToday) last = kpi('지난주 같은 요일보다', '–', '오늘 진료가 끝나면 비교해요');
      else if (!prev) last = kpi('지난주 같은 요일보다', '–', '지난주 자료가 없어요');
      else {
        var diff = row.t - prev.t, pct = prev.t ? Math.trunc(Math.abs(diff) / prev.t * 1000) / 10 : 0;
        if (diff === 0) { cmp = ' 지난주 ' + wd(selected) + '요일과 같습니다.'; last = kpi('지난주 같은 요일보다', '변화 없음', '지난주 ' + wd(selected) + '요일', 'on sm'); }
        else {
          cmp = ' 지난주 ' + wd(selected) + '요일보다 ' + Math.abs(diff) + '명 ' + (diff > 0 ? '많습니다.' : '적습니다.');
          last = kpi('지난주 같은 요일보다', (diff > 0 ? '▲ ' : '▼ ') + Math.abs(diff) + '명 (' + (diff > 0 ? '+' : '−') + pct + '%%)', '지난주 ' + wd(selected) + '요일', (diff > 0 ? 'up' : 'down') + ' sm');
        }
      }
      cards = kpi(isToday ? '오늘 환자 수' : '환자 수', count(row.t), '', 'on') + kpi('신환', count(row.n), '', 'on') + kpi('재진', count(row.r), '', 'on') + last;
    }
    document.querySelectorAll('.stage').forEach(function (st) {
      var ctl = st.querySelector('.dp');
      if (!ctl) return;
      ctl.querySelector('.dp-t').textContent = md(selected) + ' ' + wd(selected) + '요일';
      ctl.querySelector('.dp-i').value = selected;
      ctl.querySelector('[data-day=prev]').disabled = selected <= MIN;
      ctl.querySelector('[data-day=next]').disabled = selected >= TODAY;
      ctl.querySelector('[data-day=today]').hidden = isToday;
      var h = st.querySelector('.rp-1'), l = st.querySelector('.rp-2'), t = st.querySelector('.day-t'), k = st.querySelector('.day-k'), c = st.querySelector('.rp-c');
      if (h) h.textContent = first;
      if (l) l.textContent = rest + cmp;
      if (t) t.textContent = isToday ? '오늘 하루 분석' : md(selected) + ' 하루 분석';
      if (k) k.innerHTML = cards;
      if (c) { c.disabled = !row; c.textContent = '복사'; }
    });
  }
  function pick(ymd) { if (ymd && ymd >= MIN && ymd <= TODAY) selected = ymd; applyDay(); }
  function show(state) {
    clearTimeout(timer);
    stages.forEach(function (st) {
      st.innerHTML = SCREENS[state][st.dataset.kind];
      var vp = st.closest('.vp'); if (vp) vp.scrollTop = 0;
    });
    setPeriod(period);
    applyDay();
    var key = state === 'data2' ? 'data' : state;
    strip.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.state === key ? 'true' : 'false'); });
    hint.textContent = HINTS[state] || '';
    var title = document.querySelector('.fig-pc .btab-t');
    if (title) title.textContent = (state === 'setup-ok' || state === 'update' ? '설정' : '대시보드') + ' · 예시정형외과의원';
    var next = AUTO[state];
    if (next) timer = setTimeout(function () { show(next[0]); }, next[1]);
  }
  document.addEventListener('click', function (e) {
    var dayBtn = e.target.closest('[data-day]');
    if (dayBtn && !dayBtn.disabled) {
      var how = dayBtn.dataset.day;
      pick(how === 'today' ? TODAY : shift(selected, how === 'prev' ? -1 : 1));
      return;
    }
    var s = e.target.closest('.st-b');
    if (s) { show(s.dataset.state); return; }
    var g = e.target.closest('[data-go]');
    if (g) { e.preventDefault(); show(g.dataset.go); return; }
    var pb = e.target.closest('.stage .seg button');
    if (pb) { setPeriod(pb.dataset.per); return; }
    var c = e.target.closest('[data-act=copy]');
    if (c) { c.textContent = '복사했어요'; setTimeout(function () { c.textContent = '복사'; }, 2000); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.classList && e.target.classList.contains('dp-i')) pick(e.target.value);
  });
  show('before');
})();
''' % (json.dumps(screens, ensure_ascii=False), json.dumps(chart_html, ensure_ascii=False),
       json.dumps(hints, ensure_ascii=False), json.dumps(PERIOD_LABEL, ensure_ascii=False), json.dumps(DAY_DATA, ensure_ascii=False))

TITLE = '비트 읽기 대시보드 시안'
page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{TITLE}</title>
<style>
{read(UI90, 'fonts.css')}
{read(UI90, 'css_page.css')}
{read(UI90, 'css_app.css')}
{EXTRA_CSS}
</style>
</head>
<body>
<header class="wrap intro">
<p class="eyebrow">대시보드 · 비트 PC에서 숫자 읽기 · 클릭 시안</p>
<h1>연결이 끝나면 대시보드가 저절로 채워져요</h1>
<p class="lead">비트 PC 크롬에서 대시보드를 열면 아무것도 누르지 않아도 비트에서 최근 100일 숫자를 읽어 와요. 읽은 뒤에는 날짜를 골라 그 날의 숫자도 볼 수 있어요. 읽는 동안과 실패했을 때 어떻게 보이는지 눌러 보세요. 아직 실제 앱은 바뀌지 않았어요.</p>
</header>
<nav class="secnav" aria-label="시안 목록"><div class="secnav-in">{nav}</div></nav>
<main class="wrap">
{demo}
{phone_note}
{notes_html}
{decide}
</main>
<footer class="wrap foot"><p>그림 속 의원 이름, 이메일, 숫자, 처방 이름은 모두 예시예요. 실제 환자 정보는 들어 있지 않아요.</p></footer>
<dialog id="zoom" aria-labelledby="zt"><div class="zh"><span id="zt"></span><button type="button" class="zc" data-act="zclose">닫기</button></div><div class="zb"></div></dialog>
<script>
{read(UI90, 'app.js')}
{JS}
</script>
</body>
</html>'''
with open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8') as f:
    f.write(page)
print('bytes', len(page.encode()))
