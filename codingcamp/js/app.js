/* ============================================================
   EXPENSE & BUDGET VISUALIZER — app.js
   Vanilla JS | No frameworks | LocalStorage
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// 1. CONSTANTS & STORAGE KEYS
// ─────────────────────────────────────────────
const STORAGE_TX   = 'bv_transactions';
const STORAGE_CATS = 'bv_categories';
const STORAGE_THEME = 'bv_theme';

// Palette for category colors (cycles if > 12 categories)
const PALETTE = [
  '#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
  '#6366f1','#fb923c'
];

// Built-in default categories (cannot be deleted)
const DEFAULT_CATEGORIES = [
  'Food & Drink', 'Transport', 'Housing', 'Health',
  'Entertainment', 'Shopping', 'Education', 'Salary',
  'Freelance', 'Other'
];

// ─────────────────────────────────────────────
// 2. STATE
// ─────────────────────────────────────────────
let transactions = [];
let categories   = [];
let currentMonth; // { year, month } (0-indexed month)

// chart instances (Chart.js CDN is NOT used — we draw with Canvas API)
let donutChart   = null;
let barChart     = null;

// ─────────────────────────────────────────────
// 3. HELPERS
// ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

function formatRp(n) {
  return 'Rp ' + Math.abs(n).toLocaleString('id-ID');
}

function categoryColor(name) {
  const idx = categories.findIndex(c => c.name === name);
  return PALETTE[idx % PALETTE.length] ?? '#94a3b8';
}

function categoryEmoji(name) {
  const map = {
    'Food & Drink':'🍔','Transport':'🚗','Housing':'🏠',
    'Health':'💊','Entertainment':'🎮','Shopping':'🛍️',
    'Education':'📚','Salary':'💼','Freelance':'💻','Other':'📦'
  };
  return map[name] ?? '🏷️';
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2400);
}

function saveTx()   { localStorage.setItem(STORAGE_TX,   JSON.stringify(transactions)); }
function saveCats() { localStorage.setItem(STORAGE_CATS, JSON.stringify(categories)); }

function loadData() {
  // Load categories
  const storedCats = localStorage.getItem(STORAGE_CATS);
  if (storedCats) {
    categories = JSON.parse(storedCats);
    // Ensure default categories always exist
    DEFAULT_CATEGORIES.forEach(name => {
      if (!categories.find(c => c.name === name)) {
        categories.unshift({ name, isDefault: true });
      }
    });
  } else {
    categories = DEFAULT_CATEGORIES.map(name => ({ name, isDefault: true }));
  }

  // Load transactions
  const storedTx = localStorage.getItem(STORAGE_TX);
  transactions = storedTx ? JSON.parse(storedTx) : [];

  // Load theme
  const theme = localStorage.getItem(STORAGE_THEME) ?? 'light';
  applyTheme(theme);
}

// ─────────────────────────────────────────────
// 4. THEME
// ─────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  $('themeToggle').textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(STORAGE_THEME, theme);
}

$('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
  // Re-render charts so canvas backgrounds update
  renderCategoryChart();
  renderMonthlyChart();
});

// ─────────────────────────────────────────────
// 5. TABS
// ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'monthly')    renderMonthlyTab();
    if (btn.dataset.tab === 'categories') renderCategoryList();
  });
});

// ─────────────────────────────────────────────
// 6. CATEGORY DROPDOWN (in form)
// ─────────────────────────────────────────────
function populateCategorySelect() {
  const sel = $('txCategory');
  const prev = sel.value;
  sel.innerHTML = '';
  categories.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  // Restore previous selection if still valid
  if (prev && categories.find(c => c.name === prev)) sel.value = prev;
}

// ─────────────────────────────────────────────
// 7. BALANCE SUMMARY
// ─────────────────────────────────────────────
function renderBalance() {
  const income  = transactions.filter(t => t.type === 'income') .reduce((s,t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const balance = income - expense;

  $('balanceDisplay').textContent = formatRp(balance);
  $('incomeDisplay').textContent  = formatRp(income);
  $('expenseDisplay').textContent = formatRp(expense);
  $('balanceDisplay').style.color = balance < 0 ? '#fca5a5' : '#fff';
}

// ─────────────────────────────────────────────
// 8. TRANSACTION LIST
// ─────────────────────────────────────────────
function renderTxList(containerEl, txArray) {
  containerEl.innerHTML = '';
  if (!txArray.length) {
    containerEl.innerHTML = '<p class="empty-state">No transactions here yet.</p>';
    return;
  }
  // Sort newest first
  [...txArray].sort((a,b) => new Date(b.date) - new Date(a.date))
    .forEach(tx => {
      const item = document.createElement('div');
      item.className = 'tx-item';
      item.dataset.id = tx.id;
      item.innerHTML = `
        <div class="tx-icon ${tx.type}">${categoryEmoji(tx.category)}</div>
        <div class="tx-info">
          <div class="tx-desc" title="${tx.desc}">${tx.desc}</div>
          <div class="tx-meta">${tx.category} · ${formatDate(tx.date)}</div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${tx.type}">${tx.type === 'income' ? '+' : '-'}${formatRp(tx.amount)}</div>
        </div>
        <button class="tx-delete" data-id="${tx.id}" title="Delete">🗑</button>
      `;
      containerEl.appendChild(item);
    });
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

// Delegated delete on transaction list
$('txList').addEventListener('click', e => {
  const btn = e.target.closest('.tx-delete');
  if (!btn) return;
  const id = btn.dataset.id;
  transactions = transactions.filter(t => t.id !== id);
  saveTx();
  renderAll();
  showToast('Transaction deleted');
});

// Clear all
$('clearAll').addEventListener('click', () => {
  if (!transactions.length) return;
  if (!confirm('Delete ALL transactions? This cannot be undone.')) return;
  transactions = [];
  saveTx();
  renderAll();
  showToast('All transactions cleared');
});

// ─────────────────────────────────────────────
// 9. ADD TRANSACTION FORM
// ─────────────────────────────────────────────
// Set today as default date
$('txDate').value = new Date().toISOString().split('T')[0];

$('transactionForm').addEventListener('submit', e => {
  e.preventDefault();
  const desc     = $('txDesc').value.trim();
  const amount   = parseFloat($('txAmount').value);
  const type     = $('txType').value;
  const category = $('txCategory').value;
  const date     = $('txDate').value;

  if (!desc || isNaN(amount) || amount <= 0 || !date) {
    showToast('Please fill in all fields correctly.');
    return;
  }

  const tx = {
    id: Date.now().toString(),
    desc, amount, type, category, date
  };

  transactions.push(tx);
  saveTx();
  renderAll();
  e.target.reset();
  $('txDate').value = new Date().toISOString().split('T')[0];
  populateCategorySelect();
  showToast('Transaction added ✓');
});

// ─────────────────────────────────────────────
// 10. DONUT CHART (Canvas API — no library)
// ─────────────────────────────────────────────
function renderCategoryChart() {
  const canvas = $('categoryChart');
  const emptyMsg = $('chartEmpty');
  const legendEl = $('chartLegend');

  const expenses = transactions.filter(t => t.type === 'expense');
  if (!expenses.length) {
    canvas.style.display = 'none';
    emptyMsg.style.display = 'grid';
    legendEl.innerHTML = '';
    return;
  }

  canvas.style.display = 'block';
  emptyMsg.style.display = 'none';

  // Aggregate by category
  const totals = {};
  expenses.forEach(t => {
    totals[t.category] = (totals[t.category] ?? 0) + t.amount;
  });
  const total = Object.values(totals).reduce((s,v) => s + v, 0);
  const entries = Object.entries(totals).sort((a,b) => b[1] - a[1]);

  // Draw
  const size = Math.min(canvas.parentElement.offsetWidth, 260);
  canvas.width  = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);

  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.24;

  let angle = -Math.PI / 2;

  entries.forEach(([cat, val]) => {
    const slice = (val / total) * 2 * Math.PI;
    const color = categoryColor(cat);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Gap between slices
    angle += slice;
  });

  // Donut hole
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, 2 * Math.PI);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.fillStyle = isDark ? '#1e293b' : '#ffffff';
  ctx.fill();

  // Centre text
  ctx.fillStyle = isDark ? '#f1f5f9' : '#1a202c';
  ctx.font = `bold ${Math.round(size * 0.07)}px Segoe UI, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatRp(total), cx, cy);

  // Legend
  legendEl.innerHTML = entries.map(([cat, val]) => `
    <div class="legend-item">
      <span class="legend-dot" style="background:${categoryColor(cat)}"></span>
      ${cat} (${((val/total)*100).toFixed(1)}%)
    </div>
  `).join('');
}

// ─────────────────────────────────────────────
// 11. MONTHLY TAB
// ─────────────────────────────────────────────
function initMonth() {
  const now = new Date();
  currentMonth = { year: now.getFullYear(), month: now.getMonth() };
}

function renderMonthlyTab() {
  updateMonthLabel();
  renderMonthlyStats();
  renderMonthlyChart();
  renderMonthlyTxList();
}

function updateMonthLabel() {
  const d = new Date(currentMonth.year, currentMonth.month, 1);
  $('monthLabel').textContent = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function getMonthTx() {
  return transactions.filter(t => {
    const d = new Date(t.date + 'T00:00:00');
    return d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month;
  });
}

function renderMonthlyStats() {
  const txs     = getMonthTx();
  const income  = txs.filter(t => t.type === 'income') .reduce((s,t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const balance = income - expense;

  $('monthlyStats').innerHTML = `
    <div class="stat-box">
      <div class="stat-label">Income</div>
      <div class="stat-value income">${formatRp(income)}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Expense</div>
      <div class="stat-value expense">${formatRp(expense)}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Net</div>
      <div class="stat-value balance" style="color:${balance < 0 ? 'var(--expense-clr)' : 'var(--income-clr)'}">${formatRp(balance)}</div>
    </div>
  `;
}

function renderMonthlyChart() {
  const canvas = $('monthlyChart');
  const txs = getMonthTx();

  // Get how many days in the month
  const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
  const dailyExpense = new Array(daysInMonth).fill(0);

  txs.filter(t => t.type === 'expense').forEach(t => {
    const day = new Date(t.date + 'T00:00:00').getDate();
    dailyExpense[day - 1] += t.amount;
  });

  const maxVal = Math.max(...dailyExpense, 1);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  const W = canvas.parentElement.offsetWidth - 24;
  const H = 140;
  canvas.width  = W;
  canvas.height = H;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  const barW   = W / daysInMonth;
  const padTop = 10;
  const padBot = 22;

  dailyExpense.forEach((val, i) => {
    const barH = ((val / maxVal) * (H - padTop - padBot));
    const x = i * barW;
    const y = H - padBot - barH;

    // Bar fill
    const alpha = val > 0 ? 1 : 0.15;
    ctx.fillStyle = `rgba(79,70,229,${alpha})`;
    ctx.beginPath();
    ctx.roundRect(x + barW * 0.1, y, barW * 0.8, barH, [3, 3, 0, 0]);
    ctx.fill();

    // Day label every 5 days
    if ((i + 1) % 5 === 0 || i === 0 || i === daysInMonth - 1) {
      ctx.fillStyle = isDark ? '#94a3b8' : '#718096';
      ctx.font = '9px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(i + 1, x + barW / 2, H - 5);
    }
  });
}

function renderMonthlyTxList() {
  const txs = getMonthTx();
  const container = $('monthlyTxList');
  renderTxList(container, txs);
}

$('prevMonth').addEventListener('click', () => {
  currentMonth.month--;
  if (currentMonth.month < 0) { currentMonth.month = 11; currentMonth.year--; }
  renderMonthlyTab();
});

$('nextMonth').addEventListener('click', () => {
  currentMonth.month++;
  if (currentMonth.month > 11) { currentMonth.month = 0; currentMonth.year++; }
  renderMonthlyTab();
});

// ─────────────────────────────────────────────
// 12. CATEGORIES TAB
// ─────────────────────────────────────────────
function renderCategoryList() {
  const ul = $('categoryList');
  ul.innerHTML = '';
  categories.forEach((cat, idx) => {
    const li = document.createElement('li');
    li.className = 'category-item';
    li.innerHTML = `
      <div class="cat-left">
        <span class="cat-swatch" style="background:${PALETTE[idx % PALETTE.length]}"></span>
        ${cat.name}
        ${cat.isDefault ? '<span class="cat-default-badge">default</span>' : ''}
      </div>
      ${!cat.isDefault
        ? `<button class="cat-delete" data-name="${cat.name}" title="Delete category">✕</button>`
        : ''}
    `;
    ul.appendChild(li);
  });
}

$('categoryForm').addEventListener('submit', e => {
  e.preventDefault();
  const raw  = $('newCategoryInput').value.trim();
  if (!raw) return;

  // Title-case
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);

  if (categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('Category already exists.');
    return;
  }

  categories.push({ name, isDefault: false });
  saveCats();
  populateCategorySelect();
  renderCategoryList();
  $('newCategoryInput').value = '';
  showToast(`Category "${name}" added ✓`);
});

$('categoryList').addEventListener('click', e => {
  const btn = e.target.closest('.cat-delete');
  if (!btn) return;
  const name = btn.dataset.name;

  // Check if any tx uses this category
  const used = transactions.some(t => t.category === name);
  if (used) {
    showToast('Cannot delete: category is in use.');
    return;
  }

  categories = categories.filter(c => c.name !== name);
  saveCats();
  populateCategorySelect();
  renderCategoryList();
  showToast(`Category "${name}" removed`);
});

// ─────────────────────────────────────────────
// 13. RENDER ALL (dashboard)
// ─────────────────────────────────────────────
function renderAll() {
  renderBalance();
  renderTxList($('txList'), transactions);
  renderCategoryChart();
}

// ─────────────────────────────────────────────
// 14. INIT
// ─────────────────────────────────────────────
function init() {
  loadData();
  initMonth();
  populateCategorySelect();
  renderAll();

  // Re-render chart on resize (responsive canvas)
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderCategoryChart();
      if ($('tab-monthly').classList.contains('active')) renderMonthlyChart();
    }, 200);
  });
}

init();
