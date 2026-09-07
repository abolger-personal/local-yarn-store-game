#!/usr/bin/env python3
"""Bake notion illustrations into a texture atlas for the LYS concept viewers.

The atlas stores SHAPE ONLY: RGB is white, alpha is silhouette coverage. Colour, outline,
gold and sparkle are material and per-instance work at runtime, so a theme that only recolours
needs no new art at all -- it ships colour tokens. A theme folder overrides a cell only when it
wants a genuinely different shape.

    source/            default set, one image per notion, named by item id
    themes/<name>/     optional overrides, same filenames
    build/             notions.png + notions.json

Usage:
    python notion_processing.py --theme cottage
    python notion_processing.py --cell 256 --columns 8

Requires Pillow:  pip install Pillow
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).parent
SUFFIXES = {".png", ".webp", ".tif", ".tiff"}
PREVIEW_INK = (36, 30, 34)
PREVIEW_PAPER = (232, 226, 217)


def source_files(source: Path, theme: Path | None) -> dict[str, Path]:
    """Default set, with any same-named file in the theme folder taking precedence."""
    files = {p.stem: p for p in sorted(source.iterdir()) if p.suffix.lower() in SUFFIXES}
    if theme and theme.is_dir():
        for path in sorted(theme.iterdir()):
            if path.suffix.lower() in SUFFIXES:
                files[path.stem] = path
    return files


def to_mask(image: Image.Image, from_luminance: bool) -> Image.Image:
    """White RGB with coverage in alpha, so a shader tint is just colour x alpha."""
    image = image.convert("RGBA")
    if from_luminance:
        # black-on-white line art: darkness becomes coverage
        alpha = image.convert("L").point(lambda v: 255 - v)
    else:
        alpha = image.getchannel("A")
    mask = Image.new("RGBA", image.size, (255, 255, 255, 0))
    mask.putalpha(alpha)
    return mask


def fit_cell(mask: Image.Image, cell: int, padding: int) -> Image.Image:
    """Trim to the drawn pixels, then centre in a square cell at a consistent scale."""
    bbox = mask.getchannel("A").getbbox()
    if bbox:
        mask = mask.crop(bbox)
    inner = max(cell - padding * 2, 1)
    scale = min(inner / mask.width, inner / mask.height)
    size = (max(round(mask.width * scale), 1), max(round(mask.height * scale), 1))
    mask = mask.resize(size, Image.LANCZOS)

    out = Image.new("RGBA", (cell, cell), (255, 255, 255, 0))
    out.alpha_composite(mask, ((cell - size[0]) // 2, (cell - size[1]) // 2))
    return out


def cell_uv(index: int, columns: int, rows: int) -> dict[str, float]:
    """three.js samples with v increasing upward, so row 0 sits at the TOP of the image."""
    col, row = index % columns, index // columns
    return {
        "col": col,
        "row": row,
        "u0": col / columns,
        "u1": (col + 1) / columns,
        "v0": 1 - (row + 1) / rows,
        "v1": 1 - row / rows,
    }


def pack(masks: dict[str, Image.Image], cell: int, columns: int) -> tuple[Image.Image, dict]:
    names = sorted(masks)
    rows = max(-(-len(names) // columns), 1)
    atlas = Image.new("RGBA", (columns * cell, rows * cell), (255, 255, 255, 0))

    cells = {}
    for index, name in enumerate(names):
        uv = cell_uv(index, columns, rows)
        atlas.alpha_composite(masks[name], (uv["col"] * cell, uv["row"] * cell))
        cells[name] = uv
    return atlas, {"cell": cell, "columns": columns, "rows": rows, "cells": cells}


def preview_sheet(masks: dict[str, Image.Image], cell: int, columns: int) -> Image.Image:
    """The atlas is white-on-transparent and so looks blank. This is what a human reviews."""
    names = sorted(masks)
    rows = max(-(-len(names) // columns), 1)
    label = 22
    sheet = Image.new("RGB", (columns * cell, rows * (cell + label)), PREVIEW_PAPER)
    ink = Image.new("RGB", (cell, cell), PREVIEW_INK)
    draw = ImageDraw.Draw(sheet)

    for index, name in enumerate(names):
        col, row = index % columns, index // columns
        x, y = col * cell, row * (cell + label)
        sheet.paste(ink, (x, y), masks[name].getchannel("A"))
        draw.text((x + 6, y + cell + 4), name, fill=PREVIEW_INK)
    return sheet


def build(args: argparse.Namespace) -> None:
    source = Path(args.source)
    theme = Path(args.themes) / args.theme if args.theme else None
    files = source_files(source, theme)
    if not files:
        raise SystemExit(f"no source images in {source}")

    masks = {
        name: fit_cell(to_mask(Image.open(path), args.from_luminance), args.cell, args.padding)
        for name, path in files.items()
    }
    atlas, manifest = pack(masks, args.cell, args.columns)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    stem = args.theme or "default"
    atlas.save(out / f"{stem}.png")
    manifest["atlas"] = f"{stem}.png"
    manifest["theme"] = stem
    (out / f"{stem}.json").write_text(json.dumps(manifest, indent=2) + "\n")
    preview_sheet(masks, args.cell, args.columns).save(out / f"{stem}-preview.png")

    overridden = sum(1 for name, path in files.items() if theme and path.parent == theme)
    print(f"{stem}: {len(files)} notions, {overridden} overridden -> {out}/{stem}.png")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=HERE / "source")
    parser.add_argument("--themes", default=HERE / "themes")
    parser.add_argument("--theme", help="theme folder name; omit to build the default set")
    parser.add_argument("--out", default=HERE / "build")
    parser.add_argument("--cell", type=int, default=256, help="atlas cell size in pixels")
    parser.add_argument("--columns", type=int, default=8)
    parser.add_argument("--padding", type=int, default=12, help="keeps cells from bleeding")
    parser.add_argument(
        "--from-luminance",
        action="store_true",
        default=True,
        help="derive coverage from darkness (black line art) rather than the alpha channel",
    )
    parser.add_argument("--from-alpha", dest="from_luminance", action="store_false")
    build(parser.parse_args())


if __name__ == "__main__":
    main()
