#!/usr/bin/env python3
"""접수 현황 화면 아이콘(reception/www/icon.png)을 만든다 (reception-other-clinic design.md 7절, AC-5709.4).

favicon·apple-touch-icon·manifest 아이콘은 병원과 상관없는 그림이다: 512×512, 바탕 숯색(theme.css --ink #333432),
가운데 흰 가로 막대 셋(theme.css --on-ink #FFFFFF, 끝이 둥근 막대 = 목록 모양). 병원 이름·로고는 넣지 않는다.
파이썬 표준 라이브러리(zlib·struct)만 쓴다. 결과 PNG를 커밋한다.

실행 (저장소 맨 위에서):
  python -I -X utf8 reception/tools/make-icon.py
"""
import struct
import zlib

SIZE = 512
INK = (0x33, 0x34, 0x32)
WHITE = (0xFF, 0xFF, 0xFF)

# 막대 셋: 가운데 y, 둥근 끝의 반지름(막대 높이의 반), 둥근 끝 가운데의 x(왼쪽·오른쪽)
BAR_CENTERS = (176, 256, 336)
BAR_RADIUS = 24
BAR_LEFT = 120
BAR_RIGHT = 392


def inside_bar(x: int, y: int) -> bool:
    """점 (x, y)의 가운데가 끝이 둥근 막대 안에 있는가."""
    px, py = x + 0.5, y + 0.5
    dx = max(BAR_LEFT - px, 0.0, px - BAR_RIGHT)
    return any(dx * dx + (py - cy) * (py - cy) <= BAR_RADIUS * BAR_RADIUS for cy in BAR_CENTERS)


def pixels() -> bytes:
    """줄마다 거르개 0(None) 한 바이트 + RGB 점들."""
    rows = bytearray()
    for y in range(SIZE):
        rows.append(0)
        for x in range(SIZE):
            rows.extend(WHITE if inside_bar(x, y) else INK)
    return bytes(rows)


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def png() -> bytes:
    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0)  # 8비트 RGB, 압축·거르개·엮음 기본
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(pixels(), 9)) + chunk(b"IEND", b"")


def main() -> None:
    here = __file__.replace("\\", "/").rsplit("/", 1)[0] if "/" in __file__.replace("\\", "/") else "."
    out = here + "/../www/icon.png"
    with open(out, "wb") as f:
        f.write(png())
    print(out)


if __name__ == "__main__":
    main()
