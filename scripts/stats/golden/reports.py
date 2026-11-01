"""원장님 보고 문장 골든을 만든다(TASK-10, AC-510.1·510.3).

원본 양지바른 medicore/reports.py의 format_report·report_notes·validate_period에 가짜 숫자를 넣어
결과를 fixtures/stats/golden/report-*.json에 적는다. 골든을 다시 만들 때만 돌린다. 시험은 커밋한 파일과 견준다.

  python3 -I scripts/stats/golden/reports.py <원본 YangjiBareun_사전점검 폴더>   (또는 YANGJI_SRC)

금액 줄의 knownDiffs는 손으로 적지 않는다. 원본을 한 번은 그대로, 한 번은 금액 버림(ROUND_DOWN)만 바꿔 돌려 달라진 줄을 적는다.
안내 첫 줄의 차이만 손으로 적는다(NOTE_ORIGINAL·NOTE_OURS). 그래서 "우리 글" = 원본에서 금액 규칙과 그 안내 한 줄만 바꾼 글이고, 그 밖의 차이는 시험에서 실패한다.
"""
import json
import os
from datetime import date
from decimal import Decimal, ROUND_DOWN
from pathlib import Path
import sys

SOURCE = "seoseungkwan/shared@2a1069b"
FILE = "YangjiBareun_사전점검/medicore/reports.py"
ENTRY = "format_report, report_notes"
OUT = Path(__file__).resolve().parents[3] / "fixtures" / "stats" / "golden"

WHY_ROUND = "금액·건당진료비는 원 미만을 버린다(CLAUDE.md 금액 규칙). 원본은 ROUND_HALF_UP이고, 음수도 0 쪽으로 버린다"
WHY_NOTE = "건당진료비를 반올림하지 않으므로 안내 문장도 실제 계산에 맞춘다(위 금액 규칙에 따라오는 차이)"
NOTE_ORIGINAL = "총환을 원 단위로 반올림합니다."
NOTE_OURS = "총환에서 원 미만을 버립니다."

FIXED_NOTE = "신환 내원경로의 0은 요청에 따른 고정값이며 실제 유입 집계가 아닙니다."
REASON = "환불·변경수납·예치금 자료가 있어 금액을 자동 집계하지 않았습니다. 원본 외래환자경영통계에서 확인해 직접 입력하세요."


def report(mode, period, **changes):
    """원본 validate_report를 지나는 가짜 보고 숫자. 병원·기호·프로필은 가짜 모양이다."""
    data = dict(
        ok=True, schema=2, mode=mode, period=period,
        hospital_name="가상의원", institution_code="00000000", profile_id="f" * 32,
        total_visits=8, new_patients=3, return_patients=5,
        total_amount=100004, insurer_amount=65000, noncovered_amount=15000,
        cash_amount=1200, card_amount=27500, transfer_amount=6300,
        treatments=dict(manual=2, eswt=3, carm=4, sono=5, cryo=1),
        la_codes=[], notes=["가상 자료입니다."],
    )
    data.update(changes)
    return data


def money(total, others=0):
    """총진료비와 나머지 금액 칸을 한꺼번에 준다."""
    return dict(total_amount=total, insurer_amount=others, noncovered_amount=others,
                cash_amount=others, card_amount=others, transfer_amount=others)


def counts(visits, new):
    return dict(total_visits=visits, new_patients=new, return_patients=visits - new)


UNCONFIRMED = dict(finance_unconfirmed=True, **money(0))

CASES = {
    # 일일 보통 날: 건수에 쉼표가 붙고, 안내가 겹치면 하나만 남는다
    "daily-normal": report("daily", "2024-02-29", **counts(1234, 34),
                           notes=["가상 자료입니다.", "가상 자료입니다.", FIXED_NOTE]),
    "daily-unconfirmed": report("daily", "2024-03-04", finance_unconfirmed_reason=REASON, **UNCONFIRMED),
    "daily-zero-visits": report("daily", "2024-03-05", **counts(0, 0), **money(0)),
    "daily-zero-visits-unconfirmed": report("daily", "2024-03-06", finance_unconfirmed_reason=REASON,
                                            **counts(0, 0), **UNCONFIRMED),
    # 음수: 건당진료비 글자까지 골든이 정한다
    "daily-negative": report("daily", "2024-03-08", **counts(3, 1), total_amount=-1000, insurer_amount=-1000,
                             noncovered_amount=-5, cash_amount=-1000, card_amount=0, transfer_amount=-1234567),
    "daily-negative-half": report("daily", "2024-03-09", **counts(3, 1), **money(-2000)),   # -666.67
    "daily-negative-zero": report("daily", "2024-01-01", **counts(3, 1), **money(-1)),      # -0.33 → 원본도 '-0원'
    "daily-negative-to-zero": report("daily", "2024-01-02", **counts(3, 1), **money(-2)),   # -0.67 → 원본 '-1원', 버리면 '-0원'
    # 원 미만 금액: 계좌이체만 .5 아래라 원본과 같고, 나머지 금액 줄은 반올림과 버림이 갈린다
    "daily-sub-won": report("daily", "2024-03-03", total_amount=100004.5, insurer_amount=65000.5,
                            noncovered_amount=15000.5, cash_amount=1200.5, card_amount=27500.5, transfer_amount=6300.4),
    # 건당진료비 100,004 ÷ 8 = 12,500.5. 코드는 글자 차례로 줄을 세운다(숫자 차례가 아니다)
    "monthly-la": report("monthly", "2024-02", la_codes=[
        dict(code="LA999", count=9), dict(code="LA247", count=1234), dict(code="LA10", count=1),
        dict(code="LA9", count=2), dict(code="LA_1", count=3), dict(code="LA-1", count=4), dict(code="LA", count=5)]),
    "monthly-no-la": report("monthly", "2023-12"),
    "monthly-unconfirmed": report("monthly", "2024-01", la_codes=[dict(code="LA247", count=2)], **UNCONFIRMED),
    "monthly-zero-visits": report("monthly", "2024-03", **counts(0, 0), **money(0)),
    # 가장 큰 값: 원본이 받는 금액 한도 안, 건수 10억 → 건당 99,999.999999999
    "monthly-largest": report("monthly", "2024-11", **counts(1_000_000_000, 1), **money(99_999_999_999_999)),
}

# 달은 그 달 1일이 오늘보다 뒤일 때만 미래다(원본 first > today)
PERIODS = [
    ("daily", "2024-03-01", "2024-03-01"),
    ("daily", "2024-03-02", "2024-03-01"),
    ("daily", "2024-02-29", "2024-03-01"),
    ("monthly", "2024-03", "2024-03-01"),
    ("monthly", "2024-03", "2024-03-31"),
    ("monthly", "2024-04", "2024-03-31"),
    ("monthly", "2024-02", "2024-03-01"),
    ("monthly", "2025-01", "2024-12-31"),
]


def head(entry, known_diffs):
    return {"source": SOURCE, "file": FILE, "entry": entry, "knownDiffs": known_diffs}


def line_diffs(original, ours):
    if len(original) != len(ours):
        raise SystemExit("버림만 바꿨는데 줄 수가 달라졌습니다.")
    return [{"field": "lines", "index": index, "original": before, "ours": after, "why": WHY_ROUND}
            for index, (before, after) in enumerate(zip(original, ours)) if before != after]


def note_diffs(notes):
    return [{"field": "notes", "index": index, "original": note,
             "ours": note.replace(NOTE_ORIGINAL, NOTE_OURS), "why": WHY_NOTE}
            for index, note in enumerate(notes) if NOTE_ORIGINAL in note]


def write(name, content):
    path = OUT / f"report-{name}.json"
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("YANGJI_SRC")
    if not source:
        raise SystemExit("원본 폴더를 인자나 YANGJI_SRC로 주세요.")
    sys.dont_write_bytecode = True  # 원본 폴더에 아무것도 남기지 않는다
    sys.path.insert(0, source)
    from medicore import reports

    def won_down(value):
        return f"{reports._amount(value).quantize(Decimal('1'), rounding=ROUND_DOWN):,}원"

    original_won = reports._won
    OUT.mkdir(parents=True, exist_ok=True)
    for name, data in CASES.items():
        lines = reports.format_report(data).split("\n")
        notes = reports.report_notes(data)
        reports._won = won_down
        ours = reports.format_report(data).split("\n")
        reports._won = original_won
        write(name, {**head(ENTRY, line_diffs(lines, ours) + note_diffs(notes)),
                     "input": data, "output": {"lines": lines, "notes": notes}})

    cases = []
    for mode, period, today in PERIODS:
        try:
            reports.validate_period(mode, period, today=date.fromisoformat(today))
            future = False
        except reports.ReportError:
            future = True
        cases.append({"mode": mode, "period": period, "today": today, "future": future})
    write("period", {**head("validate_period", []), "cases": cases})


if __name__ == "__main__":
    main()
