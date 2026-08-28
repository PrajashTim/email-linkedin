// ============================================================
// Email cadence and lead-disposition tracking for Sheet3.
// This schedules reviewable follow-ups; it never sends email automatically.
// LinkedIn remains a separate channel throughout.
// ============================================================

const EMAIL_OUTREACH_STATUS_HEADERS = [
  'Email Outreach Status', 'Email Status', 'Email Sent Status',
  'Day 1 Email Status', 'Day 1 Status', 'Email 1 Status',
  'Email 1 Sent', 'Day 1 Sent', 'Email Sent'
];

const EMAIL_WORKFLOW_HEADERS = [
  'Lead Workflow Status', 'Lead Workflow Reason', 'Email Sequence Status',
  'Email Next Action At', 'Email Paused Step', 'Email Day 1 Sent At',
  'Email Day 3 Sent At', 'Email Day 7 Sent At'
];

function emailFindOutreachStatusColumn_(headerMap) {
  return liFindColumn_(headerMap, EMAIL_OUTREACH_STATUS_HEADERS);
}

function emailFindSentAtColumn_(headerMap) {
  return liFindColumn_(headerMap, ['Email Sent At', 'Day 1 Email Sent At', 'Email 1 Sent At']);
}

function emailReadOutreachStatus_(values, headerMap) {
  const column = emailFindOutreachStatusColumn_(headerMap);
  return column ? String(values[column - 1] || '').trim() : 'Not sent';
}

function emailReadField_(values, headerMap, candidates) {
  const column = liFindColumn_(headerMap, candidates);
  return column ? String(values[column - 1] || '').trim() : '';
}

function emailIsSent_(value) {
  return /^(sent|email sent|day 1 sent|message sent|true|yes|complete|completed)$/i.test(String(value || '').trim());
}

function emailWorkflowFromValues_(values, headerMap) {
  const emailStatus = emailReadOutreachStatus_(values, headerMap);
  const sequenceStatus = emailReadField_(values, headerMap, ['Email Sequence Status']) || (emailIsSent_(emailStatus) ? 'Follow-up review' : 'Not started');
  return {
    workflowStatus: emailReadField_(values, headerMap, ['Lead Workflow Status']) || 'Active',
    workflowReason: emailReadField_(values, headerMap, ['Lead Workflow Reason']),
    emailSequenceStatus: sequenceStatus,
    emailNextActionAt: emailReadField_(values, headerMap, ['Email Next Action At']),
    emailPausedStep: emailReadField_(values, headerMap, ['Email Paused Step'])
  };
}

function emailEnsureOutreachColumns_(sheet, headerMap) {
  let map = headerMap || liHeaderMap_(sheet);
  if (!emailFindOutreachStatusColumn_(map)) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('Email Outreach Status');
    map = liHeaderMap_(sheet);
  }
  if (!emailFindSentAtColumn_(map)) {
    sheet.getRange(1, sheet.getLastColumn() + 1).setValue('Email Sent At');
    map = liHeaderMap_(sheet);
  }
  return map;
}

function emailEnsureWorkflowColumns_(sheet, headerMap) {
  let map = emailEnsureOutreachColumns_(sheet, headerMap);
  EMAIL_WORKFLOW_HEADERS.forEach(header => {
    if (!liFindColumn_(map, [header])) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
      map = liHeaderMap_(sheet);
    }
  });
  return map;
}

function emailSetField_(sheet, row, headerMap, candidates, value) {
  const column = liFindColumn_(headerMap, candidates);
  if (!column) throw new Error('Sheet column not found: ' + candidates[0]);
  sheet.getRange(row, column).setValue(value);
}

function emailAddDays_(days) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return value;
}

function emailStepForStatus_(status) {
  if (/day 7/i.test(status)) return 'Day 7';
  if (/day 3|follow-up/i.test(status)) return 'Day 3';
  return 'Day 1';
}

function emailEnsureFollowUpScheduler_() {
  const handler = 'processDueEmailFollowUps';
  const exists = ScriptApp.getProjectTriggers().some(trigger => trigger.getHandlerFunction() === handler);
  if (!exists) ScriptApp.newTrigger(handler).timeBased().everyHours(1).create();
}

function emailSequenceAction_(request) {
  const sheet = liGetSheet_();
  const row = Number(request.row);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Invalid row');
  const map = emailEnsureWorkflowColumns_(sheet, liHeaderMap_(sheet));
  const action = String(request.sequenceAction || '');
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const state = emailWorkflowFromValues_(values, map);
  const email = emailReadField_(values, map, ['Primary Email', 'Email']);
  if (!email && /sent|due/i.test(action)) throw new Error('This lead has no email address.');

  if (action === 'day1Sent') {
    emailSetField_(sheet, row, map, EMAIL_OUTREACH_STATUS_HEADERS, 'Sent');
    emailSetField_(sheet, row, map, ['Email Sent At', 'Day 1 Email Sent At', 'Email 1 Sent At'], new Date());
    emailSetField_(sheet, row, map, ['Email Day 1 Sent At'], new Date());
    emailSetField_(sheet, row, map, ['Email Sequence Status'], 'Day 3 scheduled');
    emailSetField_(sheet, row, map, ['Email Next Action At'], emailAddDays_(3));
    emailSetField_(sheet, row, map, ['Email Paused Step'], '');
    emailEnsureFollowUpScheduler_();
  } else if (action === 'day3Sent') {
    emailSetField_(sheet, row, map, ['Email Day 3 Sent At'], new Date());
    emailSetField_(sheet, row, map, ['Email Sequence Status'], 'Day 7 scheduled');
    emailSetField_(sheet, row, map, ['Email Next Action At'], emailAddDays_(4));
    emailSetField_(sheet, row, map, ['Email Paused Step'], '');
    emailEnsureFollowUpScheduler_();
  } else if (action === 'day7Sent') {
    emailSetField_(sheet, row, map, ['Email Day 7 Sent At'], new Date());
    emailSetField_(sheet, row, map, ['Email Sequence Status'], 'Awaiting reply');
    emailSetField_(sheet, row, map, ['Email Next Action At'], '');
    emailSetField_(sheet, row, map, ['Email Paused Step'], '');
  } else if (action === 'makeDay3Due') {
    emailSetField_(sheet, row, map, ['Email Sequence Status'], 'Day 3 due');
    emailSetField_(sheet, row, map, ['Email Next Action At'], '');
  } else if (action === 'pause') {
    emailSetField_(sheet, row, map, ['Email Paused Step'], emailStepForStatus_(state.emailSequenceStatus));
    emailSetField_(sheet, row, map, ['Email Sequence Status'], 'Paused');
  } else if (action === 'resume') {
    const step = state.emailPausedStep || 'Day 3';
    emailSetField_(sheet, row, map, ['Email Sequence Status'], step + ' due');
    emailSetField_(sheet, row, map, ['Email Next Action At'], '');
    emailSetField_(sheet, row, map, ['Email Paused Step'], '');
  } else if (action === 'noReply') {
    emailSetField_(sheet, row, map, ['Lead Workflow Status'], 'No response');
    emailSetField_(sheet, row, map, ['Lead Workflow Reason'], 'No reply after email sequence');
    emailSetField_(sheet, row, map, ['Email Sequence Status'], 'No reply');
    emailSetField_(sheet, row, map, ['Email Next Action At'], '');
  } else {
    throw new Error('Unknown email sequence action');
  }

  if (typeof sgSyncSheet3Row_ === 'function') sgSyncSheet3Row_(sheet, row, map);
  return { ok: true, row: row, sequenceAction: action, lead: lgDashboardLeadByRow_(row).lead };
}

function emailSetLeadDisposition_(request) {
  const sheet = liGetSheet_();
  const row = Number(request.row);
  if (!Number.isInteger(row) || row < 2 || row > sheet.getLastRow()) throw new Error('Invalid row');
  const allowed = ['Active', 'Skipped', 'No response'];
  const status = String(request.status || '');
  if (allowed.indexOf(status) === -1) throw new Error('Invalid lead disposition');
  const map = emailEnsureWorkflowColumns_(sheet, liHeaderMap_(sheet));
  emailSetField_(sheet, row, map, ['Lead Workflow Status'], status);
  emailSetField_(sheet, row, map, ['Lead Workflow Reason'], status === 'Active' ? '' : String(request.reason || ''));
  if (typeof sgSyncSheet3Row_ === 'function') sgSyncSheet3Row_(sheet, row, map);
  return { ok: true, row: row, status: status, lead: lgDashboardLeadByRow_(row).lead };
}

// Hourly state automation: it marks a planned follow-up as due. It does not
// send an email, open an email client, or touch any paused/skipped lead.
function processDueEmailFollowUps() {
  const sheet = liGetSheet_();
  const map = liHeaderMap_(sheet);
  const statusColumn = liFindColumn_(map, ['Email Sequence Status']);
  const nextActionColumn = liFindColumn_(map, ['Email Next Action At']);
  const workflowColumn = liFindColumn_(map, ['Lead Workflow Status']);
  if (!statusColumn || !nextActionColumn) return;
  const rowCount = Math.max(0, sheet.getLastRow() - 1);
  if (!rowCount) return;
  const statuses = sheet.getRange(2, statusColumn, rowCount, 1).getDisplayValues();
  const nextActions = sheet.getRange(2, nextActionColumn, rowCount, 1).getValues();
  const workflows = workflowColumn ? sheet.getRange(2, workflowColumn, rowCount, 1).getDisplayValues() : [];
  const now = new Date();
  const changedRows = [];
  statuses.forEach((item, index) => {
    const status = String(item[0] || '');
    const workflow = workflowColumn ? String(workflows[index][0] || 'Active') : 'Active';
    const dueAt = nextActions[index][0] instanceof Date ? nextActions[index][0] : new Date(nextActions[index][0]);
    if (workflow !== 'Active' || !/scheduled/i.test(status) || Number.isNaN(dueAt.getTime()) || dueAt > now) return;
    const dueStatus = /day 7/i.test(status) ? 'Day 7 due' : 'Day 3 due';
    sheet.getRange(index + 2, statusColumn).setValue(dueStatus);
    sheet.getRange(index + 2, nextActionColumn).setValue('');
    changedRows.push(index + 2);
  });
  changedRows.forEach(row => sgSyncSheet3Row_(sheet, row, map));
}
