#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './lib/loadConfig.js';

type Emphasis = { start: number; end: number; label?: string };
type Telop = { text: string; startSec: number; endSec: number; emphasis: Emphasis[] };
type CameraSwitch = { atSec: number; camera: 'left' | 'right' };

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTelopText(telop: Telop): string {
  if (telop.emphasis.length === 0) return escapeHtml(telop.text);
  // emphasis を start でソート
  const sorted = [...telop.emphasis].sort((a, b) => a.start - b.start);
  let html = '';
  let pos = 0;
  for (const e of sorted) {
    if (e.start > pos) html += escapeHtml(telop.text.slice(pos, e.start));
    html += `<mark>${escapeHtml(telop.text.slice(e.start, e.end))}</mark>`;
    pos = e.end;
  }
  if (pos < telop.text.length) html += escapeHtml(telop.text.slice(pos));
  return html;
}

function renderCameraTimeline(switches: CameraSwitch[], totalSec: number): string {
  let html = '<div class="timeline">';
  for (let i = 0; i < switches.length; i++) {
    const s = switches[i];
    const nextSec = switches[i + 1]?.atSec ?? totalSec;
    const width = ((nextSec - s.atSec) / totalSec) * 100;
    const color = s.camera === 'left' ? '#4a90e2' : '#e2904a';
    html += `<div class="cam" style="width:${width}%; background:${color};" title="${s.camera} ${s.atSec.toFixed(1)}s">${s.camera[0].toUpperCase()}</div>`;
  }
  html += '</div>';
  return html;
}

async function main() {
  const configPath = path.resolve('project.json');
  const config = loadConfig(configPath);

  const candidatesPath = path.resolve(config.workDir, 'candidates.json');
  const candidatesData = JSON.parse(fs.readFileSync(candidatesPath, 'utf-8'));

  const scriptsDir = path.resolve(config.workDir, '..', 'scripts');

  let html = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<title>Review: ${escapeHtml(config.projectName)}</title>
<style>
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; padding: 20px; }
  .short { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
  .header h2 { margin: 0; color: #333; }
  .meta { color: #666; font-size: 14px; margin-top: 5px; }
  .hook { background: #fff8e1; padding: 8px 12px; border-left: 4px solid #ffc107; margin-bottom: 15px; font-size: 13px; color: #666; }
  .telops { margin-bottom: 15px; }
  .telop { padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 16px; }
  .telop:last-child { border-bottom: none; }
  .telop-time { color: #999; font-size: 12px; margin-right: 10px; }
  mark { background: #ffeb3b; padding: 0 3px; border-radius: 3px; font-weight: bold; }
  .timeline { display: flex; height: 30px; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; margin-top: 10px; }
  .cam { color: white; text-align: center; line-height: 30px; font-weight: bold; font-size: 11px; }
  .switches-info { color: #666; font-size: 12px; margin-top: 5px; }
</style>
</head><body>
<h1>Review: ${escapeHtml(config.projectName)}</h1>
<p>Total ${candidatesData.candidates.length} shorts</p>
`;

  for (const candidate of candidatesData.candidates) {
    const scriptPath = path.join(scriptsDir, `script-${candidate.shortId}.json`);
    if (!fs.existsSync(scriptPath)) continue;
    const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));

    const totalSec = (candidate.endSec - candidate.startSec);

    html += `<div class="short">
<div class="header">
  <h2>${escapeHtml(candidate.shortId)}: ${escapeHtml(candidate.label)}</h2>
  <div class="meta">
    Topic: ${escapeHtml(candidate.topicId)} | Score: ${candidate.score} |
    Duration: ${totalSec.toFixed(1)}s (${candidate.startSec.toFixed(1)}-${candidate.endSec.toFixed(1)}s) |
    Telops: ${script.telops.length} | Emphasis: ${candidate.totalEmphasis}
  </div>
</div>`;

    if (candidate.hookFirstTelop?.text) {
      html += `<div class="hook">Hook (ref): ${escapeHtml(candidate.hookFirstTelop.text)}</div>`;
    }

    html += '<div class="telops">';
    for (const t of script.telops) {
      html += `<div class="telop"><span class="telop-time">${t.startSec.toFixed(1)}s-${t.endSec.toFixed(1)}s</span> ${renderTelopText(t)}</div>`;
    }
    html += '</div>';

    html += `<div><strong>Camera Timeline:</strong></div>`;
    html += renderCameraTimeline(script.cameraSwitches, totalSec);
    html += `<div class="switches-info">${script.cameraSwitches.length} switches: ${script.cameraSwitches.map((s: CameraSwitch) => `${s.atSec.toFixed(1)}s ${s.camera}`).join(' → ')}</div>`;

    html += '</div>';
  }

  html += '</body></html>';

  const outPath = path.resolve('review.html');
  fs.writeFileSync(outPath, html);
  console.log(`✅ Review HTML generated: ${outPath}`);
  console.log(`Open: open ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
