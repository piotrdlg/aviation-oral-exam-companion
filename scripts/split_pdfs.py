#!/usr/bin/env python3
"""Split FAA handbook PDFs into chapter-level files."""

import os
import re
import pypdf

SOURCES = "/Users/piotrdlugiewicz/claude-projects/aviation-oral-exam-companion/sources"


def split_pdf(input_path, chapters, output_dir, prefix):
    """Split a PDF into chapter files based on (start_page, name) tuples.

    chapters: list of (start_page_1indexed, filename_suffix, display_name)
    """
    os.makedirs(output_dir, exist_ok=True)
    reader = pypdf.PdfReader(input_path)
    total_pages = len(reader.pages)

    for i, (start, suffix, name) in enumerate(chapters):
        # End page is start of next chapter, or end of book
        end = chapters[i + 1][0] - 1 if i + 1 < len(chapters) else total_pages
        start_idx = start - 1  # Convert to 0-indexed

        writer = pypdf.PdfWriter()
        for page_num in range(start_idx, end):
            writer.add_page(reader.pages[page_num])

        filename = f"{prefix}_{suffix}.pdf"
        output_path = os.path.join(output_dir, filename)
        with open(output_path, "wb") as f:
            writer.write(f)

        page_count = end - start_idx
        size_kb = os.path.getsize(output_path) / 1024
        print(f"  {filename:50s} pages {start:3d}-{end:3d} ({page_count:3d} pp, {size_kb:,.0f} KB) | {name}")


def get_top_level_bookmarks(reader):
    """Extract only top-level bookmarks with page numbers."""
    results = []
    outline = reader.outline
    if not outline:
        return results
    for item in outline:
        if isinstance(item, list):
            continue  # Skip nested
        try:
            page_num = reader.get_destination_page_number(item) + 1  # 1-indexed
            results.append((page_num, item.title))
        except:
            pass
    return results


def split_aim():
    """Split AIM into chapters."""
    print("\n" + "=" * 70)
    print("AIM — Aeronautical Information Manual (901 pages)")
    print("=" * 70)

    path = os.path.join(SOURCES, "aim", "AIM_Basic_2-20-25.pdf")
    output_dir = os.path.join(SOURCES, "aim", "chapters")

    # From bookmarks analysis
    chapters = [
        (1,   "00_front",     "Front Matter (Cover, Changes, Checklist, TOC)"),
        (37,  "01_ch1",       "Ch 1 — Air Navigation"),
        (91,  "02_ch2",       "Ch 2 — Aeronautical Lighting and Other Airport Visual Aids"),
        (143, "03_ch3",       "Ch 3 — Airspace"),
        (177, "04_ch4",       "Ch 4 — Air Traffic Control"),
        (297, "05_ch5",       "Ch 5 — Air Traffic Procedures"),
        (459, "06_ch6",       "Ch 6 — Emergency Procedures"),
        (491, "07_ch7",       "Ch 7 — Safety of Flight"),
        (615, "08_ch8",       "Ch 8 — Medical Facts for Pilots"),
        (625, "09_ch9",       "Ch 9 — Aeronautical Charts and Related Publications"),
        (639, "10_ch10",      "Ch 10 — Helicopter Operations"),
        (667, "11_ch11",      "Ch 11 — Unmanned Aircraft Systems (UAS)"),
        (701, "12_appendices", "Appendices 1-5"),
        (739, "13_glossary",  "Pilot/Controller Glossary"),
    ]

    split_pdf(path, chapters, output_dir, "aim")


def split_ifh():
    """Split Instrument Flying Handbook into chapters."""
    print("\n" + "=" * 70)
    print("IFH — Instrument Flying Handbook (371 pages)")
    print("=" * 70)

    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-15B_Instrument_Flying.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "ifh_chapters")

    # IFH has no bookmarks. Page numbers determined by scanning for internal
    # page numbering (e.g., "1-1", "2-1") in the extracted text.
    chapters = [
        (1,   "00_front",       "Front Matter (Cover, Preface, Acknowledgments, Introduction, TOC)"),
        (20,  "01_ch1",         "Ch 1 — The National Airspace System"),
        (52,  "02_ch2",         "Ch 2 — The Air Traffic Control System"),
        (68,  "03_ch3",         "Ch 3 — Human Factors"),
        (78,  "04_ch4",         "Ch 4 — Aerodynamic Factors"),
        (96,  "05_ch5",         "Ch 5 — Flight Instruments"),
        (134, "06_ch6",         "Ch 6 — Airplane Attitude Instrument Flying"),
        (162, "07_ch7",         "Ch 7 — Airplane Basic Flight Maneuvers"),
        (224, "08_ch8",         "Ch 8 — Helicopter Attitude Instrument Flying"),
        (244, "09_ch9",         "Ch 9 — Navigation Systems"),
        (292, "10_ch10",        "Ch 10 — IFR Flight"),
        (326, "11_ch11",        "Ch 11 — Emergency Operations"),
        (340, "12_appendixA",   "Appendix A — Clearance Shorthand"),
        (342, "13_appendixB",   "Appendix B — Instrument Training Lesson Guide"),
        (346, "14_glossary",    "Glossary"),
        (366, "15_index",       "Index"),
    ]

    split_pdf(path, chapters, output_dir, "ifh")


def split_awh():
    """Split Aviation Weather Handbook into chapters."""
    print("\n" + "=" * 70)
    print("AWH — Aviation Weather Handbook (539 pages)")
    print("=" * 70)

    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-28A_Aviation_Weather.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "awh_chapters")
    reader = pypdf.PdfReader(path)

    # Get top-level bookmarks
    bookmarks = get_top_level_bookmarks(reader)
    print(f"  Top-level bookmarks found: {len(bookmarks)}")
    for p, t in bookmarks:
        print(f"    p.{p:4d} | {t}")

    # AWH has 28 chapters + parts structure. The top-level bookmarks are chapter titles.
    # Map them to numbered files.
    chapters = [
        (1,   "00_front",  "Front Matter (Cover, Preface, Acknowledgments, TOC)"),
    ]

    ch_num = 1
    for page, title in bookmarks:
        if page <= 24:  # Skip front matter entries
            continue
        suffix = f"{ch_num:02d}_ch{ch_num}"
        chapters.append((page, suffix, f"Ch {ch_num} — {title}"))
        ch_num += 1

    # Find glossary/index at the end
    for page_idx in range(len(reader.pages) - 1, max(0, len(reader.pages) - 30), -1):
        try:
            text = reader.pages[page_idx].extract_text()
            if text and re.search(r"^Glossary", text.strip().split('\n')[0], re.IGNORECASE):
                chapters.append((page_idx + 1, f"{ch_num:02d}_glossary", "Glossary"))
                ch_num += 1
                break
        except:
            continue

    for page_idx in range(len(reader.pages) - 1, max(0, len(reader.pages) - 20), -1):
        try:
            text = reader.pages[page_idx].extract_text()
            if text and re.search(r"^Index", text.strip().split('\n')[0], re.IGNORECASE):
                chapters.append((page_idx + 1, f"{ch_num:02d}_index", "Index"))
                break
        except:
            continue

    chapters.sort(key=lambda x: x[0])
    # Remove duplicates (same start page)
    seen = set()
    unique = []
    for ch in chapters:
        if ch[0] not in seen:
            seen.add(ch[0])
            unique.append(ch)

    split_pdf(path, unique, output_dir, "awh")


def split_rmh():
    """Split Risk Management Handbook into chapters."""
    print("\n" + "=" * 70)
    print("RMH — Risk Management Handbook (78 pages)")
    print("=" * 70)

    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-2A_Risk_Management.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "rmh_chapters")

    # From bookmarks
    chapters = [
        (1,  "00_front",       "Front Matter (Cover, Preface, Introduction, TOC)"),
        (10, "01_ch1",         "Ch 1 — Introduction to Risk Management"),
        (13, "02_ch2",         "Ch 2 — Personal Minimums"),
        (19, "03_ch3",         "Ch 3 — Identifying Hazards & Associated Risks"),
        (34, "04_ch4",         "Ch 4 — Assessing Risk"),
        (39, "05_ch5",         "Ch 5 — Mitigating Risk"),
        (44, "06_ch6",         "Ch 6 — Threat and Error Management"),
        (50, "07_ch7",         "Ch 7 — Automation & Flight Path Management"),
        (54, "08_ch8",         "Ch 8 — Aeronautical Decision-Making in Flight"),
        (58, "09_appendices",  "Appendices A-D"),
        (73, "10_glossary",    "Glossary"),
        (77, "11_index",       "Index"),
    ]

    split_pdf(path, chapters, output_dir, "rmh")


def split_wbh():
    """Split Weight & Balance Handbook into chapters."""
    print("\n" + "=" * 70)
    print("WBH — Weight & Balance Handbook (116 pages)")
    print("=" * 70)

    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-1B_Weight_Balance.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "wbh_chapters")

    # From bookmarks
    chapters = [
        (1,   "00_front",    "Front Matter (Cover, Preface, TOC)"),
        (15,  "01_ch1",      "Ch 1 — Weight and Balance Overview"),
        (21,  "02_ch2",      "Ch 2 — Weight and Balance Theory"),
        (33,  "03_ch3",      "Ch 3 — Weighing the Aircraft"),
        (43,  "04_ch4",      "Ch 4 — Small Single-Engine Aircraft"),
        (49,  "05_ch5",      "Ch 5 — Small Multiengine Aircraft"),
        (55,  "06_ch6",      "Ch 6 — Large Aircraft"),
        (61,  "07_ch7",      "Ch 7 — Helicopter Weight and Balance"),
        (69,  "08_ch8",      "Ch 8 — Weight-Shift and Powered Parachute"),
        (73,  "09_ch9",      "Ch 9 — Use of Computers"),
        (93,  "10_ch10",     "Ch 10 — Summary, Questions, and Answers"),
        (101, "11_appendixA", "Appendix A"),
        (103, "12_appendixB", "Appendix B"),
        (105, "13_glossary",  "Glossary"),
        (111, "14_index",     "Index"),
    ]

    split_pdf(path, chapters, output_dir, "wbh")


def split_iph():
    """Split Instrument Procedures Handbook into chapters."""
    print("\n" + "=" * 70)
    print("IPH — Instrument Procedures Handbook (312 pages)")
    print("=" * 70)

    path = os.path.join(SOURCES, "handbooks", "FAA-H-8083-16B_Instrument_Procedures.pdf")
    output_dir = os.path.join(SOURCES, "handbooks", "iph_chapters")

    # From TOC bookmarks
    chapters = [
        (1,   "00_front",       "Front Matter (Preface, Acknowledgments, Changes, TOC)"),
        (17,  "01_ch1",         "Ch 1 — Departure Procedures"),
        (61,  "02_ch2",         "Ch 2 — En Route Operations"),
        (113, "03_ch3",         "Ch 3 — Arrivals"),
        (141, "04_ch4",         "Ch 4 — Approaches"),
        (233, "05_ch5",         "Ch 5 — Improvement Plans"),
        (251, "06_ch6",         "Ch 6 — Airborne Navigation Databases"),
        (269, "07_ch7",         "Ch 7 — Helicopter Instrument Procedures"),
        (287, "08_appendixA",   "Appendix A — Emergency Procedures"),
        (293, "09_appendixB",   "Appendix B — Acronyms"),
        (301, "10_glossary",    "Glossary"),
    ]

    split_pdf(path, chapters, output_dir, "iph")


if __name__ == "__main__":
    os.chdir(SOURCES)
    split_aim()
    split_ifh()
    split_awh()
    split_rmh()
    split_wbh()
    split_iph()
    print("\n" + "=" * 70)
    print("ALL DONE!")
    print("=" * 70)
