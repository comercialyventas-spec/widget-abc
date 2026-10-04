# Catálogo para tiendas cuyo sitemap trae los productos pero SIN foto (Adolfo Domínguez, Catchalot...).
# Lee el sitemap, se queda con las direcciones que contienen el filtro (p. ej. "/es-es/"),
# visita cada página de producto (despacio) y saca nombre, foto y precio de sus metadatos.
# Escribe productos/producto-<md5(clave)[:16]>-pN.json, el mismo formato que usa el motor.
# Uso: python3 productos/catalogo_desde_paginas.py productos/catalogos_paginas.txt
#   cada línea:  clave | sitemap | filtro | máximo
import sys, re, json, time, hashlib, html, gzip, glob, os, urllib.request
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
def get(url, maxb=6_000_000):
    r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9'}), timeout=40)
    b = r.read(maxb)
    if b[:2] == b'\x1f\x8b': b = gzip.decompress(b)
    return b.decode('utf-8', 'ignore')
def meta(p, *nombres):
    for n in nombres:
        for pat in (r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]*content=["\']([^"\']+)' % re.escape(n),
                    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\']%s["\']' % re.escape(n)):
            m = re.search(pat, p, re.I)
            if m: return html.unescape(m.group(1)).strip()
    return ''
def precio_jsonld(p):
    for bloque in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', p, re.S | re.I):
        m = re.search(r'"price"\s*:\s*"?([\d.,]+)"?', bloque)
        c = re.search(r'"priceCurrency"\s*:\s*"([A-Z]{3})"', bloque)
        if m: return m.group(1), (c.group(1) if c else '')
    return '', ''
SIMB = {'EUR': '€', 'USD': 'USD', 'GBP': '£'}
# Rublos por euro, para escribir los precios en ₽ como el NAS: "16.400 ₽ (≈ 175 €)". Se pide el cambio del día
# una sola vez; si no se puede, se usa uno aproximado.
RUB_POR_EUR = None
def rub_por_eur():
    global RUB_POR_EUR
    if RUB_POR_EUR is None:
        try: RUB_POR_EUR = float(json.loads(get('https://open.er-api.com/v6/latest/EUR'))['rates']['RUB'])
        except Exception: RUB_POR_EUR = 94.0
    return RUB_POR_EUR
def miles(n): return '{:,.0f}'.format(n).replace(',', '.')
for linea in open(sys.argv[1], encoding='utf-8'):
    if not linea.strip() or linea.startswith('#'): continue
    partes = [x.strip() for x in linea.split('|')]
    clave, sitemap, filtro, maximo = partes[:4]
    orden = partes[4] if len(partes) > 4 else ''
    maximo = int(maximo)
    slug = hashlib.md5(clave.encode()).hexdigest()[:16]
    try:
        xml = get(sitemap)
    except Exception as e:
        print('SITEMAP NO DISPONIBLE', clave, e); continue
    urls = [html.unescape(u.strip()) for u in re.findall(r'<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>', xml, re.S)]
    urls = [u for u in dict.fromkeys(urls) if filtro in u and re.search(r'\.html?$|/p/|/product', u)]
    if orden == 'id_desc':   # los productos más nuevos primero (número de producto al principio de la dirección)
        urls.sort(key=lambda u: -int((re.search(r'/(\d+)-[^/]*$', u) or [0, 0])[1]))
    prods, vistos_img = [], set()
    for u in urls:
        if len(prods) >= maximo: break
        try:
            p = get(u, 1_500_000)
        except Exception:
            continue
        img = meta(p, 'og:image', 'og:image:secure_url', 'twitter:image')
        tit = meta(p, 'og:title', 'twitter:title') or (re.search(r'<title[^>]*>(.*?)</title>', p, re.S | re.I) or [None, ''])[1]
        tit = re.sub(r'\s*[|\-–]\s*(Adolfo Dom[ií]nguez|AD Espa[ñn]a|Catchalot)[^|]*$', '', html.unescape(tit or '').strip(), flags=re.I)
        if not img or not tit or img in vistos_img: 
            time.sleep(1); continue
        vistos_img.add(img)
        pr = meta(p, 'product:price:amount', 'og:price:amount')
        mon = meta(p, 'product:price:currency', 'og:price:currency')
        if not pr: pr, mon = precio_jsonld(p)
        precio = ''
        if pr:
            precio = pr.replace(',', '.') if re.match(r'^\d+([.,]\d+)?$', pr) else pr
            try:
                if mon == 'RUB': precio = '%s ₽ (≈ %s €)' % (miles(float(precio)), miles(float(precio) / rub_por_eur()))
                else: precio = ('%.2f' % float(precio)).replace('.', ',') + ' ' + SIMB.get(mon or 'EUR', mon or '€')
            except Exception: pass
        prods.append({'titulo': tit, 'url': u, 'imagen': img, 'precio': precio})
        time.sleep(1.2)
    precios = [x['precio'] for x in prods if x['precio']]
    if len(precios) > 5 and len(set(precios)) == 1:   # todos iguales: el precio no se ha leído bien, mejor no ponerlo
        for x in prods: x['precio'] = ''
    print(f'{clave}: {len(urls)} direcciones con "{filtro}", {len(prods)} productos con foto')
    if len(prods) < 6:
        print('  pocos productos: se conserva la copia anterior'); continue
    for f in glob.glob(f'productos/producto-{slug}-p*.json'): os.remove(f)
    paginas = [prods[i:i + 24] for i in range(0, len(prods), 24)]
    for i, pag in enumerate(paginas, 1):
        json.dump({'productos': pag, 'pagina': i, 'totalPaginas': len(paginas), 'hayMas': i < len(paginas),
                   'generado': time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime())},
                  open(f'productos/producto-{slug}-p{i}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
