"""Uploads the paid-plan parts of the company analysis to the private database (table pro_data).
Usage: python3 engine/upload_pro.py <folder of SYM.json files>
Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Exits 1 if nothing could be uploaded, so the caller can say so loudly."""
import json, os, sys, time, urllib.request, urllib.error

BATCH = 150


def post(url, key, rows):
    req = urllib.request.Request(url + "/rest/v1/pro_data?on_conflict=sym", data=json.dumps(rows).encode(), method="POST",
                                 headers={"apikey": key, "Authorization": "Bearer " + key, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    for attempt in range(3):
        try:
            urllib.request.urlopen(req, timeout=60).read()
            return True
        except urllib.error.HTTPError as e:
            print("  upload failed:", e.code, e.read()[:200].decode("utf-8", "replace"))
            if e.code < 500:
                return False
        except Exception as e:
            print("  upload error:", e)
        time.sleep(2 * (attempt + 1))
    return False


def main(folder):
    url, key = os.environ.get("SUPABASE_URL", "").rstrip("/"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        print("pro upload skipped: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set")
        return 1
    files = sorted(f for f in os.listdir(folder) if f.endswith(".json"))
    ok = 0
    for i in range(0, len(files), BATCH):
        rows = [{"sym": f[:-5], "doc": json.load(open(os.path.join(folder, f)))} for f in files[i:i + BATCH]]
        if post(url, key, rows):
            ok += len(rows)
    print("pro upload: %d of %d companies" % (ok, len(files)))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
