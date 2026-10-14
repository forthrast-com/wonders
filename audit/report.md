# World Heritage Register — launch audit

Date: 14 October 2026. Target: https://wonders.forthrast.com/
Scope: first visit, discovery, recording visits, persistence, register, sharing, mobile and keyboard usability.
Browser: isolated agent-browser Chrome session `wonders-audit`.
Baseline: commit `a171079`; deployed HTML, JavaScript and CSS match the worktree byte-for-byte (SHA-256).

## Verdict

Audit in progress.

## Findings

### ISSUE-001 — browser-only saving is never explained

Severity: high (launch trust/data-retention risk). Category: UX.

The homepage, register dialog and About dialog do not explain that visits live only in this browser. There is no visible export/import or restore flow. Save Card produces an image; Copy List is not an advertised restorable backup. Users investing time in a register can reasonably expect it to follow them to another device or survive clearing browser data.

Evidence: [register](screenshots/register.png), [About](screenshots/about.png), [homepage](screenshots/initial.png). Browser storage inspection confirms the two test visits are in `whr.register.v1`. Reload preserves them; this is not a finding of reload data loss. Repro video: N/A (missing explanatory UI).

Before broad launch: show “Saved on this browser only” beside the count or in the register, explain clearing site data, and add a portable export/import backup. Sync is not necessary to fix the expectation mismatch.

### ISSUE-002 — the landing screen does not name or explain the product

Severity: medium. Category: onboarding/content.

The first viewport starts with a zero counter, “Sites visited”, a map and “Form WHC-72/B · Property docket”. “World Heritage Register” exists in the browser title but there is no visible product heading or plain-language introduction. The footer explains AI authorship and non-affiliation more clearly than the main interface explains its purpose. New visitors arriving outside a rich link preview must infer what the collection represents and what to do first.

Evidence: [initial desktop screenshot](screenshots/initial.png). Repro video: N/A.

Add a short first-run line: “Your World Heritage register. Find places you’ve visited, tick them off, then share your map.” Keep the bureaucratic visual character; give newcomers one plain-language foothold.

## Checks and limitations

- HTTPS homepage returned HTTP 200.
- Initial page rendered without browser console errors.
- Initial desktop viewport: 1440 × 1000.
