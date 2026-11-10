"""Regenerate patterns.js from PROSITE's prosite.dat.

Usage:
    python3 build.py                        # download the latest prosite.dat and prosite.aux first
    python3 build.py FILE.dat FILE.aux      # use local copies instead

prosite.dat holds the motifs; prosite.aux holds statistics against UniProtKB/Swiss-Prot
(it has no records for motifs flagged /SKIP-FLAG=TRUE, so those get no statistics).
"""
import json
import re
import subprocess
import sys

BASE_URL = "https://ftp.expasy.org/databases/prosite/"


def parse_records(lines):
    """Yield one dict per PATTERN entry (MATRIX/profile entries are skipped)."""
    record = None
    for line in lines:
        code, text = line[:2], line[5:].strip()
        if code == "ID":
            is_pattern = text.rstrip(".").endswith("PATTERN")
            record = {"name": text.split(";")[0], "de": [], "pa": []} if is_pattern else None
        elif record is None:
            continue
        elif code == "AC":
            record["id"] = text.rstrip(";")
        elif code == "DE":
            record["de"].append(text)
        elif code == "PA":
            record["pa"].append(text)
        elif code == "DO":
            record["doc"] = text.rstrip(";")
        elif code == "//":
            yield record
            record = None


def parse_aux(lines):
    """Return {accession: stats dict or None} for the entries in prosite.aux."""
    aux = {}
    current = None
    for line in lines:
        code, text = line[:2], line[5:].strip()
        if code == "AC":
            current = aux.setdefault(text.rstrip(";"), [])
        elif current is not None and code == "NR":
            current.append(text)
        elif code == "//":
            current = None
    result = {}
    for accession, nr_lines in aux.items():
        nr = " ".join(nr_lines)
        # "/TOTAL=1845(456)": 1845 hits in 456 different proteins. We report proteins.
        def proteins(key):
            m = re.search(rf"/{key}=\d+\((\d+)\)", nr)
            return int(m.group(1)) if m else None
        false_neg = re.search(r"/FALSE_NEG=(\d+)", nr)
        result[accession] = None if proteins("TOTAL") is None else {
            "total": proteins("TOTAL"),
            "positive": proteins("POSITIVE"),
            "unknown": proteins("UNKNOWN"),
            "falsePositive": proteins("FALSE_POS"),
            "falseNegative": int(false_neg.group(1)) if false_neg else None,
        }
    return result


def to_entry(record, aux):
    return {
        "id": record["id"],
        "name": record["name"],
        "description": " ".join(record["de"]).rstrip("."),
        "pattern": "".join(record["pa"]),  # long patterns span several PA lines
        "doc": record.get("doc", ""),
        "stats": aux.get(record["id"]),
    }


def main():
    downloaded = len(sys.argv) == 1
    if downloaded:
        dat_path, aux_path = "prosite.dat", "prosite.aux"
        for path in (dat_path, aux_path):
            subprocess.run(["wget", "-O", path, BASE_URL + path], check=True)
    elif len(sys.argv) == 3:
        dat_path, aux_path = sys.argv[1], sys.argv[2]
    else:
        sys.exit(__doc__)

    with open(dat_path) as infile:
        lines = infile.read().splitlines()
    with open(aux_path) as infile:
        aux = parse_aux(infile.read().splitlines())
    release = next((re.search(r"Release (.+?)\.?$", l).group(1) for l in lines if "Release" in l), "unknown")
    entries = [to_entry(r, aux) for r in parse_records(lines)]

    with open("patterns.js", "w") as outfile:
        outfile.write(f"const prositeRelease = {json.dumps(release)};\n")
        outfile.write("const prositePatterns = [\n")
        for entry in entries:
            outfile.write(f"    {json.dumps(entry)},\n")
        outfile.write("];\n")

    if downloaded:
        subprocess.run(["rm", dat_path, aux_path], check=True)
    print(f"Wrote {len(entries)} patterns from PROSITE release {release}")


if __name__ == "__main__":
    main()
