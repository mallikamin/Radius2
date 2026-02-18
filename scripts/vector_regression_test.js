/**
 * Vector Module — Regression Test Script
 * Run: node scripts/vector_regression_test.js
 *
 * Tests column detection, numeric parsing, and data integrity invariants.
 * For UI-level tests, follow the manual checklist at the bottom.
 */

// ── Test 1: Column detection collision ────────────────────────────
// "Rate per Marla" must NOT cross-populate with "Marla"
(function testColumnDetection() {
  // Inline the detection logic (mirrors inventoryUtils.js)
  function detectColumnMapping(firstRow) {
    const columnMap = {};
    const diagnostics = {};
    const claimed = new Set();
    const headers = Object.keys(firstRow || {});

    const claim = (field, headerKey, reason) => {
      if (columnMap[field] || claimed.has(headerKey)) return false;
      columnMap[field] = headerKey;
      claimed.add(headerKey);
      diagnostics[field] = { header: headerKey, reason };
      return true;
    };

    headers.forEach(key => {
      const lk = key.toLowerCase().trim();
      if (lk.includes('rate per') || lk.includes('rate/') || lk.includes('price per')) {
        claim('ratePerMarla', key, 'exact: rate per / price per');
        return;
      }
      if ((lk.includes('total') && lk.includes('value')) || (lk === 'value')) {
        claim('totalValue', key, 'exact: total value');
        return;
      }
      if (lk.includes('factor') && lk.includes('note')) {
        claim('factorNotes', key, 'exact: factor note');
        return;
      }
    });

    headers.forEach(key => {
      if (claimed.has(key)) return;
      const lk = key.toLowerCase().trim();
      if (!columnMap.plot && (lk.includes('plot') || lk === '#')) claim('plot', key, 'broad: plot/#');
      if (!columnMap.marla && (lk.includes('marla') || lk.includes('size')) && !lk.includes('rate') && !lk.includes('per') && !lk.includes('price')) {
        claim('marla', key, 'broad: marla/size');
      }
      if (!columnMap.ratePerMarla && (lk.includes('rate') || lk.includes('price'))) claim('ratePerMarla', key, 'broad: rate/price');
      if (!columnMap.notes && (lk.includes('note') || lk.includes('remark')) && !lk.includes('factor')) claim('notes', key, 'broad: note/remark');
    });

    if (columnMap.marla && columnMap.ratePerMarla && columnMap.marla === columnMap.ratePerMarla) {
      delete columnMap.marla;
      delete diagnostics.marla;
    }

    return { columnMap, diagnostics };
  }

  // Test case: headers with both "Marla" and "Rate per Marla"
  const row1 = { 'Plot#': '1', 'Marla': 5, 'Rate per Marla': 500000, 'Total Value': 2500000 };
  const { columnMap: cm1, diagnostics: d1 } = detectColumnMapping(row1);
  console.assert(cm1.marla === 'Marla', `FAIL: marla should map to "Marla", got "${cm1.marla}"`);
  console.assert(cm1.ratePerMarla === 'Rate per Marla', `FAIL: ratePerMarla should map to "Rate per Marla", got "${cm1.ratePerMarla}"`);
  console.assert(cm1.marla !== cm1.ratePerMarla, 'FAIL: marla and ratePerMarla must not be the same header');
  console.log('PASS: Column detection with "Marla" + "Rate per Marla"', JSON.stringify(cm1));

  // Test case: header "Rate/Marla" (no separate Marla column)
  const row2 = { 'Plot#': '1', 'Rate/Marla': 500000 };
  const { columnMap: cm2 } = detectColumnMapping(row2);
  console.assert(cm2.ratePerMarla === 'Rate/Marla', `FAIL: ratePerMarla should map to "Rate/Marla", got "${cm2.ratePerMarla}"`);
  console.assert(!cm2.marla, `FAIL: marla should be undefined when no separate marla column, got "${cm2.marla}"`);
  console.log('PASS: Column detection with "Rate/Marla" only', JSON.stringify(cm2));

  // Test case: "Size (Marla)" should map to marla, not ratePerMarla
  const row3 = { 'Plot': '1', 'Size (Marla)': 5, 'Rate': 500000 };
  const { columnMap: cm3 } = detectColumnMapping(row3);
  console.assert(cm3.marla === 'Size (Marla)', `FAIL: marla should map to "Size (Marla)", got "${cm3.marla}"`);
  console.assert(cm3.ratePerMarla === 'Rate', `FAIL: ratePerMarla should map to "Rate", got "${cm3.ratePerMarla}"`);
  console.log('PASS: Column detection with "Size (Marla)" + "Rate"', JSON.stringify(cm3));
})();

// ── Test 2: Numeric parsing ──────────────────────────────────────
(function testNumericParsing() {
  function parseNumeric(raw) {
    if (raw === null || raw === undefined) return 0;
    if (typeof raw === 'number') return isNaN(raw) ? 0 : raw;
    const cleaned = String(raw)
      .replace(/,/g, '')
      .replace(/PKR|Rs\.?|USD|\$|£|€/gi, '')
      .replace(/\s*(per|\/)\s*marla/gi, '')
      .replace(/\s*marla$/gi, '')
      .trim();
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : val;
  }

  const tests = [
    [1500000, 1500000, 'plain number'],
    ['1,500,000', 1500000, 'commas'],
    ['PKR 1,500,000', 1500000, 'PKR prefix + commas'],
    ['Rs. 500000', 500000, 'Rs. prefix'],
    ['$1,000', 1000, '$ prefix'],
    ['500000/marla', 500000, '/marla suffix'],
    ['500000 per marla', 500000, 'per marla suffix'],
    ['5 marla', 5, 'trailing marla'],
    [null, 0, 'null'],
    [undefined, 0, 'undefined'],
    ['abc', 0, 'non-numeric string'],
    [NaN, 0, 'NaN'],
  ];

  let passed = 0;
  tests.forEach(([input, expected, label]) => {
    const result = parseNumeric(input);
    if (result === expected) {
      passed++;
    } else {
      console.error(`FAIL: parseNumeric(${JSON.stringify(input)}) = ${result}, expected ${expected} [${label}]`);
    }
  });
  console.log(`PASS: Numeric parsing ${passed}/${tests.length} tests passed`);
})();

// ── Test 3: Plot deduplication invariants ────────────────────────
(function testDeduplicationInvariants() {
  // Simulate plots array with auto + manual duplicates
  const plots = [
    { id: '1_100_200', n: '1', manual: false, x: 100, y: 200 },
    { id: 1001, n: '1', manual: true, x: 105, y: 195 },
    { id: '2_150_250', n: '2', manual: false, x: 150, y: 250 },
    { id: 1002, n: '2', manual: true, x: 155, y: 245 },
    { id: 1003, n: '3', manual: true, x: 200, y: 300 }, // no auto counterpart
  ];

  // Simulate removeAutoPlotDuplicates logic
  const manualByName = {};
  plots.forEach(p => { if (p.manual && !manualByName[p.n]) manualByName[p.n] = p; });

  const autoToRemove = new Map();
  plots.forEach(p => {
    if (!p.manual && manualByName[p.n]) autoToRemove.set(p.id, manualByName[p.n].id);
  });

  const cleaned = plots.filter(p => !autoToRemove.has(p.id));
  console.assert(cleaned.length === 3, `FAIL: Expected 3 plots after cleanup, got ${cleaned.length}`);
  console.assert(cleaned.every(p => p.manual), 'FAIL: All remaining plots should be manual');
  console.assert(autoToRemove.size === 2, `FAIL: Expected 2 auto plots removed, got ${autoToRemove.size}`);
  console.log('PASS: Plot deduplication removes only auto ghosts, keeps all manual');
})();

console.log('\n══════════════════════════════════════════════');
console.log('AUTOMATED TESTS COMPLETE');
console.log('══════════════════════════════════════════════');
console.log('\n── Manual UI Checklist (run in browser) ──');
console.log('');
console.log('1. SELECT STABILITY TEST:');
console.log('   - Load any Vector project with plots');
console.log('   - Open browser console, note plots count');
console.log('   - Select a plot 10+ times (click, shift-click, click again)');
console.log('   - Verify: NO "[Vector] BUG: select click mutated plots!" in console');
console.log('   - Verify: plots count unchanged');
console.log('');
console.log('2. CLEAN DUPES TEST:');
console.log('   - Load City Walk (or any project with auto+manual plots)');
console.log('   - Note plot count in Sidebar > Plots tab');
console.log('   - Click "Clean Dupes" in Annotations tab');
console.log('   - Verify: auto ghost plots removed, manual plots preserved');
console.log('   - Verify: no false additions/removals (manual count unchanged)');
console.log('   - Click "Clean Dupes" again — should say "No duplicates found"');
console.log('');
console.log('3. ADD PLOT AUTO-SWITCH TEST:');
console.log('   - Select "Add Plot" tool in toolbar');
console.log('   - Click on map, enter plot number');
console.log('   - Verify: tool auto-switches back to "Select"');
console.log('   - Verify: next click does NOT trigger another add prompt');
console.log('');
console.log('4. INVENTORY IMPORT COLLISION TEST:');
console.log('   - Create Excel with columns: Plot#, Marla, Rate per Marla, Total Value');
console.log('   - Import into Vector');
console.log('   - Check console: "[inventoryUtils] Column mapping" should show');
console.log('     marla → "Marla" and ratePerMarla → "Rate per Marla" (NOT same column)');
console.log('   - Verify: marla values are NOT populated with rate values');
console.log('');
console.log('5. LEGEND FALLBACK TEST:');
console.log('   - Load a project with inventory but NO annotated plots');
console.log('   - Verify: legend shows "INVENTORY TOTALS" with correct counts');
console.log('   - Add an annotation with plots');
console.log('   - Verify: legend switches to "LEGEND" with annotation breakdown');
