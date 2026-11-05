#!/usr/bin/env python3
"""접수 현황 화면의 제목 글꼴(reception/www/fonts/title.woff2)을 한 번 만든다 (TASK-16, design.md '글꼴' 결정).

Black Han Sans(구글 글꼴, SIL OFL 1.1)에서 KS X 1001 완성형 한글 2,350자와 영문·숫자(A–Z a–z 0–9)만 남겨
woff2 하나(600KB 이하)로 줄인다. 없는 글자는 화면이 본문 기기 글꼴로 떨어진다(theme.css의 --font-title, --font-body).
결과 woff2와 OFL.txt만 커밋한다. 원본 TTF와 fontTools는 커밋하지 않는다.

준비 (한 번, 저장소 밖 임시 폴더에서):
  python3 -m venv <임시>/fontvenv  (ensurepip가 없으면 --without-pip로 만들고 fonttools·brotli 휠을 site-packages에 푼다)
  <임시>/fontvenv/bin/pip install fonttools brotli
  google/fonts 저장소 ofl/blackhansans/ 의 BlackHanSans-Regular.ttf 와 OFL.txt 를 받는다

실행:
  <임시>/fontvenv/bin/python -I reception/fonts/make-title-font.py <BlackHanSans-Regular.ttf> reception/www/fonts/title.woff2
  cp <받은 OFL.txt> reception/www/fonts/OFL.txt
"""
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

MAX_BYTES = 600 * 1024
ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"


def ksx1001_hangul() -> list[str]:
    """KS X 1001 완성형 한글: EUC-KR 두 바이트 B0A1–C8FE (25줄 × 94자 = 2,350자)."""
    chars = [bytes([hi, lo]).decode("euc_kr") for hi in range(0xB0, 0xC9) for lo in range(0xA1, 0xFF)]
    assert len(chars) == 2350 and len(set(chars)) == 2350
    assert all(0xAC00 <= ord(c) <= 0xD7A3 for c in chars)
    return chars


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    source, target = Path(argv[1]), Path(argv[2])
    font = TTFont(source)
    family = font["name"].getDebugName(1)
    if family != "Black Han Sans":
        print(f"Black Han Sans가 아니다: {family}")
        return 1

    wanted = ksx1001_hangul() + list(ALNUM)
    cmap = font.getBestCmap()
    missing = [c for c in wanted if ord(c) not in cmap]
    if missing:
        print(f"원본에 없는 글자 {len(missing)}개: {''.join(missing[:40])}")
        return 1

    options = subset.Options()
    options.flavor = "woff2"
    options.hinting = False  # 휴대폰 화면은 힌팅을 쓰지 않는다. 크기만 준다
    options.desubroutinize = True
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6]  # 저작권·이름은 남긴다(OFL)
    options.notdef_outline = True
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=[ord(c) for c in wanted])
    subsetter.subset(font)
    target.parent.mkdir(parents=True, exist_ok=True)
    subset.save_font(font, str(target), options)

    size = target.stat().st_size
    kept = set(TTFont(target).getBestCmap())
    if kept != {ord(c) for c in wanted}:
        print(f"남은 글자가 다르다: {len(kept)}자")
        return 1
    if size > MAX_BYTES:
        print(f"너무 크다: {size} 바이트 (> {MAX_BYTES})")
        return 1
    print(f"{target}: {len(kept)}자, {size} 바이트")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
