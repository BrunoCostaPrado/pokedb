#!/usr/bin/env python3
"""Download card images from Limitless TCG for a given set.

Usage: python scripts/download-images.py <SET_CODE> [count=400]
Example: python scripts/download-images.py SSP 200

Downloads to data-sample/<SET_CODE>/.
"""
import os
import sys
import urllib.request
from html.parser import HTMLParser

SET_CODE = sys.argv[1] if len(sys.argv) > 1 else "SSP"
COUNT = int(sys.argv[2]) if len(sys.argv) > 2 else 400
OUT = os.path.join("data-sample", SET_CODE)
os.makedirs(OUT, exist_ok=True)


class CardHoverParser(HTMLParser):
    """Extract data-hover image URLs from Limitless TCG card table rows."""

    def __init__(self):
        super().__init__()
        self._in_tr = False
        self._attrs: dict = {}

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "tr" and d.get("data-hover"):
            self._in_tr = True
            self._attrs = d

    def handle_endtag(self, tag):
        self._in_tr = False

    @property
    def image_url(self):
        return self._attrs.get("data-hover")


url = f"https://limitlesstcg.com/cards/en/{SET_CODE}?display=list"
print(f"Fetching {url} …")
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
resp = urllib.request.urlopen(req)
html = resp.read().decode("utf-8", errors="replace")

parser = CardHoverParser()
image_urls = []
for match in __import__("re").finditer(r'<tr[^>]*data-hover="([^"]*)"[^>]*>', html):
    image_urls.append(match.group(1))
    if len(image_urls) >= COUNT:
        break

print(f"Found {len(image_urls)} image URLs")

downloaded = 0
for i, url in enumerate(image_urls[:COUNT]):
    ext = url.rsplit(".", 1)[-1] if "." in url else "jpg"
    path = os.path.join(OUT, f"{i+1:03d}.{ext}")
    if os.path.exists(path):
        continue
    try:
        urllib.request.urlretrieve(url, path)
        downloaded += 1
        if downloaded % 50 == 0:
            print(f"  {downloaded}/{len(image_urls)}")
    except Exception as e:
        print(f"  FAIL [{i+1}]: {e}")

print(f"Done. {downloaded} new files in {OUT}/")
