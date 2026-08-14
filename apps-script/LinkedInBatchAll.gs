// ============================================================
// Checkpointed full-list queue. Each trigger owns a small batch, records an
// in-flight marker before network work, and never loops indefinitely.
// ============================================================

const LINKEDIN_BATCH_ALL_CONFIG = {
  FIRST_DATA_ROW: 2,
  LEADS_PER_RUN: 6,
  ROWS_SCANNED_PER_RUN: 120,
  MAX_RUN_MILLISECONDS: 235000,
  TRIGGER_MINUTES: 1,
  PREFIX: 'linkedinPipeline.'
};

function startLinkedInBatchAll() {
  const sheet = liGetSheet_();
  liEnsureEnrichmentColumns_(sheet);
  const props = PropertiesService.getScriptProperties();
  liAllDeleteTriggers_(['runLinkedInBatchAll', 'startLinkedInBatchAll', 'runLinkedInBatch2000']);
  props.setProperties({
    'linkedinBatch2000.status': 'superseded',
    'linkedinBatchAll.status': 'superseded_by_checkpointed_pipeline',
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'status']: 'running',
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'nextRow']: String(LINKEDIN_BATCH_ALL_CONFIG.FIRST_DATA_ROW),
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'endRow']: String(sheet.getLastRow()),
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'processed']: '0',
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'found']: '0',
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'errors']: '0',
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'startedAt']: new Date().toISOString(),
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'inflightStart']: '',
    [LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'inflightEnd']: ''
  });
  ScriptApp.newTrigger('runLinkedInBatchAll').timeBased().everyMinutes(LINKEDIN_BATCH_ALL_CONFIG.TRIGGER_MINUTES).create();
  Logger.log('Checkpointed LinkedIn pipeline started for rows 2-' + sheet.getLastRow() + '.');
}

function runLinkedInBatchAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1500)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const prefix = LINKEDIN_BATCH_ALL_CONFIG.PREFIX;
    if (props.getProperty(prefix + 'status') !== 'running') return;
    const sheet = liGetSheet_();
    const map = liEnsureEnrichmentColumns_(sheet);
    const endRow = Math.max(Number(props.getProperty(prefix + 'endRow')) || 0, sheet.getLastRow());
    props.setProperty(prefix + 'endRow', String(endRow));

    const staleStart = Number(props.getProperty(prefix + 'inflightStart')) || 0;
    const staleEnd = Number(props.getProperty(prefix + 'inflightEnd')) || 0;
    if (staleStart && staleEnd) {
      for (let stalledRow = staleStart; stalledRow <= staleEnd; stalledRow++) {
        const currentStatus = liCell_(sheet, stalledRow, map, ['LinkedIn Enrichment Status']);
        if (!currentStatus) liWriteResult_(sheet, stalledRow, map, { enrichmentStatus: 'stalled_retry_available', error: 'A prior cloud execution ended before this row completed.', updatedAt: new Date() });
      }
      props.setProperty(prefix + 'nextRow', String(staleEnd + 1));
      props.setProperty(prefix + 'inflightStart', '');
      props.setProperty(prefix + 'inflightEnd', '');
    }

    let row = Math.max(LINKEDIN_BATCH_ALL_CONFIG.FIRST_DATA_ROW, Number(props.getProperty(prefix + 'nextRow')) || LINKEDIN_BATCH_ALL_CONFIG.FIRST_DATA_ROW);
    if (row > endRow) { liAllComplete_(props); return; }
    const selectedRows = [];
    let scanned = 0;
    while (row <= endRow && selectedRows.length < LINKEDIN_BATCH_ALL_CONFIG.LEADS_PER_RUN && scanned < LINKEDIN_BATCH_ALL_CONFIG.ROWS_SCANNED_PER_RUN) {
      const status = liCell_(sheet, row, map, ['LinkedIn Enrichment Status']);
      if (!status || status === 'stalled_retry_available' || status === 'error') selectedRows.push(row);
      row++; scanned++;
    }
    props.setProperty(prefix + 'nextRow', String(row));
    if (!selectedRows.length) {
      if (row > endRow) liAllComplete_(props);
      return;
    }

    props.setProperty(prefix + 'inflightStart', String(selectedRows[0]));
    props.setProperty(prefix + 'inflightEnd', String(selectedRows[selectedRows.length - 1]));
    const started = Date.now();
    let processed = Number(props.getProperty(prefix + 'processed')) || 0;
    let found = Number(props.getProperty(prefix + 'found')) || 0;
    let errors = Number(props.getProperty(prefix + 'errors')) || 0;

    for (let index = 0; index < selectedRows.length; index++) {
      if (Date.now() - started > LINKEDIN_BATCH_ALL_CONFIG.MAX_RUN_MILLISECONDS) break;
      const currentRow = selectedRows[index];
      try {
        const outcome = liProcessOneRow_(sheet, currentRow, map);
        processed++;
        if (outcome && outcome.found) found++;
      } catch (error) {
        errors++;
        Logger.log('Row ' + currentRow + ': ' + error.message);
      }
      props.setProperties({
        [prefix + 'processed']: String(processed),
        [prefix + 'found']: String(found),
        [prefix + 'errors']: String(errors),
        [prefix + 'inflightStart']: String(currentRow + 1)
      });
    }

    props.setProperty(prefix + 'inflightStart', '');
    props.setProperty(prefix + 'inflightEnd', '');
    if (row > endRow) liAllComplete_(props);
  } finally { lock.releaseLock(); }
}

function stopLinkedInBatchAll() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'status', 'paused');
  liAllDeleteTriggers_(['runLinkedInBatchAll']);
}

function resumeLinkedInBatchAll() {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'status', 'running');
  liAllDeleteTriggers_(['runLinkedInBatchAll']);
  ScriptApp.newTrigger('runLinkedInBatchAll').timeBased().everyMinutes(LINKEDIN_BATCH_ALL_CONFIG.TRIGGER_MINUTES).create();
}

function getLinkedInBatchAllStatus() {
  const props = PropertiesService.getScriptProperties();
  const p = LINKEDIN_BATCH_ALL_CONFIG.PREFIX;
  const status = { status: props.getProperty(p + 'status') || 'not_started', nextRow: Number(props.getProperty(p + 'nextRow')) || 2, endRow: Number(props.getProperty(p + 'endRow')) || 0, processed: Number(props.getProperty(p + 'processed')) || 0, found: Number(props.getProperty(p + 'found')) || 0, errors: Number(props.getProperty(p + 'errors')) || 0 };
  Logger.log(JSON.stringify(status));
  return status;
}

function liAllComplete_(props) { props.setProperty(LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'status', 'complete'); props.setProperty(LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'completedAt', new Date().toISOString()); props.setProperty(LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'inflightStart', ''); props.setProperty(LINKEDIN_BATCH_ALL_CONFIG.PREFIX + 'inflightEnd', ''); liAllDeleteTriggers_(['runLinkedInBatchAll']); }
function liAllDeleteTriggers_(names) { ScriptApp.getProjectTriggers().filter(trigger => names.indexOf(trigger.getHandlerFunction()) !== -1).forEach(trigger => ScriptApp.deleteTrigger(trigger)); }

