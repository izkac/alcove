#!/usr/bin/env python3
"""Find threads where Alcove is a genuine answer. You do the posting, personally.

Prints new leads and appends them to leads.md. Nothing is posted anywhere.

Sources: Reddit post search, Reddit new-comment scan of target subs, Hacker News,
Super User, plus any Google Alerts RSS urls in listen.feeds.txt (one per line).

Reddit needs a free app: reddit.com/prefs/apps -> create app -> "script" ->
redirect http://localhost -> then set REDDIT_ID and REDDIT_SECRET. Without them
the other sources still run.
"""
import base64, gzip, html, json, os, re, sys, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

HERE  = Path(__file__).resolve().parent
SEEN  = HERE / "listen.seen.json"
OUT   = HERE / "leads.md"
FEEDS = HERE / "listen.feeds.txt"
UA    = "windows:alcove-listen:0.1 (by /u/CHANGE_ME)"

# what people type when they are shopping for what Alcove does
QUERIES = ['"fences alternative"', '"alternative to fences"', '"stardock fences"',
           '"organize desktop icons"', '"desktop icon groups"', '"desktop clutter"']
SUBS = ["windows", "Windows11", "Windows10", "windowsapps", "software",
        "softwarerecommendations", "Rainmeter", "customization"]
# comment scan: multi-word so it does not flood
PHRASES = ["fences", "desktop icon", "organize my desktop", "desktop clutter",
           "icon group", "desktop organizer", "clean up my desktop", "messy desktop"]


def get(url, headers=None, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    raw = urllib.request.urlopen(req, timeout=timeout).read()
    return gzip.decompress(raw) if raw[:2] == b"\x1f\x8b" else raw


def matches(text):
    t = text.lower()
    return [p for p in PHRASES if p in t]


def reddit_token():
    cid, sec = os.environ.get("REDDIT_ID"), os.environ.get("REDDIT_SECRET")
    if not (cid and sec):
        return None
    auth = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    req = urllib.request.Request(
        "https://www.reddit.com/api/v1/access_token",
        urllib.parse.urlencode({"grant_type": "client_credentials"}).encode(),
        {"Authorization": f"Basic {auth}", "User-Agent": UA})
    return json.load(urllib.request.urlopen(req, timeout=25))["access_token"]


def reddit(tok):
    hdr = {"Authorization": f"bearer {tok}"}
    for q in QUERIES:
        url = ("https://oauth.reddit.com/search?sort=new&limit=25&t=month&type=link&q="
               + urllib.parse.quote(q))
        for c in json.loads(get(url, hdr))["data"]["children"]:
            p = c["data"]
            yield {"id": p["name"], "src": f"r/{p['subreddit']}",
                   "why": q, "title": p["title"],
                   "url": "https://reddit.com" + p["permalink"]}
    for sub in SUBS:  # new comments, filtered locally - reddit search cannot do this
        url = f"https://oauth.reddit.com/r/{sub}/comments?limit=100"
        for c in json.loads(get(url, hdr))["data"]["children"]:
            p = c["data"]
            hit = matches(p.get("body", ""))
            if hit:
                yield {"id": p["name"], "src": f"r/{sub} comment", "why": ", ".join(hit),
                       "title": " ".join(p["body"].split())[:160],
                       "url": "https://reddit.com" + p["permalink"]}


def hackernews():
    for q in ('"desktop organizer"', '"stardock fences"', '"fences alternative"'):
        url = ("https://hn.algolia.com/api/v1/search_by_date?tags=(story,comment)"
               "&hitsPerPage=20&query=" + urllib.parse.quote(q))
        for h in json.loads(get(url))["hits"]:
            body = h.get("title") or h.get("comment_text") or ""
            yield {"id": "hn" + h["objectID"], "src": "HN", "why": q,
                   "title": html.unescape(" ".join(body.split()))[:160],
                   "url": f"https://news.ycombinator.com/item?id={h['objectID']}"}


def superuser():
    url = ("https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=creation"
           "&site=superuser&pagesize=25&q=" + urllib.parse.quote("organize desktop icons"))
    for i in json.loads(get(url)).get("items", []):
        yield {"id": "su%d" % i["question_id"], "src": "SuperUser", "why": "desktop icons",
               "title": html.unescape(i["title"]), "url": i["link"]}


def parse_atom(body):
    ns = "{http://www.w3.org/2005/Atom}"
    for e in ET.fromstring(body).iter(ns + "entry"):
        link = e.find(ns + "link").get("href")
        title = html.unescape("".join(e.find(ns + "title").itertext()))
        yield {"id": link, "src": "alert", "why": "google alert",
               "title": re.sub("<[^>]+>", "", title)[:160], "url": link}


def rss():
    if not FEEDS.exists():
        return
    for feed in FEEDS.read_text().split():
        yield from parse_atom(get(feed).decode("utf8", "replace"))


def run():
    sys.stdout.reconfigure(encoding="utf8", errors="replace")   # windows console is cp1252
    seen = set(json.loads(SEEN.read_text())) if SEEN.exists() else set()
    tok = reddit_token()
    if not tok:
        print("! REDDIT_ID / REDDIT_SECRET unset - skipping reddit\n", file=sys.stderr)
    sources = [("hn", hackernews), ("superuser", superuser), ("alerts", rss)]
    if tok:
        sources.insert(0, ("reddit", lambda: reddit(tok)))

    fresh = []
    for name, fn in sources:
        try:
            for item in fn():
                if item["id"] not in seen:
                    seen.add(item["id"])
                    fresh.append(item)
        except Exception as e:                  # one dead source must not kill the run
            print(f"! {name}: {e}", file=sys.stderr)

    if fresh:
        lines = [f"- **{i['src']}** ({i['why']}) [{i['title']}]({i['url']})" for i in fresh]
        OUT.write_text((OUT.read_text() if OUT.exists() else "# Leads\n\n")
                       + "\n".join(lines) + "\n")
        print("\n".join(lines))
    print(f"\n{len(fresh)} new -> {OUT}", file=sys.stderr)
    SEEN.write_text(json.dumps(sorted(seen)[-5000:]))


def selftest():
    assert matches("Any good FENCES alternative?") == ["fences"]
    assert matches("my desktop is a mess") == []
    assert "desktop icon" in matches("hide the desktop icons")
    atom = ('<feed xmlns="http://www.w3.org/2005/Atom"><entry>'
            '<title>&lt;b&gt;Alcove&lt;/b&gt; review</title>'
            '<link href="http://x/1"/></entry></feed>')
    [e] = list(parse_atom(atom))
    assert e["title"] == "Alcove review", e          # google wraps hits in <b>
    assert e["url"] == "http://x/1"
    print("selftest ok")


if __name__ == "__main__":
    selftest() if "--selftest" in sys.argv else run()
