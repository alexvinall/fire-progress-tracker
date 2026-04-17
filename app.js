const STORAGE_KEY = 'fire-progress-tracker-v1';

let dataPoints = [{ id: String(Date.now()), date: todayStr(), u1p: '', u1i: '', u2p: '', u2i: '' }];
let chart;

const ids = {
  hasPartner: document.getElementById('hasPartner'),
  partnerBox: document.getElementById('partnerBox'),
  thP2Pension: document.getElementById('th-p2pension'),
  thP2Isa: document.getElementById('th-p2isa'),
  dataTable: document.getElementById('dataTable'),
  metricsGrid: document.getElementById('metricsGrid'),
  analysisBox: document.getElementById('analysisBox'),
  fileIn: document.getElementById('fileIn')
};

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
function formatDateLabel(s) {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 'Invalid' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtGBPShort(n) {
  if (n >= 1e6) return `£${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `£${Math.round(n / 1e3)}k`;
  return fmtGBP(n);
}
function fmtGBP(n) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(Math.max(0, n || 0));
}
function hasPartner() {
  return ids.hasPartner.checked;
}
function getFreq() {
  return document.querySelector('input[name="freq"]:checked').value;
}
function getNum(id) {
  return Number.parseFloat(document.getElementById(id).value) || 0;
}
function getAgeFromDob(dobStr) {
  if (!dobStr) return 0;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const hasBirthdayPassed = monthDiff > 0 || (monthDiff === 0 && now.getDate() >= dob.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return Math.max(0, age);
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function rowTotal(p, includePartner = hasPartner()) {
  const u1 = (parseFloat(p.u1p) || 0) + (parseFloat(p.u1i) || 0);
  const u2 = includePartner ? (parseFloat(p.u2p) || 0) + (parseFloat(p.u2i) || 0) : 0;
  return u1 + u2;
}

function updatePoint(id, field, val) {
  const row = dataPoints.find((x) => x.id === id);
  if (!row) return;
  row[field] = val;
  recalc();
}

function addDataPoint() {
  const freq = getFreq();
  const latest = [...dataPoints].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const seed = latest?.date || todayStr();
  const newDate = freq === 'quarterly' ? addMonths(seed, 3) : addMonths(seed, 12);
  dataPoints.push({ id: String(Date.now() + Math.random()), date: newDate, u1p: '', u1i: '', u2p: '', u2i: '' });
  recalc();
}

function removePoint(id) {
  if (dataPoints.length <= 1) return;
  dataPoints = dataPoints.filter((x) => x.id !== id);
  recalc();
}

function renderTable() {
  const hp = hasPartner();
  ids.thP2Pension.classList.toggle('hidden', !hp);
  ids.thP2Isa.classList.toggle('hidden', !hp);
  ids.partnerBox.classList.toggle('hidden', !hp);

  ids.dataTable.innerHTML = '';

  dataPoints
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .forEach((p) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="date" value="${p.date}" onchange="updatePoint('${p.id}', 'date', this.value)"></td>
        <td><input type="number" value="${p.u1p}" min="0" step="100" placeholder="0" onchange="updatePoint('${p.id}', 'u1p', this.value)"></td>
        <td><input type="number" value="${p.u1i}" min="0" step="100" placeholder="0" onchange="updatePoint('${p.id}', 'u1i', this.value)"></td>
        ${hp ? `<td><input type="number" value="${p.u2p}" min="0" step="100" placeholder="0" onchange="updatePoint('${p.id}', 'u2p', this.value)"></td>
               <td><input type="number" value="${p.u2i}" min="0" step="100" placeholder="0" onchange="updatePoint('${p.id}', 'u2i', this.value)"></td>` : ''}
        <td><strong>${fmtGBP(rowTotal(p, hp))}</strong></td>
        <td><button class="btn btn-danger" ${dataPoints.length <= 1 ? 'disabled' : ''} onclick="removePoint('${p.id}')">✕</button></td>
      `;
      ids.dataTable.appendChild(tr);
    });
}

function projectValue(current, monthlyContrib, annualGrowthRate, monthsToRetire) {
  const monthlyRate = annualGrowthRate / 100 / 12;
  let value = current;
  for (let i = 0; i < monthsToRetire; i += 1) {
    value = value * (1 + monthlyRate) + monthlyContrib;
  }
  return value;
}

function recalc() {
  renderTable();

  const hp = hasPartner();
  const target = getNum('target');
  const contrib = getNum('monthlyContrib');
  const growth = getNum('growthRate');
  const inflationField = document.getElementById('inflationRate').value;
  const inflation = inflationField === '' ? 3 : getNum('inflationRate');
  const swr = getNum('safeWithdrawal') || 4;
  const u1Age = getAgeFromDob(document.getElementById('u1Dob').value);
  const u2Age = getAgeFromDob(document.getElementById('u2Dob').value);

  document.getElementById('u1AgeDisplay').textContent = `Current age: ${u1Age}`;
  document.getElementById('u2AgeDisplay').textContent = `Current age: ${u2Age}`;

  const u1Years = Math.max(0, getNum('u1RetAge') - u1Age);
  const u2Years = hp ? Math.max(0, getNum('u2RetAge') - u2Age) : Infinity;
  const yearsToRetire = Math.min(u1Years, u2Years);
  const latestYearsToRetire = hp ? Math.max(u1Years, u2Years) : u1Years;
  const monthsToRetire = Math.round(yearsToRetire * 12);
  const projectionMonths = Math.round((latestYearsToRetire + 5) * 12);

  const sorted = [...dataPoints].sort((a, b) => new Date(a.date) - new Date(b.date));
  const current = sorted.length ? rowTotal(sorted[sorted.length - 1], hp) : 0;

  const projected = monthsToRetire > 0 ? projectValue(current, contrib, growth, monthsToRetire) : current;
  const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const retirementIncomeNominal = (projected * (swr / 100)) / 12;
  const inflationFactor = Math.pow(1 + (inflation / 100), yearsToRetire);
  const retirementIncome = inflationFactor > 0 ? retirementIncomeNominal / inflationFactor : retirementIncomeNominal;

  ids.metricsGrid.innerHTML = `
    <article class="metric"><div class="mlabel">Current total</div><div class="mval">${fmtGBP(current)}</div><div class="msub">${progressPct.toFixed(1)}% of target</div></article>
    <article class="metric"><div class="mlabel">Projected at retirement</div><div class="mval">${fmtGBP(projected)}</div><div class="msub">Based on ${fmtGBP(contrib)}/mo @ ${growth.toFixed(1)}% growth</div></article>
    <article class="metric"><div class="mlabel">Years to retirement</div><div class="mval">${yearsToRetire.toFixed(1)}</div><div class="msub">Earliest selected retirement age</div></article>
    <article class="metric"><div class="mlabel">Est. monthly drawdown (today's money)</div><div class="mval">${fmtGBP(retirementIncome)}</div><div class="msub">Using ${swr.toFixed(1)}% safe withdrawal rate and ${inflation.toFixed(1)}% inflation</div></article>
  `;

  const shortfall = Math.max(0, target - projected);
  const surplus = Math.max(0, projected - target);
  const requiredMonthly = yearsToRetire > 0 ? shortfall / (yearsToRetire * 12) : shortfall;

  ids.analysisBox.innerHTML = `
    <section class="analysis">
      <h3 class="section-title">Analysis</h3>
      <div class="analysis-row"><span>Target fund</span><strong>${fmtGBP(target)}</strong></div>
      <div class="analysis-row"><span>Projected gap</span><strong>${fmtGBP(shortfall)}</strong></div>
      <div class="analysis-row"><span>Needed extra monthly (simple)</span><strong>${fmtGBP(requiredMonthly)}</strong></div>
      ${projected >= target
        ? `<div class="on-track">✅ You are on track based on the current assumptions. Estimated surplus at retirement: <strong>${fmtGBP(surplus)}</strong>.</div>`
        : `<div class="off-track">⚠️ You may miss your target. Estimated deficit at retirement: <strong>${fmtGBP(shortfall)}</strong>. Increase contributions or adjust timeline/target.</div>`}
    </section>
  `;

  drawChart(sorted, hp, target, contrib, growth, projectionMonths);
  persist();
}

function drawChart(sorted, hp, target, contrib, growth, projectionMonths) {
  const labels = sorted.map((p) => formatDateLabel(p.date));
  const u1p = sorted.map((p) => parseFloat(p.u1p) || 0);
  const u1i = sorted.map((p) => parseFloat(p.u1i) || 0);
  const u2p = sorted.map((p) => parseFloat(p.u2p) || 0);
  const u2i = sorted.map((p) => parseFloat(p.u2i) || 0);
  const total = sorted.map((p) => rowTotal(p, hp));

  const projectionStepMonths = getFreq() === 'yearly' ? 12 : 3;
  const projectionPoints = Math.max(0, Math.ceil(projectionMonths / projectionStepMonths));
  let projectedSeries = [];
  if (sorted.length > 0 && projectionPoints > 0) {
    let running = total[total.length - 1];
    for (let i = 0; i < projectionPoints; i += 1) {
      running = projectValue(running, contrib, growth, projectionStepMonths);
      projectedSeries.push(Math.round(running));
    }
  }

  const finalDate = sorted.length ? sorted[sorted.length - 1].date : todayStr();
  const projectionLabels = projectedSeries.map((_, i) => formatDateLabel(addMonths(finalDate, projectionStepMonths * (i + 1))));
  const allLabels = [...labels, ...projectionLabels];

  const datasets = [
    { label: 'Your pension', data: [...u1p, ...Array(projectionLabels.length).fill(null)], borderColor: '#2f6fdb', tension: 0.2 },
    { label: 'Your ISA', data: [...u1i, ...Array(projectionLabels.length).fill(null)], borderColor: '#7255cf', tension: 0.2 }
  ];
  if (hp) {
    datasets.push({ label: 'Partner pension', data: [...u2p, ...Array(projectionLabels.length).fill(null)], borderColor: '#0f856a', tension: 0.2 });
    datasets.push({ label: 'Partner ISA', data: [...u2i, ...Array(projectionLabels.length).fill(null)], borderColor: '#d46a2f', tension: 0.2 });
  }
  datasets.push({ label: 'Total', data: [...total, ...Array(projectionLabels.length).fill(null)], borderColor: '#2f8f42', borderWidth: 3, tension: 0.2 });

  if (projectedSeries.length) {
    datasets.push({
      label: 'Projected total',
      data: [...Array(total.length - 1).fill(null), total[total.length - 1], ...projectedSeries],
      borderColor: '#f09a21',
      borderDash: [8, 4],
      borderWidth: 3,
      tension: 0.2
    });
  }

  if (target > 0) {
    datasets.push({ label: 'Target', data: Array(allLabels.length).fill(target), borderColor: '#e24b4a', borderDash: [6, 6], pointRadius: 0 });
  }

  const ctx = document.getElementById('retChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: allLabels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (ctx2) => `${ctx2.dataset.label}: ${fmtGBP(ctx2.parsed.y || 0)}` } }
      },
      scales: {
        y: { ticks: { callback: (v) => fmtGBPShort(v) } }
      }
    }
  });
}

function captureFormState() {
  return {
    version: 2,
    hasPartner: ids.hasPartner.checked,
    frequency: getFreq(),
    values: {
      u1Dob: document.getElementById('u1Dob').value,
      u1RetAge: document.getElementById('u1RetAge').value,
      u2Dob: document.getElementById('u2Dob').value,
      u2RetAge: document.getElementById('u2RetAge').value,
      target: document.getElementById('target').value,
      safeWithdrawal: document.getElementById('safeWithdrawal').value,
      inflationRate: document.getElementById('inflationRate').value,
      monthlyContrib: document.getElementById('monthlyContrib').value,
      growthRate: document.getElementById('growthRate').value
    },
    dataPoints
  };
}

function restoreState(state) {
  if (!state || !Array.isArray(state.dataPoints)) return false;
  ids.hasPartner.checked = Boolean(state.hasPartner);
  const freqInput = document.querySelector(`input[name="freq"][value="${state.frequency}"]`);
  if (freqInput) freqInput.checked = true;

  const values = state.values || {};
  if (!values.u1Dob && values.u1Age) {
    values.u1Dob = `${new Date().getFullYear() - Number(values.u1Age)}-01-01`;
  }
  if (!values.u2Dob && values.u2Age) {
    values.u2Dob = `${new Date().getFullYear() - Number(values.u2Age)}-01-01`;
  }
  ['u1Dob', 'u1RetAge', 'u2Dob', 'u2RetAge', 'target', 'safeWithdrawal', 'inflationRate', 'monthlyContrib', 'growthRate'].forEach((id) => {
    if (values[id] !== undefined) document.getElementById(id).value = values[id];
  });

  dataPoints = state.dataPoints.map((p) => ({
    id: p.id || String(Date.now() + Math.random()),
    date: (p.date || todayStr()).slice(0, 10),
    u1p: p.u1p ?? '',
    u1i: p.u1i ?? '',
    u2p: p.u2p ?? '',
    u2i: p.u2i ?? ''
  }));

  if (!dataPoints.length) dataPoints = [{ id: String(Date.now()), date: todayStr(), u1p: '', u1i: '', u2p: '', u2i: '' }];
  return true;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(captureFormState()));
}

function exportPlan() {
  const blob = new Blob([JSON.stringify(captureFormState(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fire-plan-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importPlan(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!restoreState(parsed)) throw new Error('Invalid file');
      recalc();
      alert('Plan imported successfully.');
    } catch {
      alert('Unable to import this file. Please select a valid exported plan JSON.');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function seedData() {
  const start = todayStr();
  dataPoints = [
    { id: 'a', date: addMonths(start, -18), u1p: 110000, u1i: 42000, u2p: 65000, u2i: 25000 },
    { id: 'b', date: addMonths(start, -12), u1p: 125000, u1i: 48000, u2p: 74000, u2i: 29000 },
    { id: 'c', date: addMonths(start, -6), u1p: 138000, u1i: 52000, u2p: 81000, u2i: 34000 },
    { id: 'd', date: start, u1p: 151000, u1i: 60000, u2p: 89000, u2i: 39000 }
  ];
  ids.hasPartner.checked = true;
  recalc();
}

function resetPlan() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

window.updatePoint = updatePoint;
window.removePoint = removePoint;

function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      restoreState(JSON.parse(saved));
    } catch {
      // ignore broken local state
    }
  }

  document.getElementById('addDataBtn').addEventListener('click', addDataPoint);
  document.getElementById('seedDataBtn').addEventListener('click', seedData);
  document.getElementById('exportBtn').addEventListener('click', exportPlan);
  document.getElementById('importBtn').addEventListener('click', () => ids.fileIn.click());
  document.getElementById('resetBtn').addEventListener('click', resetPlan);
  ids.fileIn.addEventListener('change', importPlan);

  ids.hasPartner.addEventListener('change', recalc);
  document.querySelectorAll('input[name="freq"]').forEach((r) => r.addEventListener('change', recalc));
  ['u1Dob', 'u1RetAge', 'u2Dob', 'u2RetAge', 'target', 'safeWithdrawal', 'inflationRate', 'monthlyContrib', 'growthRate'].forEach((id) => {
    document.getElementById(id).addEventListener('input', recalc);
  });

  recalc();
}

init();
