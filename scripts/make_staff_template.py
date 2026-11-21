"""직원 명단 엑셀 양식 만들기 (웹앱 직원 탭 [엑셀 양식 받기]의 기준 파일).

실행:  py -3.12 -I scripts/make_staff_template.py public/staff/staff-template.xlsx
       (경로를 안 주면 저장소 public/staff/staff-template.xlsx. 웹앱은 '직원명단-양식.xlsx' 이름으로 내려받게 한다)

만든 뒤 같은 스크립트가 파일을 다시 열어 시트·머리 줄·고르기 목록·서식을 확인한다.

웹앱 [엑셀 올리기]가 읽을 때 지킬 약속(이 스크립트가 기준):
- 시트 이름 '직원', 1번째 줄 = COLUMNS의 header 그대로, 2번째 줄부터 한 사람 한 줄.
- 보기 줄: 메모가 EXAMPLE_MEMO 로 시작하는 줄은 건너뛴다.
- 직종: 목록 밖 글자도 받음(웹앱에서는 '기타' + 그 글자).
- 요일 칸: 'HH:MM-HH:MM', 비면 쉬는 날. 토요일 격주가 비면 '매주'.
- 날짜 칸: 엑셀 날짜 값 또는 '2026-03-02' 같은 글자 둘 다 올 수 있다.
- 맨 끝 칸 '넘어온 연차(일)'(2026-11-21 더함): -30~100, 0.5 단위. 그 칸이 없는 옛 양식(21칸)도 웹앱이 읽는다.
"""
from __future__ import annotations

import datetime as dt
import os
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

# ---------------------------------------------------------------- 기준값
DEFAULT_OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "staff", "staff-template.xlsx")

GUIDE_SHEET = "안내"
STAFF_SHEET = "직원"
FIRST_ROW = 2          # 보기 줄이 들어가는 줄 = 데이터 첫 줄
LAST_ROW = 301         # 서식·고르기 목록을 미리 깔아 두는 마지막 줄(300명)

JOB_TYPES = ["간호사", "간호조무사", "물리치료사", "방사선사", "원무", "기타"]
EMPLOYMENT_TYPES = ["정규직", "계약직", "파트타임"]
SATURDAY_ROTATIONS = ["매주", "1·3주", "2·4주"]
WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"]

EXAMPLE_MEMO = "보기 줄 — 지우고 쓰세요"

# 넘어온 연차(일) 칸 글(specs/staff requirements '화면 글 기본값' 그대로)
CARRY_HEADER = "넘어온 연차(일)"
CARRY_PROMPT = "웹앱을 쓰기 전에 이미 넘어와 있던 연차 일수. 없으면 비워요. 반차는 0.5. 예: 2.5"
CARRY_ERROR = "-30~100 사이 일수를 숫자로 적어 주세요. 반차는 0.5예요."
CARRY_GUIDE = ("'넘어온 연차(일)'(맨 끝 칸)는 못 쓴 연차를 다음 해로 넘기는 병원만 적어요. "
               "웹앱을 쓰기 전에 이미 넘어와 있던 일수예요. 없으면 비워 두세요. "
               "반차는 0.5, 미리 당겨 써서 모자라면 -1처럼 적어요.")

FONT_NAME = "맑은 고딕"
DATE_FMT = "yyyy-mm-dd"
TEXT_FMT = "@"

# kind: text(글자 서식) / plain(일반) / choice(목록) / number / date / time(요일 칸)
# key: 웹앱 쪽에서 쓸 이름(화면에는 안 나옴)
COLUMNS = [
    dict(header="이름*", key="name", kind="text", width=10, required=True, sample="김하늘"),
    dict(header="직종", key="jobType", kind="choice", width=14, sample="간호조무사"),
    dict(header="근무 형태", key="employmentType", kind="choice", width=11, sample="정규직"),
    dict(header="주 근무시간", key="weeklyHours", kind="number", width=11, sample=40),
    dict(header="입사일*", key="hireDate", kind="date", width=12, required=True, sample=dt.date(2021, 3, 2)),
    dict(header="퇴사일", key="leaveDate", kind="date", width=12, sample=None),
    dict(header="연락처", key="phone", kind="text", width=15, sample="010-0000-0000"),
    dict(header="생일", key="birthday", kind="date", width=12, sample=dt.date(1996, 4, 8)),
    dict(header="주소", key="address", kind="plain", width=32, sample="○○시 ○○구 ○○로 00"),
    dict(header="은행", key="bank", kind="plain", width=11, sample="○○은행"),
    dict(header="계좌번호", key="accountNumber", kind="text", width=18, sample="000-00-000000"),
    dict(header="올해 이미 쓴 연차(일)", key="usedLeaveThisYear", kind="number", width=12, sample=9.5),
    *[
        dict(header=d, key=f"work_{k}", kind="time", width=12,
             sample=("09:00-13:00" if d == "토" else None if d == "일" else "09:00-18:00"))
        for d, k in zip(WEEKDAYS, ["mon", "tue", "wed", "thu", "fri", "sat", "sun"])
    ],
    dict(header="토요일 격주", key="saturdayRotation", kind="choice", width=11, sample="1·3주"),
    dict(header="메모", key="memo", kind="plain", width=26, sample=EXAMPLE_MEMO),
    # 넘어온 연차 시작 값(2026-11-21) — 옛 양식과 앞 칸 차례가 같게 맨 끝(메모 뒤)에 둔다. 보기 줄은 빈칸
    dict(header=CARRY_HEADER, key="carryStart", kind="number", width=12, sample=None),
]
HEADERS = [c["header"] for c in COLUMNS]

GUIDE_LINES = [
    "'직원' 시트에 한 사람을 한 줄에 적어요. 둘째 줄부터 적으면 돼요.",
    "꼭 적을 칸은 이름*, 입사일* 두 칸이에요(머리 줄에서 노란 칸). 나머지는 모르면 비워 두고, 나중에 웹앱 화면에서 채워도 돼요.",
    "날짜(입사일·퇴사일·생일)는 2026-03-02 모양으로 적어요.",
    "월~일 칸에는 그 요일에 일하는 시간을 09:00-18:00 모양으로 적어요. 비워 두면 쉬는 날이에요.",
    "토요일에 격주로 일하면 '토요일 격주' 칸에서 1·3주 또는 2·4주를 골라요. 비워 두면 매주로 봐요.",
    "직종·근무 형태·토요일 격주는 칸을 누르면 나오는 목록에서 골라요. 직종이 목록에 없으면 직접 적어도 돼요(기타로 들어가요).",
    "주 근무시간은 숫자만 적어요(예: 40). '올해 이미 쓴 연차(일)'에는 올해 들어 지금까지 쓴 연차 일수를 적어요. 반차는 0.5예요(예: 9.5).",
    CARRY_GUIDE,
    "연락처·계좌번호는 적은 그대로(앞의 0, 줄표 포함) 남아요.",
    "회색 기울임 글씨 '김하늘' 줄은 보기 줄이에요. 지우고 쓰세요.",
    "퇴사한 직원도 넣을 수 있어요. 퇴사일을 적으면 '퇴사' 목록으로 들어가요.",
    "다 채우면 저장한 뒤, 웹앱 직원 탭 → 명단 → [엑셀 올리기]로 올려요. 미리 보기를 확인하고 [넣기]를 누르면 들어가요.",
    "같은 이름 + 같은 입사일로 다시 올리면 새 사람으로 생기지 않고, 그 사람 정보가 새로 적은 내용으로 고쳐져요.",
    "계좌번호는 원장 계정에서만 봐요.",
    "시트 이름과 첫 줄(머리 줄)은 바꾸지 마세요. 칸을 더하거나 칸 순서를 바꾸면 올릴 때 읽지 못해요.",
    "이 파일에는 연락처·계좌번호 같은 개인정보가 들어가요. 다 올린 뒤에는 파일을 지우거나 안전한 곳에 두세요.",
]

# ---------------------------------------------------------------- 모양
HEADER_FILL = PatternFill("solid", fgColor="D9E1F2")    # 보통 머리 칸: 옅은 파랑
REQUIRED_FILL = PatternFill("solid", fgColor="FFD966")  # 꼭 적을 칸: 노랑
THIN = Side(style="thin", color="A6A6A6")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)


def font(**kw) -> Font:
    return Font(name=FONT_NAME, size=kw.pop("size", 10), **kw)


def col_letter(header: str) -> str:
    return get_column_letter(HEADERS.index(header) + 1)


def col_range(header: str) -> str:
    c = col_letter(header)
    return f"{c}{FIRST_ROW}:{c}{LAST_ROW}"


# ---------------------------------------------------------------- 시트 만들기
def fit_print_width(ws, *, landscape: bool) -> None:
    """인쇄하면 가로가 한 장에 들어가게."""
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.page_setup.paperSize = ws.PAPERSIZE_A4
    ws.page_setup.orientation = "landscape" if landscape else "portrait"


def build_guide(ws) -> None:
    ws.title = GUIDE_SHEET
    ws.sheet_view.showGridLines = False
    ws.column_dimensions["A"].width = 5
    ws.column_dimensions["B"].width = 100
    fit_print_width(ws, landscape=False)

    ws["A1"] = "직원 명단 채우는 법"
    ws["A1"].font = font(size=16, bold=True)
    ws.row_dimensions[1].height = 30

    ws["A2"] = "이 파일은 직원 명단을 처음에 한꺼번에 넣을 때 쓰는 양식이에요."
    ws["A2"].font = font(size=11, color="595959")

    row = 4
    for i, line in enumerate(GUIDE_LINES, start=1):
        a, b = ws.cell(row=row, column=1, value=i), ws.cell(row=row, column=2, value=line)
        a.font = font(size=11, bold=True)
        a.alignment = Alignment(horizontal="right", vertical="top")
        b.font = font(size=11)
        b.alignment = Alignment(wrap_text=True, vertical="top")
        # 한글은 2칸 너비로 어림 → 줄 수만큼 높이(잘림 막기)
        wide = sum(2 if ord(ch) >= 0x1100 else 1 for ch in line)
        ws.row_dimensions[row].height = 18 * -(-wide // 90) + 4
        row += 1

    # 색 알림
    row += 1
    ws.cell(row=row, column=1).fill = REQUIRED_FILL
    ws.cell(row=row, column=1).border = BOX
    ws.cell(row=row, column=2, value="← 머리 줄에서 이 색 칸(이름*, 입사일*)은 꼭 적어요.").font = font(size=11)
    row += 1
    ws.cell(row=row, column=1).fill = HEADER_FILL
    ws.cell(row=row, column=1).border = BOX
    ws.cell(row=row, column=2, value="← 이 색 칸은 모르면 비워 둬도 돼요.").font = font(size=11)


def add_list(ws, header: str, items: list[str], *, strict: bool, prompt: str) -> None:
    dv = DataValidation(type="list", formula1='"' + ",".join(items) + '"', allow_blank=True)
    dv.showDropDown = False            # False = 칸 옆 화살표를 보여 줌(엑셀 쪽 이름이 반대)
    dv.showInputMessage = True
    dv.promptTitle, dv.prompt = header, prompt
    if strict:
        dv.showErrorMessage = True
        dv.errorStyle = "stop"
        dv.errorTitle = "목록에서 골라 주세요"
        dv.error = "칸 옆 화살표를 눌러 " + " · ".join(items) + " 가운데 하나를 골라요."
    else:
        dv.showErrorMessage = False    # 목록 밖 글자도 받음
    ws.add_data_validation(dv)
    dv.add(col_range(header))


def add_check(ws, header: str, dv: DataValidation, *, prompt: str, error: str) -> None:
    dv.allow_blank = True
    dv.showInputMessage = True
    dv.promptTitle, dv.prompt = header, prompt
    dv.showErrorMessage = True
    dv.errorStyle = "warning"          # 알려만 주고, 그래도 넣을 수 있음
    dv.errorTitle = "모양을 확인해 주세요"
    dv.error = error
    ws.add_data_validation(dv)
    dv.add(col_range(header))


def add_prompt_only(ws, header_or_range: str, title: str, prompt: str) -> None:
    dv = DataValidation(allow_blank=True)   # 아무 값이나 받음, 칸을 누르면 도움말만
    dv.showInputMessage = True
    dv.promptTitle, dv.prompt = title, prompt
    ws.add_data_validation(dv)
    dv.add(header_or_range if ":" in header_or_range else col_range(header_or_range))


def build_staff(ws) -> None:
    ws.title = STAFF_SHEET
    ws.freeze_panes = "B2"   # 머리 줄 + 이름 칸 고정
    fit_print_width(ws, landscape=True)
    ws.print_title_rows = "1:1"

    # 머리 줄
    for i, c in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=i, value=c["header"])
        cell.font = font(size=10, bold=True)
        cell.fill = REQUIRED_FILL if c.get("required") else HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BOX
        ws.column_dimensions[get_column_letter(i)].width = c["width"]
    ws.row_dimensions[1].height = 34

    # 빈 줄에 서식 미리 깔기(글자 서식이라야 앞 0이 안 사라짐)
    for i, c in enumerate(COLUMNS, start=1):
        fmt = {"text": TEXT_FMT, "time": TEXT_FMT, "date": DATE_FMT}.get(c["kind"], "General")
        for r in range(FIRST_ROW, LAST_ROW + 1):
            cell = ws.cell(row=r, column=i)
            cell.number_format = fmt
            cell.font = font()
            if c["kind"] in ("date", "time", "number", "choice"):
                cell.alignment = Alignment(horizontal="center")

    # 보기 줄
    for i, c in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=FIRST_ROW, column=i, value=c["sample"])
        cell.font = font(italic=True, color="808080")

    # 고르기 목록
    add_list(ws, "직종", JOB_TYPES, strict=False,
             prompt="목록에서 골라요. 목록에 없으면 직접 적어도 돼요(기타로 들어가요).")
    add_list(ws, "근무 형태", EMPLOYMENT_TYPES, strict=True, prompt="정규직 · 계약직 · 파트타임 가운데 골라요.")
    add_list(ws, "토요일 격주", SATURDAY_ROTATIONS, strict=True,
             prompt="토요일에 격주로 일하면 1·3주 또는 2·4주. 비우면 매주로 봐요.")

    # 날짜 칸
    for h in ("입사일*", "퇴사일", "생일"):
        add_check(ws, h, DataValidation(type="date", operator="between",
                                        formula1="DATE(1930,1,1)", formula2="DATE(2100,12,31)"),
                  prompt="2026-03-02 모양으로 적어요." + (" 꼭 적어요." if h == "입사일*" else ""),
                  error="날짜는 2026-03-02 모양으로 적어 주세요.")

    # 숫자 칸
    c = col_letter("주 근무시간")
    add_check(ws, "주 근무시간", DataValidation(type="decimal", operator="between", formula1="0", formula2="60"),
              prompt="일주일에 일하는 시간을 숫자만 적어요. 예: 40",
              error="숫자만 적어 주세요. 예: 40")
    c = col_letter("올해 이미 쓴 연차(일)")
    add_check(ws, "올해 이미 쓴 연차(일)",
              DataValidation(type="custom",
                             formula1=f"AND(ISNUMBER({c}{FIRST_ROW}),{c}{FIRST_ROW}>=0,"
                                      f"{c}{FIRST_ROW}<=60,MOD({c}{FIRST_ROW}*2,1)=0)"),
              prompt="올해 들어 지금까지 쓴 연차 일수. 반차는 0.5. 예: 9.5",
              error="일수를 숫자로 적어 주세요. 반차는 0.5예요. 예: 9.5")
    c = col_letter(CARRY_HEADER)
    add_check(ws, CARRY_HEADER,
              DataValidation(type="custom",
                             formula1=f"AND(ISNUMBER({c}{FIRST_ROW}),{c}{FIRST_ROW}>=-30,"
                                      f"{c}{FIRST_ROW}<=100,MOD({c}{FIRST_ROW}*2,1)=0)"),
              prompt=CARRY_PROMPT, error=CARRY_ERROR)

    # 요일 칸(한 번에)
    first, last = col_letter(WEEKDAYS[0]), col_letter(WEEKDAYS[-1])
    tl = f"{first}{FIRST_ROW}"
    dv = DataValidation(type="custom", allow_blank=True,
                        formula1=f'AND(LEN({tl})=11,MID({tl},3,1)=":",MID({tl},6,1)="-",MID({tl},9,1)=":")')
    dv.showInputMessage, dv.promptTitle = True, "그날 일하는 시간"
    dv.prompt = "09:00-18:00 모양으로 적어요. 비우면 쉬는 날이에요."
    dv.showErrorMessage, dv.errorStyle = True, "warning"
    dv.errorTitle, dv.error = "모양을 확인해 주세요", "시간은 09:00-18:00 모양으로 적어 주세요."
    ws.add_data_validation(dv)
    dv.add(f"{first}{FIRST_ROW}:{last}{LAST_ROW}")

    # 도움말만
    add_prompt_only(ws, "이름*", "이름", "꼭 적어요.")
    add_prompt_only(ws, "연락처", "연락처", "010-0000-0000 모양. 적은 그대로 남아요.")
    add_prompt_only(ws, "계좌번호", "계좌번호", "적은 그대로 남아요. 원장 계정에서만 봐요.")


def build(out_path: str) -> None:
    wb = Workbook()
    build_guide(wb.active)
    build_staff(wb.create_sheet())
    wb.active = 0
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    wb.save(out_path)


# ---------------------------------------------------------------- 확인
def verify(out_path: str) -> None:
    wb = load_workbook(out_path)
    problems: list[str] = []

    def check(ok: bool, msg: str) -> None:
        if not ok:
            problems.append(msg)

    check(wb.sheetnames == [GUIDE_SHEET, STAFF_SHEET], f"시트 이름 {wb.sheetnames}")
    ws = wb[STAFF_SHEET]
    got_headers = [ws.cell(row=1, column=i).value for i in range(1, ws.max_column + 1)]
    check(got_headers == HEADERS, f"머리 줄 {got_headers}")
    check(ws.freeze_panes == "B2", f"고정 {ws.freeze_panes}")

    # 꼭 적을 칸 색·굵게
    for i, c in enumerate(COLUMNS, start=1):
        cell = ws.cell(row=1, column=i)
        want = "FFD966" if c.get("required") else "D9E1F2"
        check(cell.fill.fgColor.rgb.endswith(want), f"{c['header']} 머리 색 {cell.fill.fgColor.rgb}")
        check(bool(cell.font.b), f"{c['header']} 굵게 아님")

    # 고르기 목록
    dvs = ws.data_validations.dataValidation

    def find(rng: str):
        return [d for d in dvs if rng in str(d.sqref).split()]

    for h, items, strict in (("직종", JOB_TYPES, False), ("근무 형태", EMPLOYMENT_TYPES, True),
                             ("토요일 격주", SATURDAY_ROTATIONS, True)):
        hits = [d for d in find(col_range(h)) if d.type == "list"]
        check(len(hits) == 1, f"{h} 목록 {len(hits)}개")
        if hits:
            d = hits[0]
            check(d.formula1 == '"' + ",".join(items) + '"', f"{h} 목록 값 {d.formula1}")
            check(bool(d.showErrorMessage) == strict, f"{h} 막기 {d.showErrorMessage}")
    for h in ("입사일*", "퇴사일", "생일"):
        check(any(d.type == "date" for d in find(col_range(h))), f"{h} 날짜 확인 없음")
    check(any(d.type == "decimal" for d in find(col_range("주 근무시간"))), "주 근무시간 숫자 확인 없음")
    check(any(d.type == "custom" for d in find(col_range("올해 이미 쓴 연차(일)"))), "연차 확인 없음")
    # 넘어온 연차(일): 맨 끝 칸 · 숫자 확인(-30~100, 0.5 단위, 경고만) · 칸 도움말 · 확인 글
    check(HEADERS[-1] == CARRY_HEADER and HEADERS[-2] == "메모", f"넘어온 연차 칸 자리 {HEADERS[-2:]}")
    carry = [d for d in find(col_range(CARRY_HEADER)) if d.type == "custom"]
    check(len(carry) == 1, f"넘어온 연차 확인 {len(carry)}개")
    if carry:
        d = carry[0]
        c = col_letter(CARRY_HEADER)
        want = f"AND(ISNUMBER({c}{FIRST_ROW}),{c}{FIRST_ROW}>=-30,{c}{FIRST_ROW}<=100,MOD({c}{FIRST_ROW}*2,1)=0)"
        check(d.formula1 == want, f"넘어온 연차 확인 식 {d.formula1}")
        check(d.promptTitle == CARRY_HEADER and d.prompt == CARRY_PROMPT, f"넘어온 연차 도움말 {d.promptTitle} / {d.prompt}")
        check(d.error == CARRY_ERROR and d.errorStyle == "warning", f"넘어온 연차 확인 글 {d.error} / {d.errorStyle}")
    check(ws.cell(row=FIRST_ROW, column=len(HEADERS)).value is None, "넘어온 연차 보기 줄이 빈칸이 아님")
    week = f"{col_letter('월')}{FIRST_ROW}:{col_letter('일')}{LAST_ROW}"
    check(any(d.type == "custom" for d in find(week)), "요일 칸 확인 없음")

    # 서식
    for c in COLUMNS:
        want = {"text": TEXT_FMT, "time": TEXT_FMT, "date": DATE_FMT}.get(c["kind"])
        if want:
            col = HEADERS.index(c["header"]) + 1
            for r in (FIRST_ROW, FIRST_ROW + 1, LAST_ROW):
                fmt = ws.cell(row=r, column=col).number_format
                check(fmt == want, f"{c['header']} {r}줄 서식 {fmt}")

    # 보기 줄
    for i, c in enumerate(COLUMNS, start=1):
        v = ws.cell(row=FIRST_ROW, column=i).value
        want = c["sample"]
        if isinstance(want, dt.date):
            v = v.date() if isinstance(v, dt.datetime) else v
        check(v == want, f"보기 줄 {c['header']} = {v!r} (기대 {want!r})")
        if want is not None:
            f = ws.cell(row=FIRST_ROW, column=i).font
            check(bool(f.i) and f.color is not None and f.color.rgb.endswith("808080"),
                  f"보기 줄 {c['header']} 회색 기울임 아님")
    check(ws.cell(row=FIRST_ROW + 1, column=1).value is None, "3줄이 비어 있지 않음")

    g = wb[GUIDE_SHEET]
    guide_text = [g.cell(row=r, column=2).value for r in range(4, 4 + len(GUIDE_LINES))]
    check(guide_text == GUIDE_LINES, "안내 글이 다름")
    used_line = next((i for i, line in enumerate(GUIDE_LINES) if "'올해 이미 쓴 연차(일)'" in line), -1)
    check(used_line >= 0 and GUIDE_LINES[used_line + 1] == CARRY_GUIDE, "넘어온 연차 안내 줄이 '올해 이미 쓴 연차' 줄 다음이 아님")

    # 주민번호는 저장하지 않음(2026-11-21) — 파일 어디에도 '주민' 말이 없어야 함
    texts = [str(cell.value) for s in wb for row in s.iter_rows() for cell in row if cell.value is not None]
    texts += [f"{d.promptTitle}{d.prompt}{d.errorTitle}{d.error}" for d in dvs]
    check(not any("주민" in t for t in texts), "'주민' 말이 남아 있음")

    if problems:
        print("확인 실패:")
        for p in problems:
            print(" -", p)
        sys.exit(1)
    print(f"확인 끝: 시트 {wb.sheetnames}, 칸 {len(HEADERS)}개, 고르기·확인 {len(dvs)}개, "
          f"서식 {FIRST_ROW}~{LAST_ROW}줄")
    print("머리 줄:", " | ".join(HEADERS))


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT
    build(out)
    verify(out)
    print("저장:", os.path.abspath(out))
