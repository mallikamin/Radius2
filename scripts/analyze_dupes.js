const fs = require('fs');
const d = JSON.parse(fs.readFileSync('C:/Users/Malik/Downloads/CITY WALK_2026-02-18.json', 'utf8'));

const byName = {};
d.plots.forEach(p => {
  if (!byName[p.n]) byName[p.n] = [];
  byName[p.n].push(p);
});

let bothManual = 0, autoVsManual = 0, bothAuto = 0;
Object.values(byName).forEach(arr => {
  if (arr.length > 1) {
    const m = arr.filter(p => p.manual);
    const a = arr.filter(p => !p.manual);
    if (m.length > 1) bothManual++;
    if (a.length > 1) bothAuto++;
    if (m.length >= 1 && a.length >= 1) autoVsManual++;
  }
});

console.log('=== DUPE ANALYSIS ===');
console.log('Total plots:', d.plots.length);
console.log('  manual:true  =', d.plots.filter(p => p.manual).length);
console.log('  manual:false =', d.plots.filter(p => !p.manual).length);
console.log('Unique names:', Object.keys(byName).length);
console.log('');
console.log('Dupe pairs: both manual:', bothManual);
console.log('Dupe pairs: auto vs manual:', autoVsManual);
console.log('Dupe pairs: both auto:', bothAuto);

// Auto plots that have NO matching manual plot
const autoOnly = d.plots.filter(p => !p.manual).filter(p => {
  return !d.plots.some(q => q.manual && q.n === p.n);
});
console.log('');
console.log('Auto plots with NO matching manual:', autoOnly.length);
if (autoOnly.length > 0) {
  console.log('Their names:', autoOnly.map(p => p.n).join(', '));
}

// Show a sample pair — same name, auto vs manual, compare coords
console.log('');
console.log('=== SAMPLE PAIRS (auto vs manual with same name) ===');
let shown = 0;
for (const [name, arr] of Object.entries(byName)) {
  if (arr.length === 2 && shown < 5) {
    const auto = arr.find(p => !p.manual);
    const manual = arr.find(p => p.manual);
    if (auto && manual) {
      const dx = Math.abs(auto.x - manual.x);
      const dy = Math.abs(auto.y - manual.y);
      console.log(`Plot "${name}": auto(${auto.x.toFixed(0)},${auto.y.toFixed(0)} ${auto.w}x${auto.h}) vs manual(${manual.x.toFixed(0)},${manual.y.toFixed(0)} ${manual.w}x${manual.h}) dist=${Math.sqrt(dx*dx+dy*dy).toFixed(0)}`);
      shown++;
    }
  }
}

// Check if any manual:true plots are exact positional duplicates of each other
console.log('');
console.log('=== EXACT POSITION DUPES (same x,y among manual plots) ===');
const manualPlots = d.plots.filter(p => p.manual);
const posMap = {};
manualPlots.forEach(p => {
  const key = `${p.x.toFixed(1)}_${p.y.toFixed(1)}`;
  if (!posMap[key]) posMap[key] = [];
  posMap[key].push(p);
});
const posDupes = Object.entries(posMap).filter(([k, v]) => v.length > 1);
console.log('Position duplicates among manual plots:', posDupes.length);
posDupes.slice(0, 5).forEach(([k, v]) => {
  console.log('  At', k, ':', v.map(p => `"${p.n}" id=${p.id}`).join(' | '));
});
