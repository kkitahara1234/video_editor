import * as XLSX from 'xlsx';

export type XlsxTelop = {
  rowNum: number;      // xlsx 行番号（デバッグ用）
  camId: string;       // cam-0000
  idx: number;         // cam内連番
  angle: string;       // front/left/right
  topic: string;       // トピック名
  startSec: number;    // 絶対開始（秒）
  endSec: number;      // 絶対終了（秒）
  durationSec: number; // 秒
  text: string;        // テロップ本文（元）
  charCount: number;   // 文字数
};

/**
 * 時刻文字列を秒に変換
 * "00:00:01.080" → 1.08
 * "00:01:30.500" → 90.5
 */
function parseTime(timeStr: string): number {
  const [hms, ms] = timeStr.split('.');
  const parts = hms.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const s = parseInt(parts[2], 10);
  const millis = ms ? parseInt(ms.padEnd(3, '0').slice(0, 3), 10) : 0;
  return h * 3600 + m * 60 + s + millis / 1000;
}

/**
 * script_check.xlsx を読み込み、全テロップ行を返す
 *
 * シート: subtitles
 * ヘッダ: #, cam_id, idx, angle, topic, 絶対開始, 絶対終了, 秒, テロップ（元）, 修正案 ✏️, アクション, 文字数, ⚠️
 */
export function loadXlsxTelops(xlsxPath: string): XlsxTelop[] {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets['subtitles'];
  if (!ws) {
    throw new Error(`Sheet "subtitles" not found in ${xlsxPath}`);
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

  // ヘッダ行スキップ
  const telops: XlsxTelop[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 9) continue;

    const rowNum = row[0] as number;
    const camId = String(row[1] ?? '');
    const idx = Number(row[2] ?? 0);
    const angle = String(row[3] ?? '');
    const topic = String(row[4] ?? '');
    const startStr = String(row[5] ?? '');
    const endStr = String(row[6] ?? '');
    const durationSec = Number(row[7] ?? 0);
    const text = String(row[8] ?? '');
    const charCount = Number(row[11] ?? text.length);

    if (!startStr || !endStr || !text) continue;

    telops.push({
      rowNum,
      camId,
      idx,
      angle,
      topic,
      startSec: parseTime(startStr),
      endSec: parseTime(endStr),
      durationSec,
      text,
      charCount,
    });
  }

  return telops;
}
