/* Department import: builds a Shift Happens roster directly from the raw files
 * the department already produces, so nobody has to hand-edit CSVs.
 *
 *   1. Qualtrics survey export(s), untouched (all three header rows, all columns).
 *      Two surveys (e.g. main survey + TA-screening survey) can be passed together.
 *   2. UniTime "offerings" export, untouched (the whole department).
 *   3. Special MRR-only TAs: either Dom's spreadsheet/CSV (name_last, name_first,
 *      hours) or simply a pasted list of names, one per line.
 *
 * Department rules (Naughton memo) are encoded in DEFAULT_RULES and can be edited:
 *   - Only TAs teaching the listed MRR courses get MRR hours.
 *   - 15300/15800/16010/16020: one hour per two sections; other courses: one per section.
 *   - Faculty never appear in the TA survey, so "not in survey" means "not a TA".
 *   - LTLs do not work in the MRR.
 *   - Special MRR-only TAs work 10 hours.
 *
 * Pure functions only (no DOM). Works in the browser (window.ShiftHappensImport)
 * and in Node tests (module.exports).
 */
(function attachDepartmentImport(global) {
    const DEFAULT_RULES = {
        hoursPerSection: {
            'MA 15300': 0.5,
            'MA 15800': 0.5,
            'MA 16010': 0.5,
            'MA 16020': 0.5,
            'MA 16100': 1,
            'MA 16200': 1,
            'MA 16500': 1,
            'MA 16600': 1,
            'MA 26100': 1
        },
        rounding: 'up',          // 1 section of 15300 -> 1 hour; 3 sections of 16010 -> 2 hours
        mrrOnlyHours: 10,
        excludeLTL: true,
        // Section-size cutoff used to tell TA-run sections from large faculty lectures.
        taSectionMaxLimit: 50,
        // An instructor co-teaching this many sections of one course is the coordinator.
        coordinatorMinSections: 3,
        // Courses normally taught by people who never take the TA survey and never
        // work in the MRR (MA 15300: undergraduate math-ed majors and lecturers).
        // Someone teaching only these courses who is not in the survey is skipped
        // quietly. Graduate TAs filling a shortfall DO take the survey, so they are
        // matched and get MRR hours like anyone else.
        nonSurveyInstructorCourses: ['MA 15300'],
        // TAs who teach an MRR course but are missing from every survey are still
        // scheduled (only teaching times blocked) and flagged for a human to check.
        includeTeachingWithoutSurvey: true
    };

    const DAY_NAMES = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };
    const SURVEY_ROW_TIMES = ['07:30', '08:30', '09:30', '10:30', '11:30', '12:30', '13:30', '14:30', '15:30', '16:30'];
    const SURVEY_COL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

    // ---------- small helpers ----------
    const clean = v => String(v == null ? '' : v).trim();

    function stripAccents(s) {
        return clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function nameTokens(s) {
        return stripAccents(s).toLowerCase().replace(/\(instr\)/g, ' ').replace(/[^a-z\s,'-]/g, ' ')
            .split(/[\s,'-]+/).filter(t => t.length > 0);
    }

    function compact(s) {
        return stripAccents(s).toLowerCase().replace(/[^a-z]/g, '');
    }

    function levenshtein(a, b) {
        if (a === b) return 0;
        const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) dp[0][j] = j;
        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            }
        }
        return dp[a.length][b.length];
    }

    function baseCourse(text) {
        const m = clean(text).match(/^MA\s*(\d{5})/i);
        return m ? `MA ${m[1]}` : null;
    }

    function toMinutes(t) {
        const m = clean(t).toLowerCase().match(/^(\d{1,2}):(\d{2})\s*([ap])?/);
        if (!m) return null;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        if (m[3] === 'p' && h !== 12) h += 12;
        if (m[3] === 'a' && h === 12) h = 0;
        return h * 60 + min;
    }

    function hhmm(minutes) {
        return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    }

    function parseMeetingDays(code) {
        const days = [];
        let s = clean(code);
        // Handle two-letter codes first so "Th"/"Tu"/"Sa"/"Su" are not misread.
        const twoLetter = { Th: 'Thu', Tu: 'Tue', Sa: 'Sat', Su: 'Sun' };
        Object.entries(twoLetter).forEach(([k, v]) => {
            if (s.includes(k)) { days.push(v); s = s.split(k).join(''); }
        });
        const one = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri', S: 'Sat', U: 'Sun' };
        for (const ch of s) if (one[ch]) days.push(one[ch]);
        const order = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        return Array.from(new Set(days)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }

    /* "TTh 10:30a-11:45a" -> { days:[Tue,Thu], start:630, end:705 } */
    function parseMeeting(timeText) {
        const m = clean(timeText).match(/^([A-Za-z]+)\s+(\d{1,2}:\d{2}\s*[ap]?)\s*-\s*(\d{1,2}:\d{2}\s*[ap]?)/i);
        if (!m) return null;
        const start = toMinutes(m[2]);
        let endText = m[3];
        if (!/[ap]\s*$/i.test(endText)) endText += /p\s*$/i.test(m[2]) ? 'p' : 'a';
        const end = toMinutes(endText);
        if (start == null || end == null) return null;
        return { days: parseMeetingDays(m[1]), start, end };
    }

    /* Every hourly slot (":30" starts, 50-minute blocks) that overlaps the meeting. */
    function blockedSlots(meeting) {
        if (!meeting) return [];
        const out = [];
        for (let s = 7 * 60 + 30; s <= 21 * 60 + 30; s += 60) {
            const e = s + 50;
            if (meeting.start < e && meeting.end > s) {
                meeting.days.forEach(d => out.push(`${d} ${hhmm(s)}`));
            }
        }
        return out;
    }

    // ---------- names ----------
    /* Accepts "Last, First Middle" or "First Middle Last". */
    function splitName(raw) {
        const text = clean(raw).replace(/\(instr\)/ig, '').replace(/\s+/g, ' ').trim();
        if (!text) return { first: '', last: '' };
        if (text.includes(',')) {
            const [last, ...rest] = text.split(',');
            return { last: clean(last), first: clean(rest.join(' ')) };
        }
        const parts = text.split(' ');
        if (parts.length === 1) return { first: '', last: parts[0] };
        return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
    }

    function displayName(person) {
        return person.first ? `${person.last}, ${person.first}` : person.last;
    }

    /* Score how well an offerings/MRR name fits a survey person. 0 = no match.
     * Deliberately conservative: a last-name match alone is NOT enough when the
     * first names disagree, so a TA without a survey is reported instead of
     * silently inheriting a classmate's availability. */
    function matchScore(target, person) {
        const tLast = compact(target.last), tFirst = nameTokens(target.first);
        const pLast = compact(person.last), pFirst = nameTokens(person.first);
        const tAll = new Set([...nameTokens(target.last), ...tFirst]);
        const pAll = new Set([...nameTokens(person.last), ...pFirst]);
        const firstCompatible = () => {
            if (!tFirst.length || !pFirst.length) return true;
            if (tFirst.some(t => pFirst.includes(t))) return true;
            const a = compact(target.first), b = compact(person.first);
            if (a && b && (a.startsWith(b) || b.startsWith(a))) return true;
            return levenshtein(tFirst[0], pFirst[0]) <= 1 && tFirst[0].length >= 4;
        };

        // Same last name (accents/hyphens/spaces ignored), compatible first name.
        if (tLast && tLast === pLast && firstCompatible()) return 100;
        // Compound surname shortened on one side ("Moran Lamas" vs "Moran").
        if (tLast && pLast && tLast.length >= 4 && pLast.length >= 4 &&
            (tLast.startsWith(pLast) || pLast.startsWith(tLast)) && firstCompatible() &&
            tFirst.length && pFirst.length) return 85;
        // Survey respondent typed first/last in the wrong boxes.
        if (tAll.size >= 2 && [...tAll].every(t => pAll.has(t)) && [...pAll].every(t => tAll.has(t))) return 90;
        const pFlip = { first: person.last, last: person.first };
        if (compact(pFlip.last) === tLast && nameTokens(pFlip.first).some(t => tFirst.includes(t))) return 90;
        // One-letter typo in the surname, same first name.
        if (tLast.length >= 5 && levenshtein(tLast, pLast) === 1 && tFirst.length && pFirst.length &&
            tFirst.some(t => pFirst.includes(t))) return 75;
        return 0;
    }

    function findPerson(name, people) {
        const target = typeof name === 'string' ? splitName(name) : name;
        let best = null, bestScore = 0, tie = false;
        people.forEach(p => {
            const s = matchScore(target, p);
            if (s > bestScore) { best = p; bestScore = s; tie = false; }
            else if (s && s === bestScore && p !== best) tie = true;
        });
        return { person: best, score: bestScore, ambiguous: tie };
    }

    // ---------- Qualtrics ----------
    function isQualtricsExport(rows) {
        const h = (rows && rows[0]) || [];
        return h.includes('ResponseId') || h.some(c => /^Q1_\d+_\d+$/.test(clean(c)));
    }

    /* rows: array of arrays (Papa.parse with header:false). Returns one record per
     * person (latest response wins when someone submitted twice). */
    function parseQualtrics(rows, sourceName = 'survey') {
        if (!isQualtricsExport(rows)) throw new Error(`${sourceName} does not look like a Qualtrics export`);
        const ids = rows[0].map(clean);
        const labels = (rows[1] || []).map(clean);
        const col = id => ids.indexOf(id);
        const firstCol = (...cands) => cands.map(col).find(i => i >= 0);
        const looksLikeImportRow = r => r.some(c => /^\{"ImportId"/.test(clean(c)));
        const looksLikeLabelRow = r => clean(r[col('ResponseId')]) === 'Response ID' || clean(r[0]) === 'Start Date';

        // Map availability columns -> slot ids using the human label when present
        // ("- 7:30am-8:20am - Monday"), otherwise Qualtrics' Q1_row_col numbering.
        const gridCols = [];
        ids.forEach((id, i) => {
            const lab = labels[i] || '';
            const m = lab.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*-\s*\d{1,2}:\d{2}\s*(?:am|pm)\s*-\s*(\w+)\s*$/i);
            if (m && DAY_NAMES[m[4].toLowerCase()]) {
                const start = toMinutes(`${m[1]}:${m[2]}${m[3][0]}`);
                gridCols.push({ i, slot: `${DAY_NAMES[m[4].toLowerCase()]} ${hhmm(start)}` });
                return;
            }
            const q = id.match(/^Q1_(\d+)_(\d+)$/);
            if (q && SURVEY_ROW_TIMES[q[1] - 1] && SURVEY_COL_DAYS[q[2] - 1]) {
                gridCols.push({ i, slot: `${SURVEY_COL_DAYS[q[2] - 1]} ${SURVEY_ROW_TIMES[q[1] - 1]}` });
            }
        });

        const iLast = firstCol('RecipientLastName'), iFirst = firstCol('RecipientFirstName');
        const iELast = firstCol('embedded_data_Last name'), iEFirst = firstCol('embedded_data_First name');
        const iEmail = firstCol('RecipientEmail'), iEEmail = firstCol('embedded_data_Email');
        const iPuid = firstCol('embedded_data_puid'), iPuid2 = firstCol('Q3_3');
        const iSig = firstCol('Q10_1'), iDate = firstCol('RecordedDate', 'EndDate');
        const iPref = firstCol('Q5'), iStatus = firstCol('Q28'), iRole = firstCol('Q6');
        const iNotes = [firstCol('Q2'), firstCol('Q18')].filter(i => i >= 0);
        const iFinished = firstCol('Finished');

        const byKey = new Map();
        rows.slice(1).forEach(r => {
            if (!r || r.every(c => !clean(c))) return;
            if (looksLikeImportRow(r) || looksLikeLabelRow(r)) return;
            if (iFinished >= 0 && /^false$/i.test(clean(r[iFinished]))) return;
            const get = i => (i >= 0 ? clean(r[i]) : '');

            let last = get(iLast) || get(iELast), first = get(iFirst) || get(iEFirst);
            if (!last && get(iSig)) ({ first, last } = splitName(get(iSig)));
            if (!last) return;

            const unavail = new Set();
            gridCols.forEach(({ i, slot }) => { if (clean(r[i])) unavail.add(slot); }); // "X", "x", "XX", "1"...

            const email = (get(iEmail) || get(iEEmail)).toLowerCase();
            const puid = (get(iPuid) || get(iPuid2)).replace(/\D/g, '');
            const role = get(iRole), status = get(iStatus);
            const rec = {
                first, last, email, puid,
                signature: get(iSig),
                pref: /^yes/i.test(get(iPref)) ? 'Yes' : /^no$/i.test(get(iPref)) ? 'No' : 'No preference',
                unavail,
                isLTL: /limited-term-lecturer/i.test(role),
                status, role,
                notes: iNotes.map(get).filter(Boolean).join(' | '),
                recorded: get(iDate),
                source: sourceName
            };
            const key = puid || email || compact(`${last}${first}`);
            const prev = byKey.get(key);
            if (!prev || rec.recorded >= prev.recorded) {
                if (prev) rec.replaced = (prev.replaced || 0) + 1;
                byKey.set(key, rec);
            }
        });
        return Array.from(byKey.values());
    }

    // ---------- UniTime offerings ----------
    function isOfferingsExport(rows) {
        return (rows || []).slice(0, 5).some(r => r.some(c => /Offered Courses/i.test(clean(c)))) ||
            (rows || []).slice(0, 5).some(r => r.map(clean).includes('External Id') && r.map(clean).includes('Instructor'));
    }

    /* Returns one record per section that has a meeting or an instructor. */
    function parseOfferings(rows) {
        // UniTime column order, used if the header row was trimmed off.
        let header = ['', 'External Id', 'Enrollment', 'Limit', 'Instructor', 'Time', 'Room', 'Room Cap', 'Wait-Listing'];
        let course = null, offered = true;
        const sections = [];
        (rows || []).forEach(r => {
            const cells = r.map(c => String(c == null ? '' : c));
            const first = clean(cells[0]);
            if (/not offered courses/i.test(first)) { offered = false; return; }
            if (/offered courses/i.test(first)) { offered = true; return; }
            if (cells.map(clean).includes('Instructor') && cells.map(clean).includes('Time')) {
                header = cells.map(clean); return;
            }
            if (!offered || !header) return;
            const iInstr = header.indexOf('Instructor'), iTime = header.indexOf('Time');
            const iRoom = header.indexOf('Room'), iExt = header.indexOf('External Id');
            const iLimit = header.indexOf('Limit');
            const bc = baseCourse(first);
            if (bc && !/^\s/.test(cells[0])) { course = { code: bc, label: first.split('\n')[0].trim() }; return; }
            if (!course) return;
            const external = clean(cells[iExt]);
            if (!external) return; // configuration / subpart header rows
            const instructors = String(cells[iInstr] || '').split(/\n+/)
                .map(s => s.replace(/\(instr\)/ig, '').trim()).filter(Boolean);
            sections.push({
                course: course.code,
                courseLabel: course.label,
                section: first,
                external,
                type: (first.match(/^(\w+)/) || [])[1] || '',
                instructors,
                time: clean(cells[iTime]),
                meeting: parseMeeting(cells[iTime]),
                room: clean(cells[iRoom]),
                limit: parseInt(clean(cells[iLimit]), 10) || null
            });
        });
        return sections;
    }

    // ---------- MRR-only list ----------
    /* Accepts CSV rows with headers (name_last/name_first/hours, or Name/Hours),
     * OR plain text with one name per line ("Kavouras, Andreas" / "Andreas Kavouras 10"). */
    function parseMrrList(input, defaultHours) {
        const out = [];
        if (Array.isArray(input)) {
            input.forEach(row => {
                if (!row || typeof row !== 'object') return;
                const keys = Object.keys(row);
                const find = (...c) => keys.find(k => c.some(x => k.toLowerCase().replace(/[^a-z]/g, '').includes(x)));
                const kLast = find('namelast', 'lastname', 'last'), kFirst = find('namefirst', 'firstname', 'first');
                const kName = find('name'), kHours = find('hours', 'hrs');
                let last = kLast ? clean(row[kLast]) : '', first = kFirst ? clean(row[kFirst]) : '';
                if (!last && kName) ({ first, last } = splitName(row[kName]));
                if (!last) return;
                const h = parseFloat(kHours ? row[kHours] : '');
                out.push({ first, last, hours: Number.isFinite(h) && h > 0 ? h : defaultHours });
            });
            return out;
        }
        String(input || '').split(/\r?\n/).forEach(line => {
            const t = line.replace(/\t+/g, ' ').trim();
            if (!t || /^name/i.test(t)) return;
            const hm = t.match(/[\s,;]+(\d{1,2}(?:\.\d+)?)\s*(?:h|hrs?|hours?)?\s*$/i);
            const hours = hm ? parseFloat(hm[1]) : defaultHours;
            const namePart = hm ? t.slice(0, hm.index) : t;
            const n = splitName(namePart.replace(/[;]+$/, ''));
            if (n.last) out.push({ ...n, hours });
        });
        return out;
    }

    // ---------- roster ----------
    function hoursFor(byCourse, rules) {
        let total = 0;
        Object.entries(byCourse).forEach(([course, n]) => { total += n * (rules.hoursPerSection[course] || 0); });
        if (rules.rounding === 'down') return Math.floor(total + 1e-9);
        if (rules.rounding === 'nearest') return Math.round(total);
        return Math.ceil(total - 1e-9);
    }

    /**
     * buildRoster({ surveys: [rows...], offerings: rows, mrr: rows|text, rules })
     * -> { instructors, report }
     * instructors are in the same shape processSingleFile/processFiles produce.
     */
    function buildRoster({ surveys = [], surveyNames = [], offerings = [], mrr = '', rules = {} } = {}) {
        const R = { ...DEFAULT_RULES, ...rules, hoursPerSection: { ...DEFAULT_RULES.hoursPerSection, ...(rules.hoursPerSection || {}) } };
        const people = [];
        surveys.forEach((rows, i) => people.push(...parseQualtrics(rows, surveyNames[i] || `survey ${i + 1}`)));
        const sections = parseOfferings(offerings);
        const mrrCourses = new Set(Object.keys(R.hoursPerSection).filter(c => R.hoursPerSection[c] > 0));

        const report = {
            surveyResponses: people.length,
            sectionsRead: sections.length,
            included: [],
            mrrOnly: [],
            skippedNotInSurvey: [],      // usually faculty / coordinators
            skippedLTL: [],
            skippedUndergrad: [],         // e.g. MA 15300 undergraduate instructors
            teachingNoSurvey: [],         // must be checked by a human
            fuzzyMatches: [],
            ambiguousMatches: [],
            sectionsWithoutInstructor: [],
            mrrNotInSurvey: [],
            duplicateResponses: people.filter(p => p.replaced).map(displayName)
        };

        // Gather every section each instructor teaches (all courses, for blocking).
        const byInstructor = new Map();
        sections.forEach(sec => {
            if (!sec.instructors.length) {
                if (mrrCourses.has(sec.course)) report.sectionsWithoutInstructor.push(`${sec.course} ${sec.section} (${sec.time || 'no time'})`);
                return;
            }
            sec.instructors.forEach(name => {
                if (!byInstructor.has(name)) byInstructor.set(name, []);
                byInstructor.get(name).push(sec);
            });
        });

        // Coordinators co-teach many sections of one course with different TAs.
        const coordinators = new Set();
        byInstructor.forEach((secs, name) => {
            const counts = {};
            secs.filter(s => s.instructors.length > 1).forEach(s => { counts[s.course] = (counts[s.course] || 0) + 1; });
            if (Object.values(counts).some(n => n >= R.coordinatorMinSections)) coordinators.add(name);
        });
        const taSized = s => s.limit == null || s.limit <= R.taSectionMaxLimit;

        const instructors = [];
        byInstructor.forEach((secs, name) => {
            const mrrSecs = secs.filter(s => mrrCourses.has(s.course));
            if (!mrrSecs.length) return; // teaches nothing that carries MRR hours

            const byCourse = {};
            mrrSecs.forEach(s => { byCourse[s.course] = (byCourse[s.course] || 0) + 1; });
            const courseLabel = Object.entries(byCourse).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
                .map(([c]) => c).join(' / ');
            const summary = `${name} — ${Object.entries(byCourse).map(([c, n]) => `${c} ×${n}`).join(', ')}`;
            const required = hoursFor(byCourse, R);
            const teachingBlocks = new Set();
            secs.forEach(s => blockedSlots(s.meeting).forEach(x => teachingBlocks.add(x)));

            if (coordinators.has(name)) { report.skippedNotInSurvey.push(`${summary} (coordinator)`); return; }

            const { person, score, ambiguous } = findPerson(name, people);
            if (!person) {
                // Faculty never take the TA survey. A sole instructor of small sections
                // is almost certainly a TA whose survey is missing (e.g. the separate
                // TA-screening survey was not uploaded) — that is worth a human look.
                if (!mrrSecs.every(taSized)) { report.skippedNotInSurvey.push(summary); return; }
                if (mrrSecs.every(s => R.nonSurveyInstructorCourses.includes(s.course))) {
                    report.skippedUndergrad.push(summary);
                    return;
                }
                report.teachingNoSurvey.push(summary);
                if (!R.includeTeachingWithoutSurvey) return;
                instructors.push({
                    name, course: courseLabel, sections: mrrSecs.length, required,
                    unavail: Array.from(teachingBlocks).sort(), isMRR: false, pref: 'No preference',
                    assignments: [], notes: '', email: '',
                    importWarning: 'Not found in any uploaded survey — only teaching times are blocked.'
                });
                report.included.push({ name, summary, required, notes: '', warning: true });
                return;
            }
            if (ambiguous) report.ambiguousMatches.push(`${name} → ${displayName(person)} (check)`);
            else if (score < 100) report.fuzzyMatches.push(`${name} → ${displayName(person)}`);
            if (R.excludeLTL && person.isLTL) { report.skippedLTL.push(summary); return; }

            const unavail = new Set([...person.unavail, ...teachingBlocks]);
            instructors.push({
                name, course: courseLabel, sections: mrrSecs.length, required,
                unavail: Array.from(unavail).sort(), isMRR: false, pref: person.pref, assignments: [],
                notes: person.notes, email: person.email,
                importWarning: ambiguous ? `Survey match is ambiguous (${displayName(person)}).` : ''
            });
            report.included.push({ name, summary, required, notes: person.notes });
        });

        // MRR-only TAs
        const mrrList = parseMrrList(mrr, R.mrrOnlyHours);
        mrrList.forEach(m => {
            const { person } = findPerson({ first: m.first, last: m.last }, people);
            const name = displayName(m);
            if (!person) report.mrrNotInSurvey.push(name);
            instructors.push({
                name, course: 'MRR', sections: m.hours, required: m.hours,
                unavail: person ? Array.from(person.unavail).sort() : [], isMRR: true,
                pref: person ? person.pref : 'No preference', assignments: [],
                notes: person ? person.notes : '', email: person ? person.email : ''
            });
            report.mrrOnly.push({ name, required: m.hours, notes: person ? person.notes : '' });
            if (!person) instructors[instructors.length - 1].importWarning = 'Not found in any uploaded survey \u2014 no availability on file.';
        });

        return { instructors, report, people, sections };
    }

    const api = {
        DEFAULT_RULES, isQualtricsExport, isOfferingsExport, parseQualtrics, parseOfferings,
        parseMrrList, parseMeeting, blockedSlots, splitName, findPerson, buildRoster
    };
    global.ShiftHappensImport = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
