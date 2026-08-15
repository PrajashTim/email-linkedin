import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the LeadGen dashboard and secured server proxy", async () => {
  const [page, dashboard, apiRoute, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/leadgen-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/leadgen/route.ts", import.meta.url), "utf8"),
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
  assert.match(apiRoute, /process\.env\.SHEET_API_URL/);
  assert.match(apiRoute, /process\.env\.SHEET_API_TOKEN/);
  assert.doesNotMatch(apiRoute, /sk-or-v1-|APIFY_TOKEN\s*=/);
  assert.match(packageJson, /"build": "next build"/);
});
