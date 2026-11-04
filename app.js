const STORAGE_KEY = 'fire-progress-tracker-v1';
const THEME_KEY = 'fire-tracker-theme';

let dataPoints = [{ id: String(Date.now()), date: todayStr(), u1p: '', u1i: '', u2p: '', u2i: '' }];
let chart;
let chartView = 'total';
let chartRange = 'all';

const CHART_COLORS = {
  pension: '#0072B2',
  isa: '#E69F00',
  you: '#0072B2',
  youIsa: '#56B4E9',
  partner: '#CC79A7',
  partnerIsa: '#8E3B6B',
  projection: '#009E73',
  target: '#D55E00'
};
const PROJECTION_RANGE_PCT = 2;

function getPreferredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    btn.textContent = theme === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
  recalc();
}

const ids = {
  hasPartner: document.getElementById('hasPartner'),
  partnerBox: document.getElementById('partnerBox'),
  partnerContribBox: document.getElementById('partnerContribBox'),
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
function fmtSignedGBP(n) {
  const rounded = Math.round(n || 0);
  if (rounded === 0) return fmtGBP(0);
  return `${rounded > 0 ? '+' : '−'}${fmtGBP(Math.abs(rounded))}`;
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
function getMonthlyContributionTotal() {
  const ownContrib = getNum('u1PensionContrib') + getNum('u1IsaContrib');
  if (!hasPartner()) return ownContrib;
  return ownContrib + getNum('u2PensionContrib') + getNum('u2IsaContrib');
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
function getRetirementDate(dobStr, retirementAge) {
  if (!dobStr || !retirementAge) return null;
  const dob = new Date(dobStr);
  if (Number.isNaN(dob.getTime())) return null;
  const retirementDate = new Date(dob);
  retirementDate.setFullYear(retirementDate.getFullYear() + retirementAge);
  return retirementDate.toISOString().split('T')[0];
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
function toYear(dateStr) {
  const d = new Date(dateStr);
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  return y + (d.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start);
}
function fromYear(value) {
  const y = Math.floor(value);
  const start = Date.UTC(y, 0, 1);
  return new Date(start + (value - y) * (Date.UTC(y + 1, 0, 1) - start));
}
function getAgeOnDate(dobStr, dateStr) {
  if (!dobStr || !dateStr) return null;
  const dob = new Date(dobStr);
  const atDate = new Date(dateStr);
  if (Number.isNaN(dob.getTime()) || Number.isNaN(atDate.getTime())) return null;

  let age = atDate.getFullYear() - dob.getFullYear();
  const monthDiff = atDate.getMonth() - dob.getMonth();
  const hasBirthdayPassed = monthDiff > 0 || (monthDiff === 0 && atDate.getDate() >= dob.getDate());
  if (!hasBirthdayPassed) age -= 1;
  return Math.max(0, age);
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
  ids.partnerContribBox.classList.toggle('hidden', !hp);

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
function solveMonthsToTarget(current, monthlyContrib, annualGrowthRate, target, maxMonths = 1200) {
  if (target <= 0) return 0;
  if (current >= target) return 0;

  const monthlyRate = annualGrowthRate / 100 / 12;
  if (monthlyContrib <= 0 && monthlyRate <= 0) return null;

  let value = current;
  for (let month = 1; month <= maxMonths; month += 1) {
    value = value * (1 + monthlyRate) + monthlyContrib;
    if (value >= target) return month;
  }
  return null;
}

function recalc() {
  renderTable();

  const hp = hasPartner();
  const target = getNum('target');
  const contrib = getMonthlyContributionTotal();
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
  const u1RetirementDate = getRetirementDate(document.getElementById('u1Dob').value, getNum('u1RetAge'));
  const u2RetirementDate = hp ? getRetirementDate(document.getElementById('u2Dob').value, getNum('u2RetAge')) : null;
  const ageBasedYearsToRetire = Math.min(u1Years, u2Years);
  const latestYearsToRetire = hp ? Math.max(u1Years, u2Years) : u1Years;

  const sorted = [...dataPoints].sort((a, b) => new Date(a.date) - new Date(b.date));
  const validDates = sorted.map((p) => p.date).filter((d) => !Number.isNaN(new Date(d).getTime()));
  const anchorDate = validDates.length ? validDates[validDates.length - 1] : todayStr();
  const monthsFromAnchor = (dateStr, fallbackYears) => (dateStr
    ? Math.max(0, Math.round((toYear(dateStr) - toYear(anchorDate)) * 12))
    : Math.round(fallbackYears * 12));
  const retirementDates = [u1RetirementDate, hp ? u2RetirementDate : null].filter(Boolean).sort();
  const monthsToRetire = monthsFromAnchor(retirementDates[0], ageBasedYearsToRetire);
  const yearsToRetire = monthsToRetire / 12;
  const projectionMonths = monthsFromAnchor(retirementDates[retirementDates.length - 1], latestYearsToRetire) + 60;

  const current = sorted.length ? rowTotal(sorted[sorted.length - 1], hp) : 0;

  const projected = monthsToRetire > 0 ? projectValue(current, contrib, growth, monthsToRetire) : current;
  const progressPct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const retirementIncomeNominal = (projected * (swr / 100)) / 12;
  const inflationFactor = Math.pow(1 + (inflation / 100), yearsToRetire);
  const retirementIncome = inflationFactor > 0 ? retirementIncomeNominal / inflationFactor : retirementIncomeNominal;

  ids.metricsGrid.innerHTML = `
    <article class="metric"><div class="mlabel">Current total</div><div class="mval">${fmtGBP(current)}</div><div class="msub">${progressPct.toFixed(1)}% of target</div></article>
    <article class="metric"><div class="mlabel">Projected at retirement</div><div class="mval">${fmtGBP(projected)}</div><div class="msub">Based on ${fmtGBP(contrib)}/mo @ ${growth.toFixed(1)}% growth</div></article>
    <article class="metric"><div class="mlabel">Years to retirement</div><div class="mval">${yearsToRetire.toFixed(1)}</div><div class="msub">Earliest retirement, from latest snapshot</div></article>
    <article class="metric"><div class="mlabel">Est. monthly drawdown (today's money)</div><div class="mval">${fmtGBP(retirementIncome)}</div><div class="msub">Using ${swr.toFixed(1)}% safe withdrawal rate and ${inflation.toFixed(1)}% inflation</div></article>
  `;

  const shortfall = Math.max(0, target - projected);
  const surplus = Math.max(0, projected - target);
  const requiredMonthly = yearsToRetire > 0 ? shortfall / (yearsToRetire * 12) : shortfall;
  const monthsToTarget = solveMonthsToTarget(current, contrib, growth, target);
  const targetDate = monthsToTarget === null ? null : addMonths(anchorDate, monthsToTarget);
  const u1TargetAge = targetDate ? getAgeOnDate(document.getElementById('u1Dob').value, targetDate) : null;
  const u2TargetAge = hp && targetDate ? getAgeOnDate(document.getElementById('u2Dob').value, targetDate) : null;
  let targetSolverText = 'Unable to reach the target with the current assumptions within 100 years.';
  if (targetDate) {
    targetSolverText = `<br>You reach your target and can FIRE on: <strong>${formatDateLabel(targetDate)}</strong>.`;
    if (u1TargetAge !== null) targetSolverText += `<br> You'll be ${u1TargetAge}`;
    if (hp && u2TargetAge !== null) targetSolverText += `, your partner will be ${u2TargetAge}`;
    targetSolverText += '.';
  }

  ids.analysisBox.innerHTML = `
    <section class="analysis">
      <h3 class="section-title">Analysis</h3>
      <div class="analysis-row"><span>Target fund</span><strong>${fmtGBP(target)}</strong></div>
      <div class="analysis-row"><span>Projected shortfall / surplus</span><strong class="${projected >= target ? 'amount-positive' : 'amount-negative'}">${fmtSignedGBP(projected - target)}</strong></div>
      <div class="analysis-row"><span>Additional monthly contribution needed to make up shortfall (simple)</span><strong>${fmtGBP(requiredMonthly)}</strong></div>
      ${projected >= target
        ? `<div class="on-track">✅<br>You are on track based on the current assumptions. Estimated surplus at retirement: <strong>${fmtGBP(surplus)}</strong>. ${targetSolverText}</div>`
        : `<div class="off-track">⚠️<br>You may miss your target. Estimated deficit at retirement: <strong>${fmtGBP(shortfall)}</strong>. Increase contributions or adjust timeline/target. ${targetSolverText}</div>`}
    </section>
  `;

  drawChart(sorted, hp, target, contrib, growth, projectionMonths, {
    u1RetirementDate,
    u2RetirementDate,
    targetDate: monthsToTarget > 0 ? targetDate : null,
    progressPct,
    projected
  });
  persist();
}

function drawChartLabel(ctx, text, x, y, { color, bg, maxRight }) {
  ctx.font = '600 12px Manrope, sans-serif';
  const w = ctx.measureText(text).width;
  let left = x + 6;
  if (left + w + 4 > maxRight) left = x - w - 6;
  ctx.fillStyle = bg;
  ctx.fillRect(left - 4, y - 2, w + 8, 18);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(text, left, y);
}

const annotationPlugin = {
  id: 'fireAnnotations',
  afterDraw(chartInstance, _args, options) {
    const { ctx, chartArea, scales } = chartInstance;
    const { x: xScale, y: yScale } = scales;
    if (!options || !chartArea || !xScale || !yScale) return;
    const label = { color: options.textColor, bg: options.labelBg, maxRight: chartArea.right };

    ctx.save();
    if (options.target) {
      const yPx = yScale.getPixelForValue(options.target.value);
      if (yPx >= chartArea.top && yPx <= chartArea.bottom) {
        const labelY = yPx - 22 < chartArea.top ? yPx + 4 : yPx - 22;
        drawChartLabel(ctx, options.target.label, chartArea.left, labelY, { ...label, color: CHART_COLORS.target });
      }
    }

    if (options.today && options.today.x >= xScale.min && options.today.x <= xScale.max) {
      const xPx = xScale.getPixelForValue(options.today.x);
      ctx.strokeStyle = options.textColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xPx, chartArea.top);
      ctx.lineTo(xPx, chartArea.bottom);
      ctx.stroke();
      drawChartLabel(ctx, options.today.label, xPx, chartArea.bottom - 22, label);
    }

    let row = 0;
    (options.markers || []).forEach((marker) => {
      if (marker.x < xScale.min || marker.x > xScale.max) return;
      const xPx = xScale.getPixelForValue(marker.x);
      ctx.strokeStyle = options.mutedColor;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xPx, chartArea.top);
      ctx.lineTo(xPx, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      drawChartLabel(ctx, marker.label, xPx, chartArea.top + 6 + row * 22, label);
      row += 1;
    });

    const fire = options.fire;
    if (fire && fire.x >= xScale.min && fire.x <= xScale.max) {
      const xPx = xScale.getPixelForValue(fire.x);
      const yPx = yScale.getPixelForValue(fire.y);
      ctx.beginPath();
      ctx.arc(xPx, yPx, 7, 0, Math.PI * 2);
      ctx.fillStyle = CHART_COLORS.projection;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = options.labelBg;
      ctx.stroke();
      drawChartLabel(ctx, fire.label, xPx, yPx + 10, { ...label, color: CHART_COLORS.projection });
    }
    ctx.restore();
  }
};

function drawChart(allPoints, hp, target, contrib, growth, projectionMonths, extras) {
  const sorted = allPoints.filter((p) => !Number.isNaN(new Date(p.date).getTime()));
  if (!sorted.length) {
    if (chart) chart.destroy();
    chart = undefined;
    return;
  }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tickColor = isDark ? '#9ba3b5' : '#4b566c';
  const textColor = isDark ? '#e4e6eb' : '#13151a';
  const surfaceColor = isDark ? '#1e2028' : '#ffffff';

  document.getElementById('chartViewPerson').classList.toggle('hidden', !hp);
  document.getElementById('chartViewBoth').classList.toggle('hidden', !hp);
  if (!hp && (chartView === 'person' || chartView === 'both')) {
    chartView = 'account';
    document.querySelector('input[name="chartView"][value="account"]').checked = true;
  }

  const num = (v) => parseFloat(v) || 0;
  const totals = sorted.map((p) => rowTotal(p, hp));
  const n = sorted.length;
  const lastTotal = totals[n - 1];

  const stepMonths = 3;
  const projCount = Math.max(0, Math.ceil(projectionMonths / stepMonths));
  const lastDate = sorted[n - 1].date;
  const projDates = Array.from({ length: projCount }, (_, i) => addMonths(lastDate, stepMonths * (i + 1)));
  const gridDates = [...sorted.map((p) => p.date), ...projDates];
  const xs = gridDates.map(toYear);

  const points = (snapshotValues, projectedValues) => xs.map((x, i) => {
    const v = i < n ? snapshotValues[i] : (projectedValues ? projectedValues[i - n] : null);
    return { x, y: v, v, date: gridDates[i] };
  });
  const projectSeries = (rate, start = lastTotal, monthly = contrib) => {
    let value = start;
    return projDates.map(() => { value = projectValue(value, monthly, rate, stepMonths); return value; });
  };
  const lead = Array(n).fill(null);
  lead[n - 1] = lastTotal;

  const datasets = [];

  if (chartView !== 'total') {
    const last = sorted[n - 1];
    const component = (label, color, fields, contribIds) => ({
      label,
      color,
      values: sorted.map((p) => fields.reduce((t, f) => t + num(p[f]), 0)),
      start: fields.reduce((t, f) => t + num(last[f]), 0),
      monthly: contribIds.reduce((t, id) => t + getNum(id), 0)
    });
    const components = {
      person: () => [
        component('You', CHART_COLORS.you, ['u1p', 'u1i'], ['u1PensionContrib', 'u1IsaContrib']),
        component('Partner', CHART_COLORS.partner, ['u2p', 'u2i'], ['u2PensionContrib', 'u2IsaContrib'])
      ],
      both: () => [
        component('Your pension', CHART_COLORS.you, ['u1p'], ['u1PensionContrib']),
        component('Your ISA', CHART_COLORS.youIsa, ['u1i'], ['u1IsaContrib']),
        component('Partner pension', CHART_COLORS.partner, ['u2p'], ['u2PensionContrib']),
        component('Partner ISA', CHART_COLORS.partnerIsa, ['u2i'], ['u2IsaContrib'])
      ],
      account: () => [
        component('Pensions', CHART_COLORS.pension, hp ? ['u1p', 'u2p'] : ['u1p'], hp ? ['u1PensionContrib', 'u2PensionContrib'] : ['u1PensionContrib']),
        component('ISAs', CHART_COLORS.isa, hp ? ['u1i', 'u2i'] : ['u1i'], hp ? ['u1IsaContrib', 'u2IsaContrib'] : ['u1IsaContrib'])
      ]
    }[chartView]();
    const running = Array(xs.length).fill(0);
    components.forEach((c, idx) => {
      const projected = projectSeries(growth, c.start, c.monthly);
      const data = xs.map((x, i) => {
        const v = i < n ? c.values[i] : projected[i - n];
        running[i] += v;
        return { x, y: running[i], v, date: gridDates[i] };
      });
      datasets.push({
        label: c.label,
        data,
        borderColor: c.color,
        backgroundColor: `${c.color}99`,
        borderWidth: 1.5,
        pointRadius: 0,
        segment: { borderDash: (ctx) => (ctx.p0DataIndex >= n - 1 ? [6, 4] : undefined) },
        fill: idx === 0 ? 'origin' : '-1',
        order: 5
      });
    });
  }

  datasets.push({
    label: 'Total',
    data: points(totals),
    borderColor: textColor,
    backgroundColor: surfaceColor,
    pointBackgroundColor: surfaceColor,
    borderWidth: 2.5,
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.15,
    order: 1
  });

  let loIdx = -1;
  let hiIdx = -1;
  if (projCount > 0) {
    const loRate = Math.max(0, growth - PROJECTION_RANGE_PCT);
    const hiRate = growth + PROJECTION_RANGE_PCT;
    datasets.push({
      label: 'Projected total',
      data: points(lead, projectSeries(growth)),
      borderColor: CHART_COLORS.projection,
      borderDash: [8, 4],
      borderWidth: 3,
      pointRadius: 0,
      pointHoverRadius: 5,
      isProjection: true,
      order: 2
    });
    loIdx = datasets.length;
    datasets.push({
      label: 'Projection range (low)',
      data: points(lead, projectSeries(loRate)),
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      fill: false,
      hideLegend: true,
      hideTooltip: true,
      order: 6
    });
    hiIdx = datasets.length;
    datasets.push({
      label: `Projection range (${loRate.toFixed(1)}%–${hiRate.toFixed(1)}% growth)`,
      data: points(lead, projectSeries(hiRate)),
      borderWidth: 0,
      pointRadius: 0,
      pointHoverRadius: 0,
      backgroundColor: `${CHART_COLORS.projection}2e`,
      fill: '-1',
      hideTooltip: true,
      order: 6
    });
  }

  if (target > 0) {
    datasets.push({
      label: 'Target',
      data: xs.map((x, i) => ({ x, y: target, v: target, date: gridDates[i] })),
      borderColor: CHART_COLORS.target,
      borderDash: [6, 6],
      borderWidth: 1.5,
      pointRadius: 0,
      pointHoverRadius: 0,
      hideTooltip: true,
      order: 3
    });
  }

  const retirementMarkers = [
    extras.u1RetirementDate ? { label: `You retire · ${formatDateLabel(extras.u1RetirementDate)}`, x: toYear(extras.u1RetirementDate) } : null,
    hp && extras.u2RetirementDate ? { label: `Partner retires · ${formatDateLabel(extras.u2RetirementDate)}`, x: toYear(extras.u2RetirementDate) } : null
  ].filter(Boolean);

  let xMin;
  let xMax;
  if (chartRange === 'history') {
    xMin = xs[0];
    xMax = xs[n - 1];
  } else if (chartRange === '5y') {
    xMin = xs[0];
    xMax = xs[n - 1] + 5;
  } else if (chartRange === 'retire' && retirementMarkers.length) {
    xMin = xs[0];
    xMax = Math.max(...retirementMarkers.map((m) => m.x));
  }
  if (xMax !== undefined) xMax = Math.max(xMax, xMin + 0.5);

  const ages = (dateStr) => {
    const own = getAgeOnDate(document.getElementById('u1Dob').value, dateStr);
    const partner = hp ? getAgeOnDate(document.getElementById('u2Dob').value, dateStr) : null;
    if (own === null) return '';
    return partner === null ? `Age ${own}` : `You ${own} · Partner ${partner}`;
  };

  const fireDate = extras.targetDate;
  const canvas = document.getElementById('retChart');
  canvas.setAttribute('aria-label', [
    `Chart of fund value over time. Current total ${fmtGBP(lastTotal)}`,
    target > 0 ? `, ${extras.progressPct.toFixed(0)}% of the ${fmtGBP(target)} target.` : '.',
    projCount > 0 ? ` Projected ${fmtGBP(extras.projected)} at retirement.` : '',
    fireDate ? ` Target reached around ${formatDateLabel(fireDate)}.` : ''
  ].join(''));

  if (chart) chart.destroy();
  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { datasets },
    plugins: [annotationPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { right: 12 } },
      plugins: {
        fireAnnotations: {
          markers: retirementMarkers,
          today: { x: toYear(todayStr()), label: `Today · ${formatDateLabel(todayStr())}` },
          target: target > 0 ? { value: target, label: `Target ${fmtGBPShort(target)} · ${extras.progressPct.toFixed(0)}% reached` } : null,
          fire: fireDate && target > 0 ? { x: toYear(fireDate), y: target, label: `Target reached · ${formatDateLabel(fireDate)}` } : null,
          textColor,
          mutedColor: tickColor,
          labelBg: isDark ? 'rgba(30,32,40,0.85)' : 'rgba(255,255,255,0.85)'
        },
        legend: {
          position: 'bottom',
          labels: { color: tickColor, usePointStyle: true, filter: (item, data) => !data.datasets[item.datasetIndex].hideLegend }
        },
        tooltip: {
          filter: (item) => !item.dataset.hideTooltip && item.raw && item.raw.v !== null && !(item.dataset.isProjection && item.dataIndex === n - 1),
          callbacks: {
            title: (items) => (items.length ? formatDateLabel(items[0].raw.date) : ''),
            afterTitle: (items) => (items.length ? ages(items[0].raw.date) : ''),
            label: (c) => `${c.dataset.label}: ${fmtGBP(c.raw.v)}`,
            footer: (items) => {
              const proj = items.find((item) => item.dataset.isProjection);
              if (!proj || loIdx < 0) return '';
              const lo = datasets[loIdx].data[proj.dataIndex].v;
              const hi = datasets[hiIdx].data[proj.dataIndex].v;
              return `Range: ${fmtGBP(lo)} – ${fmtGBP(hi)}`;
            }
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { callback: (v) => fmtGBPShort(v), color: tickColor }, grid: { color: gridColor } },
        x: {
          type: 'linear',
          bounds: 'data',
          min: xMin,
          max: xMax,
          ticks: {
            color: tickColor,
            maxRotation: 0,
            callback(value) {
              if (this.max - this.min > 2) return String(Math.round(value));
              return fromYear(value).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
            }
          },
          grid: { color: gridColor },
          afterBuildTicks(scale) {
            const span = scale.max - scale.min;
            let step = span > 40 ? 10 : span > 20 ? 5 : span > 10 ? 2 : span > 2 ? 1 : 0.25;
            if (scale.chart.width < 520 && step >= 1) step *= 2;
            const ticks = [];
            for (let v = Math.ceil(scale.min / step) * step; v <= scale.max + 1e-9; v += step) ticks.push({ value: v });
            scale.ticks = ticks;
          }
        }
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
      u1PensionContrib: document.getElementById('u1PensionContrib').value,
      u1IsaContrib: document.getElementById('u1IsaContrib').value,
      u2PensionContrib: document.getElementById('u2PensionContrib').value,
      u2IsaContrib: document.getElementById('u2IsaContrib').value,
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
  if (values.monthlyContrib !== undefined && values.u1PensionContrib === undefined) {
    const legacyContrib = Number(values.monthlyContrib) || 0;
    values.u1PensionContrib = Math.round(legacyContrib * 0.6);
    values.u1IsaContrib = legacyContrib - values.u1PensionContrib;
    values.u2PensionContrib = 0;
    values.u2IsaContrib = 0;
  }

  ['u1Dob', 'u1RetAge', 'u2Dob', 'u2RetAge', 'target', 'safeWithdrawal', 'inflationRate', 'u1PensionContrib', 'u1IsaContrib', 'u2PensionContrib', 'u2IsaContrib', 'growthRate'].forEach((id) => {
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
  applyTheme(getPreferredTheme());

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
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  ids.fileIn.addEventListener('change', importPlan);

  document.querySelectorAll('input[name="chartView"]').forEach((r) => r.addEventListener('change', () => {
    chartView = r.value;
    recalc();
  }));
  document.querySelectorAll('input[name="chartRange"]').forEach((r) => r.addEventListener('change', () => {
    chartRange = r.value;
    recalc();
  }));
  const chartCard = document.getElementById('chartCard');
  const expandBtn = document.getElementById('chartExpandBtn');
  const setExpanded = (expanded) => {
    chartCard.classList.toggle('chart-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
    [...chartCard.parentElement.children].forEach((el) => {
      if (el !== chartCard) el.inert = expanded;
    });
    expandBtn.setAttribute('aria-pressed', String(expanded));
    expandBtn.textContent = expanded ? '✕ Close' : '⤢ Expand';
    if (chart) chart.resize();
  };
  expandBtn.addEventListener('click', () => setExpanded(!chartCard.classList.contains('chart-expanded')));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chartCard.classList.contains('chart-expanded')) setExpanded(false);
  });

  ids.hasPartner.addEventListener('change', recalc);
  document.querySelectorAll('input[name="freq"]').forEach((r) => r.addEventListener('change', recalc));
  ['u1Dob', 'u1RetAge', 'u2Dob', 'u2RetAge', 'target', 'safeWithdrawal', 'inflationRate', 'u1PensionContrib', 'u1IsaContrib', 'u2PensionContrib', 'u2IsaContrib', 'growthRate'].forEach((id) => {
    document.getElementById(id).addEventListener('input', recalc);
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(getPreferredTheme());
      recalc();
    }
  });

  recalc();
}

init();
