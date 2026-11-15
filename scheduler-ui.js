/* Small UI boundary for shared, schedule-level feedback. Keeping this out of
 * index.html lets rendering behavior evolve without touching page structure. */
(function attachScheduleUI(global) {
    function renderFeasibilityReport(state) {
        const alertArea = document.getElementById('schedule-alerts');
        if (!alertArea) return;
        alertArea.querySelectorAll('.feasibility-alert').forEach(alert => alert.remove());
        const report = state.feasibilityReport;
        if (!report || !report.issues || !report.issues.length) return;

        const alert = document.createElement('div');
        alert.className = 'feasibility-alert';
        alert.style.cssText = 'background: #fffbeb; border: 1px solid #fbbf24; color: #92400e; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px;';
        const heading = document.createElement('strong');
        heading.textContent = 'Scheduling constraints need attention';
        const details = document.createElement('div');
        details.style.cssText = 'font-size: 0.82rem; margin-top: 4px;';
        details.textContent = report.issues.map(issue => issue.message).join(' ');
        alert.append(heading, details);
        alertArea.appendChild(alert);
    }

    /* Summary of what the department import did, shown above the roster review.
     * Problems a human must check are open by default; routine skips are folded. */
    function renderImportReport(report) {
        const host = document.getElementById('import-report');
        if (!host) return;
        host.innerHTML = '';
        if (!report) return;

        const esc = value => String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const label = item => typeof item === 'string' ? item : (item.summary || item.name);
        const hours = [...report.included, ...report.mrrOnly].reduce((sum, item) => sum + Number(item.required || 0), 0);

        const groups = [
            { title: 'Teaching TAs not found in any survey (only their class times are blocked)', items: report.teachingNoSurvey, warn: true,
              hint: 'In the fall, make sure both surveys (continuing TAs and TA screening) were added. Otherwise enter their unavailable times below.' },
            { title: 'MRR-only TAs not found in any survey', items: report.mrrNotInSurvey, warn: true },
            { title: 'No MRR-only TAs entered', items: report.noMrrOnly ? ['Add them with "Add Staff" below, or go back and paste their names.'] : [], warn: true },
            { title: 'Ambiguous name matches', items: report.ambiguousMatches, warn: true },
            { title: 'Survey availability entries that could not be read', items: report.unreadableAvailability, warn: true },
            { title: 'MRR-course sections with no instructor in UniTime', items: report.sectionsWithoutInstructor, warn: true },
            { title: 'Skipped: faculty, coordinators, large lectures (not in the TA survey)', items: report.skippedNotInSurvey },
            { title: 'Skipped: limited-term lecturers', items: report.skippedLTL },
            { title: 'Skipped: MA 15300 undergraduate instructors (no survey, no MRR)', items: report.skippedUndergrad },
            { title: 'Matched despite name differences', items: report.fuzzyMatches },
            { title: 'Repeat survey responses (latest kept)', items: report.duplicateResponses },
            { title: 'Included teaching TAs', items: report.included.map(i => `${label(i)} \u2192 ${i.required} h`) },
            { title: 'Included MRR-only TAs', items: report.mrrOnly.map(i => `${i.name} \u2192 ${i.required} h`) }
        ].filter(g => g.items && g.items.length);

        const warnCount = groups.filter(g => g.warn).reduce((n, g) => n + g.items.length, 0);
        const box = document.createElement('div');
        box.style.cssText = 'border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; font-size: 0.85rem;';
        box.innerHTML = `
            <div style="font-weight: 700; margin-bottom: 6px;">Import summary</div>
            <div style="color: var(--text-muted); margin-bottom: 8px;">
                ${report.surveyResponses} survey responses (${report.surveyPeople} people) and ${report.sectionsRead} sections read &rarr;
                <strong>${report.included.length}</strong> teaching TAs + <strong>${report.mrrOnly.length}</strong> MRR-only TAs,
                ${hours} MRR hours in total.
                ${warnCount
                    ? `<span style="color: #b45309; font-weight: 600;">${warnCount} item(s) need a look.</span>`
                    : '<span style="color: var(--success); font-weight: 600;">Nothing needs attention.</span>'}
            </div>
            ${groups.map(g => `
                <details ${g.warn ? 'open' : ''} style="margin-top: 6px;">
                    <summary style="cursor: pointer; font-weight: 600; ${g.warn ? 'color: #b45309;' : ''}">${g.warn ? '&#9888; ' : ''}${esc(g.title)} (${g.items.length})</summary>
                    ${g.hint ? `<div style="color: var(--text-muted); margin: 4px 0 0 16px;">${esc(g.hint)}</div>` : ''}
                    <ul style="margin: 4px 0 0 28px; max-height: 180px; overflow-y: auto;">
                        ${g.items.map(item => `<li>${esc(label(item))}</li>`).join('')}
                    </ul>
                </details>`).join('')}
        `;
        host.appendChild(box);
    }

    global.ShiftHappensUI = { renderFeasibilityReport, renderImportReport };
})(window);
