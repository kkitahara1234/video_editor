/**
 * Whisper誤認識のレンダリング時補正
 * 長尺 wellness-video の TelopLine.tsx から切り出し
 * long-form & shorts 両方から import される
 */

// ── 表示直前の表記固定 ───────────────────────────────────
// prepare.ts と二重に補正することで、script.json が古い場合も正しく表示される。
// ★ 順番重要: 「ザ・付き」を先に処理しないと「ザ・The Well-being」二重表記になる
export const DISPLAY_CORRECTIONS: Array<[RegExp, string]> = [
  // ─ 人名 ─
  [/中田(?:こう太郎|光太郎|康太郎|孝太郎|幸太郎|好太郎|広太郎|皇太郎)/g, "中田航太郎"],
  [/橋本(?:まき|マキ|真樹|真紀|真記|万喜)/g,                              "橋本真希"],
  // ─ 敬称付き人名 ─
  [/(?:Dr\.|ドクター|どくたー)\s*中田/g,                                   "Dr.中田"],
  [/(?:Dr\.|ドクター|どくたー)\s*なかた/g,                                  "Dr.中田"],
  // ─ 固有語（ザ・付き変種を先に処理して二重表記を防ぐ）─
  [/ザ[・\s]*(?:ウェルビーイング|ウェルビーング|ウェルビング)/gi,           "The Well-being"],
  [/ザ[・\s]+[Tt]he\s+[Ww]ell[\s\-]?[Bb]eing/g,                           "The Well-being"],
  [/ウェルビーイング|ウェルビーング|ウェルビング/gi,                        "The Well-being"],
  [/(?<!The\s)[Ww]ell[\s\-]?[Bb]eing/g,                                     "The Well-being"],
  [/じゅんレギュラー|準れぎゅらー/g,                                         "準レギュラー"],
  // ─ 放送局名 ─
  [/クロス\s?FM/g,                                                          "CROSS FM"],
  // ─ 句読点（念のため render 時にも除去）─
  [/[、。]/g, ""],
];

export function fixText(text: string): string {
  return DISPLAY_CORRECTIONS.reduce((t, [re, rep]) => t.replace(re, rep), text);
}
