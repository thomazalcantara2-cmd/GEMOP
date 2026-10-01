"""Gera um único arquivo HTML (sem pastas) com scripts, logo e fontes embutidos.
Uso: python3 build_standalone.py saida.html"""
import base64, re, sys

def data_uri(caminho, mime):
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(caminho, 'rb').read()).decode())

h = open('index.html', encoding='utf-8').read()
h = re.sub(r'url\("(assets/fonts/[^"]+\.woff2)"\)', lambda m: 'url("%s")' % data_uri(m.group(1), 'font/woff2'), h)
for src in ['vendor/xlsx.full.min.js', 'js/dados.js', 'js/app.js']:
    codigo = open(src, encoding='utf-8').read().replace('</script', '<\\/script')
    if src == 'js/app.js':
        codigo = codigo.replace('assets/logo-jaboatao.png', data_uri('assets/logo-jaboatao.png', 'image/png'))
    tag = '<script src="%s"></script>' % src
    assert tag in h, tag
    h = h.replace(tag, '<script>\n' + codigo + '\n</script>')
open(sys.argv[1], 'w', encoding='utf-8').write(h)
