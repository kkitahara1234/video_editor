import * as fs from 'fs';
const data = JSON.parse(fs.readFileSync('data/work/candidates.json','utf-8'));
const properNouns = JSON.parse(fs.readFileSync('/Volumes/編集用/wellness-shared/proper-nouns.json','utf-8'));

console.log('=== 違和感パターン全件診断 ===\n');

const patterns: Array<{name: string, regex?: RegExp, between?: (c:string,n:string)=>boolean, proper?: boolean}> = [
  // === 行頭禁止 ===
  { name: '行頭: 拗音', regex: /^[ゃゅょャュョ]/ },
  { name: '行頭: 促音', regex: /^[っッ]/ },
  { name: '行頭: 長音', regex: /^ー/ },
  { name: '行頭: 小文字', regex: /^[ぁぃぅぇぉァィゥェォ]/ },
  // === 句読点記号 ===
  { name: '？！混入', regex: /[？！?!]/ },
  // === 数字 ===
  { name: '数字連続分断', between: (c,n) => /[0-9０-９]$/.test(c) && /^[0-9０-９]/.test(n) },
  // === 接続助詞 ===
  { name: 'と+か', between: (c,n) => c.endsWith('と') && n.startsWith('か') },
  // === 形式名詞 ===
  { name: 'こと+も', between: (c,n) => c.endsWith('こと') && n.startsWith('も') },
  { name: 'こと+は', between: (c,n) => c.endsWith('こと') && n.startsWith('は') },
  { name: 'こと+の', between: (c,n) => c.endsWith('こと') && n.startsWith('の') },
  { name: 'もの+も', between: (c,n) => c.endsWith('もの') && n.startsWith('も') },
  { name: 'もの+は', between: (c,n) => c.endsWith('もの') && n.startsWith('は') },
  { name: 'もの+の', between: (c,n) => c.endsWith('もの') && n.startsWith('の') },
  // === 動詞活用 ===
  { name: '動詞+なく/ない', between: (c,n) => /[かなさたまはらわ]$/.test(c) && /^(なく|ない|なくて|なかった)/.test(n) },
  { name: '動詞+てい', between: (c,n) => /[えきしせて]$/.test(c) && /^(てい|ている|ています)/.test(n) },
  { name: '動詞連用+て/た/ます', between: (c,n) => /[いきしちにひみり]$/.test(c) && /^(て|た|ます|ました|たい|たく)/.test(n) },
  { name: '思っ+て/た', between: (c,n) => c.endsWith('思っ') && /^[てた]/.test(n) },
  { name: '考え+て/た', between: (c,n) => c.endsWith('考え') && /^(て|た|る|ます)/.test(n) },
  { name: 'やっ+て/た', between: (c,n) => c.endsWith('やっ') && /^[てた]/.test(n) },
  { name: '言っ+て/た', between: (c,n) => c.endsWith('言っ') && /^[てた]/.test(n) },
  // === 形容詞 ===
  { name: '形容詞く+て/ない', between: (c,n) => /く$/.test(c) && /^(て|ない|なる)/.test(n) },
  // === 接続表現 ===
  { name: 'じゃ+ない/なく', between: (c,n) => c.endsWith('じゃ') && /^(ない|なく|なくて)/.test(n) },
  { name: 'けれど+も', between: (c,n) => c.endsWith('けれど') && n.startsWith('も') },
  // === 副詞分断 ===
  { name: 'すごく+動詞等', between: (c,n) => c === 'すごく' },
  { name: 'とても+動詞等', between: (c,n) => c === 'とても' },
  { name: 'ちょっと+動詞等', between: (c,n) => c === 'ちょっと' },
  { name: 'やっぱり+動詞等', between: (c,n) => c === 'やっぱり' },
  // === 助詞連続 ===
  { name: 'では+なく/ない', between: (c,n) => c.endsWith('では') && /^(なく|ない)/.test(n) },
  { name: 'しか+ない/なく', between: (c,n) => c.endsWith('しか') && /^(ない|なく)/.test(n) },
  { name: 'だけ+で/の/は', between: (c,n) => c.endsWith('だけ') && /^(で|の|じゃ|は|を|が|に)/.test(n) },
  // === 助動詞 ===
  { name: 'でしょ+う', between: (c,n) => c.endsWith('でしょ') && n.startsWith('う') },
  { name: 'だろ+う', between: (c,n) => c.endsWith('だろ') && n.startsWith('う') },
  { name: 'ます+ね/よ/から', between: (c,n) => c.endsWith('ます') && /^(ね|よ|から|けど)/.test(n) },
  { name: 'です+ね/よ/から', between: (c,n) => c.endsWith('です') && /^(ね|よ|から|けど|けれど)/.test(n) },
  // === 形式名詞追加 ===
  { name: 'わけ+です/が', between: (c,n) => c.endsWith('わけ') && /^(です|が|ない|で)/.test(n) },
  { name: 'ところ+で/に', between: (c,n) => c.endsWith('ところ') && /^(で|に|から|を|が)/.test(n) },
  { name: 'はず+です/が', between: (c,n) => c.endsWith('はず') && /^(です|が|ない|で)/.test(n) },
  // === 名詞修飾 ===
  { name: 'の+人/もの/こと', between: (c,n) => c.endsWith('の') && /^(人|もの|こと|とき|方|時|場合|よう)/.test(n) },
  // === 引用 ===
  { name: 'と+言う/思う/考える', between: (c,n) => c.endsWith('と') && /^(言|思|考|聞)/.test(n) },
  // === 口語 ===
  { name: 'みたい+な/に/だ', between: (c,n) => c.endsWith('みたい') && /^(な|に|だ|で|です)/.test(n) },
  { name: 'よう+な/に/だ', between: (c,n) => c.endsWith('よう') && /^(な|に|だ|で|です)/.test(n) },
  { name: 'しま+う系', between: (c,n) => c.endsWith('しま') && /^う/.test(n) },
  { name: 'うみた+い', between: (c,n) => c.endsWith('うみた') && /^い/.test(n) },
  // === 接尾辞分断 ===
  { name: 'が+ち（がち分断）', between: (c,n) => c.endsWith('が') && n.startsWith('ち') && /[ぁ-んァ-ン一-龯]/.test(c.slice(-2, -1)) },
  // === テロップ長 ===
  { name: '3字以下テロップ', regex: /^.{1,3}$/ },
  { name: 'proper-noun 分断', proper: true },
];

let totalIssues = 0;
const results: Array<{name: string, count: number}> = [];

for (const p of patterns) {
  let count = 0;
  const examples: string[] = [];

  if (p.proper) {
    for (const noun of properNouns) {
      for (const c of data.candidates) {
        for (let i = 0; i < c.telops.length - 1; i++) {
          const cur = c.telops[i].text;
          const next = c.telops[i+1].text;
          for (let len = 1; len < noun.length; len++) {
            if (cur.endsWith(noun.slice(0, len)) && next.startsWith(noun.slice(len))) {
              if (examples.length < 3) examples.push(c.shortId + ' [' + i + ']: "' + cur + '"+"' + next + '"');
              count++;
            }
          }
        }
      }
    }
  } else if (p.regex) {
    for (const c of data.candidates) {
      for (const t of c.telops) {
        if (p.regex.test(t.text)) {
          if (examples.length < 3) examples.push(c.shortId + ': "' + t.text + '"');
          count++;
        }
      }
    }
  } else if (p.between) {
    for (const c of data.candidates) {
      for (let i = 0; i < c.telops.length - 1; i++) {
        if (p.between(c.telops[i].text, c.telops[i+1].text)) {
          if (examples.length < 3) examples.push(c.shortId + ' [' + i + ']: "' + c.telops[i].text + '"+"' + c.telops[i+1].text + '"');
          count++;
        }
      }
    }
  }

  if (count > 0) {
    console.log(p.name + ': ' + count + '件');
    examples.forEach(e => console.log('  ' + e));
    totalIssues += count;
    results.push({ name: p.name, count });
  }
}

console.log('\n=== Total issues: ' + totalIssues + ' ===');
console.log('\n=== Top issues ===');
results.sort((a,b) => b.count - a.count);
for (const r of results.slice(0, 10)) {
  console.log('  ' + r.count + '件: ' + r.name);
}
