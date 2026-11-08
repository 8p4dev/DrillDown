import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
from fontTools.ttLib import TTFont
for p in sys.argv[1:]:
    f = TTFont(p); cm = f.getBestCmap()
    syl = sum(1 for c in cm if 0xAC00 <= c <= 0xD7A3)
    print(f"| {os.path.basename(p)} | {os.path.getsize(p):,} | {len(cm):,} | {syl:,} | {'fvar' if 'fvar' in f else '정적'} |")
