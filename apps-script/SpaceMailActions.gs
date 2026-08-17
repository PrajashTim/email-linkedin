// ============================================================
// SpaceMail draft actions for LeadGen V2 / Sheet3.
//
// This adds a safe action link beside the existing Gmail links. The link opens
// the dashboard on the exact Sheet3 row, where the user can open SpaceMail and
// copy the reviewed recipient, subject, and Day 1 body. SpaceMail's web app
// does not provide a supported URL format that can prefill its composer, so
// this intentionally never transmits contact data or sends an email.
// ============================================================

const SPACEMAIL_ACTION_CONFIG = {
  HEADER: 'Prepare SpaceMail Day 1',
  DASHBOARD_URL: 'https://email-linkedin-delta.vercel.app/'
};

function installSpaceMailComposeLinks() {
  const sheet = liGetSheet_();
  let map = liHeaderMap_(sheet);
  const source = smSourceColumns_(map);
  if (!source.email || !source.message) {
    throw new Error('Sheet3 needs an email column and a Day 1 message column before SpaceMail links can be added.');
  }

  const linkColumn = smEnsureLinkColumn_(sheet, map);
  map = liHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const formulas = [];
    for (let row = 2; row <= lastRow; row++) formulas.push([smComposeFormula_(row, source.email, source.message)]);
    sheet.getRange(2, linkColumn, formulas.length, 1).setFormulas(formulas);
  }
  SpreadsheetApp.flush();
  Logger.log('SpaceMail links installed for rows 2-' + lastRow + ' in column ' + linkColumn + '.');
}

function smEnsureSpaceMailLinkForRow_(sheet, row, headerMap) {
  const map = headerMap || liHeaderMap_(sheet);
  const linkColumn = liFindColumn_(map, [SPACEMAIL_ACTION_CONFIG.HEADER]);
  if (!linkColumn || row < 2) return false;
  const source = smSourceColumns_(map);
  if (!source.email || !source.message) return false;
  const cell = sheet.getRange(row, linkColumn);
  const formula = smComposeFormula_(row, source.email, source.message);
  if (cell.getFormula() === formula) return false;
  if (cell.getDisplayValue() && !cell.getFormula()) return false;
  cell.setFormula(formula);
  return true;
}

function smSourceColumns_(map) {
  return {
    email: liFindColumn_(map, ['Primary Email', 'Email']),
    message: liFindColumn_(map, ['Email 1 Body', 'Day 1 Email Body', 'First Day Email Body', 'Day 1 Message'])
  };
}

function smEnsureLinkColumn_(sheet, map) {
  const existing = liFindColumn_(map, [SPACEMAIL_ACTION_CONFIG.HEADER]);
  if (existing) return existing;
  const previous = sheet.getLastColumn();
  if (previous >= sheet.getMaxColumns()) sheet.insertColumnAfter(previous);
  const column = previous + 1;
  if (previous) sheet.getRange(1, previous).copyTo(sheet.getRange(1, column), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sheet.getRange(1, column).setValue(SPACEMAIL_ACTION_CONFIG.HEADER);
  sheet.setColumnWidth(column, 170);
  return column;
}

function smComposeFormula_(row, emailColumn, messageColumn) {
  const email = '$' + smColumnLetter_(emailColumn) + row;
  const message = '$' + smColumnLetter_(messageColumn) + row;
  const url = SPACEMAIL_ACTION_CONFIG.DASHBOARD_URL + '?row=' + row + '&prepare=spacemail';
  return '=IF(OR(' + email + '="",' + message + '=""),"",HYPERLINK("' + url + '","Prepare SpaceMail"))';
}

function smColumnLetter_(column) {
  let value = Number(column);
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}
