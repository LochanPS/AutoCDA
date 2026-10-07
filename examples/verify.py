#!/usr/bin/env python3
"""AutoCDA Verification API — Python example.

    python examples/verify.py "low pass filter at 2 kHz within 2%"

Env: AUTOCDA_API (default http://localhost:3002), AUTOCDA_KEY (optional).
Uses only the stdlib (urllib), so there is nothing to install.
"""
import json
import os
import sys
import urllib.request

# Component values carry unit symbols (Ω, µ). Force UTF-8 so Windows' default
# cp1252 console doesn't crash on them.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

API = os.environ.get("AUTOCDA_API", "http://localhost:3002")
KEY = os.environ.get("AUTOCDA_KEY", "")
prompt = " ".join(sys.argv[1:]) or "low pass filter at 2 kHz within 2%"

req = urllib.request.Request(
    f"{API}/api/verify",
    data=json.dumps({"prompt": prompt}).encode(),
    headers={"content-type": "application/json", **({"x-api-key": KEY} if KEY else {})},
    method="POST",
)
with urllib.request.urlopen(req) as r:
    d = json.load(r)

if not d.get("ok"):
    print("verify failed:", d.get("error", d), file=sys.stderr)
    sys.exit(1)

print(f'\n{d["name"]}  ({d["type"]})')
print(f'  {d["targetName"]} target {d["target"]} -> measured {d["measured"]}')
print(f'  error {d["errorPct"]*100:.2f}%  {"converged" if d["converged"] else "best-effort"}')
print("  parts:", ", ".join(f'{c["ref"]}={c["value"]}' for c in d["components"]))
landed = (d.get("sourcing") or {}).get("indiaLandedINR") or {}
print(f'  BOM: ${d["bom"]["total"]:.3f}  |  India landed: Rs {landed.get("total", "-")}')
for m in (d.get("metrics") or {}).values():
    print(f'  {m["label"]}: {m["value"]:.4g} {m["unit"]}')
if d.get("repro"):
    print(f'  repro: {d["repro"]["engine"]} {d["repro"]["engineVersion"]} netlist {d["repro"]["netlistHash"]}')
