"""Собирает кадры Playwright в компактную демо-гифку."""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image


def main(frames_dir: str, output: str) -> None:
    paths = sorted(Path(frames_dir).glob("*.png"))
    if not paths:
        raise SystemExit("нет кадров для гифки")
    images = [Image.open(path).convert("RGB") for path in paths]
    width = min(960, images[0].width)
    resized = [
        image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        for image in images
    ]
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    resized[0].save(
        target,
        save_all=True,
        append_images=resized[1:],
        duration=1800,
        loop=0,
        optimize=True,
    )
    print(f"{target} — {target.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
