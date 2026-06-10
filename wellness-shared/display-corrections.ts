/**
 * テロップ表記補正（共通モジュール）
 * long-form & shorts 両方から import される
 *
 * fixText: 正規表現が必要な補正（dictionary.json では対応不可能なパターン）
 * applyDictionary: dictionary.json の完全一致置換 + fixText
 */

import dictionary from './dictionary.json';

// ── 正規表現が必要な補正のみ（完全一致パターンは dictionary.json に移行済み）──
export const DISPLAY_CORRECTIONS: Array<[RegExp, string]> = [
  // ─ 「ザ・」付き二重表記防止（スペース変種、正規表現必須）─
  [/ザ[・\s]*(?:ウェルビーイング|ウェルビーング|ウェルビング)/gi, "The Well-being"],
  [/ザ[・\s]+[Tt]he\s+[Ww]ell[\s\-]?[Bb]eing/g,                 "The Well-being"],
  // ─ 後読み付き（dictionary 不可）─
  [/(?<!The\s)[Ww]ell[\s\-]?[Bb]eing/g,                           "The Well-being"],
  // ─ スペース変種（dictionary 不可）─
  [/クロス\s+FM/g,                                                 "CROSS FM"],
  // ─ 「時」→「とき」（形式名詞、正規表現必須）─
  [/([するたれてっいのな])時(?![間刻代計差点期分秒給空候速進制限効因報距系列節])/g, "$1とき"],
  // ─ 句読点除去（部分一致、dictionary 不可）─
  [/[、。]/g, ""],
];

export function fixText(text: string): string {
  return DISPLAY_CORRECTIONS.reduce((t, [re, rep]) => t.replace(re, rep), text);
}

/**
 * dictionary.json の完全一致置換 + fixText（正規表現補正）
 * 長いキーから先に置換して部分一致の正確性を保つ
 */
export function applyDictionary(text: string): string {
  let result = text;
  const sortedEntries = Object.entries(dictionary as Record<string, string>)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sortedEntries) {
    result = result.split(from).join(to);
  }
  return fixText(result);
}
