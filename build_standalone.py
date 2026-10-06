"""Gera um único arquivo HTML (sem pastas) com scripts, logo e fontes embutidos.
Uso: python3 build_standalone.py saida.html [requerimento|portarias]   (padrão: requerimento)"""
import base64, re, sys

PAGINAS = {
    'requerimento': ('index.html', ['vendor/xlsx.full.min.js', 'js/dados.js', 'js/planilhas.js', 'js/app.js']),
    'portarias': ('portarias.html', ['vendor/xlsx.full.min.js', 'js/dados.js', 'js/planilhas.js', 'js/portarias.js', 'js/portarias-app.js']),
}

def data_uri(caminho, mime):
    return 'data:%s;base64,%s' % (mime, base64.b64encode(open(caminho, 'rb').read()).decode())

pagina = sys.argv[2] if len(sys.argv) > 2 else 'requerimento'
html, scripts = PAGINAS[pagina]
h = open(html, encoding='utf-8').read()
h = re.sub(r'url\("(assets/fonts/[^"]+\.woff2)"\)', lambda m: 'url("%s")' % data_uri(m.group(1), 'font/woff2'), h)
for src in scripts:
    codigo = open(src, encoding='utf-8').read().replace('</script', '<\\/script')
    codigo = codigo.replace('assets/logo-jaboatao.png', data_uri('assets/logo-jaboatao.png', 'image/png'))
    tag = '<script src="%s"></script>' % src
    assert tag in h, tag
    h = h.replace(tag, '<script>\n' + codigo + '\n</script>')
open(sys.argv[1], 'w', encoding='utf-8').write(h)
