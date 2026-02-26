#!/usr/bin/env python3
"""
extract_pdf_toc.py — Extract PDF bookmarks/TOC via PyMuPDF

Iterates source PDFs, extracts TOC entries (levels 1-3),
normalizes headings, and outputs one JSON per document group.

Output: data/taxonomy/toc/<doc_abbrev>.json

Usage:
    python scripts/taxonomy/extract_pdf_toc.py
    python scripts/taxonomy/extract_pdf_toc.py --verbose
    python scripts/taxonomy/extract_pdf_toc.py --doc phak
"""

import fitz  # PyMuPDF
import json
import os
import re
import sys
import argparse
from pathlib import Path
from typing import Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SOURCES_DIR = PROJECT_ROOT / "sources"
OUTPUT_DIR = PROJECT_ROOT / "data" / "taxonomy" / "toc"

# Document groups and their source directories
DOC_GROUPS = {
    "phak": {
        "title": "Pilot's Handbook of Aeronautical Knowledge (FAA-H-8083-25B)",
        "faa_number": "FAA-H-8083-25B",
        "paths": [SOURCES_DIR / "phak"],
    },
    "afh": {
        "title": "Airplane Flying Handbook (FAA-H-8083-3C)",
        "faa_number": "FAA-H-8083-3C",
        "paths": [SOURCES_DIR / "afh"],
    },
    "aim": {
        "title": "Aeronautical Information Manual",
        "faa_number": "AIM",
        "paths": [SOURCES_DIR / "aim", SOURCES_DIR / "aim" / "chapters"],
    },
    "ifh": {
        "title": "Instrument Flying Handbook (FAA-H-8083-15B)",
        "faa_number": "FAA-H-8083-15B",
        "paths": [SOURCES_DIR / "handbooks", SOURCES_DIR / "handbooks" / "ifh_chapters"],
    },
    "iph": {
        "title": "Instrument Procedures Handbook (FAA-H-8083-16B)",
        "faa_number": "FAA-H-8083-16B",
        "paths": [SOURCES_DIR / "handbooks", SOURCES_DIR / "handbooks" / "iph_chapters"],
    },
    "awh": {
        "title": "Aviation Weather Handbook (FAA-H-8083-28A)",
        "faa_number": "FAA-H-8083-28A",
        "paths": [SOURCES_DIR / "handbooks", SOURCES_DIR / "handbooks" / "awh_chapters"],
    },
    "rmh": {
        "title": "Risk Management Handbook (FAA-H-8083-2A)",
        "faa_number": "FAA-H-8083-2A",
        "paths": [SOURCES_DIR / "handbooks", SOURCES_DIR / "handbooks" / "rmh_chapters"],
    },
    "wbh": {
        "title": "Weight & Balance Handbook (FAA-H-8083-1B)",
        "faa_number": "FAA-H-8083-1B",
        "paths": [SOURCES_DIR / "handbooks"],
    },
    "cfr": {
        "title": "14 CFR (Federal Aviation Regulations)",
        "faa_number": "14 CFR",
        "paths": [SOURCES_DIR / "cfr"],
    },
    "ac": {
        "title": "Advisory Circulars",
        "faa_number": "AC",
        "paths": [SOURCES_DIR / "ac"],
    },
    "acs": {
        "title": "Airman Certification Standards",
        "faa_number": "ACS",
        "paths": [SOURCES_DIR / "acs"],
    },
}


def normalize_heading(text: str) -> str:
    """Clean up TOC heading text."""
    # Remove page number noise (trailing numbers after dots/spaces)
    text = re.sub(r'[\s.]+\d+\s*$', '', text)
    # Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    # Remove leading/trailing punctuation noise
    text = re.sub(r'^[.\-–—]+\s*', '', text)
    text = re.sub(r'\s*[.\-–—]+$', '', text)
    return text


def extract_toc_from_pdf(pdf_path: Path, verbose: bool = False) -> list[dict]:
    """Extract TOC entries from a single PDF."""
    entries = []
    try:
        doc = fitz.open(str(pdf_path))
        toc = doc.get_toc()  # Returns list of [level, title, page]

        if verbose and toc:
            print(f"  Found {len(toc)} TOC entries in {pdf_path.name}")

        for level, title, page in toc:
            if level > 3:
                continue  # Only levels 1-3

            normalized = normalize_heading(title)
            if not normalized or len(normalized) < 3:
                continue

            entries.append({
                "toc_level": level,
                "title": normalized,
                "page": page if page > 0 else None,
                "raw_title": title,
                "source_file": pdf_path.name,
            })

        doc.close()
    except Exception as e:
        if verbose:
            print(f"  Warning: Could not process {pdf_path.name}: {e}")

    return entries


def build_hierarchy(entries: list[dict]) -> list[dict]:
    """Add parent pointers based on TOC levels."""
    # Track current parent at each level
    parents: dict[int, Optional[str]] = {1: None, 2: None, 3: None}

    for entry in entries:
        level = entry["toc_level"]
        # Parent is the most recent entry at (level - 1)
        entry["parent_title"] = parents.get(level - 1)

        # Update tracking
        parents[level] = entry["title"]
        # Clear deeper levels when we encounter a new section
        for deeper in range(level + 1, 4):
            parents[deeper] = None

    return entries


def filter_by_doc_group(pdf_path: Path, doc_abbrev: str) -> bool:
    """Check if a PDF belongs to a specific document group."""
    name_lower = pdf_path.name.lower()
    group = DOC_GROUPS[doc_abbrev]

    # For groups with specific FAA numbers, match on filename
    if doc_abbrev == "phak":
        return "phak" in name_lower
    elif doc_abbrev == "afh":
        return "afh" in name_lower
    elif doc_abbrev == "aim":
        return "aim" in name_lower
    elif doc_abbrev == "ifh":
        return "8083-15" in name_lower or "ifh" in name_lower or "instrument_flying" in name_lower or "ifh_" in name_lower
    elif doc_abbrev == "iph":
        return "8083-16" in name_lower or "iph" in name_lower or "instrument_procedures" in name_lower
    elif doc_abbrev == "awh":
        return "8083-28" in name_lower or "awh" in name_lower or "aviation_weather" in name_lower
    elif doc_abbrev == "rmh":
        return "8083-2a" in name_lower or "rmh" in name_lower or "risk_management" in name_lower
    elif doc_abbrev == "wbh":
        return ("8083-1b" in name_lower or "weight" in name_lower) and "8083-15" not in name_lower and "8083-16" not in name_lower
    elif doc_abbrev == "cfr":
        return True  # cfr dir only has CFR files
    elif doc_abbrev == "ac":
        return True  # ac dir only has AC files
    elif doc_abbrev == "acs":
        return True  # acs dir only has ACS files
    return False


def process_doc_group(doc_abbrev: str, verbose: bool = False) -> dict:
    """Process all PDFs in a document group and return structured output."""
    group = DOC_GROUPS[doc_abbrev]
    all_entries: list[dict] = []
    files_processed = []

    # Collect all PDFs from the group's paths
    seen_files = set()
    for dir_path in group["paths"]:
        if not dir_path.exists():
            if verbose:
                print(f"  Directory not found: {dir_path}")
            continue

        for pdf_file in sorted(dir_path.glob("*.pdf")):
            if pdf_file.name in seen_files:
                continue

            # Filter to ensure PDF belongs to this group (for shared dirs like handbooks/)
            if dir_path == SOURCES_DIR / "handbooks" and not filter_by_doc_group(pdf_file, doc_abbrev):
                continue

            seen_files.add(pdf_file.name)
            entries = extract_toc_from_pdf(pdf_file, verbose)
            if entries:
                all_entries.extend(entries)
                files_processed.append(pdf_file.name)

    # Build hierarchy with parent pointers
    all_entries = build_hierarchy(all_entries)

    output = {
        "doc_abbrev": doc_abbrev,
        "doc_title": group["title"],
        "faa_number": group["faa_number"],
        "files_processed": files_processed,
        "total_entries": len(all_entries),
        "level_counts": {
            "level_1": sum(1 for e in all_entries if e["toc_level"] == 1),
            "level_2": sum(1 for e in all_entries if e["toc_level"] == 2),
            "level_3": sum(1 for e in all_entries if e["toc_level"] == 3),
        },
        "entries": all_entries,
    }

    return output


def main():
    parser = argparse.ArgumentParser(description="Extract PDF TOCs for taxonomy scaffold")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show detailed output")
    parser.add_argument("--doc", type=str, help="Process only this document group (e.g., phak, aim)")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    groups_to_process = [args.doc] if args.doc else list(DOC_GROUPS.keys())

    summary = []

    for doc_abbrev in groups_to_process:
        if doc_abbrev not in DOC_GROUPS:
            print(f"Unknown document group: {doc_abbrev}")
            continue

        print(f"Processing: {doc_abbrev} — {DOC_GROUPS[doc_abbrev]['title']}")
        result = process_doc_group(doc_abbrev, args.verbose)

        # Write JSON output
        out_path = OUTPUT_DIR / f"{doc_abbrev}.json"
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)

        summary.append({
            "doc": doc_abbrev,
            "files": len(result["files_processed"]),
            "entries": result["total_entries"],
            "L1": result["level_counts"]["level_1"],
            "L2": result["level_counts"]["level_2"],
            "L3": result["level_counts"]["level_3"],
        })

        print(f"  → {result['total_entries']} entries from {len(result['files_processed'])} files → {out_path.name}")

    # Print summary table
    print("\n=== Summary ===\n")
    print(f"{'Doc':<8} {'Files':>5} {'Total':>6} {'L1':>4} {'L2':>4} {'L3':>4}")
    print("-" * 40)
    total_entries = 0
    for s in summary:
        print(f"{s['doc']:<8} {s['files']:>5} {s['entries']:>6} {s['L1']:>4} {s['L2']:>4} {s['L3']:>4}")
        total_entries += s["entries"]
    print("-" * 40)
    print(f"{'TOTAL':<8} {'':<5} {total_entries:>6}")
    print(f"\nOutput directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
