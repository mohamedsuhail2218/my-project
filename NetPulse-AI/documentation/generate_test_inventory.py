"""Generate the automated test inventory used by the project documentation."""
from __future__ import annotations

from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / "reports" / "test-runs"
OUTPUT = Path(__file__).resolve().parent / "test-inventory.generated.md"


def result_of(case: ET.Element) -> str:
    if case.find("failure") is not None or case.find("error") is not None:
        return "FAIL"
    if case.find("skipped") is not None:
        return "SKIP"
    return "PASS"


def table(cases: list[ET.Element]) -> list[str]:
    lines = ["| # | Test | Result | Time (s) |", "|---|---|---|---:|"]
    for index, case in enumerate(cases, start=1):
        name = (case.get("name") or "").replace("\ufffd", " - ").replace("|", "\\|").strip()
        lines.append(f"| {index} | {name} | {result_of(case)} | {case.get('time', '')} |")
    return lines


def main() -> None:
    backend_root = ET.parse(REPORTS / "backend-junit.xml").getroot()
    backend_cases = list(backend_root.iter("testcase"))
    frontend_root = ET.parse(REPORTS / "frontend-junit.xml").getroot()
    frontend_cases = list(frontend_root.iter("testcase"))

    lines = [
        "# Automated Test Inventory",
        "",
        "Generated from the final JUnit XML files in `reports/test-runs/`.",
        "",
        f"## Backend Pytest inventory ({len(backend_cases)} tests)",
        "",
    ]
    groups: dict[str, list[ET.Element]] = {}
    for case in backend_cases:
        groups.setdefault(case.get("classname") or "unknown", []).append(case)
    for group_name in sorted(groups):
        suite = group_name.removeprefix("tests.")
        lines.append(f"### `{suite}` — {len(groups[group_name])} tests")
        lines.append("")
        lines.extend(table(groups[group_name]))
        lines.append("")

    lines.extend([f"## Frontend Playwright inventory ({len(frontend_cases)} tests)", ""])
    fgroups: dict[str, list[ET.Element]] = {}
    for case in frontend_cases:
        fgroups.setdefault(case.get("classname") or "unknown", []).append(case)
    for group_name in sorted(fgroups):
        lines.append(f"### `{group_name}` — {len(fgroups[group_name])} tests")
        lines.append("")
        lines.extend(table(fgroups[group_name]))
        lines.append("")

    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT} with {len(backend_cases)} backend and {len(frontend_cases)} frontend tests")


if __name__ == "__main__":
    main()
