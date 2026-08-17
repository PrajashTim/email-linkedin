// ============================================================
// Independent email-outreach tracking for Sheet3 and the dashboard.
// LinkedIn and email are deliberately separate channels: marking an email as
// sent never moves a lead out of the LinkedIn queue (and vice versa).
// ============================================================

const EMAIL_OUTREACH_STATUS_HEADERS = [
  'Email Outreach Status', 'Email Status', 'Email Sent Status',
  'Day 1 Email Status', 'Day 1 Status', 'Email 1 Status',
  'Email 1 Sent', 'Day 1 Sent', 'Email Sent'
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

function emailEnsureOutreachColumns_(sheet, headerMap) {
  let map = headerMap || liHeaderMap_(sheet);
  if (!emailFindOutreachStatusColumn_(map)) {
    const column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue('Email Outreach Status');
    map = liHeaderMap_(sheet);
  }
  if (!emailFindSentAtColumn_(map)) {
    const column = sheet.getLastColumn() + 1;
    sheet.getRange(1, column).setValue('Email Sent At');
    map = liHeaderMap_(sheet);
  }
  return map;
}
