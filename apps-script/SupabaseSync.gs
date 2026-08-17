// ============================================================
// Sheet3 -> Supabase mirror for the LeadGen Command Center.
// Sheet3 is the source of truth. The Supabase publishable key and private
// sync token are stored only in Apps Script properties, never in cells or
// browser-delivered code.
// ============================================================

const SUPABASE_SYNC_CONFIG = {
  SHEET_NAME: 'Sheet3',
  TABLE: 'leadgen_leads',
  META_TABLE: 'leadgen_meta',
  BATCH_SIZE: 500,
  PREFIX: 'supabaseSync.'
};

function installSheet3SupabaseSync() {
  const spreadsheet = SpreadsheetApp.openById(LINKEDIN_CONFIG.SPREADSHEET_ID);
  ScriptApp.getProjectTriggers()
    .filter(trigger => ['onSheet3EditToSupabase_', 'runSupabaseMetaRefresh_'].indexOf(trigger.getHandlerFunction()) !== -1)
    .forEach(trigger => ScriptApp.deleteTrigger(trigger));
  ScriptApp.newTrigger('onSheet3EditToSupabase_').forSpreadsheet(spreadsheet).onEdit().create();
  ScriptApp.newTrigger('runSupabaseMetaRefresh_').timeBased().everyMinutes(15).create();
  Logger.log('Installed the Sheet3 -> Supabase edit sync.');
}

function onSheet3EditToSupabase_(event) {
  if (!event || !event.range || event.range.getSheet().getName() !== SUPABASE_SYNC_CONFIG.SHEET_NAME) return;
  const sheet = event.range.getSheet();
  const map = liHeaderMap_(sheet);
  const first = Math.max(2, event.range.getRow());
  const last = Math.min(sheet.getLastRow(), event.range.getLastRow());
  const rows = [];
  for (let row = first; row <= last && rows.length < 100; row++) {
    if (typeof smEnsureSpaceMailLinkForRow_ === 'function') smEnsureSpaceMailLinkForRow_(sheet, row, map);
    const lead = sgLeadFromRow_(sheet, row, map);
    if (lead) rows.push(lead);
  }
  if (rows.length) sgUpsertLeads_(rows);
}

function runSupabaseMetaRefresh_() {
  if (!sgIsConfigured_()) return;
  const sheet = liGetSheet_();
  sgSyncMeta_(sheet, liHeaderMap_(sheet));
}

function startSupabaseBackfill() {
  const sheet = liGetSheet_();
  sgRequireConfiguration_();
  const props = PropertiesService.getScriptProperties();
  sgDeleteTriggers_(['runSupabaseBackfill']);
  props.setProperties({
    [SUPABASE_SYNC_CONFIG.PREFIX + 'status']: 'running',
    [SUPABASE_SYNC_CONFIG.PREFIX + 'nextRow']: '2',
    [SUPABASE_SYNC_CONFIG.PREFIX + 'endRow']: String(sheet.getLastRow()),
    [SUPABASE_SYNC_CONFIG.PREFIX + 'synced']: '0',
    [SUPABASE_SYNC_CONFIG.PREFIX + 'startedAt']: new Date().toISOString()
  });
  ScriptApp.newTrigger('runSupabaseBackfill').timeBased().everyMinutes(1).create();
  runSupabaseBackfill();
}

function runSupabaseBackfill() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const prefix = SUPABASE_SYNC_CONFIG.PREFIX;
    if (props.getProperty(prefix + 'status') !== 'running') return;
    const sheet = liGetSheet_();
    const map = liHeaderMap_(sheet);
    const endRow = Math.max(Number(props.getProperty(prefix + 'endRow')) || 0, sheet.getLastRow());
    const startRow = Math.max(2, Number(props.getProperty(prefix + 'nextRow')) || 2);
    if (startRow > endRow) {
      sgSyncMeta_(sheet, map);
      props.setProperty(prefix + 'status', 'complete');
      props.setProperty(prefix + 'completedAt', new Date().toISOString());
      sgDeleteTriggers_(['runSupabaseBackfill']);
      return;
    }

    const lastRow = Math.min(endRow, startRow + SUPABASE_SYNC_CONFIG.BATCH_SIZE - 1);
    const displayRows = sheet.getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn()).getDisplayValues();
    const leads = displayRows.map((values, index) => sgLeadFromValues_(values, startRow + index, map)).filter(Boolean);
    if (leads.length) sgUpsertLeads_(leads);
    props.setProperty(prefix + 'nextRow', String(lastRow + 1));
    props.setProperty(prefix + 'synced', String((Number(props.getProperty(prefix + 'synced')) || 0) + leads.length));
    if (lastRow >= endRow) {
      sgSyncMeta_(sheet, map);
      props.setProperty(prefix + 'status', 'complete');
      props.setProperty(prefix + 'completedAt', new Date().toISOString());
      sgDeleteTriggers_(['runSupabaseBackfill']);
    }
  } finally { lock.releaseLock(); }
}

function sgSyncSheet3Row_(sheet, row, map) {
  try {
    if (!sgIsConfigured_()) return;
    const lead = sgLeadFromRow_(sheet, row, map || liHeaderMap_(sheet));
    if (lead) sgUpsertLeads_([lead]);
  } catch (error) {
    Logger.log('Supabase mirror skipped for row ' + row + ': ' + error.message);
  }
}

function sgLeadFromRow_(sheet, row, map) {
  return sgLeadFromValues_(sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0], row, map);
}

function sgLeadFromValues_(values, row, map) {
  const read = candidates => {
    const column = liFindColumn_(map, candidates);
    return column ? String(values[column - 1] || '').trim() : '';
  };
  const company = read(['Name', 'Company', 'Firm Name']);
  if (!company) return null;
  const linkedIn = read(['LinkedIn Account']);
  const email = read(['Primary Email', 'Email']);
  const score = Number(read(['LinkedIn Match Score'])) || 0;
  return {
    row_number: row,
    company: company,
    city: read(['City']),
    website: read(['Website']),
    person: read(['Decision Maker Name', 'Primary Contact Name']),
    title: read(['Decision Maker Title', 'Primary Contact Role']),
    linkedin: linkedIn,
    email: email,
    youtube: read(['YT Channel', 'YouTube Channel', 'Youtube Channel']),
    signal: read(['Why Now', 'Signal', 'Status']) || read(['LinkedIn Match Status']) || 'Awaiting signal review',
    message: read(['Email 1 Body', 'Day 1 Email Body', 'First Day Email Body', 'Day 1 Message']),
    match_score: score,
    match_status: read(['LinkedIn Match Status']) || (linkedIn ? 'Existing link' : 'Not enriched'),
    eligibility: read(['LinkedIn Eligibility']) || (linkedIn ? 'Review identity' : 'Find LinkedIn'),
    channel: read(['Recommended Channel']) || (email ? 'Email first' : 'Needs research'),
    connection_status: read(['LinkedIn Connection Status']) || 'Not sent',
    enrichment_status: read(['LinkedIn Enrichment Status']) || 'queued',
    sheet_updated_at: new Date().toISOString(),
    synced_at: new Date().toISOString()
  };
}

function sgSyncMeta_(sheet, map) {
  if (!sgIsConfigured_()) return;
  const stats = sgDashboardStats_(sheet, map || liHeaderMap_(sheet));
  const status = typeof getLinkedInBatchAllStatus === 'function' ? getLinkedInBatchAllStatus() : { status: 'not_started', nextRow: 2, endRow: sheet.getLastRow(), processed: 0, found: 0, errors: 0 };
  sgUpsertMeta_({
    stats: stats,
    pipeline: status,
    refreshedAt: new Date().toISOString()
  });
}

function sgDashboardStats_(sheet, map) {
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) return { total: 0, verified: 0, openProfile: 0, ready: 0 };
  const values = sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getDisplayValues();
  const column = candidates => liFindColumn_(map, candidates);
  const scoreColumn = column(['LinkedIn Match Score']);
  const openColumn = column(['LinkedIn Open Profile']);
  const eligibilityColumn = column(['LinkedIn Eligibility']);
  let verified = 0, openProfile = 0, ready = 0;
  values.forEach(row => {
    if (Number(scoreColumn ? row[scoreColumn - 1] : 0) >= 90) verified++;
    if (/^(yes|true|open)$/i.test(String(openColumn ? row[openColumn - 1] : ''))) openProfile++;
    if (/ready|connect|email first/i.test(String(eligibilityColumn ? row[eligibilityColumn - 1] : ''))) ready++;
  });
  return { total: rowCount, verified: verified, openProfile: openProfile, ready: ready };
}

function sgUpsertLeads_(leads) { sgRestUpsert_(SUPABASE_SYNC_CONFIG.TABLE, leads, 'row_number'); }
function sgUpsertMeta_(value) { sgRestUpsert_(SUPABASE_SYNC_CONFIG.META_TABLE, value, 'dashboard'); }

function sgRestUpsert_(table, value) {
  const config = sgRequireConfiguration_();
  const rpc = table === SUPABASE_SYNC_CONFIG.TABLE ? 'leadgen_upsert' : 'leadgen_set_meta';
  const payload = table === SUPABASE_SYNC_CONFIG.TABLE
    ? { p_token: config.token, p_leads: value }
    : { p_token: config.token, p_value: value };
  if (table === SUPABASE_SYNC_CONFIG.TABLE && !value.length) return;
  const response = UrlFetchApp.fetch(config.url + '/rest/v1/rpc/' + rpc, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { apikey: config.key },
    payload: JSON.stringify(payload)
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('Supabase HTTP ' + status + ': ' + response.getContentText().slice(0, 500));
}

function sgIsConfigured_() {
  const props = PropertiesService.getScriptProperties();
  return Boolean(props.getProperty('SUPABASE_URL') && props.getProperty('SUPABASE_PUBLISHABLE_KEY') && props.getProperty('LEADGEN_SYNC_TOKEN'));
}

function sgRequireConfiguration_() {
  const props = PropertiesService.getScriptProperties();
  const url = String(props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = String(props.getProperty('SUPABASE_PUBLISHABLE_KEY') || '');
  const token = String(props.getProperty('LEADGEN_SYNC_TOKEN') || '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !key || !token) throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and LEADGEN_SYNC_TOKEN in Script Properties first.');
  return { url: url, key: key, token: token };
}

function sgDeleteTriggers_(names) {
  ScriptApp.getProjectTriggers().filter(trigger => names.indexOf(trigger.getHandlerFunction()) !== -1).forEach(trigger => ScriptApp.deleteTrigger(trigger));
}
