const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { parseSyncReportFile, summarizeSyncReports } = require('../scripts/sync');

function entry(script: string, statuses: string[], cacheWritten: boolean) {
  return {
    script,
    success: statuses.filter((status) => status === 'success').length,
    failed: statuses.filter((status) => status === 'failed').length,
    skipped: statuses.filter((status) => status === 'skipped').length,
    cacheWritten,
    sources: statuses.map((status, index) => ({
      name: `${script}-${index}`,
      status,
    })),
  };
}

test('同步摘要：部分失败时保留成功来源统计', () => {
  const summary = summarizeSyncReports([
    entry('articles', ['success', 'failed', 'skipped'], true),
    entry('projects', ['success'], true),
  ]);

  assert.deepEqual(summary, {
    total: 4,
    success: 2,
    failed: 1,
    skipped: 1,
    cacheWritten: true,
    allFailed: false,
  });
});

test('同步摘要：全部来源失败时给出 allFailed', () => {
  const summary = summarizeSyncReports([
    entry('articles', ['failed', 'failed'], false),
    entry('heatmap', ['failed'], false),
  ]);

  assert.equal(summary.allFailed, true);
  assert.equal(summary.cacheWritten, false);
  assert.equal(summary.failed, 3);
});

test('同步摘要：没有来源时不误报全部失败', () => {
  assert.equal(summarizeSyncReports([]).allFailed, false);
  assert.equal(summarizeSyncReports([entry('projects', [], false)]).allFailed, false);
});

test('同步报告解析：忽略损坏行与缺少 sources 的记录', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'menav-sync-report-test-'));
  const file = path.join(dir, 'report.jsonl');
  fs.writeFileSync(
    file,
    [
      JSON.stringify(entry('articles', ['success'], true)),
      '{not-json',
      JSON.stringify({ script: 'projects' }),
      '',
    ].join('\n'),
    'utf8'
  );

  try {
    const reports = parseSyncReportFile(file);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].script, 'articles');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
