"""Tests for the procedural texture generator.

The properties that matter are the ones a reviewer would otherwise have to check
by eye across a tiled seam, or trust blindly across a regeneration.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))

import textures  # noqa: E402


class SeamlessTileTest(unittest.TestCase):
    def test_height_field_wraps_without_a_visible_seam(self):
        height = textures.leather_height(256, seed=7)
        self.assertEqual(height.shape, (256, 256))
        self.assertGreaterEqual(float(height.min()), 0.0)
        self.assertLessEqual(float(height.max()), 1.0)

        # A tiled seam shows up as a jump between the last and first row/column
        # that is much larger than a typical interior step.
        horizontal_seam = np.abs(height[:, -1] - height[:, 0]).mean()
        horizontal_typical = np.abs(np.diff(height, axis=1)).mean()
        vertical_seam = np.abs(height[-1, :] - height[0, :]).mean()
        vertical_typical = np.abs(np.diff(height, axis=0)).mean()

        self.assertLess(horizontal_seam, horizontal_typical * 3.0)
        self.assertLess(vertical_seam, vertical_typical * 3.0)

    def test_generation_is_deterministic_for_a_fixed_seed(self):
        first = textures.leather_height(128, seed=42)
        second = textures.leather_height(128, seed=42)
        third = textures.leather_height(128, seed=43)
        np.testing.assert_array_equal(first, second)
        self.assertFalse(np.array_equal(first, third), "a different seed must produce different grain")


class NormalMapTest(unittest.TestCase):
    def test_normals_are_unit_length_and_encoded_in_range(self):
        height = textures.leather_height(128, seed=11)
        normal = textures.height_to_normal(height)
        self.assertEqual(normal.shape, (128, 128, 3))
        self.assertGreaterEqual(float(normal.min()), 0.0)
        self.assertLessEqual(float(normal.max()), 1.0)

        decoded = normal * 2.0 - 1.0
        lengths = np.linalg.norm(decoded, axis=-1)
        np.testing.assert_allclose(lengths, 1.0, atol=1e-5)
        self.assertTrue((decoded[:, :, 2] > 0).all(), "normals must point out of the surface")

    def test_a_flat_height_field_produces_flat_normals(self):
        normal = textures.height_to_normal(np.full((32, 32), 0.5))
        flat = np.zeros((32, 32, 3))
        flat[:, :, 2] = 1.0
        np.testing.assert_allclose(normal * 2.0 - 1.0, flat, atol=1e-6)


class RegionTest(unittest.TestCase):
    def test_detail_boxes_stay_inside_the_frame(self):
        for key, spec in textures.DETAIL_REGIONS.items():
            x0, y0, x1, y1 = spec["box"]
            self.assertTrue(0 <= x0 < x1 <= 1, f"{key} box must be ordered and inside the frame")
            self.assertTrue(0 <= y0 < y1 <= 1, f"{key} box must be ordered and inside the frame")
            self.assertTrue(spec["label"])
            self.assertTrue(spec["note"])


if __name__ == "__main__":
    unittest.main()
