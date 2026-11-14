# 🗓️ Shift Happens

**Shift Happens** is an intelligent, dynamic web-based staffing and scheduling dashboard designed for clinical and academic rosters. It transforms instructor availability, teaching sections, and coverage requirements into an optimized initial schedule with rich live-editing capabilities.

Built entirely with modern **HTML5**, **CSS3**, and **vanilla JavaScript (ES6+)**, Shift Happens runs **100% client-side** in your browser without requiring any backend server, database, or external setup.

---

## ✨ Key Features

### 🧠 Intelligent Optimization & Constraints
- 🛡️ **Conflict Armor**: Identifies overlaps and unavailability matrices from instructor data to ensure no staff member is ever double-booked or scheduled during blocked hours.
- 🎯 **Dynamic Course Coverage & MRR Engine**: Enforces required core course coverage (e.g., *MA 15300*, *MA 16100*, *STAT 30100*) in every slot. Missing primary courses are automatically covered by MRR staff with dynamic claim labels (e.g., `MRR / MA 15800, MA 16010`).
- 🔁 **Back-to-Back (B2B) Optimization**: Honors individual instructor preferences (`Yes`, `No`, or `No preference`) to either group consecutive teaching hours or spread them out across the week.
- 📊 **Real-Time Schedule Score**: Live composite dashboard metric evaluating **Coverage (40%)**, **Assignment Completeness (30%)**, **B2B Satisfaction (20%)**, and **Schedule Balance (10%)**.
- ⚠️ **Intelligent Warnings & Gap Tracking**: Real-time alerts highlighting uncovered required courses, incomplete staff assignments, and over-assigned hours.
- 🔎 **Feasibility Check**: Before assigning staff, the scheduler identifies impossible hour requests and required courses with no eligible primary or MRR coverage, then explains them in the schedule view.
- 🪪 **Stable Instructor Identity**: Every instructor has a persistent internal ID, so duplicate display names can be scheduled, moved, swapped, saved, and restored independently.

### 🖱️ Interactive Live-Editing & Visual Tools
- 🖐️ **Drag-and-Drop Slot Editing**: Move staff between slots or remove an assignment directly from a calendar card; schedule scores, gaps, hours, and Undo update immediately.
- 🔄 **Direct & Modal Swapping**: Swap assignments by dragging one staff card directly onto another, or use the dedicated **Swap Staff** modal to trade assignments across distant days.
- 👥 **Interactive Staff Roster**: Collapsible sidebar listing all instructors with live assignment progress, B2B satisfaction badges, hover tooltips for scheduled slots and conflicts, and cross-highlighting on hover.
- 🔍 **Click-to-Locate**: Clicking any staff card in the schedule grid automatically scrolls to and highlights that instructor in the roster sidebar.
- 🌡️ **Availability Heatmap**: Visualize staffing depth and vulnerability per slot with a 5-tier color-coded heatmap.
- 🖥️ **Full View Mode**: One-click high-density fullscreen grid that fits the entire weekly schedule onto a single screen with compact badges.
- ⏪ **Infinite Undo**: Complete history stack allowing you to safely undo any manual move, swap, or optimization step.

### 🖨️ Printing, Saving & Exporting
- 📄 **Printer-Friendly Letter Layout**: Dedicated print engine formatted for standard **US Letter paper (landscape, 8.5" × 11")**, fitting the complete schedule onto a single page (or minimal pages) while keeping all instructor names and course badges completely visible without truncation.
- 💾 **Session Save & Restore (JSON)**: Save your active scheduling draft as a `.json` session file to resume editing anytime.
- 📤 **Standalone HTML Export**: Export a self-contained, read-only `.html` calendar with embedded styling, full staff names, and light/dark themes. It contains only the schedule—no editing or print controls.
- 🌓 **Dark & Light Mode**: Seamless theme toggle with automatic system theme detection.

---

## 🧭 Start Workflow

The start screen asks only how you want to begin. After the roster is loaded, the app guides you through review, configuration, and schedule generation.

| Step | What happens |
| :--- | :--- |
| **1. Choose a source** | Upload a consolidated roster CSV, drop the raw department files (Qualtrics + UniTime + MRR list), build a roster manually, or load a saved session. |
| **2. Review the roster** | Check instructors, required hours, preferences, and unavailable slots. |
| **3. Configure the schedule** | Set operating days and times, scheduling priorities, and the courses that require coverage. |
| **4. Generate and refine** | Create the initial schedule, review feasibility and coverage alerts, then drag, swap, save, print, or export. |

For a quick first run, choose **Try sample schedule** from the start screen. It downloads the included math-themed practice roster.

---

## ⚙️ Configurable Time Slots & Coverage

- **Per-Day Slot Customization**: Enable/disable specific days (Mon–Sun) and toggle individual time slots per day.
- **Editable Time Chips & Custom Slots**: Click any time chip to edit its time (HH:MM format) or insert custom time slots.
- **"Copy to All" Replicator**: Quickly replicate one day's time slot configuration across all other days with a single click.
- **Course Coverage Selection**: Select which detected or potential core courses require guaranteed coverage, or add custom course codes (e.g., `STAT 30100`).

---

## 🚀 Quick Start

Because Shift Happens runs entirely client-side, setup requires zero installation:

### Method 1: Double-Click
Simply open `index.html` in any modern web browser (Google Chrome, Mozilla Firefox, Apple Safari, Microsoft Edge).

### Method 2: Local HTTP Server
```bash
# Clone the repository
git clone https://github.com/drjchen1/Shift-Happens.git
cd Shift-Happens

# Start a local static server (optional)
npx serve .
# or
python3 -m http.server 8000
```

---

## 📂 Project Structure

```
Shift-Happens/
├── index.html                  # Main application UI, modal stages, and controller
├── app.js                      # Core scheduling engine, data parsing, optimization algorithms
├── scheduler-constraints.js    # Feasibility analysis and constraint explanations
├── scheduler-ui.js             # Reusable schedule-level UI rendering (feasibility + import summary)
├── department-import.js        # Raw Qualtrics + UniTime + MRR list -> roster, with department rules
├── style.css                   # Responsive layout, light/dark themes, print media queries
├── Shift_Happens_Help.html     # Interactive handbook and operational documentation
├── package.json                # Test runner configuration
├── tests/
│   ├── scheduler.smoke.test.js # Automated unit and regression test suite
│   ├── department-import.test.js # Raw-export import tests (synthetic data only)
│   └── csv.js                  # Tiny CSV reader used by tests
├── anonymized_mrr_scheduler_input.csv # Consolidated example input
└── sample_math_practice.csv    # Small, math-themed practice schedule
```

---

## ✅ Automated Testing

Run the Node.js test suite to verify core scheduler behavior and print stylesheets:

```bash
npm test
```

### Verified Test Coverage:
- ✔️ **Conflict Prevention**: No duplicate slot assignments per person and no blocked-slot assignments.
- ✔️ **Custom Day/Slot Preserving**: Custom day-slot configurations and `getAllSlots()` shapes preserved.
- ✔️ **Live Move & Swap Consistency**: Data integrity between instructor assignment lists and schedule grid state.
- ✔️ **Single-File CSV Parsing**: Auto-detection of required fields, section counts, and normalized B2B preferences.
- ✔️ **Session Serialization**: Correct export and import of `.json` session state.
- ✔️ **Fuzzy Name Matching**: Robust handling of spelling variations and middle-name parsing.
- ✔️ **Core Course Ingestion**: Automatic detection of core courses and calculation of required hours.
- ✔️ **Dynamic MRR Coverage**: Auto-filling missing core courses with MRR staff.
- ✔️ **Custom Required Courses**: User-selected custom courses enforced across all slots.
- ✔️ **Natural Numerical Sorting**: Missing core courses and MRR coverage lists sorted naturally.
- ✔️ **Letter Landscape Print Styles**: Dedicated `@media print` rules for letter landscape with non-clipped names.
- ✔️ **Duplicate-Name Safety**: Stable IDs keep manual moves from affecting another instructor with the same name.
- ✔️ **Feasibility Explanations**: Impossible hour totals and uncovered required subjects are reported before scheduling.
- ✔️ **Repeat File Selection**: The same roster file can be selected again after restarting a session.

---

## 📖 Help & Documentation

For a visual step-by-step walkthrough of all features, open [Shift_Happens_Help.html](Shift_Happens_Help.html) in your browser.

### Scheduling behavior and manual overrides

Availability constraints are hard constraints for automatic scheduling. The feasibility check reports when they make an instructor's requested hours impossible. Manual drag-and-drop and swaps may still be confirmed as overrides when staff have negotiated an exception; these overrides remain visible as availability conflicts in the schedule.

Course coverage, room balance, course variety, and back-to-back preferences are optimization goals. The app uses a constraint-aware, most-constrained-first assignment order and then applies the selected priorities. It does not claim to produce a mathematically global optimum.

### Input and session compatibility

The app accepts the consolidated CSV downloaded from the interface, or the department files.

#### Department files (no hand-editing)

`department-import.js` reads the **untouched** exports:

- **Qualtrics survey export(s)**: all three header rows and all columns. Any mark in the availability grid counts (`X`, `x`, `XX`, `1`). Duplicate submissions collapse to the latest. Several surveys (e.g. main + TA-screening) can be combined.
- **UniTime offerings export** for the whole department. Co-taught cells are split, and every hourly slot a class overlaps is blocked, including classes in non-MRR courses.
- **Special MRR-only TAs**: paste names (one per line, optional hours) or drop the list CSV (`name_last`, `name_first`, hours).

Department rules live in `DEFAULT_RULES` at the top of `department-import.js` (MRR courses, hours per section, rounding, LTL exclusion, MRR-only hours). Faculty are recognized because they never take the TA survey. MA 15300 is normally taught by undergraduate math-education majors and lecturers who neither take the survey nor work in the MRR; they are skipped quietly (`nonSurveyInstructorCourses`). Graduate TAs who fill a 15300 shortfall take the survey, so they are matched and get one MRR hour per two sections. Teaching TAs missing from every survey are still scheduled with only their class times blocked, and they are flagged in the Import summary.

**Privacy:** the raw exports contain phone numbers and PUIDs. `.gitignore` keeps them out of the repository. Never commit them.

The legacy hand-prepared three-file people/MRR/teaching workflow still works. Sessions are saved as JSON and include stable instructor IDs. Older sessions that do not contain IDs can still be opened; they are assigned IDs on import. When old sessions contain duplicate names, re-save the imported session before editing so subsequent actions retain the new identities.

For a quick, low-stakes first run, download [sample_math_practice.csv](sample_math_practice.csv). It contains 16 fictional instructors, a variety of course types and preferences, availability constraints, and MRR staff.

---

## 📝 License

Open-source under the MIT License. Feel free to adapt and use it for your department or clinic!
