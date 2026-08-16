import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the LeadGen dashboard and secured server proxy", async () => {
  const [page, dashboard, apiRoute, youtubeRoute, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/leadgen-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/leadgen/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/youtube/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /LeadGen Command Center/);
  assert.match(page, /<LeadGenDashboard \/>/);
  assert.match(dashboard, /Sync sheet/);
  assert.match(dashboard, /Mark request sent/);
  assert.match(dashboard, /changeView\("linkedin"\)/);
  assert.match(dashboard, /changeView\("email"\)/);
  assert.match(dashboard, /changeView\("results"\)/);
  assert.match(dashboard, /Enrichment results/);
  assert.match(dashboard, /Recent YouTube videos/);
  assert.match(dashboard, /youtube-nocookie\.com\/embed/);
  assert.match(dashboard, /Load 200 more/);
  assert.match(dashboard, /Row \{lead\.row\}/);
  assert.match(dashboard, /loaded of \$\{totalCandidates\.toLocaleString\(\)\}/);
  assert.match(dashboard, /offset: data\.leads\.length/);
  assert.match(apiRoute, /process\.env\.SHEET_API_URL/);
  assert.match(apiRoute, /process\.env\.SHEET_API_TOKEN/);
  assert.doesNotMatch(apiRoute, /sk-or-v1-|APIFY_TOKEN\s*=/);
  assert.match(youtubeRoute, /feeds\/videos\.xml/);
  assert.match(youtubeRoute, /YOUTUBE_HOSTS/);
  assert.doesNotMatch(youtubeRoute, /YOUTUBE_API_KEY|AIza/);
  assert.match(packageJson, /"build": "next build"/);
});
