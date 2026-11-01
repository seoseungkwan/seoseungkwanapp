import html as H
D = '/tmp/claude-1000/-home-developer/f0aefd71-28ae-4c2f-86ff-de082e15e7d3/scratchpad/mockup-app/'
ICONS = {
 'shield': '<path d="M8 1.75 3 3.6v3.9c0 3 2.1 5.5 5 6.75 2.9-1.25 5-3.75 5-6.75V3.6L8 1.75z"/><path d="m5.9 8 1.5 1.5 2.8-2.9"/>',
 'clock': '<circle cx="8" cy="8" r="6"/><path d="M8 4.75V8l2.25 1.5"/>',
 'user': '<circle cx="8" cy="5.5" r="2.75"/><path d="M2.75 14c.6-2.5 2.7-3.9 5.25-3.9s4.65 1.4 5.25 3.9"/>',
 'chev': '<path d="m4.75 6.25 3.25 3.25 3.25-3.25"/>',
 'check': '<path d="m3.5 8.25 2.9 2.9 6.1-6.65"/>',
 'x': '<path d="m4.75 4.75 6.5 6.5m0-6.5-6.5 6.5"/>',
 'arrow': '<path d="M2.75 8h10.5M9.25 4l4 4-4 4"/>',
 'monitor': '<rect x="1.75" y="2.75" width="12.5" height="8.5" rx="1"/><path d="M5.5 13.75h5M8 11.25v2.5"/>',
 'stop': '<circle cx="8" cy="8" r="6"/><path d="m3.9 3.9 8.2 8.2"/>',
 'userCheck': '<circle cx="6.5" cy="5.25" r="2.5"/><path d="M1.75 13.5c.5-2.4 2.4-3.75 4.75-3.75 1.15 0 2.2.3 3.05.9"/><path d="m10 12 1.6 1.6 3-3.35"/>',
 'logout': '<path d="M9.5 2.75h2.75a1 1 0 0 1 1 1v8.5a1 1 0 0 1-1 1H9.5"/><path d="M6.5 5 3.5 8l3 3M3.5 8h6.5"/>',
}
def ic(n, s=16, cls=''):
    c = f'ic {cls}'.strip()
    return f'<svg class="{c}" aria-hidden="true" width="{s}" height="{s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">{ICONS[n]}</svg>'
def logo(s=24):
    return (f'<svg class="logo" aria-hidden="true" width="{s}" height="{s}" viewBox="0 0 30 30"><rect x="3" y="3" width="24" height="24" rx="6" fill="none" stroke="#14C8BA" stroke-width="2.4"/>'
            '<path d="M13.5 8h3a1 1 0 0 1 1 1v3.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3.5H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3.5V9a1 1 0 0 1 1-1z" fill="#6D5DF5"/></svg>')
GO = ic('arrow', 16, 'ic-go')
CLINIC = '예시정형외과의원'
TABS = ['대시보드','통계','청구','고시·공지','환자','매출','AI 리포트','서식','직원','업무일지','재고','주소록','설정']
READY = {'대시보드','청구','설정'}

def acct_menu():
    return ('<div class="menu"><div class="menu-h"><span class="menu-n">manager@example.com</span><span class="menu-s">예시정형외과의원</span>'
            '<span class="chip chip-n menu-c">관리자 계정</span></div><div class="menu-l">'
            f'<a href="#" class="menu-i hl">{ic("userCheck")}가입 승인</a><button type="button" class="menu-i">{ic("logout")}로그아웃</button></div></div>')

def header(kind, menu_open=False):
    op = ' open' if menu_open else ''
    ex = 'true' if menu_open else 'false'
    if kind == 'ph':
        return (f'<header class="a-hdr"><div class="brand">{logo(24)}<span class="clinic">{CLINIC}</span></div>'
                f'<div class="acct-w{op}"><button type="button" class="iconbtn" data-act="acct" aria-expanded="{ex}" aria-label="manager@example.com">{ic("user")}</button>{acct_menu()}</div></header>')
    return (f'<header class="a-hdr"><div class="wa"><div class="brand">{logo(24)}<span class="clinic">{CLINIC}</span></div>'
            f'<div class="hdr-r"><span class="clock">2026년 11월 1일 (일) 07:11 (KST)</span><div class="acct-w{op}">'
            f'<button type="button" class="acct" data-act="acct" aria-expanded="{ex}">{ic("user")}manager@example.com{ic("chev")}</button>{acct_menu()}</div></div></div></header>')

def tab_links(cur):
    return ''.join(f'<a href="#" class="tab" data-tab="{t}"' + (' aria-current="page"' if t == cur else '') + f'>{t}</a>' for t in TABS)

def all_panel(cur, open_):
    items = ''
    for t in TABS:
        c = ' aria-current="page"' if t == cur else ''
        mark = '' if t in READY else '<span class="chip chip-n">준비 중</span>'
        items += f'<li><a href="#" class="allp-i" data-tab="{t}"{c}><span>{t}</span>{mark}</a></li>'
    hid = '' if open_ else ' hidden'
    return f'<div class="allp"{hid}><p class="allp-h"><span>모든 탭 13개</span><span>준비 중 10개</span></p><ul class="allp-g">{items}</ul></div>'

def tabs(kind, cur, panel_open=False, still=False):
    bar = '<i class="ldbar still" aria-hidden="true"></i>' if still else '<i class="ldbar" aria-hidden="true"></i>'
    if kind == 'pc':
        return f'<nav class="a-tabs" aria-label="메뉴"><div class="wa"><div class="tabs-in">{tab_links(cur)}</div></div>{bar}</nav>'
    ex = 'true' if panel_open else 'false'
    return (f'<nav class="a-tabs sw" aria-label="메뉴"><div class="tabs-sc"><div class="tabs-in">{tab_links(cur)}</div></div>'
            f'<button type="button" class="allbtn" data-act="allmenu" aria-expanded="{ex}">전체 메뉴{ic("chev")}</button>{bar}</nav>{all_panel(cur, panel_open)}')

def shell(kind, cur, body, menu_open=False, panel_open=False, canvas=False, k1=False, extra='', still=False):
    k = 'pc' if kind in ('pc', 'tab') else 'ph'
    hk = 'pc' if kind in ('pc', 'tab') else 'ph'
    tk = 'pc' if kind == 'pc' else 'ph'
    cls = 'is-pc' if k == 'pc' else 'is-ph'
    if kind == 'tab': cls += ' is-mid'
    bg = ' bg-canvas' if canvas else ''
    mk = ' k1' if k1 else ''
    top = f'<div class="shell-top"><div style="position:relative">{header(hk, menu_open)}</div><div style="position:relative">{tabs(tk, cur, panel_open, still)}</div></div>'
    return f'<div class="ui {cls}{bg}">{extra}{top}<main class="main{mk}"><div class="{"wa" if k=="pc" else ""}">{body}</div></main></div>'

def frame(kind, inner, w, h=None, scroll=False, cap='', title=None, size='', zoom=True, label=''):
    fk = {'ph': 'fig-ph', 'pc': 'fig-pc', 'sm': 'fig-sm', 'full': 'fig-full'}[size or kind]
    st = f'width:{w}px;' + (f'height:{h}px;' if h else '')
    sc = ' sc' if scroll else ''
    zb = f'<button type="button" class="zoom" data-act="zoom">크게 보기</button>' if zoom else ''
    bb = f'<div class="bbar"><span class="btab">{logo(12)}<span class="btab-t">{title}</span></span></div>' if title else ''
    lab = H.escape(label or cap.replace('<b>','').replace('</b>',''), quote=True)
    return (f'<figure class="fig {fk}" data-t="{lab}"><div class="cap"><span>{cap}</span>{zb}</div>{bb}'
            f'<div class="scr" data-w="{w}"><div class="vp{sc}" style="{st}">{inner}</div></div></figure>')

def ttl(name):
    return f'{name} · {CLINIC}'

# ---------- dashboard ----------
STEPS5 = ['크롬 확장 프로그램 설치','도우미 설치','연결','비트 자료 읽기','요양기관기호 확인']
FEATS = [
 ('통계','환자 수 추이·신환 재방문율·처방 추세·요일별 환자 수'),
 ('청구','삭감 예방 사전점검·청구메모·상병 확인·월말 마감'),
 ('고시·공지','심평원·보건복지부·건강보험공단 새 글과 세 줄 요약'),
 ('환자','다시 오실 환자 명단·정기 주사 문자 명단·문자 문구'),
 ('매출','매출 추이·급여와 비급여·치료별 매출·한 사람당 평균 진료비'),
 ('AI 리포트','월간보고 발표 자료·주간 요약·분기와 연간 보고'),
 ('서식','진료일정·휴진 안내·환자 안내문·근무표·보고서 양식'),
 ('직원','직원 명단·급여 계산과 명세서·연차와 휴가'),
 ('업무일지','엑셀 양식과 똑같은 업무일지'),
 ('재고','물품 목록·남은 수량·부족 표시'),
 ('주소록','거래처·수리와 관리 업체·뉴메디코어 연락처'),
 ('설정','점검 규칙·의원 문구·비트 PC 연결·백업'),
]
def dash_body(kind):
    ph = kind == 'ph'
    ol = ''.join(f'<li><span class="num">{i}</span>{s}</li>' for i, s in enumerate(STEPS5, 1))
    left = (f'<p class="date">11월 1일 일요일</p><h1 class="d-h1">비트 PC를 연결하면 오늘 숫자가 여기에 채워져요</h1>'
            '<p class="d-lead">아직 받은 진료 자료가 없어 오늘 분석이 비어 있어요. 연결은 처음 한 번만 하면 되고, 연결한 뒤에는 이 자리에 오늘의 보고 문장이 올라와요.</p>'
            f'<div class="d-cta"><a href="#" class="btn btn-pri btn-lg{" btn-block" if ph else ""}">비트 PC 연결 시작{GO}</a></div>'
            f'<p class="safe">{ic("shield",14)}<span>환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요.</span></p>')
    if ph:
        brief = left + (f'<div class="pst"><button type="button" class="pst-b" data-act="pst" aria-expanded="false"><span>연결 순서<span class="muted">5단계</span></span>{ic("chev")}</button>'
                        f'<ol class="stp" hidden>{ol}</ol></div>')
    else:
        brief = (f'<div class="d-grid"><div class="d-l">{left}</div><div class="d-r"><div class="stp-h"><span>연결 순서</span><span>5단계</span></div>'
                 f'<ol class="stp">{ol}</ol><p class="stp-note">설정의 비트 PC 연결 화면이 한 단계씩 안내해요.</p></div></div>')
    ready = ('<section class="dsec"><div class="dsec-h"><h2 class="dsec-t">연결하면 바로 쓸 수 있어요</h2>'
             '<span class="dsec-s">삭감 예방 사전점검은 비트 PC를 연결한 뒤 열려요.</span></div>'
             '<div class="rn"><div><p class="rn-k">청구 탭</p><p class="rn-n">삭감 예방 사전점검</p></div>'
             '<div><p class="rn-d">청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요.</p><p class="rn-x">청구 점검은 비트 PC의 크롬에서 열려요.</p></div>'
             f'<div class="rn-a"><a href="#" class="btn btn-sec">비트 PC 연결부터{GO}</a></div></div></section>')
    kp = ''.join(f'<div class="kpi"><p class="kpi-n">{n}</p><p class="kpi-v">–</p><p class="kpi-s">연결하면 보여요</p></div>' for n in ['오늘 환자 수','신환','재진','지난주 같은 요일보다'])
    today = (f'<section class="dsec"><div class="dsec-h"><h2 class="dsec-t">오늘 하루 분석</h2><span class="chip chip-n">비트 PC 연결 전</span></div>'
             f'<div class="kpis">{kp}</div><p class="d-note">연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요.</p></section>')
    gains = [('환자 수 추이','신환과 재진을 하루씩 막대로 보여 줘요.'),('신환 재방문율','처음 온 환자가 7·14·30일 안에 다시 온 비율이에요.'),
             ('요일별 환자 수','요일마다 하루 평균 환자 수예요.'),('처방 상위','많이 낸 처방 5가지를 차례로 적어요.')]
    gl = ''.join(f'<li><p class="gain-n"><span class="num">{i}</span>{n}</p><p class="gain-d">{d}</p></li>' for i, (n, d) in enumerate(gains, 1))
    seg = '<div class="seg"><button type="button" aria-pressed="false">최근 7일</button><button type="button" aria-pressed="true">최근 30일</button><button type="button" aria-pressed="false">최근 90일</button></div>'
    flow = (f'<section class="dsec"><div class="dsec-h sp"><h2 class="dsec-t">기간별 흐름</h2><div class="per"><span class="rng">10월 2일 – 10월 31일</span>{seg}</div></div>'
            f'<p class="gain-t">연결하면 생기는 것 4가지</p><ol class="gain">{gl}</ol>'
            '<p class="d-note">연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요.</p></section>')
    fi = ''
    for n, d in FEATS:
        if n == '청구':
            s = f'<span class="fi-s first">연결 먼저{ic("arrow",14)}</span>'
        elif n == '설정':
            s = f'<span class="fi-s go">사용 가능{ic("arrow",14)}</span>'
        else:
            s = '<span class="fi-s">준비 중</span>'
        fi += f'<a href="#"><span class="fi-h"><span class="fi-n">{n}</span>{s}</span><span class="fi-d" style="display:block">{d}</span></a>'
    idx = (f'<section class="dsec"><div class="dsec-h"><h2 class="dsec-t">기능 목차</h2><span class="dsec-s">12개 가운데 1개는 지금, 1개는 연결하면 쓸 수 있어요</span></div>'
           f'<div class="fi">{fi}</div></section>')
    return brief + ready + today + flow + idx

# ---------- not ready ----------
def nr_body(kind, h1='주소록은 준비 중이에요', intro='거래처와 업체 연락처를 한곳에 모아 둘 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요.',
            items=('거래처','수리·관리 업체','뉴메디코어 연락처'), btn=None, meanwhile=True, box=False):
    ph = kind == 'ph'
    btn = btn or f'<a href="#" class="btn btn-sec{" btn-block" if ph else ""}">{ic("arrow",16,"ic-back")}대시보드로 돌아가기</a>'
    lis = ''.join(f'<li>{x}</li>' for x in items)
    mw = ''
    if meanwhile:
        mw = ('<div class="mw"><h2 class="mw-t">그동안 쓸 수 있어요</h2><ul class="mw-l">'
              f'<li><a href="#" class="tbtn">비트 PC 연결{GO}</a><span class="mw-d">청구 점검을 쓰려면 먼저 해요</span></li>'
              f'<li><a href="#" class="tbtn">청구{GO}</a><span class="mw-d">삭감 예방 사전점검</span></li></ul></div>')
    inner = (f'<div class="nr"><div class="nr-l"><span class="chip chip-n">준비 중</span><h1 class="nr-h1">{h1}</h1><p class="nr-p">{intro}</p>'
             f'<div class="nr-btn">{btn}</div></div><div class="nr-r"><h2 class="nr-rt">만들 것</h2><ul class="dots">{lis}</ul></div>{mw}</div>')
    if box:
        return f'<div class="nr-box">{inner}</div>'
    return inner

# ---------- claim ----------
def claim_body(kind):
    ph = kind == 'ph'
    return ('<div class="cl"><h1 class="cl-h1">이 PC에서는 청구 점검을 열 수 없어요</h1><ul class="dots">'
            '<li>환자 정보와 삭감 경고는 비트 PC(비트가 깔린 의원 PC)에서만 보여요.</li>'
            '<li>이 PC는 아직 비트 PC로 연결되지 않았어요.</li></ul>'
            f'<div class="cl-btn"><a href="#" class="btn btn-pri btn-lg{" btn-block" if ph else ""}">이 PC를 비트 PC로 연결{GO}</a></div>'
            '<p class="cl-other"><span>다른 PC에서는 건수만 볼 수 있어요</span><span class="chip chip-n">준비 중</span></p></div>')

def claim_ready_body():
    btn = f'<a href="#" class="btn btn-sec">비트 PC 연결 다시 확인</a>'
    return nr_body('pc', h1='청구 점검 화면은 준비 중이에요', intro='이 PC는 비트와 연결됐어요. 점검 화면이 만들어지면 이 탭에서 바로 열려요.',
                   items=('삭감 예방 사전점검','청구메모','상병 확인','월말 마감'), btn=btn, meanwhile=False)

BUSY = ('<div class="ui is-pc" style="padding:24px;background:var(--canvas)"><div class="busy"><h3>청구 화면이 다른 창에서 열려 있어요</h3>'
        '<p>같은 환자를 두 번 넣지 않도록 청구 화면은 한 창에서만 열 수 있어요. 열려 있는 다른 창이나 탭으로 가서 계속하세요.</p>'
        '<p style="margin-top:8px;font-size:13px">다른 창을 닫았다면 [다시 확인]을 누르세요.</p>'
        '<div class="b-a"><a href="#" class="btn btn-pri">다시 확인</a><a href="#" class="btn btn-sec">건수만 보기</a></div>'
        '<p class="b-c">오류 번호 E-BRIDGE-BUSY</p></div></div>')

# ---------- setup ----------
SDESC = [
 '크롬에 붙이는 작은 프로그램이에요. 우리 사이트와 도우미를 이어 줘요.',
 '비트를 읽고 메모를 넣는 윈도우 프로그램이에요. 설치할 때 윈도우가 경고를 띄워도 정상이에요.',
 '우리 사이트, 확장 프로그램, 도우미가 서로 이어졌는지 봐요.',
 '비트를 읽기만 해요. 비트 자료를 고치지 않아요.',
 '요양기관기호(심평원이 우리 의원에 준 번호)로 이 PC의 비트가 우리 의원 것인지 봐요.',
]
def setup_body(kind, state):
    ph = kind == 'ph'
    blk = ' btn-block' if ph else ''
    steps = ''
    for i, (t, d) in enumerate(zip(STEPS5, SDESC), 1):
        extra = ''
        cls = ''
        if state == 'first':
            chip = '<span class="chip chip-a">할 차례</span>' if i == 1 else '<span class="chip chip-n">대기</span>'
            if i > 1: cls = ' wait'
            if i == 1:
                extra = ('<div class="howto"><ol>'
                         '<li><span>[확장 내려받기]를 눌러 파일을 받고, 파일을 오른쪽 클릭해 [모두 압축 풀기]를 눌러요.</span></li>'
                         '<li><span>크롬 주소창에 <code>chrome://extensions</code> 를 넣고, 오른쪽 위 [개발자 모드]를 켜요.</span></li>'
                         '<li><span>[압축해제된 확장 프로그램을 로드합니다]를 눌러 방금 푼 폴더를 골라요.</span></li>'
                         '<li><span>이 화면으로 돌아와 [다시 확인]을 눌러요.</span></li></ol>'
                         f'<div class="howto-a"><a href="#" class="btn btn-pri{blk}">확장 내려받기</a><a href="#" class="btn btn-sec{blk}">다시 확인</a></div></div>')
        else:
            chip = f'<span class="chip chip-pos">{ic("check",12)}완료</span>' if i < 5 else f'<span class="chip chip-neg">{ic("x",12)}의원 다름</span>'
        if ph:
            steps += f'<div class="step{cls}"><span class="num">{i}</span><div><p class="step-t">{t}</p><div class="step-s">{chip}</div><p class="step-d">{d}</p></div>{extra}</div>'
        else:
            steps += f'<div class="step{cls}"><span class="num">{i}</span><div><p class="step-t">{t}</p><p class="step-d">{d}</p></div><div class="step-s">{chip}</div>{extra}</div>'
    if state == 'first':
        kv = '<dt>크롬 확장 프로그램</dt><dd>아직 없어요</dd><dt>도우미</dt><dd>아직 없어요</dd><dt>요양기관기호</dt><dd>아직 없어요</dd><dt>마지막 확인</dt><dd>방금</dd>'
    else:
        kv = (f'<dt>크롬 확장 프로그램</dt><dd class="ok">{ic("check",12)}맞아요</dd><dt>도우미</dt><dd class="ok">{ic("check",12)}맞아요</dd>'
              f'<dt>요양기관기호</dt><dd class="bad">{ic("x",12)}등록한 번호와 달라요</dd><dt>마지막 확인</dt><dd>방금</dd>')
    side = (f'<div class="st-side"><section class="panel"><div class="p-h"><h2 class="p-t">이 PC</h2></div><div class="p-b"><dl class="kv">{kv}</dl></div></section>'
            '<section class="panel"><div class="p-h"><h2 class="p-t">이렇게 지켜요</h2></div><div class="p-b"><ul class="keep">'
            '<li>환자 자료는 이 PC 밖으로 나가지 않아요. 우리 사이트에는 건수와 설정만 가요.</li>'
            '<li>비트는 읽기만 해요. 메모를 넣을 때만 이 PC에 확인 창이 뜨고, 거기서 [확인]을 눌러야 들어가요.</li>'
            '<li>확장 프로그램과 도우미는 이 비트 PC 한 대에만 설치해요.</li></ul></div></section></div>')
    note = ''
    if state == 'first':
        note = (f'<div class="st-note">{ic("monitor")}<div><p><b>이 화면은 비트 PC의 크롬에서 열어요.</b></p>'
                '<p>비트 PC는 비트가 깔린 의원 PC예요. 집 PC나 휴대폰에서는 연결하지 않아도 돼요.</p></div></div>')
    err = ''
    if state == 'mismatch':
        err = (f'<div class="errc" style="margin-top:16px">{ic("stop")}<div><p class="errc-w">이 PC의 비트가 등록한 의원과 달라요</p>'
               '<p class="errc-f">우리 의원 비트가 맞으면 [다시 등록]을 눌러요. 이 PC에 뜨는 확인 창에서 전에 등록한 값과 새 값을 보고 [확인]을 눌러요.</p>'
               '<p class="errc-c">오류 번호 E-BIT-HOSPITAL-MISMATCH</p>'
               f'<div class="errc-a"><a href="#" class="btn btn-pri{blk}">다시 등록</a><a href="#" class="btn btn-sec{blk}">다시 확인</a></div></div></div>')
    sub = ('<div class="subtabs"><span class="subtab">청구·연락 <span class="chip chip-n">준비 중</span></span>'
           '<span class="subtab on">비트 PC 연결</span></div>')
    stp = f'<section class="panel"><div class="p-h"><h2 class="p-t">준비 순서</h2><span class="p-s">5단계</span></div><div class="p-b">{steps}</div></section>'
    return f'{note}<h1 class="pg-h1">설정</h1>{sub}{err}<div class="st-grid">{stp}{side}</div>'

# ---------- admin ----------
ROWS = [('2026-10-29','바른마디정형외과의원','김민수','barun@example.com','010-1234-5678'),
        ('2026-10-28','하늘척추의원','이서연','sky@example.com','031-123-4567'),
        ('2026-10-27','튼튼재활의학과의원','박준호','teun@example.com','—')]
def admin_body(kind):
    ph = kind == 'ph'
    head = (f'<p class="loc">{ic("userCheck",14)}관리자</p><h1 class="ad-h1">가입 승인</h1>'
            '<p class="ad-p">승인하면 그 계정은 바로 대시보드를 쓸 수 있어요. 거절한 신청은 거절 탭에서 되돌릴 수 있어요.</p>'
            '<div class="itabs"><span class="itab on">대기 <span class="muted">3</span></span><span class="itab">승인 <span class="muted">1</span></span><span class="itab">거절 <span class="muted">1</span></span></div>')
    if ph:
        rows = ''.join(f'<div class="arow"><div class="arow-1"><b>{h}</b><span>{d}</span></div><p class="arow-2">{n} · {e}</p>'
                       f'<div class="arow-3"><span>{p}</span><span class="acts"><a href="#" class="btn btn-acc btn-sm">승인</a><a href="#" class="btn btn-sec btn-sm">거절</a></span></div></div>'
                       for d, h, n, e, p in ROWS)
        return head + f'<div class="arows">{rows}</div>'
    rows = ''.join(f'<tr><td class="d">{d}</td><td class="h">{h}</td><td>{n}</td><td class="e">{e}</td><td class="e">{p}</td>'
                   f'<td><span class="acts"><a href="#" class="btn btn-acc btn-sm">승인</a><a href="#" class="btn btn-sec btn-sm">거절</a></span></td></tr>' for d, h, n, e, p in ROWS)
    cols = '<colgroup><col style="width:120px"><col><col style="width:120px"><col><col style="width:150px"><col style="width:150px"></colgroup>'
    return head + f'<table class="tb">{cols}<thead><tr><th>신청일</th><th>의원 이름</th><th>신청자</th><th>이메일</th><th>연락처</th><th>동작</th></tr></thead><tbody>{rows}</tbody></table>'

# ---------- error ----------
def error_ui(kind):
    ph = kind == 'ph'
    cls = 'is-ph' if ph else 'is-pc'
    return (f'<div class="ui {cls}"><div class="af"><div class="af-col"><div class="af-hdr">{logo(28)}</div>'
            f'<span class="chip chip-neg er-chip">{ic("stop",12)}문제가 생겼어요</span>'
            '<h1 class="er-h1">화면을 열지 못했어요</h1>'
            '<p class="er-p">잠시 뒤 [다시 시도]를 눌러 주세요. 계속되면 아래 오류 번호를 관리자에게 메일로 알려 주세요.</p>'
            '<div class="er-dl"><p><b>오류 번호</b> E-PAGE-FAILED</p><p><b>관리자 메일:</b> admin@example.com</p></div>'
            '<div class="er-a"><a href="#" class="btn btn-pri">다시 시도</a><a href="#" class="btn btn-sec">대시보드로</a><a href="#" class="btn btn-ghost">로그아웃</a></div>'
            '</div></div></div>')

# ---------- states for section 1 ----------
def skip_state():
    body = dash_body('ph')
    return shell('ph', '대시보드', body, extra='<a href="#" class="skip">본문으로 건너뛰기</a>')

def idle_state():
    body = dash_body('ph')
    note = (f'<div class="idle" data-idle><div class="idle-on"><p class="idle-t">{ic("clock")}1분 뒤 자동으로 로그아웃돼요</p>'
            '<p class="idle-p">30분 동안 아무것도 누르지 않았어요. 환자 정보를 지키려고 곧 로그아웃해요.</p>'
            '<button type="button" class="btn btn-pri btn-block" data-act="idle">계속 쓰기</button></div>'
            '<div class="idle-ok" hidden><span>다시 30분 동안 쓸 수 있어요.</span><button type="button" class="tbtn" data-act="idle-back">안내 다시 보기</button></div></div>')
    return shell('ph', '대시보드', body, extra=note)

def browser_titles():
    tabs_ = [('대시보드', True), ('청구', False), ('가입 승인', False)]
    t = ''.join(f'<span class="btab{"" if on else " off"}">{logo(12)}<span class="btab-t">{ttl(n)}</span></span>' for n, on in tabs_)
    return (f'<div class="btitle"><div class="bt-row">{t}</div>'
            f'<p>지금은 모든 화면이 <b>병원 업무 도구</b> 한 이름이라, 창을 여러 개 열면 구별이 안 돼요. 고친 뒤에는 화면 이름이 앞에 와요.</p></div>')

# ================= page =================
def notes(changed, rules):
    c = ''.join(f'<li><span>{x}</span></li>' for x in changed)
    r = ''.join(f'<li><span>{x}</span></li>' for x in rules)
    rb = f'<div class="nb rule"><h3>규칙이 바뀌어요</h3><ul>{r}</ul></div>' if rules else ''
    return f'<div class="notes"><div class="nb"><h3>무엇이 달라졌나</h3><ul>{c}</ul></div>{rb}</div>'

ARR = ic('arrow', 14)
def score(now, to):
    return f'<p class="score">지금 {now}점 {ARR} <b>고친 뒤 {to}점</b></p>'

def section(id_, k, title, now, to, lead, body, ch, rules):
    return (f'<section class="sec" id="{id_}"><p class="sec-k">{k}</p><h2>{title}</h2>{score(now, to)}'
            f'<p class="sec-p">{lead}</p>{body}{notes(ch, rules)}</section>')

S = []
# 1 frame
row1 = ('<div class="row">'
        + frame('ph', shell('ph', '대시보드', dash_body('ph'), panel_open=True), 390, 640, True,
                cap='<b>폰</b> · [전체 메뉴]를 눌러 보세요', label='앱 틀 · 폰')
        + frame('pc', shell('pc', '대시보드', dash_body('pc')), 1440, 780, True,
                cap='<b>PC</b> · 탭이나 계정 단추를 눌러 보세요', title=ttl('대시보드'), label='앱 틀 · PC')
        + '</div>')
states = ('<h3 class="sub-h">상황마다 이렇게 보여요</h3><p class="sub-p">평소에는 안 보이다가 그때만 나타나는 것들이에요.</p><div class="row">'
          + frame('ph', skip_state(), 390, 300, False, cap='<b>키보드로 처음 눌렀을 때</b>', size='sm', label='본문으로 건너뛰기')
          + frame('ph', idle_state(), 390, 520, False, cap='<b>30분 동안 쓰지 않았을 때</b> · [계속 쓰기]를 눌러 보세요', size='sm', label='자동 로그아웃 안내')
          + f'<figure class="fig fig-sm"><div class="cap"><span><b>브라우저 탭 이름</b></span></div>{browser_titles()}</figure>'
          + '</div><div class="row">'
          + frame('tab', shell('tab', '설정', setup_body('pc', 'first')), 768, 330, False,
                  cap='<b>태블릿 768</b> · 계정 이메일이 잘리지 않고, 화면이 옆으로 넘치지 않아요', size='full', label='태블릿 768')
          + '</div>')
S.append(section('frame', '1 · 모든 화면에 붙는 틀', '앱 틀: 탭 줄, 위쪽 띠, 계정 메뉴', 78, 90,
  '모든 화면 위에 붙는 부분이에요. 폰에서 13개 탭을 한 번에 보는 단추가 생기고, 눌렀는지 바로 알 수 있게 바뀌어요.',
  row1 + states,
  ['폰처럼 탭이 한 줄에 다 안 들어갈 때, 탭 줄 끝에 <b>[전체 메뉴]</b> 단추가 생겨요. 누르면 13개 탭이 두 줄로 펼쳐지고 "준비 중" 표시도 같이 보여요. 옆으로 밀어 보는 탭도 그대로예요.',
   '브라우저 탭 이름이 화면마다 달라져요. 예: "대시보드 · 예시정형외과의원".',
   '키보드로 처음 누르면 "본문으로 건너뛰기"가 보여요. 탭 13개를 지나지 않고 바로 본문으로 가요.',
   '탭을 누르면 그 탭에 바로 밑줄이 가고, 탭 줄 아래에 얇은 파란 줄이 차올라요. 눌렸는지 바로 알 수 있어요.',
   '30분 동안 쓰지 않으면 로그아웃 1분 전에 알려 드려요. [계속 쓰기]를 누르면 그대로 쓸 수 있어요.',
   '태블릿 폭에서 계정 이메일이 잘리고 설정 화면이 옆으로 조금 넘치던 것을 고쳤어요.'],
  ['지금 규칙은 "폰도 가로 탭만"이에요. [전체 메뉴] 단추 하나가 더해져요.',
   '지금 규칙은 "누를 때 짧은 반응만 움직임"이에요. 화면을 불러오는 동안 얇은 줄이 차오르는 움직임 하나가 더해져요. 움직임 줄이기를 켠 기기에서는 멈춰 있어요.']))

# 2 dashboard
row2 = ('<div class="row">'
        + frame('ph', shell('ph', '대시보드', dash_body('ph')), 390, 760, True, cap='<b>폰</b> · 아래로 밀어 보세요', label='대시보드 · 폰')
        + frame('pc', shell('pc', '대시보드', dash_body('pc')), 1440, 1500, True, cap='<b>PC</b> · 아래로 밀어 보세요', title=ttl('대시보드'), label='대시보드 · PC')
        + '</div>')
S.append(section('dashboard', '2 · 비트 PC를 연결하기 전', '대시보드', 77, 91,
  '연결 전에는 비어 있는 자리가 많았어요. 빈 그래프 대신 "연결하면 무엇이 생기는지"를 짧게 보여 주고, 청구는 연결이 먼저라고 바로 알려요.',
  row2,
  ['청구 칸이 "사용 가능" 대신 <b>"연결 먼저"</b>로 보여요. 사전점검 줄의 단추도 [비트 PC 연결부터]로 바뀌어 연결 화면으로 데려가요.',
   '비어 있는 그래프 4개 대신 <b>"연결하면 생기는 것 4가지"</b>를 짧게 적었어요. 폰에서 화면 길이가 약 3분의 1 줄어요.',
   '작은 설명 글이 12에서 13 크기로 커지고, 한 줄이 너무 길어지지 않게 맞췄어요.',
   '흐리던 "준비 중"과 "–" 글자가 조금 진해져 잘 읽혀요.',
   '말끝을 "~요"로 맞췄어요. 예: "채워집니다" → "채워져요".',
   '폰의 기간 단추가 높이 44로 커져 손가락으로 누르기 쉬워요.'],
  ['승인된 대시보드 시안이 바뀌어요: 연결 전 빈 그래프 틀 4개가 빠지고, 청구 상태 글자가 "연결 먼저"로, 그 줄 제목이 "연결하면 바로 쓸 수 있어요"로 바뀌어요.',
   '"준비 중" 글자는 흐린 회색으로 둔다는 예외 규칙이 없어지고 보통 회색이 돼요.']))

# 3 not ready
row3 = ('<div class="row">'
        + frame('ph', shell('ph', '주소록', nr_body('ph')), 390, 700, False, cap='<b>폰</b>', label='준비 중 화면 · 폰')
        + frame('pc', shell('pc', '주소록', nr_body('pc')), 1440, 640, False, cap='<b>PC</b>', title=ttl('주소록'), label='준비 중 화면 · PC')
        + '</div>')
ab = ('<h3 class="sub-h">바탕을 골라 주세요</h3><p class="sub-p">같은 화면을 바탕만 바꿔 작게 그렸어요. 고르신 바탕은 준비 중 화면뿐 아니라 모든 탭에 똑같이 써요.</p><div class="row">'
      + frame('pc', shell('pc', '주소록', nr_body('pc')), 1440, 640, False, cap='<b>A 흰 바탕</b> · 대시보드와 같게, 바깥 상자 없음 · <span class="rec">추천</span>', size='sm', label='A 흰 바탕')
      + frame('pc', shell('pc', '주소록', nr_body('pc', box=True), canvas=True), 1440, 640, False, cap='<b>B 회색 바탕 + 상자</b> · 지금처럼', size='sm', label='B 회색 바탕')
      + '</div>')
S.append(section('not-ready', '3 · 아직 만들지 않은 탭 10개가 같이 쓰는 화면', '준비 중 화면 (예: 주소록)', 79, 91,
  '통계, 환자, 매출 같은 10개 탭이 이 화면을 같이 써요. 어느 탭인지, 무엇이 생기는지, 그동안 무엇을 쓰면 되는지를 한 화면에 담았어요.',
  row3 + ab,
  ['제목이 <b>"주소록은 준비 중이에요"</b>로 바뀌어 어느 탭인지 바로 알아요. 지금은 모든 탭이 "준비 중인 기능입니다"예요.',
   '왼쪽에 이름·소개·단추, 오른쪽에 "만들 것" 목록을 두었어요. 목록은 가운데가 아니라 왼쪽에 맞추고 점을 찍었어요.',
   '꾸밈으로 넣었던 가로선 4개를 뺐어요.',
   '"그동안 쓸 수 있어요" 줄에서 [비트 PC 연결]·[청구]로 바로 갈 수 있어요.',
   '폰에서는 위에서 아래로 한 줄로 쌓이고, 단추가 화면 폭 가득 커져요.'],
  ['준비 중 화면 규칙(가운데 맞춤, 바깥 상자 하나, 꾸밈 가로선 4개)이 새 배치로 바뀌어요.',
   'A를 고르시면 모든 탭 바탕이 흰색이 돼요. 지금은 대시보드만 흰색이고 나머지는 회색이에요.']))

# 4 claim
row4 = ('<div class="row">'
        + frame('ph', shell('ph', '청구', claim_body('ph')), 390, 640, False, cap='<b>폰</b> · 비트 PC가 아닌 곳에서 열었을 때', label='청구 · 폰')
        + frame('pc', shell('pc', '청구', claim_body('pc')), 1440, 600, False, cap='<b>PC</b> · 비트 PC가 아닌 곳에서 열었을 때', title=ttl('청구'), label='청구 · PC')
        + '</div>')
row4b = ('<h3 class="sub-h">다른 상황 두 가지</h3><div class="row">'
         + frame('pc', shell('pc', '청구', claim_ready_body()), 1440, 600, False, cap='<b>연결된 뒤</b> · 다른 준비 중 화면과 같은 모양', size='sm', label='청구 · 연결된 뒤')
         + frame('pc', BUSY, 568, None, False, cap='<b>다른 창에서 열려 있을 때</b> · 지금 그대로 둬요', size='sm', label='다른 창에서 열려 있어요')
         + '</div>')
S.append(section('claim', '4 · 청구 탭', '청구', 68, 90,
  '집 PC나 휴대폰에서 청구 탭을 열면 지금은 "밖에서 보는 건수"라는 낯선 상자만 보여요. 왜 못 여는지와 무엇을 하면 되는지를 먼저 말하게 바꿨어요.',
  row4 + row4b,
  ['맨 위 큰 글자가 <b>"이 PC에서는 청구 점검을 열 수 없어요"</b>예요.',
   '이유 두 줄: 환자 정보는 비트 PC에서만 보여요. 이 PC는 아직 연결 전이에요.',
   '할 일은 단추 하나, <b>[이 PC를 비트 PC로 연결]</b>이에요. 폰에서는 화면 폭 가득, 높이 44예요.',
   '"밖에서 보는 건수"라는 이름을 없애고 "다른 PC에서는 건수만 볼 수 있어요(준비 중)"로 적었어요.',
   '연결된 뒤의 "준비 중"도 다른 준비 중 화면과 같은 모양이에요.',
   '"다른 창에서 열려 있어요" 안내는 이미 좋아서 그대로 둬요.'],
  ['승인된 사전점검 시안의 "밖에서 보는 건수" 화면 문구와 모양이 바뀌어요.']))

# 5 setup
row5 = ('<h3 class="sub-h">처음 들어왔을 때</h3><div class="row">'
        + frame('ph', shell('ph', '설정', setup_body('ph', 'first')), 390, 760, True, cap='<b>폰</b> · 아래로 밀어 보세요', label='비트 PC 연결 처음 · 폰')
        + frame('pc', shell('pc', '설정', setup_body('pc', 'first')), 1440, 1040, True, cap='<b>PC</b>', title=ttl('비트 PC 연결'), label='비트 PC 연결 처음 · PC')
        + '</div>')
row5b = ('<h3 class="sub-h">정말 문제가 있을 때 (예: 의원이 다를 때)</h3><p class="sub-p">빨강은 이런 때만 써요. 경고 하나에 단추 둘, 오류 번호는 한 번만 보여요.</p><div class="row">'
         + frame('ph', shell('ph', '설정', setup_body('ph', 'mismatch')), 390, 760, True, cap='<b>폰</b>', label='비트 PC 연결 문제 · 폰')
         + frame('pc', shell('pc', '설정', setup_body('pc', 'mismatch')), 1440, 980, True, cap='<b>PC</b>', title=ttl('비트 PC 연결'), label='비트 PC 연결 문제 · PC')
         + '</div>')
S.append(section('setup', '5 · 설정 탭', '비트 PC 연결', 66, 91,
  '처음 들어오면 빨간 경고가 여러 개 보여 고장 난 것처럼 느껴졌어요. 처음에는 "할 차례"만 보이고, 진짜 문제가 있을 때만 빨강이 나오게 바꿨어요.',
  row5 + row5b,
  ['처음 들어오면 빨간 경고 대신 파란 <b>"할 차례"</b>가 보여요. 빨강은 버전이 안 맞거나 의원이 다를 때만 써요.',
   '경고는 하나, [다시 확인]도 하나, 주 단추도 하나예요. 오류 번호는 한 번만, 더 진한 글자로 보여요.',
   '"앞 단계를 먼저 해 주세요"를 네 번 되풀이하던 것을 뺐어요.',
   '폰에서는 상태 표시가 단계 이름 바로 아래로 내려가고, 설명 글이 14 크기로 커져요.',
   '폰이나 집 PC에서 열면 "이 화면은 비트 PC의 크롬에서 열어요" 안내가 맨 위에 보여요.',
   '이름을 <b>"비트 PC 연결"</b> 하나로 맞추고, 어려운 말은 처음 한 번 괄호로 풀었어요. "윈도우가 경고를 띄워도 정상이에요"도 적었어요.'],
  ['단계 표시에 "할 차례"(파랑)가 더해지고, 승인된 사전점검 시안의 첫 화면 빨강이 빠져요.',
   '"설치·연결 확인", "비트 연결"처럼 여러 개였던 이름이 모두 "비트 PC 연결"이 돼요. "병원"은 "의원"으로 써요.']))

# 6 admin
row6 = ('<div class="row">'
        + frame('ph', shell('ph', '', admin_body('ph')), 390, 700, False, cap='<b>폰</b>', label='가입 승인 · 폰')
        + frame('pc', shell('pc', '', admin_body('pc'), menu_open=True), 1440, 600, False, cap='<b>PC</b> · 계정 메뉴의 이름과 제목이 같아요', title=ttl('가입 승인'), label='가입 승인 · PC')
        + '</div>')
S.append(section('admin', '6 · 관리자만 보는 화면', '가입 승인', 83, 90,
  '이미 좋은 화면이에요. 메뉴 이름과 제목을 맞추고, 관리자 화면이라는 표시와 말투만 다듬었어요.',
  row6,
  ['제목이 계정 메뉴 이름과 같은 <b>"가입 승인"</b>이 됐어요. 지금은 메뉴는 "가입 승인", 제목은 "가입 신청"이에요.',
   '제목 위에 작은 <b>"관리자"</b> 표시가 있어 지금 관리자 화면에 있다는 걸 알아요.',
   '안내 글 말끝을 "~요"로 맞췄어요. 예: "쓸 수 있습니다" → "쓸 수 있어요".',
   '안내 글 한 줄이 너무 길지 않게 폭을 맞췄어요.',
   '기다리는 신청 수는 지금처럼 화면 안 "대기 3"에만 보여요. 메뉴에 숫자를 따로 달지 않아요.'],
  ['관리자 화면 제목이 "가입 신청"에서 "가입 승인"으로 바뀌어요.']))

# 7 error
row7 = ('<div class="row">'
        + frame('ph', error_ui('ph'), 390, 640, False, cap='<b>폰</b>', label='오류 화면 · 폰')
        + frame('pc', error_ui('pc'), 1440, 560, False, cap='<b>PC</b>', title=ttl('오류'), label='오류 화면 · PC')
        + '</div>')
S.append(section('error', '7 · 화면을 열다 문제가 생겼을 때', '오류 화면', 78, 90,
  '지금은 빨간 상자 하나와 단추 둘만 있어요. 무엇이 잘못됐는지, 누구에게 알리면 되는지, 어디로 돌아가면 되는지를 한눈에 보이게 했어요.',
  row7,
  ['큰 제목이 무엇이 잘못됐는지 바로 말해요: <b>"화면을 열지 못했어요"</b>.',
   '누구에게 알릴지 적었어요: "관리자 메일: admin@example.com". 이 주소는 예시예요. 실제 주소는 정해 주시면 넣어요.',
   '단추가 셋이에요: [다시 시도]·[대시보드로]·[로그아웃].',
   '흐리던 오류 번호 글자를 더 진하게 해 잘 읽혀요.',
   '브라우저 탭 이름도 "오류 · 예시정형외과의원"으로 보여요.'],
  ['오류 화면 규칙(빨간 상자 + 단추 둘)에 큰 제목, 관리자 메일, [대시보드로]가 더해져요.']))

SUMROWS = [('frame','앱 틀','폰 [전체 메뉴], 화면마다 탭 이름, 로그아웃 예고',78,90),
           ('dashboard','대시보드 (연결 전)','청구는 "연결 먼저", 빈 그래프 4개를 짧은 안내로',77,91),
           ('not-ready','준비 중 화면','"주소록은 준비 중이에요", 그동안 쓸 것 안내',79,91),
           ('claim','청구','못 여는 이유와 할 일 하나를 먼저',68,90),
           ('setup','비트 PC 연결','처음엔 빨강 대신 "할 차례", 경고·단추 하나씩',66,91),
           ('admin','가입 승인','메뉴와 같은 제목, "관리자" 표시',83,90),
           ('error','오류 화면','무엇이 잘못됐는지 제목으로, 관리자 메일',78,90)]
sumt = ''.join(f'<tr><td><a href="#{i}">{n}</a><span class="what">{w}</span></td><td class="n now">{a}점</td><td class="n to">{b}점</td></tr>' for i, n, w, a, b in SUMROWS)
NAV = [('frame','앱 틀'),('dashboard','대시보드'),('not-ready','준비 중'),('claim','청구'),('setup','비트 PC 연결'),('admin','가입 승인'),('error','오류'),('decide','정해 주실 것')]
nav = ''.join(f'<a href="#{i}"{" class=dec" if i=="decide" else ""}>{n}</a>' for i, n in NAV)

decide = ('<section class="sec" id="decide"><div class="decide"><p class="sec-k">정해 주실 것</p><h2>두 가지만 골라 주세요</h2><ol>'
          '<li><div><p class="q">바탕: A 흰 바탕 또는 B 회색 바탕 + 상자</p><p class="a">A는 대시보드처럼 모든 탭을 흰 바탕 한 장으로, 바깥 상자 없이 써요(추천). B는 지금처럼 회색 바탕 위에 흰 상자를 둬요. '
          '<a href="#not-ready" style="color:var(--accent)">3번 준비 중 화면</a>에서 두 모습을 비교해 보세요.</p></div></li>'
          '<li><div><p class="q">말투: 모든 화면의 말끝을 "~요"로</p><p class="a">이미 승인된 문구 몇 개가 바뀌어요. 예: 대시보드 "숫자가 여기에 채워집니다" → "채워져요", '
          '가입 승인 "대시보드를 쓸 수 있습니다" → "쓸 수 있어요", 준비 중 화면 "준비 중인 기능입니다" → "주소록은 준비 중이에요".</p></div></li></ol>'
          '<p class="reply">이렇게 답해 주시면 돼요: <b>바탕 A, 말투 좋아요</b> (B가 좋으시면 <b>바탕 B</b>)</p></div></section>')

page = f'''<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI 90점 시안 — 로그인 뒤 화면</title>
<style>
{open(D+'fonts.css').read()}
{open(D+'css_page.css').read()}
{open(D+'css_app.css').read()}
</style>
</head>
<body>
<header class="wrap intro">
<p class="eyebrow">로그인 뒤 화면 · 고친 뒤 모습 시안</p>
<h1>로그인 뒤 7개 화면을 모두 90점 넘게</h1>
<p class="lead">지난 점검에서 화면마다 점수를 매기고 고칠 곳을 찾았어요. 그 고칠 곳을 모두 고쳤을 때의 모습을 폰과 PC로 나란히 그렸어요. 단추와 탭은 눌러 볼 수 있어요. 아직 실제 앱은 바뀌지 않았어요.</p>
<table class="sum"><thead><tr><th>화면</th><th class="n">지금</th><th class="n">고친 뒤</th></tr></thead><tbody>{sumt}</tbody></table>
<p class="sum-note">점수는 10가지 기준(첫인상, 읽기 쉬움, 한결같음, 폰, 길 찾기, 믿음, 문구, 누구나 쓰기 쉬움, 반응, 마무리)으로 매긴 100점 만점이에요. 없는 주소를 열었을 때의 화면은 다른 시안에서 보여 드려요.</p>
</header>
<nav class="secnav" aria-label="화면 목록"><div class="secnav-in">{nav}</div></nav>
<main class="wrap">
{''.join(S)}
{decide}
</main>
<footer class="wrap foot"><p>그림 속 의원 이름, 이메일, 신청 목록은 모두 예시예요. 실제 환자 정보는 들어 있지 않아요.</p>
<p>정해 주시면 이 그림대로 작업을 나눠 하나씩 고쳐요.</p></footer>
<dialog id="zoom" aria-labelledby="zt"><div class="zh"><span id="zt"></span><button type="button" class="zc" data-act="zclose">닫기</button></div><div class="zb"></div></dialog>
<script>
{open(D+'app.js').read()}
</script>
</body>
</html>'''
open(D+'index.html', 'w', encoding='utf-8').write(page)
print('bytes', len(page.encode()))
