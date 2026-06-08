#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { loadConfig } from './lib/loadConfig.js';
import { fixText } from '../../wellness-shared/display-corrections.js';

const DICTIONARY_PATH = '/Volumes/編集用/wellness-shared/dictionary.json';
const TELOP_MAX_CHARS = 12;

function loadDictionary(): Record<string, string> {
  if (!fs.existsSync(DICTIONARY_PATH)) return {};
  return JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
}

function applyDictionary(text: string, dict: Record<string, string>): string {
  let r = text;
  const sorted = Object.entries(dict).sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) r = r.split(from).join(to);
  return fixText(r);
}

async function main() {
  const configPath = path.resolve('project.json');
  const config = loadConfig(configPath);
  const candidatesPath = path.resolve(config.workDir, 'candidates.json');
  const excelPath = path.resolve(config.workDir, 'review-edit.xlsx');

  if (!fs.existsSync(excelPath)) {
    console.error(`Excel not found: ${excelPath}`);
    process.exit(1);
  }

  const ts = Math.floor(Date.now() / 1000);
  fs.copyFileSync(candidatesPath, `${candidatesPath}.bak.before-excel-import.${ts}`);
  console.log(`Backup: candidates.json.bak.before-excel-import.${ts}`);

  const d = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));
  const wb = XLSX.readFile(excelPath);
  const dict = loadDictionary();

  let totalEdits = 0;
  let totalDeleted = 0;
  let totalOver12 = 0;

  for (const c of d.candidates) {
    const sheetName = c.shortId.substring(0, 31);
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      console.warn(`Sheet not found: ${sheetName}`);
      continue;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any;
    const dataRows = rows.slice(1);

    const newTelops: any[] = [];

    for (let i = 0; i < c.telops.length; i++) {
      const t = c.telops[i];
      const row = dataRows[i];
      if (!row) {
        console.warn(`${c.shortId}: row ${i + 1} missing in Excel`);
        newTelops.push(t);
        continue;
      }

      const ngFlag = (row[7] || '').toString().trim();
      if (ngFlag === '✗' || ngFlag.toLowerCase() === 'ng' || ngFlag === 'x' || ngFlag === '×') {
        console.log(`${c.shortId}: removing telop ${i + 1} (${t.text})`);
        totalDeleted++;
        continue;
      }

      const newText = (row[3] || '').toString();
      if (newText !== t.text) {
        let processed = newText.replace(/[、。,.]/g, '');
        processed = applyDictionary(processed, dict).trim();

        if (processed.length > TELOP_MAX_CHARS) {
          console.warn(`${c.shortId} [${i + 1}]: ${processed.length}文字 > ${TELOP_MAX_CHARS} ("${processed}")`);
          totalOver12++;
        }

        const newEmphasis = (t.emphasis || []).map((e: any) => {
          if (!e.label) return null;
          const idx = processed.indexOf(e.label);
          if (idx < 0) return null;
          return { start: idx, end: idx + e.label.length, label: e.label };
        }).filter((e: any) => e !== null);

        newTelops.push({
          ...t,
          text: processed,
          emphasis: newEmphasis,
        });
        totalEdits++;
      } else {
        newTelops.push(t);
      }
    }

    c.telops = newTelops;
    c.totalEmphasis = newTelops.reduce((sum: number, t: any) => sum + (t.emphasis?.length ?? 0), 0);
  }

  fs.writeFileSync(candidatesPath, JSON.stringify(d, null, 2));

  console.log(`\n=== Import Summary ===`);
  console.log(`Edits: ${totalEdits}`);
  console.log(`Deleted: ${totalDeleted}`);
  console.log(`12char over: ${totalOver12}`);
  console.log(`\n候補ごとの telops 数:`);
  for (const c of d.candidates) {
    console.log(`  ${c.shortId}: ${c.telops.length} telops`);
  }

  console.log(`\nNext: pnpm tsx scripts/ingest.ts`);
}

main().catch(e => { console.error(e); process.exit(1); });
