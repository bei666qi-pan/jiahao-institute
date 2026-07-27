import test from 'node:test';
import assert from 'node:assert/strict';

function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits }).format(Number(value || 0));
}

function formatDuration(seconds) {
  const value = Number(seconds || 0);
  if (value >= 3600) return `${formatNumber(value / 3600, 1)}小时`;
  const minutes = Math.floor(value / 60);
  const rest = Math.round(value % 60);
  return minutes ? `${minutes}分${rest}秒` : `${rest}秒`;
}

function formatCost(micros) {
  return `¥${formatNumber(Number(micros || 0) / 1_000_000, 2)}`;
}

function formatTime(value, withDate = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: withDate ? '2-digit' : undefined,
    day: withDate ? '2-digit' : undefined,
    hour: '2-digit',
    minute: '2-digit',
    second: withDate ? '2-digit' : undefined,
    hour12: false,
  }).format(new Date(value));
}

const NAV = [
  { id: 'overview', label: '总览', icon: 'home', path: '/admin' },
  { id: 'traffic', label: '访问分析', icon: 'bars', path: '/admin/traffic' },
  { id: 'requests', label: '请求明细', icon: 'list', path: '/admin/requests' },
  { id: 'costs', label: '成本分析', icon: 'cost', path: '/admin/costs' },
  { id: 'status', label: '系统状态', icon: 'pulse', path: '/admin/status' },
];

function currentView(pathname) {
  return NAV.find((item) => item.path === pathname)?.id || 'overview';
}

function changeValue(value) {
  const number = Number(value || 0);
  return { trend: number >= 0 ? '↑' : '↓', abs: Math.abs(number).toFixed(1) };
}

function metricCalc(value, previous) {
  const currentNumber = Number(value || 0);
  const previousNumber = Number(previous || 0);
  return {
    value: currentNumber,
    previous: previousNumber,
    change: previousNumber ? ((currentNumber - previousNumber) / previousNumber) * 100 : (currentNumber ? 100 : 0),
  };
}

// ---- formatNumber ----
test('formatNumber formats integers in zh-CN', () => {
  assert.equal(formatNumber(1000), '1,000');
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1234567), '1,234,567');
});

test('formatNumber handles null/undefined as 0', () => {
  assert.equal(formatNumber(null), '0');
  assert.equal(formatNumber(undefined), '0');
  assert.equal(formatNumber(''), '0');
});

test('formatNumber respects maximumFractionDigits', () => {
  assert.equal(formatNumber(3.14159, 2), '3.14');
  assert.equal(formatNumber(3.14159, 0), '3');
  assert.equal(formatNumber(1000.5, 1), '1,000.5');
});

test('formatNumber handles negative numbers', () => {
  assert.equal(formatNumber(-1234), '-1,234');
});

test('formatNumber in zh-CN uses maximumFractionDigits (not minimum)', () => {
  // zh-CN locale with maximumFractionDigits:2 does NOT pad zeros
  assert.equal(formatNumber(1, 2), '1');
  assert.equal(formatNumber(0, 2), '0');
  assert.equal(formatNumber(1.5, 2), '1.5');
  assert.equal(formatNumber(1.50, 2), '1.5');
});

// ---- formatDuration ----
test('formatDuration formats seconds', () => {
  assert.equal(formatDuration(0), '0秒');
  assert.equal(formatDuration(30), '30秒');
  assert.equal(formatDuration(90), '1分30秒');
  assert.equal(formatDuration(125), '2分5秒');
});

test('formatDuration formats hours', () => {
  assert.equal(formatDuration(3600), '1小时');
  assert.equal(formatDuration(5400), '1.5小时');
  assert.equal(formatDuration(7200), '2小时');
});

test('formatDuration handles null/undefined', () => {
  assert.equal(formatDuration(null), '0秒');
  assert.equal(formatDuration(undefined), '0秒');
});

test('formatDuration handles large values', () => {
  const result = formatDuration(86400);
  assert.ok(result.includes('小时'));
});

// ---- formatCost ----
test('formatCost converts micros to yuan', () => {
  // Note: zh-CN maxFractionDigits:2 doesn't pad zeros
  assert.equal(formatCost(0), '¥0');
  assert.equal(formatCost(1000000), '¥1');
  assert.equal(formatCost(1500000), '¥1.5');
  assert.equal(formatCost(500000), '¥0.5');
  assert.equal(formatCost(1234567), '¥1.23');
});

test('formatCost returns correct for tiny values', () => {
  assert.equal(formatCost(1), '¥0');
  assert.equal(formatCost(10000), '¥0.01');
});

test('formatCost handles null', () => {
  assert.equal(formatCost(null), '¥0');
});

// ---- formatTime ----
test('formatTime formats datetime with time only', () => {
  const d = new Date('2026-07-28T14:30:00+08:00');
  const result = formatTime(d);
  assert.ok(result.includes('14:30'));
});

test('formatTime withDate=true includes date', () => {
  const d = new Date('2026-07-28T14:30:00+08:00');
  const result = formatTime(d, true);
  assert.ok(result.includes('07') || result.includes('28'));
  assert.ok(result.includes('14:30'));
});

test('formatTime returns dash for empty', () => {
  assert.equal(formatTime(null), '—');
  assert.equal(formatTime(''), '—');
  assert.equal(formatTime(undefined), '—');
  assert.equal(formatTime(0), '—');
});

// ---- currentView ----
test('currentView returns overview for /admin', () => {
  assert.equal(currentView('/admin'), 'overview');
});

test('currentView returns correct view for each path', () => {
  assert.equal(currentView('/admin/traffic'), 'traffic');
  assert.equal(currentView('/admin/requests'), 'requests');
  assert.equal(currentView('/admin/costs'), 'costs');
  assert.equal(currentView('/admin/status'), 'status');
});

test('currentView defaults to overview for unknown paths', () => {
  assert.equal(currentView('/admin/unknown'), 'overview');
  assert.equal(currentView('/other'), 'overview');
  assert.equal(currentView('/'), 'overview');
});

// ---- changeValue ----
test('changeValue returns correct arrows and abs values', () => {
  assert.deepEqual(changeValue(100), { trend: '↑', abs: '100.0' });
  assert.deepEqual(changeValue(-50), { trend: '↓', abs: '50.0' });
  assert.deepEqual(changeValue(0), { trend: '↑', abs: '0.0' });
  assert.deepEqual(changeValue(12.345), { trend: '↑', abs: '12.3' });
  assert.deepEqual(changeValue(-0.01), { trend: '↓', abs: '0.0' });
});

// ---- metricCalc ----
test('metricCalc calculates correctly', () => {
  assert.deepEqual(metricCalc(150, 100), { value: 150, previous: 100, change: 50 });
  assert.deepEqual(metricCalc(50, 100), { value: 50, previous: 100, change: -50 });
  assert.deepEqual(metricCalc(100, 0), { value: 100, previous: 0, change: 100 });
  assert.deepEqual(metricCalc(0, 0), { value: 0, previous: 0, change: 0 });
  assert.deepEqual(metricCalc(null, null), { value: 0, previous: 0, change: 0 });
});

// ---- NAV constant integrity ----
test('NAV has all 5 sections with correct structure', () => {
  assert.equal(NAV.length, 5);
  const ids = NAV.map(i => i.id);
  assert.deepEqual(ids, ['overview', 'traffic', 'requests', 'costs', 'status']);
  for (const item of NAV) {
    assert.ok(item.id);
    assert.ok(item.label);
    assert.ok(item.icon);
    assert.ok(item.path.startsWith('/admin'));
  }
});
