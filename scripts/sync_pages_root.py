"""Copy a /mmbl/ Angular production build to the repository root for branch-mode Pages."""
from pathlib import Path
import shutil

root = Path(__file__).resolve().parent.parent
build = root / 'build/modern-motion/browser'
html = (build / 'index.html').read_text()
if '<base href="/mmbl/">' not in html:
    raise SystemExit('Expected an Angular build with --base-href /mmbl/.')
for pattern in ('main-*.js', 'styles-*.css'):
    for old in root.glob(pattern):
        old.unlink()
(root / 'index.html').write_text(html)
(root / '.nojekyll').touch()
for pattern in ('main-*.js', 'styles-*.css'):
    for file in build.glob(pattern):
        shutil.copy2(file, root / file.name)
shutil.copytree(build / 'assets', root / 'assets', dirs_exist_ok=True)
print('Synced Angular build to repository root for GitHub Pages.')
