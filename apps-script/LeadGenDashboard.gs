// ============================================================
// Private JSON bridge for the LeadGen Command Center site.
// The site keeps DASHBOARD_TOKEN server-side; browsers never receive it.
// ============================================================

function doPost(event) {
  try {
    const request = JSON.parse(event && event.postData && event.postData.contents || '{}');
    const expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_TOKEN');
    if (!expected || request.token !== expected) return lgJson_({ error: 'Unauthorized' });
    if (request.action === 'list') return lgJson_(lgDashboardData_(Math.min(200, Math.max(10, Number(request.limit) || 80)), Math.max(0, Number(request.offset) || 0)));
    if (request.action === 'lead') return lgJson_(lgDashboardLeadByRow_(Number(request.row)));
    if (request.action === 'update') return lgJson_(lgUpdateLead_(request));
    if (request.action === 'startPipeline') { startLinkedInBatchAll(); return lgJson_({ ok: true, pipeline: getLinkedInBatchAllStatus() }); }
    if (request.action === 'stopPipeline') { stopLinkedInBatchAll(); return lgJson_({ ok: true, pipeline: getLinkedInBatchAllStatus() }); }
    if (request.action === 'startSupabaseBackfill') { startSupabaseBackfill(); return lgJson_({ ok: true, sync: 'started' }); }
    return lgJson_({ error: 'Unknown action' });
  } catch (error) { return lgJson_({ error: String(error && error.message || error) }); }
}

function lgDashboardLeadByRow_(row) {
  const sheet = liGetSheet_();
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Invalid row');
  const map = liHeaderMap_(sheet);
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const read = candidates => {
    const column = liFindColumn_(map, candidates);
    return column ? String(values[column - 1] || '').trim() : '';
  };
  const linkedIn = read(['LinkedIn Account']);
  const email = read(['Primary Email', 'Email']);
  const score = Number(read(['LinkedIn Match Score'])) || 0;
  return {
    lead: {
      row: row,
      company: read(['Name', 'Company', 'Firm Name']), city: read(['City']), website: read(['Website']),
      person: read(['Decision Maker Name', 'Primary Contact Name']), title: read(['Decision Maker Title', 'Primary Contact Role']),
      linkedIn: linkedIn, email: email, youtube: read(['YT Channel', 'YouTube Channel', 'Youtube Channel']),
      signal: read(['Why Now', 'Signal', 'Status']) || read(['LinkedIn Match Status']) || 'Awaiting signal review',
      message: read(['Email 1 Body', 'Day 1 Email Body', 'First Day Email Body', 'Day 1 Message']),
      matchScore: score, matchStatus: read(['LinkedIn Match Status']) || (linkedIn ? 'Existing link' : 'Not enriched'),
      eligibility: read(['LinkedIn Eligibility']) || (linkedIn ? 'Review identity' : 'Find LinkedIn'),
      channel: read(['Recommended Channel']) || (email ? 'Email first' : 'Needs research'),
      connectionStatus: read(['LinkedIn Connection Status']) || 'Not sent',
      emailStatus: typeof emailReadOutreachStatus_ === 'function' ? emailReadOutreachStatus_(values, map) : read(['Email Outreach Status', 'Email Status', 'Email Sent']),
      enrichmentStatus: read(['LinkedIn Enrichment Status']) || 'queued'
    }
  };
}

function lgDashboardData_(limit, offset) {
  const sheet = liGetSheet_();
  const map = liHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  const rowCount = Math.max(0, lastRow - 1);
  const columns = {
    company: liFindColumn_(map, ['Name', 'Company', 'Firm Name']), city: liFindColumn_(map, ['City']), website: liFindColumn_(map, ['Website']),
    person: liFindColumn_(map, ['Decision Maker Name', 'Primary Contact Name']), title: liFindColumn_(map, ['Decision Maker Title', 'Primary Contact Role']),
    linkedIn: liFindColumn_(map, ['LinkedIn Account']), email: liFindColumn_(map, ['Primary Email', 'Email']), youtube: liFindColumn_(map, ['YT Channel', 'YouTube Channel', 'Youtube Channel']),
    signal: liFindColumn_(map, ['Why Now', 'Signal', 'Status']), message: liFindColumn_(map, ['Email 1 Body', 'Day 1 Email Body', 'First Day Email Body', 'Day 1 Message']),
    score: liFindColumn_(map, ['LinkedIn Match Score']), matchStatus: liFindColumn_(map, ['LinkedIn Match Status']), eligibility: liFindColumn_(map, ['LinkedIn Eligibility']),
    channel: liFindColumn_(map, ['Recommended Channel']), connectionStatus: liFindColumn_(map, ['LinkedIn Connection Status']), emailStatus: typeof emailFindOutreachStatusColumn_ === 'function' ? emailFindOutreachStatusColumn_(map) : liFindColumn_(map, ['Email Outreach Status', 'Email Status', 'Email Sent']), enrichmentStatus: liFindColumn_(map, ['LinkedIn Enrichment Status']),
    openProfile: liFindColumn_(map, ['LinkedIn Open Profile'])
  };
  const rows = rowCount ? sheet.getRange(2, 1, rowCount, sheet.getLastColumn()).getDisplayValues() : [];
  const data = {};
  Object.keys(columns).forEach(key => {
    const col = columns[key];
    data[key] = col ? rows.map(row => row[col - 1] || '') : new Array(rowCount).fill('');
  });
  const leads = [];
  let verified = 0, openProfile = 0, ready = 0;
  for (let index = 0; index < rowCount; index++) {
    const score = Number(data.score[index]) || 0;
    if (score >= 90) verified++;
    if (/^(yes|true|open)$/i.test(data.openProfile[index])) openProfile++;
    if (/ready|connect|email first/i.test(data.eligibility[index])) ready++;
    if (!data.company[index]) continue;
    const lead = { row: index + 2, company: data.company[index], city: data.city[index], website: data.website[index], person: data.person[index], title: data.title[index], linkedIn: data.linkedIn[index], email: data.email[index], youtube: data.youtube[index], signal: data.signal[index] || data.matchStatus[index] || 'Awaiting signal review', message: data.message[index], matchScore: score, matchStatus: data.matchStatus[index] || (data.linkedIn[index] ? 'Existing link' : 'Not enriched'), eligibility: data.eligibility[index] || (data.linkedIn[index] ? 'Review identity' : 'Find LinkedIn'), channel: data.channel[index] || (data.email[index] ? 'Email first' : 'Needs research'), connectionStatus: data.connectionStatus[index] || 'Not sent', emailStatus: data.emailStatus[index] || 'Not sent', enrichmentStatus: data.enrichmentStatus[index] || 'queued' };
    leads.push(lead);
  }
  leads.sort((a, b) => (b.matchScore - a.matchScore) || (a.row - b.row));
  const page = leads.slice(offset, offset + limit);
  return { leads: page, stats: { total: rowCount, verified: verified, openProfile: openProfile, ready: ready }, pipeline: getLinkedInBatchAllStatus(), pagination: { offset: offset, limit: limit, returned: page.length, totalCandidates: leads.length, hasMore: offset + page.length < leads.length } };
}

function lgUpdateLead_(request) {
  const sheet = liGetSheet_();
  const row = Number(request.row);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Invalid row');
  const allowed = ['Connection Request Sent', 'LinkedIn Connection Accepted', 'LinkedIn Connection Status', 'LinkedIn Eligibility', 'Recommended Channel', 'Email Outreach Status'];
  if (allowed.indexOf(request.field) === -1) throw new Error('Field is not editable from the dashboard');
  let map = liHeaderMap_(sheet);
  if (request.field === 'Email Outreach Status' && typeof emailEnsureOutreachColumns_ === 'function') map = emailEnsureOutreachColumns_(sheet, map);
  const column = request.field === 'Email Outreach Status' && typeof emailFindOutreachStatusColumn_ === 'function'
    ? emailFindOutreachStatusColumn_(map)
    : liFindColumn_(map, [request.field]);
  if (!column) throw new Error('Sheet column not found: ' + request.field);
  sheet.getRange(row, column).setValue(request.value);
  if (request.field === 'Connection Request Sent') {
    const timestampColumn = liFindColumn_(map, ['Connection Request Sent At']);
    const statusColumn = liFindColumn_(map, ['LinkedIn Connection Status']);
    if (timestampColumn) sheet.getRange(row, timestampColumn).setValue(request.value ? new Date() : '');
    if (statusColumn) sheet.getRange(row, statusColumn).setValue(request.value ? 'Sent' : 'Ready');
  }
  if (request.field === 'Email Outreach Status') {
    const timestampColumn = typeof emailFindSentAtColumn_ === 'function' ? emailFindSentAtColumn_(map) : liFindColumn_(map, ['Email Sent At']);
    if (timestampColumn) sheet.getRange(row, timestampColumn).setValue(/^(sent|email sent|day 1 sent|true|yes)$/i.test(String(request.value)) ? new Date() : '');
  }
  if (typeof sgSyncSheet3Row_ === 'function') sgSyncSheet3Row_(sheet, row, map);
  return { ok: true, row: row, field: request.field };
}

function lgJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }

// Paid Open Profile checks are opt-in and capped. They are intentionally not
// started by the 8,700-row free identity pipeline.
function getApifySafetyStatus() {
  const props = PropertiesService.getScriptProperties();
  const maxSpend = Number(props.getProperty('APIFY_MAX_SPEND_USD')) || 0;
  const spent = Number(props.getProperty('APIFY_ESTIMATED_SPEND_USD')) || 0;
  const status = { configured: Boolean(props.getProperty('APIFY_TOKEN')), maxSpendUsd: maxSpend, estimatedSpendUsd: spent, remainingGuardrailUsd: Math.max(0, maxSpend - spent), automaticPaidChecks: false };
  Logger.log(JSON.stringify(status));
  return status;
}
