// ============================================================
// BLW Canada — Dashboard Data Script (Apps Script)
// ============================================================

function doGet(e) {
  try {
    // Health check: /exec?ping=1
    if (e && e.parameter && String(e.parameter.ping) === "1") {
      return respond_({
        ok: true,
        service: "blw-dashboard",
        timestamp: new Date().toISOString()
      }, e);
    }

    const payload = buildPayloadForUser_(e);
    return respond_(payload, e);
  } catch (err) {
    const out = {
      error: true,
      message: err && err.message ? err.message : "Unknown error",
      stack: String((err && err.stack) || ""),
      overview: [],
      cells: [],
      services: [],
      last_updated: new Date().toISOString()
    };
    return respond_(out, e);
  }
}

function respond_(obj, e) {
  const callback = e && e.parameter && e.parameter.callback;

  if (callback) {
    const safeCallback = String(callback).replace(/[^\w.$]/g, "");
    return ContentService
      .createTextOutput(safeCallback + "(" + JSON.stringify(obj) + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


// ============================================================
// USER-SCOPED PAYLOAD
// ============================================================

function buildPayloadForUser_(e) {
  const payload = buildPayload_();

  // 1) URL-based subgroup mode (public/shared links)
  const subgroupParam = clean_(e && e.parameter && e.parameter.subgroup);
  if (subgroupParam) {
    return filterPayloadByAllowedGroups_(payload, [subgroupParam]);
  }

  // 2) Email-based access mode
  const email = getCurrentUserEmail_();
  if (!email) {
    throw new Error("Unable to identify user email or no access record found.");
  }

  const access = getUserAccess_(email);
  if (!access) {
    throw new Error("No access record found for: " + email);
  }

  if (String(access.role || "").toLowerCase() === "admin") {
    return payload;
  }

  return filterPayloadByAllowedGroups_(payload, access.allowed_subgroups || []);
}

function filterPayloadByAllowedGroups_(payload, allowedGroups) {
  const allowed = new Set((allowedGroups || []).map(s => String(s).trim().toLowerCase()));

  const cells = (payload.cells || []).filter(r =>
    allowed.has(String(r.group || "").trim().toLowerCase())
  );

  const services = (payload.services || []).filter(r =>
    allowed.has(String(r.group || "").trim().toLowerCase())
  );

  const overview = (payload.overview || []).filter(r =>
    allowed.has(String(r.group || r.name || "").trim().toLowerCase())
  );

  return {
    last_updated: payload.last_updated,
    cells: cells,
    services: services,
    overview: overview
  };
}

// ============================================================
// BASE PAYLOAD
// ============================================================

function buildPayload_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const cellSheet = ss.getSheetByName("Cell Reporting");
  const serviceSheet = ss.getSheetByName("Services");

  if (!cellSheet) throw new Error('Sheet "Cell Reporting" not found.');
  if (!serviceSheet) throw new Error('Sheet "Services" not found.');

  const cells = getCellReportingData_(cellSheet);
  const services = getServiceData_(serviceSheet);
  const overview = buildOverviewData_(cells, services);

  writeOverviewTab_(ss, overview);

  return {
    last_updated: new Date().toISOString(),
    cells: cells,
    services: services,
    overview: overview
  };
}

// ============================================================
// ACCESS CONTROL
// ============================================================

function getCurrentUserEmail_() {
  return String(Session.getActiveUser().getEmail() || "").trim().toLowerCase();
}

function getUserAccess_(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName("Access Control");
  if (!sh) throw new Error('Sheet "Access Control" not found.');

  const values = sh.getDataRange().getValues();
  if (!values.length) throw new Error("Access Control sheet is empty.");

  const headers = values[0].map(h => String(h || "").trim());

  const nameCol = headers.indexOf("Name");
  const emailCol = headers.indexOf("email");
  const roleCol = headers.indexOf("role");
  const subgroupCol = headers.indexOf("allowed_subgroups");

  if (nameCol === -1 || emailCol === -1 || roleCol === -1 || subgroupCol === -1) {
    throw new Error("Access Control must contain headers: Name, email, role, allowed_subgroups");
  }

  const normalizedEmail = String(email || "").trim().toLowerCase();

  for (let i = 1; i < values.length; i++) {
    const rowEmail = String(values[i][emailCol] || "").trim().toLowerCase();
    if (!rowEmail || rowEmail !== normalizedEmail) continue;

    const role = String(values[i][roleCol] || "").trim().toLowerCase();
    const allowedSubgroups = String(values[i][subgroupCol] || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);

    return {
      name: String(values[i][nameCol] || "").trim(),
      email: rowEmail,
      role: role || "subgroup_viewer",
      allowed_subgroups: allowedSubgroups
    };
  }

  return null;
}


function filterPayloadByAccess_(payload, access) {
  const allowed = new Set(
    (access.allowed_subgroups || []).map(s => String(s).trim().toLowerCase())
  );

  const cells = (payload.cells || []).filter(r =>
    allowed.has(String(r.group || '').trim().toLowerCase())
  );

  const services = (payload.services || []).filter(r =>
    allowed.has(String(r.group || '').trim().toLowerCase())
  );

  const overview = (payload.overview || []).filter(r => {
    const groupName = String(r.group || r.name || '').trim().toLowerCase();
    return allowed.has(groupName);
  });

  return {
    last_updated: payload.last_updated,
    cells: cells,
    services: services,
    overview: overview
  };
}

// ============================================================
// CELL REPORTING
// ============================================================

function getCellReportingData_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getDisplayValues();
  const backgrounds = range.getBackgrounds();

  const output = [];
  let currentGroup = "";

  const monthRowIndex = 4;
  const weekRowIndex = 5;
  const firstDataRow = 6;
  const firstWeeklyCol = 8;

  for (let r = firstDataRow; r < values.length; r++) {
    const row = values[r];

    const scCode = clean_(row[0]);
    const cellName = clean_(row[3]);
    const leader = clean_(row[4]);
    const membership = toNumber_(row[5]);
    const avgAttendance = toNumber_(row[6]);
    const reportingPct = toPercentNumber_(row[7]);

    if (cellName && !leader && membership === null && avgAttendance === null && reportingPct === 0 && clean_(row[7]) === '') {
      currentGroup = cellName;
      continue;
    }

    if (!cellName) continue;
    if (currentGroup === "Total" || cellName === "Total") continue;

    const weekly = [];
    let missingReports = 0;

    for (let c = firstWeeklyCol; c < row.length; c++) {
      const month = monthHeaderAt_(values[monthRowIndex], c);
      const weekLabel = clean_(values[weekRowIndex][c]);
      const rawVal = clean_(row[c]);
      const bg = backgrounds[r][c];

      if (!month || !weekLabel) continue;

      const weekName = formatWeekLabel_(month, weekLabel);

      if (rawVal === "" && isRed_(bg)) {
        weekly.push({ week: weekName, attendance: null, missing: true });
        missingReports++;
        continue;
      }

      const attendance = toNumber_(rawVal);
      if (attendance === null) continue;

      weekly.push({ week: weekName, attendance, missing: false });
    }

    const mem = membership || 0;
    const avg = avgAttendance || 0;

    output.push({
      name: cellName,
      leader: leader,
      membership: mem,
      avg_attendance: avg,
      engagement_pct: mem > 0 && avg > 0 ? round1_((avg / mem) * 100) : 0,
      reporting_pct: reportingPct || 0,
      sc_code: scCode,
      group: currentGroup,
      missing_reports: missingReports,
      needs_attention: (reportingPct || 0) < 50 || missingReports >= 2,
      weekly
    });
  }

  return output;
}

// ============================================================
// SERVICES
// ============================================================

function getServiceData_(sheet) {
  const range = sheet.getDataRange();
  const values = range.getDisplayValues();
  const backgrounds = range.getBackgrounds();

  const output = [];
  let currentGroup = "";

  const monthRowIndex = 4;
  const weekRowIndex = 5;
  const firstDataRow = 6;
  const firstWeeklyCol = 6;

  for (let r = firstDataRow; r < values.length; r++) {
    const row = values[r];

    const scCode = clean_(row[0]);
    const cellsRepresented = toNumber_(row[1]);
    const serviceName = clean_(row[2]);
    const leader = clean_(row[3]);
    const reportingPct = toPercentNumber_(row[4]);
    const avgAttendance = toNumber_(row[5]);

    if (serviceName && !leader && cellsRepresented === null && reportingPct === 0 && clean_(row[4]) === '' && avgAttendance === null) {
      currentGroup = serviceName;
      continue;
    }

    if (!serviceName) continue;
    if (currentGroup === "Total" || serviceName === "Total") continue;

    const weekly = [];
    let missingReports = 0;

    for (let c = firstWeeklyCol; c < row.length; c++) {
      const month = monthHeaderAt_(values[monthRowIndex], c);
      const weekLabel = clean_(values[weekRowIndex][c]);
      const rawVal = clean_(row[c]);
      const bg = backgrounds[r][c];

      if (!month || !weekLabel) continue;

      const weekName = formatWeekLabel_(month, weekLabel);

      if (rawVal === "" && isRed_(bg)) {
        weekly.push({ week: weekName, attendance: null, missing: true });
        missingReports++;
        continue;
      }

      const attendance = toNumber_(rawVal);
      if (attendance === null) continue;

      weekly.push({ week: weekName, attendance, missing: false });
    }

    output.push({
      name: serviceName,
      leader: leader,
      cells_represented: cellsRepresented || 0,
      avg_attendance: avgAttendance || 0,
      reporting_pct: reportingPct || 0,
      sc_code: scCode,
      group: currentGroup,
      missing_reports: missingReports,
      needs_attention: (reportingPct || 0) < 50 || missingReports >= 2,
      weekly
    });
  }

  return output;
}

// ============================================================
// OVERVIEW
// ============================================================

function buildOverviewData_(cells, services) {
  const subgroupOrder = [
    "Central East SGA",
    "Central East SGB",
    "Central SGA",
    "Central SGB",
    "West SGA",
    "West SGB"
  ];

  return subgroupOrder.map(group => {
    const cellRows = cells.filter(r => r.group === group);
    const serviceRows = services.filter(r => r.group === group);
    const weekly = mergeWeeklyForOverview_(cellRows, serviceRows);
    const cellsNeedingAttention = cellRows.filter(r => r.needs_attention).length;

    return {
      name: group,
      group: group,
      cell_count: cellRows.length,
      cell_members: sum_(cellRows, 'membership'),
      cell_avg_attendance: avg_(cellRows, 'avg_attendance'),
      cell_avg_engagement_pct: avg_(cellRows, 'engagement_pct'),
      cell_missing_reports: sum_(cellRows, 'missing_reports'),
      cell_reporting_avg: avg_(cellRows, 'reporting_pct'),
      cells_needing_attention: cellsNeedingAttention,
      service_count: serviceRows.length,
      service_cells_represented: sum_(serviceRows, 'cells_represented'),
      service_avg_attendance: avg_(serviceRows, 'avg_attendance'),
      service_missing_reports: sum_(serviceRows, 'missing_reports'),
      service_reporting_avg: avg_(serviceRows, 'reporting_pct'),
      total_members: sum_(cellRows, 'membership'),
      total_cells: cellRows.length,
      total_services: serviceRows.length,
      avg_attendance: avgValues_([
        avg_(cellRows, 'avg_attendance'),
        avg_(serviceRows, 'avg_attendance')
      ]),
      reporting_pct: avgValues_([
        avg_(cellRows, 'reporting_pct'),
        avg_(serviceRows, 'reporting_pct')
      ]),
      missing_reports: sum_(cellRows, 'missing_reports') + sum_(serviceRows, 'missing_reports'),
      weekly
    };
  });
}

// ============================================================
// OVERVIEW SHEET WRITER
// ============================================================

function writeOverviewTab_(ss, overview) {
  let sheet = ss.getSheetByName('Overview');
  if (!sheet) sheet = ss.insertSheet('Overview');
  else sheet.clear();

  const headers = [
    'Subgroup',
    'Cell Count',
    'Cell Members',
    'Cell Avg Attendance',
    'Cell Avg Engagement %',
    'Cells Needing Attention',
    'Cell Missing Reports',
    'Cell Reporting Avg %',
    'Service Count',
    'Cells Represented',
    'Service Avg Attendance',
    'Service Missing Reports',
    'Service Reporting Avg %',
    'Overall Avg Attendance',
    'Overall Reporting Avg %',
    'Overall Missing Reports'
  ];

  const rows = overview.map(r => [
    r.group,
    r.cell_count,
    r.cell_members,
    r.cell_avg_attendance,
    r.cell_avg_engagement_pct,
    r.cells_needing_attention,
    r.cell_missing_reports,
    r.cell_reporting_avg,
    r.service_count,
    r.service_cells_represented,
    r.service_avg_attendance,
    r.service_missing_reports,
    r.service_reporting_avg,
    r.avg_attendance,
    r.reporting_pct,
    r.missing_reports
  ]);

  const data = [headers, ...rows];
  sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#1a1f2b')
    .setFontColor('#ffffff');

  if (rows.length) {
    const attentionCol = 6;
    const attentionRange = sheet.getRange(2, attentionCol, rows.length, 1);
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setBackground('#fff3cd')
      .setFontColor('#856404')
      .setRanges([attentionRange])
      .build();
    sheet.setConditionalFormatRules([rule]);

    [4, 5, 8, 11, 13, 14, 15].forEach(col =>
      sheet.getRange(2, col, rows.length, 1).setNumberFormat('0.0')
    );
  }

  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

// ============================================================
// WEEKLY MERGE
// ============================================================

function mergeWeeklyForOverview_(cellRows, serviceRows) {
  const weekMap = {};

  [...cellRows, ...serviceRows].forEach(row => {
    (row.weekly || []).forEach(w => {
      const key = w.week;
      if (!key) return;

      if (!weekMap[key]) {
        weekMap[key] = { week: key, total: 0, count: 0, missing: 0 };
      }

      if (w.missing) {
        weekMap[key].missing++;
      } else if (w.attendance !== null && w.attendance !== undefined) {
        weekMap[key].total += Number(w.attendance) || 0;
        weekMap[key].count++;
      }
    });
  });

  return sortWeeks_(Object.values(weekMap)).map(w => ({
    week: w.week,
    attendance: w.count ? round1_(w.total / w.count) : null,
    missing: w.count === 0 && w.missing > 0
  }));
}

// ============================================================
// UTILITIES
// ============================================================

function clean_(value) {
  return String(value == null ? '' : value).trim();
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/,/g, '').replace(/%/g, '').trim();
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toPercentNumber_(v) {
  const s = String(v || '').replace('%', '').trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function formatWeekLabel_(month, weekLabel) {
  return monthToShort_(month) + ' ' + weekLabel.replace(/\s+/g, ' ').trim();
}

function monthToShort_(month) {
  const m = String(month).toLowerCase().replace(/\./g, '').trim();
  if (m.startsWith('jan')) return 'Jan';
  if (m.startsWith('feb')) return 'Feb';
  if (m.startsWith('mar')) return 'Mar';
  if (m.startsWith('apr')) return 'Apr';
  if (m === 'may') return 'May';
  if (m.startsWith('jun')) return 'Jun';
  if (m.startsWith('jul')) return 'Jul';
  if (m.startsWith('aug')) return 'Aug';
  if (m.startsWith('sep')) return 'Sep';
  if (m.startsWith('oct')) return 'Oct';
  if (m.startsWith('nov')) return 'Nov';
  if (m.startsWith('dec')) return 'Dec';
  return month;
}

function monthHeaderAt_(rowValues, colIndex) {
  for (let c = colIndex; c >= 0; c--) {
    const v = clean_(rowValues[c]);
    if (v) return v;
  }
  return '';
}

function isRed_(bg) {
  if (!bg) return false;
  const c = String(bg).toLowerCase().trim();
  return ['#ff0000','#ea4335','#f28b82','#e06666','#cc0000','#d32f2f'].includes(c);
}

function sum_(arr, key) {
  return arr.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

function avg_(arr, key) {
  if (!arr.length) return 0;
  return sum_(arr, key) / arr.length;
}

function avgValues_(values) {
  const valid = values.filter(v => Number.isFinite(v));
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

function round1_(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function sortWeeks_(items) {
  return items.sort((a, b) => weekSortValue_(a.week) - weekSortValue_(b.week));
}

function weekSortValue_(label) {
  const str = String(label || '').trim();
  const parts = str.split(/\s+/);
  const month = parts[0] || '';
  const week = parts.slice(1).join(' ');
  return monthIndex_(month) * 100 + weekIndex_(week);
}

function monthIndex_(month) {
  const order = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const idx = order.indexOf(monthToShort_(month));
  return idx === -1 ? 99 : idx;
}

function weekIndex_(weekLabel) {
  const w = String(weekLabel || '').toUpperCase().trim();
  if (w === 'PP') return 0;
  const match = w.match(/^B\s*(\d+)$/) || w.match(/^W\s*(\d+)$/) || w.match(/^(\d+)$/);
  if (match) return Number(match[1]) || 99;
  return 99;
}
