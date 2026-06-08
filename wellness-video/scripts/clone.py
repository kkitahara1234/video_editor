#!/usr/bin/env python3
"""
clone.py — プロジェクトを指定フォルダへ複製する。

使い方:
  python3 scripts/clone.py <出力先フォルダ>

コピー対象:
  src/, scripts/, public/, package.json, tsconfig.json, package-lock.json

共有リソース（シンボリックリンク）:
  dictionary.json → ~/wellness-shared/dictionary.json
  ※ 辞書は全プロジェクト共通。更新すれば全プロジェクトに即時反映される。

個別管理（コピーしない）:
  master.json — 音声は回ごとに異なるため個別に npm run transcribe で生成する

除外:
  node_modules/, out/, .claude/
"""

import sys
import shutil
from pathlib import Path

SHARED_DICT = Path.home() / "wellness-shared" / "dictionary.json"

INCLUDE_DIRS  = ["src", "scripts", "public"]
# dictionary.json はシンボリックリンクで共有するためここには含めない
INCLUDE_FILES = ["package.json", "tsconfig.json", "package-lock.json"]
EXCLUDE_NAMES = {"node_modules", "out", ".claude", "__pycache__"}


def copy_dir(src: Path, dst: Path) -> None:
    dst.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if item.name in EXCLUDE_NAMES:
            continue
        target = dst / item.name
        if item.is_dir():
            copy_dir(item, target)
        else:
            shutil.copy2(item, target)


def main() -> None:
    if len(sys.argv) < 2:
        print("使い方: python3 scripts/clone.py <出力先フォルダ>")
        raise SystemExit(1)

    src_root = Path(__file__).resolve().parent.parent
    dst_root = Path(sys.argv[1]).resolve()

    if dst_root.exists():
        print(f"❌ 出力先が既に存在します: {dst_root}")
        raise SystemExit(1)

    dst_root.mkdir(parents=True)

    for d in INCLUDE_DIRS:
        s = src_root / d
        if s.exists():
            copy_dir(s, dst_root / d)
            print(f"  📁 {d}/")

    for f in INCLUDE_FILES:
        s = src_root / f
        if s.exists():
            shutil.copy2(s, dst_root / f)
            print(f"  📄 {f}")

    # dictionary.json: 共有リソースへのシンボリックリンクを作成
    dict_link = dst_root / "dictionary.json"
    if SHARED_DICT.exists():
        dict_link.symlink_to(SHARED_DICT)
        print(f"  🔗 dictionary.json → {SHARED_DICT}")
    else:
        # wellness-shared が未作成の場合はコピーして警告
        src_dict = src_root / "dictionary.json"
        if src_dict.exists():
            shutil.copy2(src_dict, dict_link)
            print(f"  ⚠️  dictionary.json コピー（共有設定未完了: {SHARED_DICT} が見つかりません）")

    print(f"\n✅ 複製完了 → {dst_root}")
    print(f"   次のステップ: cd {dst_root} && npm install")


if __name__ == "__main__":
    main()
