// Run with: node --test scripts/test-training-progress.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Compile the two pure TypeScript utilities in memory; no native runtime required.
function loadUtility(name) {
  const filename = path.resolve(__dirname, '../src/utils', `${name}.ts`);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${outputText}\n})`, { filename })(
    (id) => (id === './date' ? loadUtility('date') : require(id)),
    module,
    module.exports,
  );
  return module.exports;
}
const { buildTrainingConsistency, getMetricChange } = loadUtility('trainingProgress');
const session = (id, date, volume = 100, status = 'completed') => ({
  workout_log_id: id,
  performed_on_date: date,
  volume_kg: volume,
  status,
});

test('consistency uses 12 Monday-based weeks and excludes future, duplicate and unfinished sessions', () => {
  const result = buildTrainingConsistency(
    [
      session('a', '2026-10-26'),
      session('a', '2026-10-26'),
      session('b', '2026-10-26', 200),
      session('c', '2026-10-30', 50, 'in_progress'),
      session('d', '2026-10-31'),
      session('old', '2025-01-01'),
    ],
    '2026-10-30',
  );
  assert.equal(result.weeks.length, 12);
  const current = result.weeks[11];
  assert.equal(current.days[0].date, '2026-10-26');
  assert.equal(current.count, 2);
  assert.equal(current.days[0].volume, 300);
  assert.equal(current.days[4].future, false);
  assert.equal(current.days[5].future, true);
});

test('an unfinished week preserves a streak, but an unsuccessful completed week breaks it', () => {
  const history = [
    '2026-10-12',
    '2026-10-13',
    '2026-10-14',
    '2026-10-19',
    '2026-10-20',
    '2026-10-21',
  ].map((date) => session(date, date));
  assert.equal(buildTrainingConsistency(history, '2026-10-30').streak, 2);
  assert.equal(buildTrainingConsistency(history, '2026-11-01').streak, 2);
  assert.equal(buildTrainingConsistency(history, '2026-11-02').streak, 0);
  history.push(session('1', '2026-10-26'), session('2', '2026-10-27'), session('3', '2026-10-28'));
  assert.equal(buildTrainingConsistency(history, '2026-10-30').streak, 3);
});

test('completed bodyweight/cardio sessions with zero load remain active days', () => {
  const { weeks } = buildTrainingConsistency([session('a', '2026-10-30', 0)], '2026-10-30');
  assert.equal(weeks[11].days[4].level, 1);
  assert.equal(weeks[11].count, 1);
});

test('metric comparison handles missing baselines, zero and duration units', () => {
  assert.equal(getMetricChange({ id: 'volume', value: 10 }, { value: 0 }), null);
  assert.equal(getMetricChange({ id: 'volume', value: null }, { value: 10 }), null);
  assert.equal(getMetricChange({ id: 'sessions', value: 21 }, { value: 19 }).label, '+11%');
  assert.equal(getMetricChange({ id: 'avg_duration', value: 52 }, { value: 55 }).label, '−3 min');
  assert.equal(getMetricChange({ id: 'sessions', value: 5 }, { value: 5 }).label, '0%');
});
