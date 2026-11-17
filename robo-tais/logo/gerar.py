#!/usr/bin/env python3
"""Gera, a partir de logo-original.webp: os ícones da extensão (extensao/icons/) e a versão redonda
usada no painel (logo/logo-uri.txt, em base64, que o build.py embute no robo-tais.js e na página)."""
import base64, pathlib
from PIL import Image, ImageDraw
d = pathlib.Path(__file__).parent
src = Image.open(d / 'logo-original.webp').convert('RGB')
# a marca (dourado) ocupa x 106..1185 e y 184..974; recorte quadrado centrado nela
box = (70, 4, 1220, 1154)
q = src.crop(box)                                   # 1150 x 1150

def arredondar(im, raio_pct):
    w = im.size[0]; m = Image.new('L', (w * 4, w * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, w * 4 - 1, w * 4 - 1), radius=int(w * 4 * raio_pct), fill=255)
    m = m.resize((w, w), Image.LANCZOS); out = im.convert('RGBA'); out.putalpha(m); return out

def redonda(im):
    w = im.size[0]; m = Image.new('L', (w * 4, w * 4), 0)
    ImageDraw.Draw(m).ellipse((0, 0, w * 4 - 1, w * 4 - 1), fill=255)
    m = m.resize((w, w), Image.LANCZOS); out = im.convert('RGBA'); out.putalpha(m); return out

(d.parent / 'extensao' / 'icons').mkdir(parents=True, exist_ok=True)
for t in (16, 32, 48, 128):
    arredondar(q.resize((t, t), Image.LANCZOS), 0.2).save(d.parent / 'extensao' / 'icons' / f'icon{t}.png', optimize=True)
# versão redonda do painel (112 px serve para tela comum e de alta densidade)
r = redonda(q.resize((112, 112), Image.LANCZOS))
r.save(d / 'logo-painel.png', optimize=True)
png = (d / 'logo-painel.png').read_bytes()
(d / 'logo-uri.txt').write_text('data:image/png;base64,' + base64.b64encode(png).decode(), encoding='utf-8')
print('painel png', len(png), 'bytes')
