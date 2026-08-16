// ============================================================
// LinkedIn identity finder for LeadGen V2 / Sheet3.
// Free stage: crawl company-owned pages in parallel and rank only links
// supported by those pages. Paid Apify checks are deliberately separate.
// ============================================================

const LINKEDIN_CONFIG = {
  SHEET_NAME: 'Sheet3',
  SPREADSHEET_ID: CONFIG.SPREADSHEET_ID,
  OPENROUTER_API_KEY: CONFIG.OPENROUTER_API_KEY,
  MODEL: CONFIG.DEEPSEEK_MODEL || 'deepseek/deepseek-v4-flash',
  WEBSITE_COLUMN: 3,
  PAGE_PATHS: ['', '/about', '/about-us', '/team', '/our-team', '/attorneys', '/lawyers', '/contact'],
  OUTPUT_HEADERS: [
    'LinkedIn Account',
    'Decision Maker Name',
    'Decision Maker Title',
    'LinkedIn Match Score',
    'LinkedIn Match Status',
    'LinkedIn Evidence',
    'LinkedIn Open Profile',
    'LinkedIn Last Activity',
    'LinkedIn Eligibility',
    'Recommended Channel',
    'LinkedIn Enrichment Status',
    'LinkedIn Enrichment Error',
    'LinkedIn Updated At'
  ]
};

function findLinkedInAccounts() {
  const sheet = liGetSheet_();
  liEnsureEnrichmentColumns_(sheet);
  const headers = liHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  let processed = 0;
  for (let row = 2; row <= lastRow && processed < 6; row++) {
    const status = liCell_(sheet, row, headers, ['LinkedIn Enrichment Status']);
    if (status) continue;
    liProcessOneRow_(sheet, row, headers);
    processed++;
  }
  Logger.log('Processed ' + processed + ' leads. Use startLinkedInBatchAll() for the full queue.');
}

function liProcessOneRow_(sheet, row, headerMap) {
  const company = liCell_(sheet, row, headerMap, ['Name', 'Company', 'Firm Name']);
  const city = liCell_(sheet, row, headerMap, ['City']);
  const existing = liCell_(sheet, row, headerMap, ['LinkedIn Account']);
  let website = liCell_(sheet, row, headerMap, ['Website']);
  const email = liCell_(sheet, row, headerMap, ['Primary Email', 'Email']);

  if (!company) {
    liWriteResult_(sheet, row, headerMap, { enrichmentStatus: 'skipped_missing_company', error: 'Company name is missing.' });
    return { status: 'skipped' };
  }

  if (existing) {
    liWriteResult_(sheet, row, headerMap, {
      url: existing,
      score: Number(liCell_(sheet, row, headerMap, ['LinkedIn Match Score'])) || 0,
      matchStatus: liCell_(sheet, row, headerMap, ['LinkedIn Match Status']) || 'Existing link — review not yet run',
      enrichmentStatus: 'existing',
      updatedAt: new Date()
    });
    return { status: 'existing', found: true };
  }

  if (!liIsWebsite_(website)) {
    website = liInferWebsiteFromEmail_(email);
    if (website) {
      const websiteColumn = liFindColumn_(headerMap, ['Website']);
      if (websiteColumn) sheet.getRange(row, websiteColumn).setValue(website);
    }
  }

  if (!liIsWebsite_(website)) {
    liWriteResult_(sheet, row, headerMap, {
      enrichmentStatus: 'missing_website',
      error: 'No company website or business email domain was available.',
      matchStatus: 'Missing website',
      eligibility: 'Email only',
      channel: email ? 'Email first' : 'Needs research',
      updatedAt: new Date()
    });
    return { status: 'missing_website' };
  }

  try {
    const result = liFindBestLinkedIn_(company, city, website);
    if (!result || !result.url) {
      liWriteResult_(sheet, row, headerMap, {
        enrichmentStatus: 'no_supported_candidate',
        matchStatus: 'No website-supported LinkedIn link',
        evidence: 'The company-owned pages did not expose a LinkedIn profile that could be verified.',
        eligibility: email ? 'Email first' : 'Needs research',
        channel: email ? 'Email first' : 'Needs research',
        updatedAt: new Date()
      });
      return { status: 'no_candidate' };
    }

    const isPerson = /linkedin\.com\/in\//i.test(result.url);
    const score = Math.max(0, Math.min(100, Number(result.score) || (isPerson ? 80 : 68)));
    const verified = score >= 90;
    const review = score < 80;
    liWriteResult_(sheet, row, headerMap, {
      url: result.url,
      person: result.person || '',
      title: result.title || '',
      score: score,
      matchStatus: verified ? 'Verified' : review ? 'Needs review' : 'Strong match',
      evidence: result.evidence || 'Linked from the company-owned website.',
      eligibility: isPerson ? (verified ? 'Ready to connect' : 'Review identity') : 'Find decision maker',
      channel: isPerson && score >= 80 ? 'LinkedIn' : (email ? 'Email first' : 'Needs research'),
      enrichmentStatus: isPerson ? (verified ? 'verified' : 'person_found') : 'company_only',
      error: '',
      updatedAt: new Date()
    });
    return { status: 'found', found: true, score: score };
  } catch (error) {
    liWriteResult_(sheet, row, headerMap, {
      enrichmentStatus: 'error',
      error: String(error && error.message || error).slice(0, 500),
      updatedAt: new Date()
    });
    throw error;
  }
}

function liFindBestLinkedIn_(name, city, website) {
  const pages = liCrawlWebsite_(website);
  const candidates = liExtractCandidates_(pages);
  if (!candidates.length) return null;
  const ranked = liRankByRules_(candidates);
  if (ranked.length === 1 && ranked[0].score >= 90) return ranked[0];
  return liAskDeepSeek_(name, city, website, pages, ranked) || ranked[0];
}

function liCrawlWebsite_(website) {
  const targets = liBuildTargetUrls_(website);
  const requests = targets.map(url => ({
    url: url,
    followRedirects: true,
    muteHttpExceptions: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadGenIdentityVerifier/2.0)' }
  }));
  let responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (error) {
    Logger.log('Parallel website fetch failed: ' + error.message);
    responses = [];
  }
  return responses.map((response, index) => {
    const code = response.getResponseCode();
    const html = code >= 200 && code < 400 ? response.getContentText() : '';
    return html ? { url: targets[index], html: html, text: liHtmlToText_(html).slice(0, 9000) } : null;
  }).filter(Boolean);
}

function liBuildTargetUrls_(website) {
  let normalized = String(website || '').trim();
  if (!/^https?:\/\//i.test(normalized)) normalized = 'https://' + normalized;
  const rootMatch = normalized.match(/^(https?:\/\/[^/?#]+)/i);
  const root = rootMatch ? rootMatch[1] : normalized;
  const targets = [normalized];
  LINKEDIN_CONFIG.PAGE_PATHS.forEach(path => {
    const candidate = root + path;
    if (targets.indexOf(candidate) === -1) targets.push(candidate);
  });
  return targets;
}

function liExtractCandidates_(pages) {
  const byUrl = {};
  const pattern = /(?:(?:https?:)?\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|company|school)\/[A-Za-z0-9%._-]+(?:[/?#][^"'<>\\s]*)?/gi;
  pages.forEach(page => {
    const matches = String(page.html || '').match(pattern) || [];
    matches.forEach(rawUrl => {
      const url = liNormalizeLinkedInUrl_(rawUrl);
      if (!url) return;
      if (!byUrl[url]) byUrl[url] = { url: url, type: /\/company\//i.test(url) ? 'company' : 'person', contexts: [] };
      const context = liGetLinkContext_(page.html, rawUrl);
      if (context && byUrl[url].contexts.indexOf(context) === -1) byUrl[url].contexts.push(context);
    });
  });
  return Object.keys(byUrl).map(url => ({
    url: url,
    type: byUrl[url].type,
    context: byUrl[url].contexts.join(' | ').slice(0, 1200)
  }));
}

function liRankByRules_(candidates) {
  const head = /\b(owner|founder|co-?founder|chief executive|ceo|president|managing partner|managing director|principal|executive director|head of)\b/i;
  const senior = /\b(partner|attorney|lawyer|director|manager|chief|vp|vice president)\b/i;
  return candidates.map(candidate => {
    const context = String(candidate.context || '');
    let score = candidate.type === 'company' ? 68 : 78;
    let rank = candidate.type === 'company' ? 'company page' : 'individual';
    if (candidate.type === 'person' && head.test(context)) { score = 95; rank = 'company head'; }
    else if (candidate.type === 'person' && senior.test(context)) { score = 86; rank = 'senior individual'; }
    return { url: candidate.url, type: candidate.type, context: context, score: score, rank: rank, evidence: context || 'Linked from company website.' };
  }).sort((a, b) => b.score - a.score);
}

function liAskDeepSeek_(name, city, website, pages, candidates) {
  const allowed = candidates.map(candidate => candidate.url);
  const prompt = [
    'Choose the best CURRENT LinkedIn identity for this lead using only the supplied company-website evidence.',
    'Priority: current owner/founder/managing partner/CEO, then another current senior person, then the company page.',
    'Reject a person if the context suggests a different employer, former role, or identity conflict.',
    'Return strict JSON: {"url":"allowed URL or empty","person":"name or empty","title":"current title or empty","score":0-100,"evidence":"short reason"}.',
    'A 90+ score requires explicit current-company plus leadership evidence. A company page should normally score 60-75.',
    '', 'Company: ' + name, 'City: ' + city, 'Website: ' + website, '',
    candidates.slice(0, 25).map(c => '- ' + c.url + ' | ' + c.type + ' | ' + (c.context || 'no nearby text')).join('\n'),
    '', 'Website text:', pages.map(page => page.text).join('\n').slice(0, 16000)
  ].join('\n');
  const response = UrlFetchApp.fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'Authorization': 'Bearer ' + LINKEDIN_CONFIG.OPENROUTER_API_KEY, 'HTTP-Referer': 'https://script.google.com', 'X-Title': 'LeadGen Identity Verifier' },
    payload: JSON.stringify({ model: LINKEDIN_CONFIG.MODEL, temperature: 0, messages: [{ role: 'system', content: 'Return only valid JSON. Never invent URLs or facts.' }, { role: 'user', content: prompt }] })
  });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error('OpenRouter HTTP ' + response.getResponseCode());
  const payload = JSON.parse(response.getContentText());
  const raw = payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
  const parsed = JSON.parse(String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  if (allowed.indexOf(parsed.url) === -1) return null;
  const selected = candidates.filter(candidate => candidate.url === parsed.url)[0];
  return { url: parsed.url, person: String(parsed.person || ''), title: String(parsed.title || ''), score: Number(parsed.score) || selected.score, evidence: String(parsed.evidence || selected.evidence || ''), type: selected.type };
}

function liEnsureEnrichmentColumns_(sheet) {
  let map = liHeaderMap_(sheet);
  LINKEDIN_CONFIG.OUTPUT_HEADERS.forEach(header => {
    if (liFindColumn_(map, [header])) return;
    const previous = sheet.getLastColumn();
    if (previous >= sheet.getMaxColumns()) sheet.insertColumnAfter(previous);
    const column = previous + 1;
    if (previous) sheet.getRange(1, previous).copyTo(sheet.getRange(1, column), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sheet.getRange(1, column).setValue(header);
    sheet.setColumnWidth(column, /Evidence|Error/.test(header) ? 260 : 145);
    map = liHeaderMap_(sheet);
  });
  return map;
}

function liWriteResult_(sheet, row, map, result) {
  const fields = {
    url: 'LinkedIn Account', person: 'Decision Maker Name', title: 'Decision Maker Title', score: 'LinkedIn Match Score',
    matchStatus: 'LinkedIn Match Status', evidence: 'LinkedIn Evidence', openProfile: 'LinkedIn Open Profile',
    activity: 'LinkedIn Last Activity', eligibility: 'LinkedIn Eligibility', channel: 'Recommended Channel',
    enrichmentStatus: 'LinkedIn Enrichment Status', error: 'LinkedIn Enrichment Error', updatedAt: 'LinkedIn Updated At'
  };
  Object.keys(fields).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(result, key)) return;
    const column = liFindColumn_(map, [fields[key]]);
    if (column) sheet.getRange(row, column).setValue(result[key]);
  });
  if (typeof sgSyncSheet3Row_ === 'function') sgSyncSheet3Row_(sheet, row, map);
}

function liInferWebsiteFromEmail_(email) {
  const match = String(email || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  if (!match) return '';
  const free = /^(gmail|yahoo|hotmail|outlook|aol|icloud|protonmail|live)\./i;
  return free.test(match[1]) ? '' : 'https://' + match[1] + '/';
}

function liNormalizeLinkedInUrl_(rawUrl) {
  let value = String(rawUrl || '').replace(/&amp;/gi, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/');
  try { value = decodeURIComponent(value); } catch (error) {}
  const match = value.match(/linkedin\.com\/(in|company|school)\/([A-Za-z0-9._-]+)/i);
  return match ? 'https://www.linkedin.com/' + match[1].toLowerCase() + '/' + match[2] : null;
}

function liGetLinkContext_(html, rawUrl) {
  const source = String(html || '');
  const position = source.toLowerCase().indexOf(String(rawUrl).toLowerCase());
  if (position < 0) return '';
  return liHtmlToText_(source.slice(Math.max(0, position - 500), position + String(rawUrl).length + 500)).replace(/\s+/g, ' ').trim().slice(0, 650);
}

function liHtmlToText_(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function liIsWebsite_(value) { return /^(https?:\/\/)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#].*)?$/i.test(String(value || '').trim()); }
function liGetSheet_() { const sheet = SpreadsheetApp.openById(LINKEDIN_CONFIG.SPREADSHEET_ID).getSheetByName(LINKEDIN_CONFIG.SHEET_NAME); if (!sheet) throw new Error('Sheet not found: ' + LINKEDIN_CONFIG.SHEET_NAME); return sheet; }
function liHeaderMap_(sheet) { return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0].reduce((map, header, index) => { const key = String(header || '').trim().toLowerCase(); if (key) map[key] = index + 1; return map; }, {}); }
function liFindColumn_(map, candidates) { for (const candidate of candidates) { const column = map[String(candidate).trim().toLowerCase()]; if (column) return column; } return 0; }
function liCell_(sheet, row, map, candidates) { const column = liFindColumn_(map, candidates); return column ? String(sheet.getRange(row, column).getDisplayValue() || '').trim() : ''; }
