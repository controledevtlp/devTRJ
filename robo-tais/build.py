#!/usr/bin/env python3
"""Gera extensao/robo-tais.js, robo-tais-extensao.zip e index.html (página de instalação) a partir de robo-tais.js."""
import zipfile, pathlib, html, base64, json
d = pathlib.Path(__file__).parent
js = (d/'robo-tais.js').read_text(encoding='utf-8')
logo = d/'logo'/'logo-uri.txt'
logo_uri = logo.read_text(encoding='utf-8').strip() if logo.exists() else ''
if logo_uri:
    assert "const LOGO_URI = '';" in js
    js = js.replace("const LOGO_URI = '';", "const LOGO_URI = '" + logo_uri + "';")
assert '</script' not in js
(d/'extensao'/'robo-tais.js').write_text(js, encoding='utf-8')
with zipfile.ZipFile(d/'robo-tais-extensao.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for n in ('manifest.json', 'robo-tais.js', 'background.js'):
        z.write(d/'extensao'/n, 'robo-tais/'+n)
    for ic in sorted((d/'extensao'/'icons').glob('*.png')):
        z.write(ic, 'robo-tais/icons/'+ic.name)
tpl = (d/'index.template.html').read_text(encoding='utf-8')
# na página o manifest é copiado como texto, sem os ícones (arquivos de imagem não dá para copiar)
mj = json.loads((d/'extensao'/'manifest.json').read_text(encoding='utf-8'))
mj.pop('icons', None); mj.get('action', {}).pop('default_icon', None)
manifest = json.dumps(mj, ensure_ascii=False, indent=2)
bg = (d/'extensao'/'background.js').read_text(encoding='utf-8')
uri = lambda n: 'data:image/jpeg;base64,' + base64.b64encode((d/'img'/n).read_bytes()).decode()
out = tpl.replace('/*__IMG_DARK__*/', uri('preview-dark.jpg')).replace('/*__IMG_LIGHT__*/', uri('preview-light.jpg'))
out = out.replace('/*__BG__*/', bg).replace('/*__CODIGO__*/', js).replace('/*__MANIFEST__*/', manifest.replace('</', '<\\/')).replace('/*__LOGO_URI__*/', logo_uri)
(d/'index.html').write_text(out, encoding='utf-8')
print('ok', len(out)//1024, 'KB')
