#!/usr/bin/env python3
"""
whisper_terms_master.json から whisper_terms.txt + whisper_terms_overflow.txt を自動生成。

優先度順 (high → medium → low) で 224 tokens 以内に収まる範囲を whisper_terms.txt に、
超過分を whisper_terms_overflow.txt に書き出す。
"""
import json
import tiktoken
from pathlib import Path

SHARED_DIR = Path("/Volumes/編集用/wellness-shared")
MASTER_PATH = SHARED_DIR / "whisper_terms_master.json"
OUTPUT_PATH = SHARED_DIR / "whisper_terms.txt"
OVERFLOW_PATH = SHARED_DIR / "whisper_terms_overflow.txt"
TOKEN_LIMIT = 224

def main():
    master = json.loads(MASTER_PATH.read_text(encoding="utf-8"))
    enc = tiktoken.get_encoding("cl100k_base")

    category_order = master["_meta"]["categories_priority_order"]

    all_terms = []
    for cat_name in category_order:
        if cat_name not in master["categories"]:
            continue
        cat_data = master["categories"][cat_name]
        for term in cat_data["terms"]:
            all_terms.append((cat_name, cat_data["priority"], term))

    active_terms = []
    overflow_terms = []
    current_tokens = 0

    for cat_name, priority, term in all_terms:
        candidate_list = [t for _, _, t in active_terms] + [term]
        candidate = "、".join(candidate_list)
        candidate_tokens = len(enc.encode(candidate))
        if candidate_tokens <= TOKEN_LIMIT:
            active_terms.append((cat_name, priority, term))
            current_tokens = candidate_tokens
        else:
            overflow_terms.append((cat_name, priority, term))

    active_text = "、".join([t for _, _, t in active_terms])
    overflow_text = "、".join([t for _, _, t in overflow_terms])

    OUTPUT_PATH.write_text(active_text, encoding="utf-8")
    OVERFLOW_PATH.write_text(overflow_text, encoding="utf-8")

    print(f"✅ whisper_terms.txt: {len(active_terms)}件、{current_tokens} tokens (上限 {TOKEN_LIMIT})")
    print(f"📦 overflow.txt: {len(overflow_terms)}件")
    print()
    print("--- アクティブ (Whisper に渡される) ---")
    current_cat = None
    for cat_name, priority, term in active_terms:
        if cat_name != current_cat:
            print(f"\n[{cat_name} ({priority})]")
            current_cat = cat_name
        print(f"  - {term}")
    print()
    print("--- 超過分 (記録のみ、dictionary.json で補完推奨) ---")
    current_cat = None
    for cat_name, priority, term in overflow_terms:
        if cat_name != current_cat:
            print(f"\n[{cat_name} ({priority})]")
            current_cat = cat_name
        print(f"  - {term}")

if __name__ == "__main__":
    main()
