# Plot Balloting UI/UX Mockups (Layman Version)

**Author:** Malik Amin  
**Purpose:** Show admin-facing visual concepts for different balloting methods before final COO decision.

---

## 1) Plain-Language Goal

This module helps us do plot allocation in a way people can trust.

- Some plots are **Selected** (already reserved for specific investors/brokers).
- Remaining plots are **Elected** (allocated by balloting to eligible buyers).
- System should look fair, be easy to explain, and produce printable proof.

---

## 2) Shared Screen Flow (All Methods)

Every method uses the same 6-step journey:

1. **Create Balloting Event**
2. **Upload/Confirm Plot Inventory (Marla-wise)**
3. **Mark Selected Plots (Reserved)**
4. **Freeze Eligible Buyer List**
5. **Run Balloting**
6. **Publish Results + Download PDF/CSV**

---

## 3) Core Admin Screens (Common Template)

### Screen A: Event Dashboard

**What admin sees**
- Project name, block, event date
- Total plots, selected plots, elected plots
- Eligible buyers count (by marla)
- Status badges: `Draft -> Locked -> Executed -> Published`

**Wireframe**
```text
+--------------------------------------------------------------+
| Balloting Event: Sitara Square - Block A    [Draft]         |
| Date: 20 Mar 2026   Method: Option A   Seed: (pending)      |
+--------------------------------------------------------------+
| 5 Marla: Plots 120 | Selected 15 | Elected 105 | Buyers 104 |
| 10 Marla: Plots 40 | Selected  4 | Elected  36 | Buyers  36 |
+--------------------------------------------------------------+
| [1 Setup] [2 Selected] [3 Buyer Pool] [4 Lock] [5 Run] [6 Publish] |
+--------------------------------------------------------------+
```

### Screen B: Selected Plot Manager

**What admin does**
- Pick a plot and assign to investor/broker directly
- Must add reason (VIP, broker incentive, management, legal hold)
- Two-approval flow for transparency

**Wireframe**
```text
+---------------- Selected Plots ------------------------------+
| Plot # | Marla | Assigned To     | Type    | Reason  | Status|
| A-101  | 5     | BRK-0009        | Broker  | Incentive|Approved|
| A-115  | 5     | CUST-0211       | Investor| VIP      |Pending |
| A-208  | 10    | COMPANY-HOLD    | Internal| Legal    |Approved|
+--------------------------------------------------------------+
| [Add Selection] [Bulk Upload CSV] [Request Approval]        |
+--------------------------------------------------------------+
```

### Screen C: Eligible Buyer Pool

**What admin sees**
- Buyers grouped by marla size
- Payment/EOI eligibility status
- Exclusions with reason

**Wireframe**
```text
+---------------- Eligible Buyers (5 Marla) -------------------+
| Buyer ID   | Name           | EOI Status | Payment | Eligible|
| CUST-0301  | Ahmed Raza     | Cleared    | Partial | Yes     |
| CUST-0312  | Sana Javed     | Pending    | None    | No      |
| CUST-0331  | Bilal Hassan   | Cleared    | Full    | Yes     |
+--------------------------------------------------------------+
| [Apply Rules] [View Excluded] [Export List]                 |
+--------------------------------------------------------------+
```

### Screen D: Lock Snapshot

**Purpose**
- Final freeze before draw
- Shows exact counts and warns no further edits

```text
You are about to LOCK this event.
After lock: no edits to selected plots, buyer pool, or inventory.

[ ] I confirm eligibility list is final
[ ] I confirm selected plots are approved

[Lock Event]
```

### Screen E: Draw Console

**Purpose**
- Run method-specific algorithm
- Show live progress
- Save seed and logs

```text
Method: Option A (Simple Shuffle)
Seed: 2026-03-20-1900-Sitara-A

[Run Balloting]
Progress: 5 Marla 78/104 assigned...
```

### Screen F: Results & Publish

**Purpose**
- Final buyer -> plot mapping
- Waitlist
- Download official documents

```text
Assigned: 140 | Waitlist: 3 | Unassigned Plots: 2

[Download PDF] [Download CSV] [Publish Notice] [Print Summary]
```

---

## 4) Method-Wise Mockup Variants

## Option A: Simple Random Shuffle (Most Transparent)

**Layman explanation:**  
We shuffle both lists fairly and match them one by one, like pairing two shuffled decks.

**UI differences**
- Minimal controls
- One click run
- Strong “fair and simple” messaging

```text
Option A Panel
- Group by Marla
- Use seed
- Shuffle buyers + plots
- Auto-pair
```

**Best for:** Public trust, easy explanation, low confusion.

---

## Option B: Lottery Draw Style (Live Event Feel)

**Layman explanation:**  
Buyers are called one by one; each “draws” from remaining plots digitally.

**UI differences**
- Big-screen mode
- Animated “draw” button
- Voice/MC mode for event host

```text
Now Drawing: CUST-0320 (Ahsan Ali)
Drawn Plot: A-149 (5 Marla)
[Next Draw]
```

**Best for:** Stage/live event presentation.

---

## Option C: Weighted Balloting (Priority-Based)

**Layman explanation:**  
Some buyers get higher chance due to policy (early payment, full payment, etc.).

**UI differences**
- Rule builder for points/tickets
- Clear policy preview before run
- “Why this buyer got this chance” trace

```text
Ticket Rules
- Full payment: +3
- Early EOI: +2
- Broker campaign: +1
```

**Best for:** Rewarding priority behavior, but must be explained carefully.

---

## Option D: Tiered Balloting (Balanced Model)

**Layman explanation:**  
First we allocate premium plots in a priority round, then run general round for all remaining.

**UI differences**
- Two-step draw wizard
- Premium vs standard plot tagging
- Priority buyer filter screen

```text
Round 1: Premium Plots vs Priority Buyers
Round 2: Remaining Plots vs Remaining Buyers
```

**Best for:** Balance between fairness and business priority.

---

## 5) “Selected vs Elected” Visual Design Pattern

Use color and labels consistently:

- **Selected (Reserved):** Gold badge, lock icon
- **Elected (Balloting Pool):** Blue badge, shuffle icon
- **Assigned:** Green badge
- **Waitlist:** Orange badge
- **Ineligible:** Gray badge

---

## 6) Recommended First Rollout UX

For V1, keep it simple:

1. Launch with **Option A**
2. Include **Live View** from Option B style
3. Keep Option D as phase-2 enhancement
4. Avoid Option C in first release unless COO explicitly wants weighted policy

---

## 7) Admin Questions to Ask Before Final Selection

1. What maximum % of plots can be marked as Selected (reserved)?
2. Should premium plots be mixed or separately balloted?
3. Do we allow one event only, or phased events by block?
4. Are post-result overrides allowed? If yes, who approves?
5. Is this a live public event or internal operation?
6. Should brokers have reserved quota rights?

---

## 8) Deliverables This Mockup Supports Later

- Product requirement document (PRD)
- Backend data model (balloting_event, selected_allocations, results, logs)
- Frontend pages and components
- PDF result format
- Audit and compliance workflow

---

## 9) Quick Comparison (Non-Technical)

| Option | Easy to Explain | Looks Fair to Public | Business Control | Complexity |
|---|---|---|---|---|
| A: Shuffle | High | High | Medium | Low |
| B: Lottery UI | High | High | Medium | Medium |
| C: Weighted | Medium | Medium/Low | High | High |
| D: Tiered | Medium/High | High | High | Medium/High |

**Practical recommendation:** Start with **A**, keep **D** ready for policy-driven upgrade.

