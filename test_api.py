#!/usr/bin/env python3
"""Comprehensive API test."""
import httpx, json, sys

BASE = "http://localhost:8080"
out = []

try:
    r = httpx.post(f"{BASE}/api/auth/login", json={"username":"admin","password":"admin123"}, timeout=10)
    token = r.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}
    out.append(f"✅ Login OK")

    r = httpx.get(f"{BASE}/api/categories/tree", headers=h, timeout=10)
    out.append(f"✅ Categories: {r.status_code} — {len(r.json())} top-level")

    r = httpx.get(f"{BASE}/api/styles/", headers=h, timeout=10)
    out.append(f"✅ Styles: {r.status_code} — {len(r.json())} styles")

    r = httpx.get(f"{BASE}/api/scenes/tree", headers=h, timeout=10)
    out.append(f"✅ Scenes: {r.status_code} — {len(r.json())} top-level")

    r = httpx.get(f"{BASE}/api/effects/tree", headers=h, timeout=10)
    out.append(f"✅ Effects: {r.status_code} — {len(r.json())} categories")

    r = httpx.get(f"{BASE}/api/numbering/rules", headers=h, timeout=10)
    out.append(f"✅ Numbering: {r.status_code} — {len(r.json())} rules")

    r = httpx.post(f"{BASE}/api/numbering/generate/QZ", headers=h, timeout=10)
    out.append(f"✅ Number Gen: {r.status_code} — {r.json()}")

    r = httpx.get(f"{BASE}/api/ai/providers", headers=h, timeout=10)
    out.append(f"✅ AI Providers: {r.json()}")

    r = httpx.get(f"{BASE}/api/platform-suite/platforms", headers=h, timeout=10)
    out.append(f"✅ Platforms: {list(r.json().keys())}")

    r = httpx.get(f"{BASE}/api/ad-material/channels", headers=h, timeout=10)
    out.append(f"✅ Ad Channels: {list(r.json().keys())}")

    r = httpx.get(f"{BASE}/api/i18n/languages", timeout=10)
    out.append(f"✅ i18n: {r.json()}")

    r = httpx.get(f"{BASE}/api/auth/users", headers=h, timeout=10)
    out.append(f"✅ Users: {len(r.json())} users")

except Exception as e:
    out.append(f"❌ ERROR: {e}")

with open("test_results.txt", "w") as f:
    f.write("\n".join(out) + "\n")
print("\n".join(out))

