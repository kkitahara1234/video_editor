#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { loadConfig } from './lib/loadConfig.js';

async function main() {
  const configPath = path.resolve('project.json');
  const config = loadConfig(configPath);
  const candidatesPath = path.resolve(config.workDir, 'candidates.json');
  const d = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));

  const wb = XLSX.utils.book_new();

  for (const c of d.candidates) {
    const rows: any[][] = [
      ['#', 'startSec', 'endSec', 'text (編集可)', '元text (参考)', 'emphasis (JSON)', 'chars', 'NG'],
    ];
    for (let i = 0; i < c.telops.length; i++) {
      const t = c.telops[i];
      rows.push([
        i + 1,
        t.startSec.toFixed(2),
        t.endSec.toFixed(2),
        t.text,
        t.text,
        JSON.stringify(t.emphasis || []),
        t.text.length,
        '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 5 },
      { wch: 10 },
      { wch: 10 },
      { wch: 25 },
      { wch: 25 },
      { wch: 30 },
      { wch: 6 },
      { wch: 5 },
    ];
    const sheetName = c.shortId.substring(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const outPath = path.resolve(config.workDir, 'review-edit.xlsx');
  XLSX.writeFile(wb, outPath);
  console.log(`✅ Exported: ${outPath}`);
  console.log(`Open: open ${outPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
