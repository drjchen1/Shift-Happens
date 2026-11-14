const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Import = require('../department-import.js');

// ---------- synthetic fixtures (no real student data in the repo) ----------
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = ['7:30am-8:20am', '8:30am-9:20am', '9:30am-10:20am', '10:30am-11:20am', '11:30am-12:20pm',
  '12:30pm-1:20pm', '1:30pm-2:20pm', '2:30pm-3:20pm', '3:30pm-4:20pm', '4:30pm-5:20pm'];

/* Builds a raw Qualtrics export: ids row, label row, ImportId row, then responses.
 * marks: { 'Mon 09:30': 'X', ... } */
function qualtrics(responses) {
  const ids = ['StartDate', 'RecordedDate', 'ResponseId', 'Finished', 'RecipientLastName', 'RecipientFirstName',
    'RecipientEmail', 'Q28'];
  const labels = ['Start Date', 'Recorded Date', 'Response ID', 'Finished', 'Recipient Last Name',
    'Recipient First Name', 'Recipient Email', 'Which of the options below apply to you?'];
  const grid = [];
  TIMES.forEach((t, r) => DAYS.forEach((d, c) => {
    ids.push(`Q1_${r + 1}_${c + 1}`);
    labels.push(`Mark each time slot with an X ... - ${t} - ${d}`);
    const start = t.split('-')[0];
    let [h, m] = start.replace(/am|pm/, '').split(':').map(Number);
    if (/pm/.test(start) && h !== 12) h += 12;
    grid.push(`${d.slice(0, 3)} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  }));
  ids.push('Q5', 'Q2', 'Q6', 'Q10_1', 'embedded_data_puid');
  labels.push('Do you prefer to teach back-to-back classes?', 'Other constraints', 'Statements', 'Full Name:', 'puid');
  const importRow = ids.map(id => `{"ImportId":"${id}"}`);
  const rows = responses.map(r => {
    const base = [r.date || '2026-04-08 10:00:00', r.date || '2026-04-08 10:00:00', 'R_x', 'True',
      r.last || '', r.first || '', r.email || '', r.status || 'I want to be considered for either a TA position'];
    grid.forEach(slot => base.push((r.marks || {})[slot] || ''));
    base.push(r.pref || 'No preference', r.notes || '', r.role || 'I will be a graduate student in the Department of Mathematics',
      r.signature || '', r.puid || '');
    return base;
  });
  return [ids, labels, importRow, ...rows];
}

function offerings(lines) {
  return [
    ['MA Offered Courses'],
    ['', 'External Id', 'Enrollment', 'Limit', 'Instructor', 'Time', 'Room', 'Room Cap', 'Wait-Listing'],
    ...lines,
    ['MA Not Offered Courses'],
    ['MA 99999', '', '0', '0', 'Ghost', '', '', '', ''],
    ['  Lec 1', '00000-001', '0', '20', 'Nobody, Never (Instr)', 'MWF 9:30a-10:20a', 'X', '20', '']
  ];
}

const survey = qualtrics([
  { last: 'Tensor', first: 'Tina', email: 'tt@x.edu', puid: '001', pref: 'Yes',
    marks: { 'Mon 09:30': 'X', 'Tue 10:30': 'x', 'Wed 11:30': 'XX', 'Thu 13:30': '1' } },
  // Same person resubmitted later with a blank name: latest wins, name from signature.
  { last: '', first: '', email: '', puid: '002', signature: 'Rho Recit', date: '2026-05-01 09:00:00',
    marks: { 'Fri 09:30': 'X' } },
  { last: 'Recit', first: 'Rho', email: 'rr@x.edu', puid: '002', date: '2026-04-09 09:00:00',
    marks: { 'Mon 10:30': 'X' } },
  // Typed first/last into the wrong boxes.
  { last: 'Kabir', first: 'Idowu', email: 'ki@x.edu', puid: '003' },
  { last: 'Lecturer', first: 'Larry', puid: '004', role: 'I seek a position as a limited-term-lecturer in Fall 2026' },
  { last: 'Mrr', first: 'Molly', puid: '005', marks: { 'Thu 15:30': 'X' }, notes: 'Consecutive MRR hours please' },
  // Shares a last name with a TA who did not fill out the survey.
  { last: 'Same', first: 'Sally', puid: '006' }
]);

const unitime = offerings([
  ['MA 15300', '', '358', '420', 'College Algebra', '', '', '', ''],
  ['  Lec 3', '14954-103', '17', '20', 'Boss, Coordinator (Instr)\nTensor, Tina (Instr)', 'MWF 8:30a-9:20a', 'MATH 215', '24', ''],
  ['  Lec 4', '14954-104', '17', '20', 'Boss, Coordinator (Instr)\nHelper, Hank (Instr)', 'MWF 9:30a-10:20a', 'MATH 215', '24', ''],
  ['  Lec 5', '14954-105', '17', '20', 'Boss, Coordinator (Instr)\nHelper2, Hal (Instr)', 'MWF 10:30a-11:20a', 'MATH 215', '24', ''],
  ['MA 16010', '', '1467', '1583', 'Applied Calculus I', '', '', '', ''],
  ['  Lec 1', '18133-001', '34', '35', 'Lecturer, Larry (Instr)', 'MWF 8:30a-9:20a', 'SCHM 316', '40', ''],
  ['  Lec 2', '18133-002', '34', '35', 'Lecturer, Larry (Instr)', 'MWF 9:30a-10:20a', 'SCHM 316', '40', ''],
  ['  Lec 39', '13300-891', '92', '103', 'Professor, Pat (Instr)', 'MWF 8:30a-9:20a', 'STEW 314', '108', ''],
  ['MA 26100', '', '3021', '3060', 'Multivariate Calculus', '', '', '', ''],
  ['  Lec 4', '21134-200', '459', '468', 'Professor, Pat (Instr)', 'MWF 7:30a-8:20a', 'CL50 224', '470', ''],
  ['    Rec 1', '1-1', '38', '39', 'Recit, Rho (Instr)', 'T 7:30a-8:20a', 'SCHM 122', '40', ''],
  ['    Rec 2', '1-2', '38', '39', 'Recit, Rho (Instr)', 'T 8:30a-9:20a', 'SCHM 122', '40', ''],
  ['    Rec 3', '1-3', '38', '39', 'Recit, Rho (Instr)', 'T 9:30a-10:20a', 'SCHM 122', '40', ''],
  ['    Rec 4', '1-4', '38', '39', 'Idowu, Kabir Oluwatobi (Instr)', 'T 2:30p-3:20p', 'AR 101', '50', ''],
  ['    Rec 5', '1-5', '38', '39', 'Same, Steve (Instr)', 'T 3:30p-4:20p', 'AR 101', '50', ''],
  ['    Rec 6', '1-6', '38', '39', '', 'T 4:30p-5:20p', 'AR 101', '50', ''],
  ['MA 26600', '', '1437', '1478', 'Ordinary Differ Equatn', '', '', '', ''],
  // Not an MRR course, but Rho teaches it: it must still block her time (75-minute class).
  ['  Lec 16', '13034-096', '42', '42', 'Recit, Rho (Instr)', 'TTh 10:30a-11:45a', 'HAMP 2101', '45', '']
]);

function build(extra = {}) {
  return Import.buildRoster({ surveys: [survey], offerings: unitime, mrr: 'Mrr, Molly\nGhost, Gary 5', ...extra });
}

// ---------- tests ----------
test('meeting parser blocks every overlapped hourly slot', () => {
  assert.deepEqual(Import.blockedSlots(Import.parseMeeting('TTh 10:30a-11:45a')),
    ['Tue 10:30', 'Thu 10:30', 'Tue 11:30', 'Thu 11:30']);
  assert.deepEqual(Import.blockedSlots(Import.parseMeeting('MWF 7:30a-8:20a')), ['Mon 07:30', 'Wed 07:30', 'Fri 07:30']);
  assert.deepEqual(Import.parseMeeting('MTWTh 9:30a-10:20a').days, ['Mon', 'Tue', 'Wed', 'Thu']);
  assert.equal(Import.parseMeeting(''), null);
});

test('raw Qualtrics export: any mark counts, duplicates collapse to latest, signature fills blank names', () => {
  assert.equal(Import.isQualtricsExport(survey), true);
  const people = Import.parseQualtrics(survey);
  const tina = people.find(p => p.last === 'Tensor');
  assert.deepEqual([...tina.unavail].sort(), ['Mon 09:30', 'Thu 13:30', 'Tue 10:30', 'Wed 11:30']);
  assert.equal(tina.pref, 'Yes');
  const rho = people.filter(p => p.puid === '002');
  assert.equal(rho.length, 1);
  assert.equal(rho[0].last, 'Recit');
  assert.deepEqual([...rho[0].unavail], ['Fri 09:30']);
  assert.equal(people.find(p => p.last === 'Lecturer').isLTL, true);
});

test('UniTime offerings: co-taught cells split, not-offered courses ignored', () => {
  assert.equal(Import.isOfferingsExport(unitime), true);
  const sections = Import.parseOfferings(unitime);
  const lec3 = sections.find(s => s.external === '14954-103');
  assert.deepEqual(lec3.instructors, ['Boss, Coordinator', 'Tensor, Tina']);
  assert.equal(lec3.course, 'MA 15300');
  assert.equal(sections.some(s => s.course === 'MA 99999'), false);
});

test('buildRoster applies department hour rules and skips faculty, coordinators, and LTLs', () => {
  const { instructors, report } = build();
  const byName = Object.fromEntries(instructors.map(i => [i.name, i]));
  assert.equal(byName['Tensor, Tina'].required, 1, '1 section of 15300 rounds up to 1 hour');
  assert.equal(byName['Recit, Rho'].required, 3, '3 recitations of 26100 = 3 hours');
  assert.equal(byName['Recit, Rho'].course, 'MA 26100');
  assert.equal(byName['Boss, Coordinator'], undefined);
  assert.equal(byName['Professor, Pat'], undefined);
  assert.equal(byName['Lecturer, Larry'], undefined);
  assert.equal(report.skippedLTL.length, 1);
  assert.ok(report.skippedNotInSurvey.some(s => s.startsWith('Boss, Coordinator')));
  assert.ok(report.skippedNotInSurvey.some(s => s.startsWith('Professor, Pat')));
  assert.equal(report.sectionsWithoutInstructor.length, 1);
});

test('buildRoster merges survey availability with every teaching block, including non-MRR courses', () => {
  const rho = build().instructors.find(i => i.name === 'Recit, Rho');
  ['Fri 09:30', 'Tue 07:30', 'Tue 08:30', 'Tue 09:30', 'Tue 10:30', 'Tue 11:30', 'Thu 10:30', 'Thu 11:30']
    .forEach(slot => assert.ok(rho.unavail.includes(slot), `missing ${slot}`));
});

test('TAs missing from the survey are flagged, never matched to a classmate with the same surname', () => {
  const { instructors, report } = build();
  const steve = instructors.find(i => i.name === 'Same, Steve');
  assert.ok(steve, 'still scheduled so his MRR hours are not lost');
  assert.match(steve.importWarning, /Not found/);
  assert.deepEqual(steve.unavail, ['Tue 15:30']);
  assert.ok(report.teachingNoSurvey.some(s => s.startsWith('Same, Steve')));
  assert.equal(report.teachingNoSurvey.some(s => s.startsWith('Helper, Hank')), false);
  const off = build({ rules: { includeTeachingWithoutSurvey: false } }).instructors;
  assert.equal(off.some(i => i.name === 'Same, Steve'), false);
});

test('MA 15300 undergraduates are skipped quietly; graduate TAs teaching 15300 still get hours', () => {
  const { instructors, report } = build();
  assert.equal(instructors.some(i => i.name === 'Helper, Hank'), false);
  assert.ok(report.skippedUndergrad.some(s => s.startsWith('Helper, Hank')));
  assert.ok(report.skippedUndergrad.some(s => s.startsWith('Helper2, Hal')));
  const tina = instructors.find(i => i.name === 'Tensor, Tina');
  assert.equal(tina.required, 1, 'graduate TA in the survey: one hour per two 15300 sections, rounded up');
});

test('swapped first/last survey names still match', () => {
  const { instructors, report } = build();
  assert.ok(instructors.find(i => i.name === 'Idowu, Kabir Oluwatobi' && !i.importWarning));
  assert.equal(report.fuzzyMatches.length, 1);
});

test('MRR-only list accepts pasted names with optional hours and Dom-style CSV rows', () => {
  const { instructors, report } = build();
  const molly = instructors.find(i => i.name === 'Mrr, Molly');
  assert.equal(molly.isMRR, true);
  assert.equal(molly.required, 10);
  assert.deepEqual(molly.unavail, ['Thu 15:30']);
  assert.equal(molly.notes, 'Consecutive MRR hours please');
  assert.equal(instructors.find(i => i.name === 'Ghost, Gary').required, 5);
  assert.deepEqual(report.mrrNotInSurvey, ['Ghost, Gary']);
  const fromCsv = Import.parseMrrList([{ number: 'MRR_TYPE1_01', name_last: 'Kavouras', name_first: 'Andreas', 'Number of hours working in MRR': '10' }], 10);
  assert.deepEqual(fromCsv, [{ first: 'Andreas', last: 'Kavouras', hours: 10 }]);
});

test('hour rules can be edited without touching code paths', () => {
  const { instructors } = build({ rules: { rounding: 'down' } });
  assert.equal(instructors.find(i => i.name === 'Tensor, Tina').required, 0);
});

// ---------- integration with the scheduler ----------
function createScheduler() {
  const root = path.join(__dirname, '..');
  const context = {
    console, setTimeout, clearTimeout, window: {},
    document: { body: { classList: { contains: () => false } } }
  };
  vm.createContext(context);
  ['department-import.js', 'scheduler-constraints.js', 'app.js'].forEach(f =>
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), context, { filename: f }));
  return context.window.scheduler;
}

test('loadImportedRoster feeds the scheduler and the schedule respects every block', async () => {
  const scheduler = createScheduler();
  const { instructors, report } = build();
  let previewed = false;
  scheduler.onPreview = () => { previewed = true; };
  scheduler.loadImportedRoster(instructors, report);
  assert.equal(previewed, true);
  assert.equal(scheduler.state.importReport, report);
  assert.ok(scheduler.state.instructors.every(i => i.id));
  await scheduler.runScheduler();
  scheduler.state.instructors.forEach(i => i.assignments.forEach(slot =>
    assert.equal(i.unavail.includes(slot), false, `${i.name} placed in blocked ${slot}`)));
  scheduler.processSingleFile([]);
  assert.equal(scheduler.state.importReport, null, 'stale report cleared on other imports');
});

test('legacy three-file path: co-taught cells and any survey mark are handled', async () => {
  const scheduler = createScheduler();
  const people = [{
    'Recipient Last Name': 'Tensor', 'Recipient First Name': 'Tina',
    'Mark each time slot - 9:30am-10:20am - Monday': 'XX',
    'Mark each time slot - 10:30am-11:20am - Tuesday': '1'
  }];
  const teaching = [
    ['MA 15300'],
    ['  Lec 3', '14954-103', '17', '20', 'Boss, Coordinator (Instr)\nTensor, Tina (Instr)', 'TTh 10:30a-11:45a', 'MATH 215', '24']
  ];
  await scheduler.processFiles(people, [], teaching);
  const tina = scheduler.state.instructors.find(i => i.name === 'Tensor, Tina');
  assert.ok(tina, 'TA in a co-taught cell becomes her own instructor');
  ['Mon 09:30', 'Tue 10:30', 'Tue 11:30', 'Thu 11:30'].forEach(slot =>
    assert.ok(tina.unavail.includes(slot), `missing ${slot}`));
});

test('generateCSV escapes embedded quotes', () => {
  const scheduler = createScheduler();
  scheduler.state.instructors = [{ name: 'O"Brien, Pat', course: 'MRR', required: 1, pref: 'Yes', unavail: [] }];
  assert.match(scheduler.generateCSV(), /"O""Brien, Pat"/);
});
