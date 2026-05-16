#!/usr/bin/env python3
"""
photo_organiser.py — Google Photos → Organised Event Folders
=============================================================
Phases:
  1. Extract zip files one at a time to a temp folder
  2. Deduplicate by MD5 hash — move dupes to a review folder
  3. Read EXIF (date + GPS) from every photo; reverse-geocode via Nominatim
  4. Group into events using 3-day windows + dominant location
  5. Print the full proposed event list and WAIT for your approval
  6. Move (never delete) photos into named folders inside Photos dir
  7. Verification count

Requirements:
  pip install Pillow requests pillow-heif
  (pillow-heif adds HEIC support; optional but recommended)
"""

import hashlib
import json
import os
import re
import shutil
import sys
import time
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

# ── optional HEIC support ───────────────────────────────────────────────────
try:
    from pillow_heif import register_heif_opener
    register_heif_opener()
    HEIC_SUPPORT = True
except ImportError:
    HEIC_SUPPORT = False

try:
    from PIL import Image
    from PIL.ExifTags import GPSTAGS, TAGS
except ImportError:
    sys.exit("ERROR: Pillow not installed.  Run:  pip install Pillow requests")

try:
    import requests
except ImportError:
    sys.exit("ERROR: requests not installed.  Run:  pip install Pillow requests")


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG — adjust if your paths differ
# ═══════════════════════════════════════════════════════════════════════════════

ZIP_DIR    = Path(r"C:\Users\vrsvi\OneDrive\Victor - Private\Photos\Google Drive")
TEMP_DIR   = Path(r"C:\Users\vrsvi\AppData\Local\Temp\PhotoOrganiser")
DUPES_DIR  = Path(r"C:\Users\vrsvi\OneDrive\Victor - Private\Photos\_Duplicates-Review")
PHOTOS_DIR = Path(r"C:\Users\vrsvi\OneDrive\Victor - Private\Photos")

PHOTO_EXTS     = {".jpg", ".jpeg", ".png", ".gif", ".heic", ".heif",
                  ".webp", ".bmp", ".tiff", ".tif",
                  ".mp4", ".mov", ".avi", ".mkv", ".3gp", ".m4v"}
EVENT_GAP_DAYS = 3
NOMINATIM_URL  = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_UA   = "PhotoOrganiserScript/1.0 (personal-use)"

# geocode cache file — persists across runs so you don't re-hit Nominatim
GEOCACHE_FILE  = TEMP_DIR / ".geocache.json"


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def banner(title: str) -> None:
    print(f"\n{'='*64}")
    print(f"  {title}")
    print(f"{'='*64}")


def confirm(prompt: str) -> bool:
    while True:
        ans = input(f"\n{prompt}  [y/N]: ").strip().lower()
        if ans in ("y", "yes"):
            return True
        if ans in ("", "n", "no"):
            return False
        print("  Please enter y or n.")


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(65_536), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_name(name: str) -> str:
    """Strip characters that are invalid in Windows folder names."""
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "", name)
    name = name.strip(". ")
    return name or "Unnamed"


def unique_dest(dest: Path) -> Path:
    """Return dest unchanged if it doesn't exist, else dest_1, dest_2 …"""
    if not dest.exists():
        return dest
    stem, suffix, parent = dest.stem, dest.suffix, dest.parent
    i = 1
    while True:
        candidate = parent / f"{stem}_{i}{suffix}"
        if not candidate.exists():
            return candidate
        i += 1


# ═══════════════════════════════════════════════════════════════════════════════
# EXIF + GEOCODING
# ═══════════════════════════════════════════════════════════════════════════════

def _dms_to_decimal(dms, ref: str) -> float:
    d, m, s = dms
    v = float(d) + float(m) / 60 + float(s) / 3600
    return -v if ref in ("S", "W") else v


def read_exif(path: Path):
    """Return (datetime|None, lat|None, lon|None)."""
    dt = lat = lon = None
    try:
        img = Image.open(path)
        raw = img._getexif()          # type: ignore[attr-defined]
        if not raw:
            return dt, lat, lon
        for tag_id, value in raw.items():
            tag = TAGS.get(tag_id, tag_id)
            if tag in ("DateTimeOriginal", "DateTimeDigitized") and dt is None:
                try:
                    dt = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass
            elif tag == "DateTime" and dt is None:
                try:
                    dt = datetime.strptime(value, "%Y:%m:%d %H:%M:%S")
                except ValueError:
                    pass
            elif tag == "GPSInfo" and isinstance(value, dict):
                gps = {GPSTAGS.get(k, k): v for k, v in value.items()}
                try:
                    lat = _dms_to_decimal(gps["GPSLatitude"],
                                          gps.get("GPSLatitudeRef", "N"))
                    lon = _dms_to_decimal(gps["GPSLongitude"],
                                          gps.get("GPSLongitudeRef", "E"))
                except (KeyError, TypeError, ZeroDivisionError):
                    pass
    except Exception:
        pass
    return dt, lat, lon


_geocache: dict = {}
_last_req_time: float = 0.0


def _load_geocache() -> None:
    global _geocache
    if GEOCACHE_FILE.exists():
        try:
            _geocache = json.loads(GEOCACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            _geocache = {}


def _save_geocache() -> None:
    GEOCACHE_FILE.write_text(
        json.dumps(_geocache, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def reverse_geocode(lat: float, lon: float) -> str:
    global _last_req_time
    key = f"{lat:.3f},{lon:.3f}"
    if key in _geocache:
        return _geocache[key]

    elapsed = time.time() - _last_req_time
    if elapsed < 1.1:
        time.sleep(1.1 - elapsed)

    location = "Unknown Location"
    try:
        r = requests.get(
            NOMINATIM_URL,
            params={"lat": lat, "lon": lon, "format": "json", "zoom": 10},
            headers={"User-Agent": NOMINATIM_UA},
            timeout=10,
        )
        _last_req_time = time.time()
        if r.ok:
            addr = r.json().get("address", {})
            parts: list[str] = []
            for field in ("city", "town", "village", "county", "state", "country"):
                v = addr.get(field, "")
                if v and v not in parts:
                    parts.append(v)
                if len(parts) == 2:
                    break
            if parts:
                location = ", ".join(parts)
    except Exception:
        pass

    _geocache[key] = location
    _save_geocache()
    return location


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 1 — EXTRACT
# ═══════════════════════════════════════════════════════════════════════════════

def phase_extract() -> list[Path]:
    banner("PHASE 1 — Extracting zip files")

    zips = sorted(ZIP_DIR.glob("*.zip"))
    if not zips:
        sys.exit(f"ERROR: No .zip files found in:\n  {ZIP_DIR}")

    print(f"Found {len(zips)} zip file(s):")
    for z in zips:
        print(f"  {z.name}  ({z.stat().st_size / 1_048_576:.1f} MB)")

    if TEMP_DIR.exists() and any(TEMP_DIR.iterdir()):
        print(f"\nWARNING: {TEMP_DIR} already contains files.")
        if not confirm("Continue and add to existing temp folder?"):
            sys.exit("Aborted.")
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    for i, zp in enumerate(zips, 1):
        print(f"\n[{i}/{len(zips)}] Extracting {zp.name} …")
        with zipfile.ZipFile(zp, "r") as zf:
            members = zf.namelist()
            for j, member in enumerate(members, 1):
                zf.extract(member, TEMP_DIR)
                if j % 200 == 0 or j == len(members):
                    print(f"  {j}/{len(members)} files", end="\r")
        print(f"  {len(members)} files extracted            ")

    photos = [
        p for p in TEMP_DIR.rglob("*")
        if p.is_file() and p.suffix.lower() in PHOTO_EXTS
    ]
    print(f"\nTotal media files in temp: {len(photos)}")

    if not HEIC_SUPPORT:
        heic = [p for p in photos if p.suffix.lower() in {".heic", ".heif"}]
        if heic:
            print(f"  NOTE: {len(heic)} HEIC files found.  "
                  "Install pillow-heif for full EXIF support on these.")

    return photos


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 2 — DEDUPLICATE
# ═══════════════════════════════════════════════════════════════════════════════

def phase_deduplicate(photos: list[Path]) -> tuple[list[Path], int]:
    banner("PHASE 2 — Detecting duplicates (MD5)")

    DUPES_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Hashing {len(photos)} files …")
    hashes: dict[str, list[Path]] = defaultdict(list)
    for i, p in enumerate(photos, 1):
        hashes[md5_file(p)].append(p)
        if i % 100 == 0 or i == len(photos):
            print(f"  {i}/{len(photos)}", end="\r")
    print()

    unique: list[Path] = []
    dupes: list[Path] = []
    for paths in hashes.values():
        unique.append(paths[0])
        dupes.extend(paths[1:])

    print(f"Unique files:    {len(unique)}")
    print(f"Duplicate files: {len(dupes)}")

    if dupes:
        print(f"\nDuplicates will be moved to:\n  {DUPES_DIR}")
        if confirm(f"Move {len(dupes)} duplicate(s) to review folder now?"):
            for p in dupes:
                dest = unique_dest(DUPES_DIR / p.name)
                shutil.move(str(p), str(dest))
            print(f"Moved {len(dupes)} duplicates.")
        else:
            print("Skipping — treating all files as unique for grouping purposes.")
            return photos, 0

    return unique, len(dupes)


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 3 — READ METADATA + GEOCODE
# ═══════════════════════════════════════════════════════════════════════════════

def phase_read_metadata(photos: list[Path]) -> list[dict]:
    banner("PHASE 3 — Reading EXIF + reverse-geocoding")
    _load_geocache()

    records: list[dict] = []
    no_exif_date = 0
    has_gps = 0
    coords_to_geocode: set[tuple[float, float]] = set()

    print(f"Reading EXIF from {len(photos)} files …")
    for i, p in enumerate(photos, 1):
        dt, lat, lon = read_exif(p)
        if dt is None:
            dt = datetime.fromtimestamp(p.stat().st_mtime)
            no_exif_date += 1
        if lat is not None and lon is not None:
            has_gps += 1
            coords_to_geocode.add((round(lat, 3), round(lon, 3)))
        records.append({"path": p, "dt": dt, "lat": lat, "lon": lon, "location": None})
        if i % 100 == 0 or i == len(photos):
            print(f"  {i}/{len(photos)}", end="\r")
    print()
    print(f"  No EXIF date (file mtime used): {no_exif_date}")
    print(f"  Photos with GPS:                {has_gps}")

    # Only geocode coords not already in cache
    new_coords = [
        c for c in coords_to_geocode
        if f"{c[0]:.3f},{c[1]:.3f}" not in _geocache
    ]
    if new_coords:
        print(f"\nGeocoding {len(new_coords)} new location(s) via Nominatim …")
        for i, (lat, lon) in enumerate(new_coords, 1):
            reverse_geocode(lat, lon)
            if i % 10 == 0 or i == len(new_coords):
                print(f"  {i}/{len(new_coords)}", end="\r")
        print()
    else:
        print("All coordinates already cached — no Nominatim requests needed.")

    for rec in records:
        if rec["lat"] is not None and rec["lon"] is not None:
            rec["location"] = reverse_geocode(rec["lat"], rec["lon"])
        else:
            rec["location"] = "Unknown Location"

    return records


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 4 — GROUP INTO EVENTS
# ═══════════════════════════════════════════════════════════════════════════════

def phase_group_events(records: list[dict]) -> list[dict]:
    banner("PHASE 4 — Grouping into events")

    records.sort(key=lambda r: r["dt"])

    raw_groups: list[list[dict]] = []
    current: list[dict] = []

    for rec in records:
        if not current:
            current.append(rec)
        elif (rec["dt"] - current[-1]["dt"]).days <= EVENT_GAP_DAYS:
            current.append(rec)
        else:
            raw_groups.append(current)
            current = [rec]
    if current:
        raw_groups.append(current)

    events: list[dict] = []
    for group in raw_groups:
        dates = [r["dt"] for r in group]
        year = dates[len(dates) // 2].year

        locs = [r["location"] for r in group if r["location"] != "Unknown Location"]
        location = Counter(locs).most_common(1)[0][0] if locs else "Unknown Location"

        raw_name = f"{year} — {location}"
        events.append({
            "name": safe_name(raw_name),
            "photos": group,
            "start": dates[0],
            "end": dates[-1],
        })

    print(f"Created {len(events)} event group(s).")
    return events


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 5 — SHOW PROPOSED EVENTS + CONFIRM
# ═══════════════════════════════════════════════════════════════════════════════

def phase_show_and_confirm(events: list[dict]) -> None:
    banner("PHASE 5 — Proposed event list  (REVIEW BEFORE APPROVING)")

    existing = {p.name for p in PHOTOS_DIR.iterdir() if p.is_dir()}

    col_name = 54
    print(f"\n{'#':<5} {'Folder name':<{col_name}} {'Files':>6}  Date range")
    print("-" * 90)
    for i, ev in enumerate(events, 1):
        date_range = (f"{ev['start'].strftime('%Y-%m-%d')} → "
                      f"{ev['end'].strftime('%Y-%m-%d')}")
        flag = "  [MERGE into existing]" if ev["name"] in existing else ""
        print(f"{i:<5} {ev['name']:<{col_name}} {len(ev['photos']):>6}  {date_range}{flag}")

    total = sum(len(ev["photos"]) for ev in events)
    print(f"\n  Total photos/videos to move : {total}")
    print(f"  Destination base folder     : {PHOTOS_DIR}")
    print("\nNOTE: Existing folders you have already organised will NOT be "
          "touched unless one of the new event names above matches exactly.")

    if not confirm("Approve this event list and proceed with moving files?"):
        print("Aborted — no files have been moved.")
        sys.exit(0)


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 6 — MOVE PHOTOS
# ═══════════════════════════════════════════════════════════════════════════════

def phase_move_photos(events: list[dict]) -> int:
    banner("PHASE 6 — Moving files into event folders")

    moved = 0
    renamed = 0

    for ev in events:
        dest_folder = PHOTOS_DIR / ev["name"]
        dest_folder.mkdir(parents=True, exist_ok=True)
        for rec in ev["photos"]:
            src = rec["path"]
            dest = unique_dest(dest_folder / src.name)
            if dest.name != src.name:
                renamed += 1
            shutil.move(str(src), str(dest))
            moved += 1
        print(f"  {ev['name']}:  {len(ev['photos'])} file(s)")

    print(f"\nMoved:          {moved}")
    print(f"Renamed (clash): {renamed}")
    return moved


# ═══════════════════════════════════════════════════════════════════════════════
# PHASE 7 — VERIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

def phase_verify(original: int, dupes: int, moved: int) -> None:
    banner("PHASE 7 — Verification")

    remaining = [
        p for p in TEMP_DIR.rglob("*")
        if p.is_file() and p.suffix.lower() in PHOTO_EXTS
    ]
    in_review = [
        p for p in DUPES_DIR.rglob("*")
        if p.is_file() and p.suffix.lower() in PHOTO_EXTS
    ]

    print(f"\n  Extracted from zips           : {original}")
    print(f"  Moved to _Duplicates-Review   : {dupes}")
    print(f"  Moved to event folders        : {moved}")
    print(f"  Accounted for                 : {dupes + moved} / {original}")
    print(f"  Still in temp (expect 0)      : {len(remaining)}")
    print(f"  Files in review folder        : {len(in_review)}")

    if dupes + moved == original and not remaining:
        print("\n  ✓  All files accounted for.  Organisation complete!")
    else:
        gap = original - (dupes + moved)
        print(f"\n  ⚠  {gap} file(s) unaccounted for.")
        if remaining:
            print(f"     Check {TEMP_DIR}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("\nPhoto Organiser — Google Photos → Event Folders")
    print(f"  ZIP source  : {ZIP_DIR}")
    print(f"  Temp folder : {TEMP_DIR}")
    print(f"  Dupes       : {DUPES_DIR}")
    print(f"  Output      : {PHOTOS_DIR}")

    if not ZIP_DIR.exists():
        sys.exit(f"ERROR: ZIP source folder not found:\n  {ZIP_DIR}")
    if not PHOTOS_DIR.exists():
        sys.exit(f"ERROR: Photos destination folder not found:\n  {PHOTOS_DIR}")

    photos           = phase_extract()
    original_count   = len(photos)

    unique, dupes_count = phase_deduplicate(photos)

    records          = phase_read_metadata(unique)
    events           = phase_group_events(records)

    phase_show_and_confirm(events)   # ← script PAUSES here for your approval

    moved            = phase_move_photos(events)
    phase_verify(original_count, dupes_count, moved)


if __name__ == "__main__":
    main()
