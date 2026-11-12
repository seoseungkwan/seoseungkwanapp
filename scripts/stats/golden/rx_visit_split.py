"""처방별 신환·재진 골든 만들기. 원본(양지바른 2a1069b)을 가짜 줄에 돌려 fixtures/stats/golden/에 쓴다.

  YANGJI_SRC=<원본 폴더 YangjiBareun_사전점검> python3 -I scripts/stats/golden/rx_visit_split.py
  python3 -I scripts/stats/golden/rx_visit_split.py <원본 폴더>

입력은 fixtures/stats/golden/rx-visit-split-input.json(가짜 자료)뿐이다. 먼저 원본 validate_split을 지나는지 본다.
시험은 여기서 쓴 파일과 견주므로 원본 없이 돈다. 골든을 다시 만들 때만 이 글을 돌린다. 쓴 파일을 손으로 고치지 않는다.
"""
import json
import os
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True  # 원본 폴더에 아무것도 남기지 않는다

SOURCE = "seoseungkwan/shared@2a1069b"
FILE = "medicore/rx_visit_split.py"
GOLDEN_DIR = Path(__file__).resolve().parents[3] / "fixtures" / "stats" / "golden"

NAME_DIFF = {"what": "처방 이름이 있으면 label이 코드가 아니라 이름", "why": "화면에 처방 이름을 보인다(AC-509.4). 골든은 이름 없이 돌려 견주므로 label이 코드다"}
SHARED_DIFFS = [
    {"what": "줄의 code 칸", "why": "원본 줄에는 label(코드)만 있다. 처방 이름을 label에 넣으려고 코드를 따로 뒀다. 시험은 이 칸을 빼고 견준다"},
    {"what": "new·returning이 집합이 아니라 수", "why": "환자 번호를 결과에 남기지 않는다(AC-509.4). 여기 값은 원본 집합의 크기다"},
    {"what": "환자 칸 p가 차트번호 글자가 아니라 메모리 번호", "why": "차트번호는 Worker 안에서도 메모리 번호로만 다닌다. 시험은 가짜 차트번호를 숫자로 바꿔 넣는다"},
    NAME_DIFF,
    {"what": "eswt 인자 없음", "why": "ESWT 묶음은 범위 밖이다(design.md TASK-9). 원본도 끔으로 돌렸다"},
]
# 일부러 다르게 한 사례(rx-split-new): cases = 사례 이름 → 칸 → 그 사례에서 우리 함수가 내야 할 값. 우리 코드를 돌리지 않고 손으로 적는다.
# 시험은 적은 사례·칸만 이 값과, 나머지는 원본 결과와 견준다. 숫자가 바뀌는 사례는 five-codes뿐이고 summarize_days는 원본과 같다
NEW_RULE = {
    "what": "신환은 진료일이 우리 병원 최초 내원일(f)인 줄",
    "why": "사용자 결정(2026-11-12): 우리 병원 방문 자체가 처음인 날 받은 처방만 신환이다. 원본은 f가 기간 첫날 이후면 그 환자의 기간 안 줄이 모두 신환이라, 기간 안에 처음 오고 다시 온 환자가 다시 온 날 받은 처방도 신환이었다. 한 줄에서 한 환자는 한 번만 센다(그 줄의 진료 줄 중 하나라도 f 날이면 신환)",
}
SUMMARY_DIFFS = SHARED_DIFFS + [
    {"what": "기간 밖 진료 줄을 뺀다", "why": "원본은 validate_split이 기간 안 줄만 들여보낸다. Worker 메모리에는 불러온 범위 전체가 있어 함수가 거른다. 입력이 같으면 결과가 같다"},
    {**NEW_RULE, "cases": {"five-codes": {"lines": [
        {"label": "LA358", "newPatients": 2, "returning": 2, "total": 4},
        {"label": "MM042", "newPatients": 1, "returning": 1, "total": 2},
        {"label": "도수", "newPatients": 0, "returning": 2, "total": 2},
        {"label": "B4001", "newPatients": 1, "returning": 0, "total": 1},
        {"label": "ZZ999", "newPatients": 0, "returning": 0, "total": 0},
        {"label": "고른 처방 중 하나라도", "newPatients": 3, "returning": 4, "total": 7},
    ]}}},
]
TEXT_DIFFS = [NAME_DIFF, {**NEW_RULE, "cases": {"five-codes": {"text": "\n".join([
    "가상의원",
    "처방별 신환·재진",
    "2026-10-01 ~ 2026-10-19 (19일) · 외래 환자 50명 (신환 7명 · 재진 43명) · 내원 75건",
    "",
    "처방             신환   재진   합계",
    "LA358            2명    2명    4명",
    "MM042            1명    1명    2명",
    "도수               0명    2명    2명",
    "B4001            1명    0명    1명",
    "ZZ999            0명    0명    0명",
    "고른 처방 중 하나라도     3명    4명    7명",
])}}}]


def load_original():
    root = os.environ.get("YANGJI_SRC") or (sys.argv[1] if len(sys.argv) > 1 else "")
    if not root or not (Path(root) / FILE).is_file():
        sys.exit(f"원본 폴더를 YANGJI_SRC나 인자로 주세요({FILE}가 있는 곳)")
    sys.path.insert(0, root)  # python3 -I라 PYTHONPATH·현재 폴더는 읽지 않는다
    from medicore import rx_visit_split
    return rx_visit_split


def line_of(line):
    return {"label": line.label, "newPatients": len(line.new), "returning": len(line.returning), "total": line.total}


def summary_of(summary):
    return {
        "from": summary.start.isoformat(), "to": summary.end.isoformat(),
        "visits": summary.visits, "patients": summary.patients, "newPatients": summary.new_patients,
        "returning": summary.returning_patients, "invalidCodes": summary.invalid_codes,
        "lines": [line_of(line) for line in summary.lines],
    }


def day_of(day):
    return {
        "date": day.day.isoformat(), "visits": day.visits, "patients": day.patients, "newPatients": day.new_patients,
        "returning": day.returning_patients, "lines": [line_of(line) for line in day.lines],
    }


def write(name, entry, known_diffs, cases):
    value = {"source": SOURCE, "file": FILE, "entry": entry, "knownDiffs": known_diffs, "cases": cases}
    text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    (GOLDEN_DIR / f"rx-visit-split-{name}.json").write_text(text, encoding="utf-8")


def main():
    rs = load_original()
    source = json.loads((GOLDEN_DIR / "rx-visit-split-input.json").read_text(encoding="utf-8"))
    hospital, profile = source["hospital"], source["profile"]
    summaries, days, texts = [], [], []
    for item in source["cases"]:
        name, data = item["name"], item["response"]
        codes, eswt = data["codes"], data["eswt"]
        rs.validate_split(data, profile=profile, start=date.fromisoformat(data["from"]), end=date.fromisoformat(data["to"]),
                          codes=codes, eswt=eswt, today=date.fromisoformat(data["as_of"]))
        summary = rs.summarize(data, codes, eswt)
        day_summaries = rs.summarize_days(data, codes, eswt)
        summaries.append({"name": name, "result": summary_of(summary)})
        days.append({"name": name, "result": [day_of(day) for day in day_summaries]})
        texts.append({"name": name, "headline": rs.headline(summary), "text": rs.format_text(hospital, summary),
                      "daysText": rs.format_days_text(hospital, summary, day_summaries)})
    write("summary", "summarize", SUMMARY_DIFFS, summaries)
    write("days", "summarize_days", SHARED_DIFFS, days)
    write("text", "format_text, format_days_text, headline", TEXT_DIFFS, texts)


if __name__ == "__main__":
    main()
