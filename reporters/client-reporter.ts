import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult,
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';

type Row = {
  index: number;
  module: string;
  test: string;
  status: 'Passed' | 'Failed' | 'Skipped' | 'Flaky' | 'Timed Out';
  durationSec: string;
  browser: string;
  notes: string;
};

const STATUS_LABEL: Record<string, Row['status']> = {
  passed: 'Passed',
  failed: 'Failed',
  skipped: 'Skipped',
  timedOut: 'Timed Out',
  interrupted: 'Failed',
};

function escapeCsv(value: string): string {
  if (value == null) return '';
  const needsQuoting = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function deriveModule(test: TestCase): string {
  const file = test.location?.file ?? '';
  const match = file.match(/[\\/]tests[\\/]([^\\/]+)[\\/]/);
  if (match) return match[1];
  const titlePath = test.titlePath();
  return titlePath[2] || titlePath[1] || 'General';
}

function firstLine(value: string): string {
  if (!value) return '';
  return value.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? '';
}

export default class ClientReporter implements Reporter {
  private rows: Row[] = [];
  private startedAt = new Date();
  private outputDir: string;

  constructor(options: { outputDir?: string } = {}) {
    this.outputDir = options.outputDir ?? 'client-report';
  }

  onBegin(_config: FullConfig, _suite: Suite): void {
    this.startedAt = new Date();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const status: Row['status'] =
      test.outcome() === 'flaky' ? 'Flaky' : STATUS_LABEL[result.status] ?? 'Failed';

    const errorMsg = result.error?.message ? firstLine(result.error.message) : '';
    const notes =
      status === 'Passed'
        ? ''
        : status === 'Skipped'
          ? 'Not run'
          : errorMsg || 'See detailed report';

    this.rows.push({
      index: this.rows.length + 1,
      module: deriveModule(test),
      test: test.title,
      status,
      durationSec: (result.duration / 1000).toFixed(1),
      browser: test.parent?.project()?.name ?? '',
      notes,
    });
  }

  async onEnd(result: FullResult): Promise<void> {
    const outDir = path.resolve(this.outputDir);
    fs.mkdirSync(outDir, { recursive: true });

    this.rows.sort((a, b) =>
      a.module === b.module ? a.test.localeCompare(b.test) : a.module.localeCompare(b.module),
    );
    this.rows.forEach((r, i) => (r.index = i + 1));

    const csvPath = path.join(outDir, 'client-report.csv');
    const htmlPath = path.join(outDir, 'client-summary.html');

    fs.writeFileSync(csvPath, this.buildCsv(), 'utf8');
    fs.writeFileSync(htmlPath, this.buildHtml(result), 'utf8');

    // eslint-disable-next-line no-console
    console.log(`\nClient report:\n  ${csvPath}\n  ${htmlPath}\n`);
  }

  private buildCsv(): string {
    const header = ['#', 'Module', 'Test', 'Status', 'Duration (s)', 'Browser', 'Notes'];
    const lines = [header.map(escapeCsv).join(',')];
    for (const r of this.rows) {
      lines.push(
        [
          String(r.index),
          r.module,
          r.test,
          r.status,
          r.durationSec,
          r.browser,
          r.notes,
        ]
          .map(escapeCsv)
          .join(','),
      );
    }
    return lines.join('\n') + '\n';
  }

  private buildHtml(result: FullResult): string {
    const counts = this.rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.status === 'Passed') acc.passed += 1;
        else if (r.status === 'Failed' || r.status === 'Timed Out') acc.failed += 1;
        else if (r.status === 'Skipped') acc.skipped += 1;
        else if (r.status === 'Flaky') acc.flaky += 1;
        return acc;
      },
      { total: 0, passed: 0, failed: 0, skipped: 0, flaky: 0 },
    );

    const durationSec = ((result.duration ?? 0) / 1000).toFixed(1);
    const finishedAt = new Date();
    const passRate = counts.total ? Math.round((counts.passed / counts.total) * 100) : 0;

    const tableRows = this.rows
      .map((r) => {
        const cls = r.status.toLowerCase().replace(/\s+/g, '-');
        return `<tr class="row-${cls}">
            <td>${r.index}</td>
            <td>${escapeHtml(r.module)}</td>
            <td contenteditable="true">${escapeHtml(r.test)}</td>
            <td><span class="badge badge-${cls}">${escapeHtml(r.status)}</span></td>
            <td>${escapeHtml(r.durationSec)}</td>
            <td>${escapeHtml(r.browser)}</td>
            <td contenteditable="true">${escapeHtml(r.notes)}</td>
          </tr>`;
      })
      .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>E2E Test Report</title>
<style>
  :root { color-scheme: light; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #f6f8fb; color: #1f2937; }
  header { background: #0b3d91; color: white; padding: 24px 32px; }
  header h1 { margin: 0 0 4px; font-size: 22px; }
  header .meta { font-size: 13px; opacity: 0.85; }
  .summary { display: flex; gap: 16px; padding: 24px 32px; flex-wrap: wrap; }
  .card { background: white; border-radius: 8px; padding: 16px 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); min-width: 140px; }
  .card .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
  .card .value { font-size: 26px; font-weight: 600; margin-top: 4px; }
  .card.pass .value { color: #047857; }
  .card.fail .value { color: #b91c1c; }
  .card.skip .value { color: #6b7280; }
  .card.flaky .value { color: #b45309; }
  .toolbar { padding: 0 32px 12px; display: flex; gap: 8px; align-items: center; }
  .toolbar input { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; min-width: 240px; }
  .toolbar button { padding: 8px 14px; background: #0b3d91; color: white; border: 0; border-radius: 6px; cursor: pointer; }
  .toolbar button.secondary { background: white; color: #0b3d91; border: 1px solid #0b3d91; }
  .note { padding: 0 32px 8px; font-size: 12px; color: #6b7280; }
  table { width: calc(100% - 64px); margin: 0 32px 32px; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
  th, td { padding: 10px 12px; text-align: left; font-size: 13px; border-bottom: 1px solid #eef0f4; vertical-align: top; }
  th { background: #f1f4f9; color: #374151; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: 0; }
  td[contenteditable="true"] { outline: none; }
  td[contenteditable="true"]:focus { background: #fffbe6; }
  .badge { padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .badge-passed { background: #d1fae5; color: #047857; }
  .badge-failed, .badge-timed-out { background: #fee2e2; color: #b91c1c; }
  .badge-skipped { background: #e5e7eb; color: #4b5563; }
  .badge-flaky { background: #fef3c7; color: #b45309; }
  footer { padding: 16px 32px 32px; font-size: 12px; color: #6b7280; }
</style>
</head>
<body>
<header>
  <h1>E2E Test Report</h1>
  <div class="meta">Run started ${escapeHtml(this.startedAt.toLocaleString())} &middot; finished ${escapeHtml(finishedAt.toLocaleString())} &middot; duration ${escapeHtml(durationSec)}s &middot; overall: <strong>${escapeHtml(result.status)}</strong></div>
</header>

<section class="summary">
  <div class="card"><div class="label">Total</div><div class="value">${counts.total}</div></div>
  <div class="card pass"><div class="label">Passed</div><div class="value">${counts.passed}</div></div>
  <div class="card fail"><div class="label">Failed</div><div class="value">${counts.failed}</div></div>
  <div class="card skip"><div class="label">Skipped</div><div class="value">${counts.skipped}</div></div>
  <div class="card flaky"><div class="label">Flaky</div><div class="value">${counts.flaky}</div></div>
  <div class="card"><div class="label">Pass rate</div><div class="value">${passRate}%</div></div>
</section>

<div class="toolbar">
  <input id="filter" type="search" placeholder="Filter by module, test or status..." />
  <button onclick="window.print()">Print / Save as PDF</button>
  <button class="secondary" onclick="downloadCsv()">Download CSV</button>
</div>
<div class="note">Tip: the <em>Test</em> and <em>Notes</em> columns are editable — click a cell and type. Use “Download CSV” to save your edits.</div>

<table id="report">
  <thead>
    <tr>
      <th>#</th><th>Module</th><th>Test</th><th>Status</th><th>Duration (s)</th><th>Browser</th><th>Notes</th>
    </tr>
  </thead>
  <tbody>
    ${tableRows}
  </tbody>
</table>

<footer>Generated automatically from the nightly E2E run. Editable fields are saved only when you click <strong>Download CSV</strong>.</footer>

<script>
  const filterInput = document.getElementById('filter');
  filterInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#report tbody tr').forEach((row) => {
      row.style.display = row.innerText.toLowerCase().includes(q) ? '' : 'none';
    });
  });

  function downloadCsv() {
    const rows = [['#','Module','Test','Status','Duration (s)','Browser','Notes']];
    document.querySelectorAll('#report tbody tr').forEach((tr) => {
      rows.push(Array.from(tr.children).map((td) => td.innerText.trim()));
    });
    const csv = rows.map((r) => r.map((v) => {
      const needsQuoting = /[",\\n\\r]/.test(v);
      const esc = v.replace(/"/g, '""');
      return needsQuoting ? '"' + esc + '"' : esc;
    }).join(',')).join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'e2e-report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
</script>
</body>
</html>
`;
  }
}
