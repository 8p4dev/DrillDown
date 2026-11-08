import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer
# 1. 공식 서브셋 파일의 cmap 을 그대로 유니코드 목록으로 쓴다 (KS X 1001 2,350 + 추가 430 = 2,780 음절 + 라틴·기호)
ref = TTFont('fonts/Pretendard-Regular.subset.woff2'); uni = sorted(ref.getBestCmap().keys())
open('subset-unicodes.txt', 'w').write('\n'.join(f'U+{u:04X}' for u in uni))
def run(src, out, axis=None):
    f = TTFont(src)
    if axis: f = instancer.instantiateVariableFont(f, {'wght': axis})
    opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['kern', 'liga', 'calt', 'tnum', 'pnum', 'lnum', 'ccmp', 'locl']
    opt.hinting = False; opt.ignore_missing_glyphs = True; opt.ignore_missing_unicodes = True; opt.desubroutinize = True; opt.name_IDs = ['*']; opt.notdef_outline = True
    s = subset.Subsetter(opt); s.populate(unicodes=uni); s.subset(f); f.save(out)
    print(f'| {os.path.basename(out)} | {os.path.getsize(out):,} | {axis or "45–920 전체"} | 문자 {len(uni):,} |')
print('| 산출 파일 | 바이트 | wght 축 | 문자 수 |'); print('|---|---|---|---|')
run('fonts/PretendardVariable.woff2', 'fonts2/PretendardVariable.subset-full.woff2')
run('fonts/PretendardVariable.woff2', 'fonts2/PretendardVariable.subset-400-700.woff2', (400, 700))
run('fonts/SUIT-Variable.woff2', 'fonts2/SUIT-Variable.subset-400-700.woff2', (400, 700))
