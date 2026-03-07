# Balloting Documentation & Reference Notes

Author: Malik Amin  
Created: 2026-03-03  
Purpose: Permanent internal reference for plot balloting design, policy discussion, and mockup review.

---

## 1) Objective

Design a fair and transparent mechanism to assign specific plot numbers to eligible buyers/investors/brokers where booking exists by marla category but exact plot is not yet assigned.

Model has two lanes:
- Selected lane: pre-assigned reserved plots
- Elected lane: balloted plots (algorithmic assignment)

---

## 2) Common Balloting Flow

1. Create event (project/block/date)
2. Confirm marla-wise inventory
3. Mark selected (reserved) plots with reason
4. Freeze eligible buyer pool
5. Run algorithmic draw
6. Publish results + exports (PDF/CSV/log)

---

## 3) Method Options Discussed

### Option A - Simple Shuffle
- Shuffle eligible buyers and elected plots (within marla group)
- Pair by index
- Best for transparency, trust, and clean auditability
- Recommended for v1

### Option B - Lottery Draw Style
- Sequential digital draw (live event style)
- Same fairness logic, more ceremony-focused UX
- Good for public-facing events

### Option C - Weighted Balloting
- Buyers receive extra chance based on policy (full payment, early EOI, etc.)
- Strong business control but higher explainability burden
- Requires strict pre-published rule policy

### Option D - Tiered Balloting
- Round 1: premium plots vs priority buyers
- Round 2: remaining plots vs remaining buyers
- Balanced fairness and policy control

---

## 4) Recommended Practical Path

For first production rollout:
1. Adopt Option A as base algorithm
2. Keep Option B visual/live draw mode for event presentation
3. Keep Option D as planned phase-2 enhancement
4. Avoid Option C until formal policy/legal comfort is confirmed

---

## 5) Governance Guardrails

- Snapshot lock before draw (no pool edits after lock)
- Selected plot reason is mandatory
- Selected lane cap per marla/block should be policy-defined
- Maker-checker approval for selected assignments
- Seed storage for reproducibility
- Full immutable audit log for event actions
- Post-result override allowed only with dual approval + reason logging

---

## 6) Mismatch Handling Rules

- Buyers > plots: automatic seeded waitlist
- Plots > buyers: leftover inventory remains available
- Ineligible/uncleared payments: excluded before lock
- Absent buyer in live event (if Option B): move to hold queue by policy

---

## 7) Exports / Evidence Pack

Every event should generate:
- Signed result PDF
- CSV mapping (buyer -> plot)
- Snapshot summary (counts, marla groups, lock timestamp)
- Seed and algorithm version
- Selected list + reasons + approvers
- Full action log (lock/run/publish/override)

---

## 8) Key COO Questions (for final policy sign-off)

1. Maximum reserved percentage per marla/block?
2. Premium plots mixed or separate?
3. One-time or phased block-wise events?
4. Broker quota policy (if any)?
5. Post-ballot override permissions?
6. Public live event or back-office only?
7. Tie-break and dispute handling timeline?

---

## 9) Mockup File Index

- `mockups/balloting_methods_overview.html`
- `mockups/balloting_option_a_shuffle.html`
- `mockups/balloting_option_b_lottery.html`
- `mockups/balloting_option_c_weighted.html`
- `mockups/balloting_option_d_tiered.html`
- `mockups/BALLOTING_UI_MOCKUPS_MALIK_AMIN.md`

---

## 10) Next Editing Notes

When refining this document later, update:
- Final selected method
- Final selected cap rule
- Final approval chain (roles/names)
- Final exception/override SOP
- Final public communication template
