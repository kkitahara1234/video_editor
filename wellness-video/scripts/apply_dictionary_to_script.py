#!/usr/bin/env python3
"""
apply_dictionary_to_script.py

既存 script.json に dictionary.json を追加適用。
prepare.ts のように master.json からゼロ生成しないので、
北原さんの手動修正を保護する。

使い方:
  python3 scripts/apply_dictionary_to_script.py --script <path> --dry-run
  python3 scripts/apply_dictionary_to_script.py --script <path>
"""

import argparse
import json
import re


def apply_dictionary(text: str, dictionary: dict) -> str:
    """長いキー優先で全件置換"""
    sorted_entries = sorted(dictionary.items(), key=lambda x: -len(x[0]))
    for from_str, to_str in sorted_entries:
        text = text.replace(from_str, to_str)
    return text


def apply_display_corrections(text: str) -> str:
    """display-corrections.ts と同等処理"""
    text = re.sub(r'ザ[・\s]*(?:ウェルビーイング|ウェルビーング|ウェルビング)', 'The Well-being', text, flags=re.IGNORECASE)
    text = re.sub(r'(?<!The\s)[Ww]ell[\s\-]?[Bb]eing', 'The Well-being', text)
    text = re.sub(r'クロス\s+FM', 'CROSS FM', text)
    text = re.sub(r'([するたれてっいのな])時(?![間刻代計差点期分秒給空候速進制限効因報距系列節])', r'\1とき', text)
    text = re.sub(r'[、。]', '', text)
    return text


def main():
    parser = argparse.ArgumentParser(
        description='既存 script.json に dictionary + display-corrections を追加適用')
    parser.add_argument('--script', required=True, help='対象 script.json')
    parser.add_argument('--dictionary', default='/Volumes/編集用/wellness-shared/dictionary.json')
    parser.add_argument('--dry-run', action='store_true', help='書き込みしない')
    args = parser.parse_args()

    with open(args.dictionary, 'r', encoding='utf-8') as f:
        dictionary = json.load(f)

    with open(args.script, 'r', encoding='utf-8') as f:
        script = json.load(f)

    changed = 0
    samples = []

    for cam_id, telops in script['subtitles'].items():
        for idx, t in enumerate(telops):
            old = t['text']
            new = apply_dictionary(old, dictionary)
            new = apply_display_corrections(new)
            if new != old:
                changed += 1
                if len(samples) < 20:
                    samples.append((cam_id, idx, old, new))
                if not args.dry_run:
                    t['text'] = new

    print(f'変更: {changed}件')
    print()
    if samples:
        print('--- サンプル（先頭20件）---')
        for cam_id, idx, old, new in samples:
            print(f'  {cam_id}[{idx}]:')
            print(f'    - {old}')
            print(f'    + {new}')

    if not args.dry_run and changed > 0:
        with open(args.script, 'w', encoding='utf-8') as f:
            json.dump(script, f, ensure_ascii=False, indent=2)
        print()
        print(f'✅ script.json 更新 ({changed}件)')
    elif args.dry_run:
        print()
        print('(dry-run、書き込みなし)')
    else:
        print('変更なし')


if __name__ == '__main__':
    main()
