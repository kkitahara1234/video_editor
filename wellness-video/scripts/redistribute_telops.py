#!/usr/bin/env python3
"""
redistribute_telops.py

script.json の空 cam にテロップを再配分。
Whisper segment が 6秒の cam 境界を超えた場合の救済策。
prepare.ts は経由しない（手動修正保護）。

使い方:
  python3 redistribute_telops.py --script <path> --dry-run
  python3 redistribute_telops.py --script <path>
"""

import argparse
import json


def main():
    parser = argparse.ArgumentParser(
        description='script.json の空 cam にテロップを再配分')
    parser.add_argument('--script', required=True)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    with open(args.script, 'r', encoding='utf-8') as f:
        script = json.load(f)

    # 各 cam の範囲取得
    cam_ranges = {}
    for seg in script['segments']:
        seg_id = seg.get('id', '')
        if seg_id.startswith('cam-'):
            cam_ranges[seg_id] = {
                'startSec': seg.get('startSec', 0),
                'endSec': seg.get('endSec', 0),
            }

    moves = []

    # 各 cam のテロップを検査
    for cam_id in list(script['subtitles'].keys()):
        if cam_id not in cam_ranges:
            continue
        cam_end = cam_ranges[cam_id]['endSec']
        telops = script['subtitles'][cam_id]

        new_telops = []
        for t in telops:
            tel_start = t.get('absStartSec', 0)

            if tel_start >= cam_end:
                # 正しい cam を探す
                target_cam = None
                for tc, tr in cam_ranges.items():
                    if tr['startSec'] <= tel_start < tr['endSec']:
                        target_cam = tc
                        break
                if target_cam and target_cam != cam_id:
                    moves.append({
                        'from': cam_id,
                        'to': target_cam,
                        'text': t.get('text', ''),
                        'start': tel_start,
                    })
                    if not args.dry_run:
                        if target_cam not in script['subtitles']:
                            script['subtitles'][target_cam] = []
                        script['subtitles'][target_cam].append(t)
                    continue
            new_telops.append(t)

        if not args.dry_run:
            script['subtitles'][cam_id] = new_telops

    # 各 cam のテロップを時系列ソート
    if not args.dry_run:
        for cam_id in script['subtitles']:
            script['subtitles'][cam_id].sort(key=lambda t: t.get('absStartSec', 0))

    print(f'移動: {len(moves)}件')
    if moves:
        print()
        for m in moves[:30]:
            print(f'  {m["from"]} → {m["to"]}: [{m["start"]:.2f}s] "{m["text"][:50]}"')
        if len(moves) > 30:
            print(f'  ... 他 {len(moves) - 30}件')

    # 空 cam の残存チェック
    empty_after = 0
    for seg_id in cam_ranges:
        if seg_id not in script['subtitles'] or len(script['subtitles'].get(seg_id, [])) == 0:
            empty_after += 1

    print()
    print(f'空 cam 残存: {empty_after}件')

    if not args.dry_run and moves:
        with open(args.script, 'w', encoding='utf-8') as f:
            json.dump(script, f, ensure_ascii=False, indent=2)
        print()
        print(f'✅ script.json 更新 ({len(moves)}件移動)')
    elif args.dry_run:
        print()
        print('(dry-run、書き込みなし)')


if __name__ == '__main__':
    main()
