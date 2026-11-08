# 폰트 파일에서 x-height 비율·한글 자폭·숫자 폭·tnum 지원을 읽는다. 실행: python -I fontmetrics.py <files...>
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen

def bounds(font, gs, ch):
    cmap = font.getBestCmap(); g = cmap.get(ord(ch))
    if not g: return None
    p = BoundsPen(gs); gs[g].draw(p); return p.bounds

def adv(font, ch):
    g = font.getBestCmap().get(ord(ch)); return font['hmtx'][g][0] if g else None

def features(font):
    out = set()
    if 'GSUB' in font and font['GSUB'].table.FeatureList:
        for fr in font['GSUB'].table.FeatureList.FeatureRecord: out.add(fr.FeatureTag)
    return out

print('| 폰트 | upm | x-height/em (OS/2 sxHeight · 실측 x) | cap/em | 한글 자폭/em (가·한·뷁) | 한글 글리프 높이/em(한) | 숫자 폭/em (0·1·7) | 숫자 등폭 | tnum/pnum | 한글 음절 수 | 라틴 a 폭/em |')
print('|---|---|---|---|---|---|---|---|---|---|---|')
for path in sys.argv[1:]:
    f = TTFont(path, fontNumber=0); upm = f['head'].unitsPerEm; gs = f.getGlyphSet()
    os2 = f['OS/2']; sx = getattr(os2, 'sxHeight', 0); cap = getattr(os2, 'sCapHeight', 0)
    bx = bounds(f, gs, 'x'); bh = bounds(f, gs, '한')
    han = [adv(f, c) for c in '가한뷁']; dig = [adv(f, c) for c in '0123456789']
    feats = features(f); cm = f.getBestCmap(); syl = sum(1 for c in cm if 0xAC00 <= c <= 0xD7A3)
    r = lambda v: f'{v/upm:.3f}' if v else '—'
    hanh = f'{(bh[3]-bh[1])/upm:.3f}' if bh else '—'
    print(f"| {os.path.basename(path)} | {upm} | {r(sx)} · {r(bx[3]) if bx else '—'} | {r(cap)} | {'/'.join(r(v) for v in han)} | {hanh} | {r(dig[0])}/{r(dig[1])}/{r(dig[7])} | {'예' if len(set(dig))==1 else '아니오('+str(len(set(dig)))+'종)'} | {'tnum' if 'tnum' in feats else '—'}/{'pnum' if 'pnum' in feats else '—'} | {syl:,} | {r(adv(f,'a'))} |")
