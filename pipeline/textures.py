"""Procedural material textures for the immersive garment stage.

Everything here is generated locally: no paid provider, no network call. The
leather grain is built from FFT-filtered noise, which is periodic by
construction, so the resulting tile is seamless in both axes with no blend seam.

Usage:
    python pipeline/textures.py --item tee --material leather
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
TEXTURE_SIZE = 1024
ALGORITHM_VERSION = "1.0.0"


def _periodic_noise(size: int, beta: float, seed: int) -> np.ndarray:
    """Band-limited periodic noise via 1/f^beta spectral shaping.

    The result tiles exactly: the spectrum of a circular buffer is inherently
    periodic, so wrapping edges match without any cross-fade.
    """
    rng = np.random.default_rng(seed)
    white = rng.standard_normal((size, size))
    spectrum = np.fft.rfft2(white)
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.rfftfreq(size)[None, :]
    radius = np.sqrt(fx * fx + fy * fy)
    radius[0, 0] = 1.0
    falloff = radius ** (-beta)
    falloff[0, 0] = 0.0
    shaped = np.fft.irfft2(spectrum * falloff, s=(size, size))
    shaped -= shaped.mean()
    peak = np.abs(shaped).max()
    return shaped / peak if peak else shaped


def _normalize(data: np.ndarray) -> np.ndarray:
    low, high = float(data.min()), float(data.max())
    if high - low < 1e-9:
        return np.zeros_like(data)
    return (data - low) / (high - low)


def _voronoi(size: int, cells: int, seed: int, jitter: float = 0.9) -> tuple[np.ndarray, np.ndarray]:
    """Tileable Worley cellular noise: returns normalised F1 and F2-F1.

    Leather grain is a cellular pattern, not smooth 1/f cloud noise. Cell
    indices wrap modulo ``cells``, so the tile is seamless by construction.
    """
    rng = np.random.default_rng(seed)
    cell = size / cells
    jx = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (cells, cells))
    jy = rng.uniform(0.5 - jitter / 2, 0.5 + jitter / 2, (cells, cells))

    xs = (np.arange(size) + 0.5)[None, :].repeat(size, axis=0)
    ys = (np.arange(size) + 0.5)[:, None].repeat(size, axis=1)
    cx = np.floor(xs / cell).astype(np.int64)
    cy = np.floor(ys / cell).astype(np.int64)

    f1 = np.full((size, size), np.inf)
    f2 = np.full((size, size), np.inf)
    for oy in (-1, 0, 1):
        for ox in (-1, 0, 1):
            gx = (cx + ox) % cells
            gy = (cy + oy) % cells
            px = (cx + ox + jx[gy, gx]) * cell
            py = (cy + oy + jy[gy, gx]) * cell
            distance = np.sqrt((xs - px) ** 2 + (ys - py) ** 2)
            nearer = distance < f1
            f2 = np.where(nearer, f1, np.minimum(f2, distance))
            f1 = np.where(nearer, distance, f1)
    return f1 / cell, (f2 - f1) / cell


def leather_height(
    size: int = TEXTURE_SIZE,
    seed: int = 20261102,
    cells: int = 59,
    groove: float = 0.11,
) -> np.ndarray:
    """Pebbled lambskin height field in [0, 1].

    Built from three layers that read as leather at garment scale: rounded
    pebbles (cellular), shallow creased borders, and fine pores on top.
    """
    # ~74 cells across a 1024 tile lands near 1.2 mm pebbles at garment scale;
    # fewer cells reads as cracked earth rather than shrunken lambskin.
    f1, border = _voronoi(size, cells, seed)
    pebbles = np.exp(-((f1 / 0.62) ** 2))

    # Shallow valley along the boundary between pebbles.
    grooves = np.exp(-((border / 0.11) ** 2))

    # Broad undulation so the tile does not read as a flat stamp.
    swell = _normalize(_periodic_noise(size, 2.4, seed + 17))

    # Fine pores break up the smooth domes.
    pores = _normalize(_periodic_noise(size, 0.35, seed + 41))

    height = 0.62 * pebbles + 0.09 * swell + 0.07 * pores - groove * grooves

    # Hair-thin cracks across the surface.
    cracks = _periodic_noise(size, 0.95, seed + 73)
    height -= 0.05 * np.exp(-((cracks / 0.03) ** 2))

    return np.clip(_normalize(height), 0.0, 1.0)


def height_to_normal(height: np.ndarray, strength: float = 4.0) -> np.ndarray:
    """Sobel gradients with wrap-around sampling, so the normal map also tiles."""
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * 0.5
    nx = -dx * strength
    ny = dy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    nx, ny, nz = nx / length, ny / length, nz / length
    rgb = np.stack([nx * 0.5 + 0.5, ny * 0.5 + 0.5, nz * 0.5 + 0.5], axis=-1)
    return np.clip(rgb, 0.0, 1.0)


def _save_webp(array: np.ndarray, path: Path) -> None:
    """Lossless blows past the transfer budget (1.3 MB for the normal map alone).

    High-quality lossy webp keeps the grain reading clean while holding each
    texture under 500 KB, which matters because these load on first paint.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.fromarray(array, mode="RGB" if array.ndim == 3 else "L")
    image.save(path, format="WEBP", quality=92, method=6)


def render_swatch(height: np.ndarray, normal: np.ndarray, tint: tuple[float, float, float],
                  size: int = 512) -> np.ndarray:
    """Render a lit material swatch from the same maps the shader uses.

    The detail panel should show what the fabric looks like under light, not the
    raw height map — a grey speckle field is data, not a product shot.
    """
    from PIL import Image as _Image

    height_image = _Image.fromarray((height * 255.0).astype(np.uint8), mode="L")
    normal_image = _Image.fromarray((normal * 255.0).astype(np.uint8), mode="RGB")
    height_small = np.asarray(height_image.resize((size, size), _Image.LANCZOS)).astype(np.float64) / 255.0
    normal_small = np.asarray(normal_image.resize((size, size), _Image.LANCZOS)).astype(np.float64) / 255.0
    n = normal_small * 2.0 - 1.0
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-6)

    light = np.array([-0.35, -0.45, 0.82])
    light /= np.linalg.norm(light)
    view = np.array([0.0, 0.0, 1.0])
    half = (light + view)
    half /= np.linalg.norm(half)

    diffuse = np.clip(n @ light, 0.0, 1.0)
    specular = np.clip(n @ half, 0.0, 1.0) ** 26.0

    albedo = np.array(tint) * (0.62 + 0.52 * height_small)[..., None]
    color = albedo * (0.42 + 0.72 * diffuse[..., None])
    color += specular[..., None] * 0.42

    # Studio falloff so the swatch reads as a lit object rather than a tile.
    ys = np.linspace(-1.0, 1.0, size)[:, None]
    xs = np.linspace(-1.0, 1.0, size)[None, :]
    falloff = np.clip(1.12 - 0.30 * np.sqrt(xs * xs + ys * ys), 0.0, 1.4)
    color *= falloff[..., None]

    return np.clip(color, 0.0, 1.0)


def build_leather(item: str, out_dir: Path) -> dict:
    height = leather_height()
    normal = height_to_normal(height)

    grain_rgb = np.stack([height, height, height], axis=-1)
    grain_rgb = np.clip(grain_rgb, 0.0, 1.0)
    grain_array = (grain_rgb * 255.0 + 0.5).astype(np.uint8)
    normal_array = (normal * 255.0 + 0.5).astype(np.uint8)

    grain_path = out_dir / "leather-grain.webp"
    normal_path = out_dir / "leather-normal.webp"
    _save_webp(grain_array, grain_path)
    _save_webp(normal_array, normal_path)

    swatch = render_swatch(height, normal, tint=(0x42 / 255, 0x30 / 255, 0x1f / 255))
    swatch_path = out_dir / "leather-swatch.webp"
    swatch_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray((swatch * 255.0 + 0.5).astype(np.uint8), mode="RGB").save(
        swatch_path, format="WEBP", quality=93, method=6
    )

    return {
        "preset": "leather",
        "algorithm": "fft-band-limited-voronoi-ridge",
        "algorithmVersion": ALGORITHM_VERSION,
        "textureSize": TEXTURE_SIZE,
        "seed": 20261102,
        "tileable": True,
        "derivedFrom": "procedural-synthesis",
        "note": "程序化生成的粒面与法线，非实拍皮革纹理。",
        "files": {
            "grain": {"path": grain_path.name, "bytes": grain_path.stat().st_size},
            "normal": {"path": normal_path.name, "bytes": normal_path.stat().st_size},
            "swatch": {"path": swatch_path.name, "bytes": swatch_path.stat().st_size},
        },
    }


DETAIL_REGIONS = {
    "collar": {
        "label": "领口",
        "box": (0.395, 0.045, 0.605, 0.175),
        "note": "领口包边与双针车线，皮革此处做了削薄处理。",
    },
    "cuff": {
        "label": "袖口",
        "box": (0.115, 0.300, 0.300, 0.470),
        "note": "袖口折边高度与车线间距，决定了硬挺感。",
    },
    "hem": {
        "label": "下摆",
        "box": (0.335, 0.775, 0.665, 0.905),
        "note": "下摆车线与起皱走向，皮革边缘做封边。",
    },
}


def build_details(item: str, out_dir: Path) -> list[dict]:
    """Crop review details from the most frontal frame of the atlas.

    The garment source is 384x448 per frame, so these crops are inherently
    soft; they are upscaled 2x and labelled as preview-derived rather than
    presented as photographic macro shots.
    """
    fixture = ROOT / "public" / "fixtures" / item
    manifest = json.loads((fixture / "manifest.json").read_text(encoding="utf-8"))
    atlas = Image.open(fixture / manifest["atlas"]).convert("RGBA")
    width, height, columns = manifest["width"], manifest["height"], manifest["columns"]
    frame = manifest["frameCount"] - 1
    cell = atlas.crop(
        (
            (frame % columns) * width,
            (frame // columns) * height,
            (frame % columns) * width + width,
            (frame // columns) * height + height,
        )
    )

    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for key, spec in DETAIL_REGIONS.items():
        x0, y0, x1, y1 = spec["box"]
        box = (
            int(round(x0 * width)),
            int(round(y0 * height)),
            int(round(x1 * width)),
            int(round(y1 * height)),
        )
        crop = cell.crop(box)
        crop = crop.resize((crop.width * 2, crop.height * 2), Image.LANCZOS)
        crop = crop.filter(ImageFilter.UnsharpMask(radius=1.6, percent=115, threshold=2))
        path = out_dir / f"{key}.webp"
        crop.save(path, format="WEBP", quality=92, method=6)
        centre_x = (x0 + x1) / 2.0
        centre_y = (y0 + y1) / 2.0
        entries.append(
            {
                "id": key,
                "label": spec["label"],
                "x": round(centre_x, 4),
                "y": round(centre_y, 4),
                "crop": f"fixtures/{item}/details/{key}.webp",
                "note": spec["note"],
                "source": "atlas-frame-29-upscaled-2x",
                "bytes": path.stat().st_size,
            }
        )
    return entries


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate procedural garment textures.")
    parser.add_argument("--item", default="tee")
    parser.add_argument("--material", default="leather")
    parser.add_argument("--force", action="store_true", help="Overwrite reviewed output")
    args = parser.parse_args()

    material_dir = ROOT / "public" / "fixtures" / args.item / "materials" / args.material
    details_dir = ROOT / "public" / "fixtures" / args.item / "details"
    report_path = material_dir / "material.json"

    if report_path.exists() and not args.force:
        raise SystemExit(
            f"Refusing to overwrite reviewed output at {report_path}. Pass --force to regenerate."
        )

    report = build_leather(args.item, material_dir)
    report["details"] = build_details(args.item, details_dir)
    report["digests"] = {
        "grain": _digest(material_dir / "leather-grain.webp"),
        "normal": _digest(material_dir / "leather-normal.webp"),
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(json.dumps(report, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
