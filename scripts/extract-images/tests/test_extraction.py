"""
Tests for the image extraction pipeline.
Section 11.1 of the design document.
"""

import hashlib
import io

import pytest

# Import from parent directory
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from extract import (
    FIGURE_PATTERNS,
    CATEGORY_KEYWORDS,
    compute_hash,
    sanitize_path,
    quality_score,
    classify_category,
    normalize_text,
    get_anchors,
    passes_quality_filter,
    optimize_image,
    ExtractionStats,
    MIN_WIDTH,
    MIN_HEIGHT,
    MIN_FILE_SIZE,
    MAX_ASPECT_RATIO,
)


# ============================================================
# Figure label regex patterns
# ============================================================

class TestFigurePatterns:
    """Figure label regex patterns match FAA format."""

    def test_figure_standard_format(self):
        """Match 'Figure 3-1' format."""
        text = "See Figure 3-1 for details"
        matches = [m.group(0) for p in FIGURE_PATTERNS for m in p.finditer(text)]
        assert any("Figure 3-1" in m for m in matches)

    def test_figure_with_dash_variants(self):
        """Match figure labels with different dash types."""
        for dash in ['-', '–']:
            text = f"Figure 15{dash}2"
            matches = [m.group(0) for p in FIGURE_PATTERNS for m in p.finditer(text)]
            assert len(matches) > 0, f"Failed to match dash type: {dash}"

    def test_fig_abbreviation(self):
        """Match 'Fig. 3-1' abbreviated format."""
        text = "See Fig. 7-3 below"
        matches = [m.group(0) for p in FIGURE_PATTERNS for m in p.finditer(text)]
        assert any("Fig." in m for m in matches)

    def test_table_format(self):
        """Match 'Table 5-2' format."""
        text = "Refer to Table 5-2"
        matches = [m.group(0) for p in FIGURE_PATTERNS for m in p.finditer(text)]
        assert any("Table 5-2" in m for m in matches)

    def test_chart_format(self):
        """Match 'Chart 1-3' format."""
        text = "Chart 1-3 shows the performance data"
        matches = [m.group(0) for p in FIGURE_PATTERNS for m in p.finditer(text)]
        assert any("Chart 1-3" in m for m in matches)

    def test_exhibit_format(self):
        """Match 'Exhibit 7' format."""
        text = "Exhibit 7 illustrates"
        matches = [m.group(0) for p in FIGURE_PATTERNS for m in p.finditer(text)]
        assert any("Exhibit 7" in m for m in matches)

    def test_no_false_positives(self):
        """Don't match regular numbers or unrelated text."""
        text = "The airplane has 3-1 fuel tanks and a figure of merit"
        # Should not match "3-1" without the Figure/Table prefix
        for p in FIGURE_PATTERNS:
            for m in p.finditer(text):
                # If matched, it should include Figure/Table/Chart prefix
                assert any(prefix in m.group(0) for prefix in ['Figure', 'Fig.', 'Table', 'Chart', 'Exhibit'])


# ============================================================
# Quality filtering
# ============================================================

class TestQualityFiltering:
    """Quality filtering removes icons, bullets, and decorative elements."""

    def test_rejects_too_small_width(self):
        stats = ExtractionStats()
        assert not passes_quality_filter(50, 200, 10000, stats)
        assert stats.filtered_too_small == 1

    def test_rejects_too_small_height(self):
        stats = ExtractionStats()
        assert not passes_quality_filter(200, 50, 10000, stats)
        assert stats.filtered_too_small == 1

    def test_rejects_extreme_aspect_ratio(self):
        stats = ExtractionStats()
        # 1500x100 = 15:1 aspect ratio, passes min dims but fails aspect ratio
        assert not passes_quality_filter(1500, 100, 50000, stats)
        assert stats.filtered_aspect_ratio == 1

    def test_rejects_tiny_file_size(self):
        stats = ExtractionStats()
        assert not passes_quality_filter(200, 200, 1000, stats)  # < 5KB
        assert stats.filtered_file_size == 1

    def test_accepts_valid_image(self):
        stats = ExtractionStats()
        assert passes_quality_filter(400, 300, 50000, stats)
        assert stats.filtered_too_small == 0
        assert stats.filtered_aspect_ratio == 0
        assert stats.filtered_file_size == 0

    def test_boundary_dimensions(self):
        """Exactly at minimum dimensions should pass."""
        stats = ExtractionStats()
        assert passes_quality_filter(MIN_WIDTH, MIN_HEIGHT, MIN_FILE_SIZE, stats)

    def test_boundary_aspect_ratio(self):
        """At maximum aspect ratio should pass, over should fail."""
        stats = ExtractionStats()
        # 10:1 aspect ratio = exactly at limit
        assert passes_quality_filter(1000, 100, 10000, stats)
        # 11:1 = over limit
        stats2 = ExtractionStats()
        assert not passes_quality_filter(1100, 100, 10000, stats2)


# ============================================================
# Duplicate detection
# ============================================================

class TestDuplicateDetection:
    """SHA-256 content_hash deduplication works correctly."""

    def test_same_content_same_hash(self):
        data = b"test image data"
        assert compute_hash(data) == compute_hash(data)

    def test_different_content_different_hash(self):
        assert compute_hash(b"image A") != compute_hash(b"image B")

    def test_hash_format(self):
        h = compute_hash(b"test")
        assert len(h) == 64  # SHA-256 hex digest
        assert all(c in '0123456789abcdef' for c in h)


# ============================================================
# Image category classification
# ============================================================

class TestCategoryClassification:
    """Automatic image category classification by keywords."""

    def test_weather_classification(self):
        assert classify_category("Figure 12-1", "Surface weather front and cloud analysis") == 'weather'

    def test_performance_classification(self):
        assert classify_category("Table 11-2", "Takeoff distance chart") == 'performance'

    def test_instrument_classification(self):
        assert classify_category(None, "Altimeter instrument display") == 'instrument'

    def test_airport_classification(self):
        assert classify_category(None, "Runway markings and taxi signs") == 'airport'

    def test_sectional_classification(self):
        assert classify_category(None, "Sectional chart airspace symbols") == 'sectional'

    def test_diagram_classification(self):
        assert classify_category(None, "Fuel system schematic layout") == 'diagram'

    def test_general_fallback(self):
        assert classify_category(None, None) == 'general'
        assert classify_category(None, "Some generic text") == 'general'


# ============================================================
# Storage path sanitization
# ============================================================

class TestPathSanitization:
    """Storage paths are URL-safe."""

    def test_lowercase(self):
        assert sanitize_path("PHAK/Ch03/Figure_3-1.png") == "phak/ch03/figure-3-1.png"

    def test_removes_spaces(self):
        assert sanitize_path("my file name.png") == "my-file-name.png"

    def test_removes_special_chars(self):
        assert sanitize_path("figure (1).png") == "figure--1-.png"

    def test_preserves_allowed_chars(self):
        assert sanitize_path("phak/ch03/figure-3-1.png") == "phak/ch03/figure-3-1.png"


# ============================================================
# Quality score computation
# ============================================================

class TestQualityScore:
    """Quality score normalization."""

    def test_zero_file_size(self):
        assert quality_score(100, 100, 0) == 0.0

    def test_high_resolution_low_compression(self):
        score = quality_score(1000, 1000, 50000)
        assert 0.0 <= score <= 1.0

    def test_normalized_range(self):
        for w, h, s in [(200, 200, 10000), (1920, 1080, 500000), (100, 100, 5000)]:
            score = quality_score(w, h, s)
            assert 0.0 <= score <= 1.0


# ============================================================
# Text normalization for page backfill
# ============================================================

class TestTextNormalization:
    """Page backfill text normalization."""

    def test_lowercase(self):
        assert normalize_text("HELLO WORLD") == "hello world"

    def test_collapse_whitespace(self):
        assert normalize_text("hello   world") == "hello world"

    def test_remove_line_break_hyphens(self):
        assert normalize_text("aero-\nplane") == "aeroplane"

    def test_strip(self):
        assert normalize_text("  hello  ") == "hello"


class TestAnchorExtraction:
    """Multi-anchor extraction for page matching."""

    def test_short_text_single_anchor(self):
        anchors = get_anchors("short text", count=3, anchor_len=40)
        assert len(anchors) == 1
        assert anchors[0] == "short text"

    def test_long_text_three_anchors(self):
        text = "A" * 200
        anchors = get_anchors(text, count=3, anchor_len=40)
        assert len(anchors) == 3
        assert all(len(a) == 40 for a in anchors)

    def test_empty_text(self):
        assert get_anchors("") == []
        assert get_anchors("   ") == []
