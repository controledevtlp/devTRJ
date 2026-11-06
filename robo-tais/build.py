#!/usr/bin/env python3
"""Gera extensao/robo-tais.js, robo-tais-extensao.zip e index.html (página de instalação) a partir de robo-tais.js."""
import zipfile, pathlib, html
d = pathlib.Path(__file__).parent
js = (d/'robo-tais.js').read_text(encoding='utf-8')
assert '</script' not in js
(d/'extensao'/'robo-tais.js').write_text(js, encoding='utf-8')
with zipfile.ZipFile(d/'robo-tais-extensao.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for n in ('manifest.json', 'robo-tais.js'):
        z.write(d/'extensao'/n, 'robo-tais/'+n)
tpl = (d/'index.template.html').read_text(encoding='utf-8')
manifest = (d/'extensao'/'manifest.json').read_text(encoding='utf-8')
out = tpl.replace('/*__CODIGO__*/', js).replace('/*__MANIFEST__*/', manifest.replace('</', '<\\/'))
(d/'index.html').write_text(out, encoding='utf-8')
print('ok', len(out)//1024, 'KB')
