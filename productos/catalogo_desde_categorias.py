# Catálogo para tiendas SIN sitemap útil (Comprafrutaonline, Shahi Grocery, Zumos de Mi Tienda Vegana...).
# Lee directamente las páginas de categoría de la tienda (como hacían los scripts viejos de los posts)
# y saca nombre, foto, precio y enlace de cada producto. No visita las páginas de producto.
# Escribe productos/producto-<md5(clave)[:16]>-pN.json, el mismo formato que usa el motor de productos.
# Uso: python3 productos/catalogo_desde_categorias.py productos/catalogos_categorias.txt
# cada línea: clave (= data-url del post) | página de categoría | tipo | máximo de páginas | máximo de productos | moneda | opciones
# tipos: woocommerce | opencart | prestashop | bitrix | comprafruta | banners (webs de hoteles con 'const BANNERS = [...]', p. ej. AZZ Hoteles)
# opciones (separadas por comas): sin_agotados (no pone los productos agotados)
import sys, re, json, time, hashlib, html, gzip, glob, os, urllib.request, urllib.parse

UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'


COOKIES = {}   # host -> 'nombre=valor' de las páginas de espera que ponen una cookie con JavaScript y recargan


def get(url, maxb=4_000_000):
    host = urllib.parse.urlparse(url).netloc
    for intento in range(2):
        cab = {'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9'}
        if COOKIES.get(host):
            cab['Cookie'] = COOKIES[host]
        r = urllib.request.urlopen(urllib.request.Request(url, headers=cab), timeout=40)
        b = r.read(maxb)
        if b[:2] == b'\x1f\x8b':
            b = gzip.decompress(b)
        t = b.decode('utf-8', 'ignore')
        # página de espera (p. ej. botica3.es): "document.cookie = 'dhd2=...'" + recarga a los 3 s
        m = re.search(r"document\.cookie\s*=\s*['\"]([A-Za-z0-9_]+=[A-Za-z0-9]+)", t) if len(t) < 8000 else None
        if not m or intento:
            return t
        COOKIES[host] = m.group(1)
        time.sleep(4)
    return t


def limpio(t):
    t = re.sub(r'<[^>]+>', ' ', t or '')
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


def absoluta(u, base):
    return urllib.parse.urljoin(base, html.unescape(u or '').strip())


def foto(u, base):
    # dirección de la foto lista para el navegador (espacios y letras no latinas codificados)
    return urllib.parse.quote(absoluta(u, base), safe=":/?&=%#@+,;~")


def precio_texto(t, moneda_por_defecto='€'):
    """'1,65€/unidad' -> '1,65 €/unidad'; '$25.99' -> '25,99 CAD' (se le pasa la moneda); '1,87 €' -> '1,87 €'"""
    t = limpio(t)
    t = re.sub(r'(?<=\d)[\s\u00a0](?=\d{3}(?!\d))', '', t)   # 26 990 -> 26990
    m = re.search(r'(\d+(?:[.,]\d{3})*(?:[.,]\d{1,2})?)', t)
    if not m:
        return ''
    num = m.group(1)
    if re.search(r'\.\d{1,2}$', num) and ',' not in num:      # 25.99 -> 25,99
        num = num.replace('.', ',')
    if re.fullmatch(r'\d{4,}', num):                             # 26990 -> 26.990
        num = f'{int(num):,}'.replace(',', '.')
    resto = t[m.end():].strip()
    unidad = ''
    u = re.search(r'/\s*([a-zA-ZáéíóúñÑ]+)', resto)
    if u:
        unidad = '/' + u.group(1)
    return f'{num} {moneda_por_defecto}{unidad}'


def pagina_n(url, tipo, n):
    if n == 1:
        return url if tipo != 'opencart' else url + ('&' if '?' in url else '?') + 'limit=100'
    if tipo == 'woocommerce':
        return url.rstrip('/') + f'/page/{n}/'
    if tipo == 'opencart':
        return url + ('&' if '?' in url else '?') + f'limit=100&page={n}'
    if tipo == 'prestashop':
        return url + ('&' if '?' in url else '?') + f'page={n}'
    if tipo == 'bitrix':
        return url + ('&' if '?' in url else '?') + f'PAGEN_1={n}'
    return None


def extraer_woocommerce(p, base, sin_agotados=False):
    out = []
    for b in re.findall(r'<li class="[^"]*\bproduct\b[^"]*type-product[\s\S]*?</li>', p):
        agotado = bool(re.search(r'\boutofstock\b', b.split('>', 1)[0]))
        a = re.search(r'<a href="([^"]+)"[^>]*woocommerce-LoopProduct-link', b) or re.search(r'<a href="([^"]+)"', b)
        tit = re.search(r'woocommerce-loop-product__title">([\s\S]*?)</h2>', b)
        img = ''
        srcset = re.search(r'data-lazy-srcset="([^"]+)"', b) or re.search(r'\ssrcset="([^"]+)"', b)
        if srcset:  # la foto más grande del srcset
            cands = [(int(w), u) for u, w in re.findall(r'(\S+)\s+(\d+)w', html.unescape(srcset.group(1)))]
            if cands:
                img = max(cands)[1]
        if not img:
            m = re.search(r'data-lazy-src="([^"]+)"', b) or re.search(r'<img[^>]+src="(https?://[^"]+)"', b)
            img = m.group(1) if m else ''
        pr = ''
        precio = re.search(r'<span class="price">([\s\S]*?)</a>', b)
        if precio:
            bloque = precio.group(1)
            ins = re.search(r'<ins[\s\S]*?</ins>', bloque)   # en oferta: el precio rebajado
            pr = precio_texto(ins.group(0) if ins else bloque)
        if a and tit:
            out.append({'titulo': limpio(tit.group(1)), 'url': absoluta(a.group(1), base), 'imagen': foto(img, base), 'precio': pr,
                        'agotado': agotado and sin_agotados})
    return out


def extraer_prestashop(p, base, moneda):
    out = []
    for b in re.split(r'<article[^>]*product-miniature', p)[1:]:
        b = b.split('</article>')[0]
        img = re.search(r'data-full-size-image-url="([^"]+)"', b) or re.search(r'<img[^>]+src="([^"]+)"', b)
        a = re.search(r'product-title[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)</a>', b)
        precio = re.search(r'class="price"[^>]*>([^<]+)<', b)
        if a and img:
            out.append({'titulo': limpio(a.group(2)), 'url': absoluta(a.group(1).split('#')[0], base), 'imagen': foto(img.group(1), base),
                        'precio': precio_texto(precio.group(1), moneda) if precio else ''})
    if not out:
        # PrestaShop con plantilla Creative Elements (p. ej. botica3.es): <article ... data-id-product="..."> y "ce-product-name"
        for b in re.split(r'<article[^>]*data-id-product=', p)[1:]:
            b = b.split('</article>')[0]
            img = re.search(r'<img[^>]+src="([^"]+)"', b)
            a = re.search(r'ce-product-name[^>]*>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)</a>', b)
            precio = re.search(r'class="ce-product-price[^"]*"[^>]*>\s*<span>([^<]+)<', b)
            if a and img:
                out.append({'titulo': limpio(a.group(2)), 'url': absoluta(a.group(1).split('#')[0], base), 'imagen': foto(img.group(1), base),
                            'precio': precio_texto(precio.group(1), moneda) if precio else ''})
    return out


def extraer_bitrix(p, base, moneda):
    # tarjetas "product-card" de 1C-Bitrix; solo las de la propia categoría (no los bloques de ofertas)
    out = []
    ruta = urllib.parse.urlparse(base).path
    for b in p.split('class="product-card"')[1:]:
        img = re.search(r'product-card__image--main">\s*<img[^>]+src="([^"]+)"', b) or re.search(r'<img[^>]+src="(/upload/[^"]+)"', b)
        a = re.search(r'product-card__name">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)</a>', b)
        precio = re.search(r'class="current"[^>]*>([\s\S]*?)</div>', b)
        if a and img and a.group(1).startswith(ruta):
            out.append({'titulo': limpio(a.group(2)), 'url': absoluta(a.group(1), base), 'imagen': foto(img.group(1), base),
                        'precio': precio_texto(precio.group(1), moneda) if precio else ''})
    return out


def extraer_banners(p, base):
    # webs de hoteles (motor "sbbasic", p. ej. azzhoteles.com) que llevan los alojamientos en "const BANNERS = [...]"
    out = []
    m = re.search(r'const BANNERS = (\[[\s\S]*?\]);', p)
    if not m:
        return out
    try:
        banners = json.loads(m.group(1))
    except Exception:
        return out
    raiz = re.match(r'https?://[^/]+', base).group(0)
    for b in banners:
        tit = re.sub(r'\s+', ' ', str(b.get('title') or '')).strip()
        fichero = (b.get('image') or {}).get('file') if isinstance(b.get('image'), dict) else ''
        enlace = str(b.get('link') or '').strip()
        if not tit or not fichero or not enlace or not re.search(r'AZZ|Hotel|SPA|PAQUETE|BONO', tit):
            continue
        out.append({'titulo': tit, 'url': absoluta(enlace, raiz + '/'), 'imagen': foto(raiz + '/files-sbbasic/gr_azz_hoteles/' + fichero, base), 'precio': ''})
    return out


def extraer_opencart(p, base, moneda):
    out = []
    for b in p.split('class="product-thumb')[1:]:
        img = re.search(r'<img src="([^"]+)"', b)
        a = re.search(r'<h4>\s*<a href="([^"]+)"[^>]*>([\s\S]*?)</a>', b)
        pr = ''
        precio = re.search(r'<p class="price">([\s\S]*?)</p>', b)
        if precio:
            nuevo = re.search(r'class="price-new">([\s\S]*?)</span>', precio.group(1))
            pr = precio_texto(nuevo.group(1) if nuevo else precio.group(1), moneda)
        if a and img and 'placeholder' not in img.group(1):   # sin foto real no se pone
            url = re.sub(r'([?&])limit=\d+&?', r'\1', html.unescape(a.group(1))).rstrip('?&')
            out.append({'titulo': limpio(a.group(2)), 'url': absoluta(url, base), 'imagen': foto(img.group(1), base), 'precio': pr})
    return out


def extraer_comprafruta(p, base):
    out = []
    for b in p.split('class="col-xs-6 col-sm-3 item"')[1:]:
        img = re.search(r'<img src="([^"]+)"', b)
        datos = re.search(r'class="item_data">([\s\S]*?)</div>', b)
        if not img or not datos:
            continue
        a = re.findall(r'<a href="([^"]+)"[^>]*>([^<]+)</a>', datos.group(1))
        sp = re.search(r'<span>([^<]+)</span>', datos.group(1))
        if a:
            out.append({'titulo': limpio(a[-1][1]), 'url': absoluta(a[-1][0], base), 'imagen': foto(img.group(1), base),
                        'precio': precio_texto(sp.group(1)) if sp else ''})
    return out


for linea in open(sys.argv[1], encoding='utf-8'):
    if not linea.strip() or linea.startswith('#'):
        continue
    partes = [x.strip() for x in linea.split('|')]
    clave, url, tipo, max_pag, maximo = partes[:5]
    moneda = (partes[5] if len(partes) > 5 else '') or '€'
    opciones = [x.strip() for x in (partes[6] if len(partes) > 6 else '').split(',') if x.strip()]
    max_pag, maximo = int(max_pag), int(maximo)
    slug = hashlib.md5(clave.encode()).hexdigest()[:16]
    prods, vistos = [], set()
    for n in range(1, max_pag + 1):
        u = pagina_n(url, tipo, n)
        if not u:
            break
        try:
            p = get(u)
        except Exception as e:
            print(f'  {clave}: página {n} no disponible ({e})')
            break
        if tipo == 'woocommerce':
            nuevos = extraer_woocommerce(p, u, 'sin_agotados' in opciones)
        elif tipo == 'opencart':
            nuevos = extraer_opencart(p, u, moneda)
        elif tipo == 'prestashop':
            nuevos = extraer_prestashop(p, u, moneda)
        elif tipo == 'bitrix':
            nuevos = extraer_bitrix(p, url, moneda)
        elif tipo == 'banners':
            nuevos = extraer_banners(p, u)
        else:
            nuevos = extraer_comprafruta(p, u)
        if n == 1 and not nuevos:
            tit = re.search(r'<title[^>]*>([\s\S]{0,120}?)</title>', p)
            print(f'  {clave}: página 1 sin productos reconocibles ({len(p)} caracteres, título: {limpio(tit.group(1)) if tit else "-"}, artículos: {len(re.findall(r"<article", p))})')
            if len(p) < 6000:
                print('  contenido: ' + re.sub(r'\s+', ' ', p)[:2800])
        pagina_nueva = 0
        for x in nuevos:
            if x['url'] in vistos:
                continue
            vistos.add(x['url'])
            pagina_nueva += 1
            if x.pop('agotado', False) or not x['imagen'] or not x['titulo']:
                continue
            prods.append(x)
        if pagina_nueva == 0 or len(prods) >= maximo:
            break
        time.sleep(2)
    prods = prods[:maximo]
    con_precio = sum(1 for x in prods if x['precio'])
    print(f'{clave}: {len(prods)} productos con foto ({con_precio} con precio)')
    if len(prods) < 6:
        print('  pocos productos: se conserva la copia anterior')
        continue
    for f in glob.glob(f'productos/producto-{slug}-p*.json'):
        os.remove(f)
    paginas = [prods[i:i + 24] for i in range(0, len(prods), 24)]
    for i, pag in enumerate(paginas, 1):
        json.dump({'productos': pag, 'pagina': i, 'totalPaginas': len(paginas), 'hayMas': i < len(paginas),
                   'generado': time.strftime('%Y-%m-%dT%H:%M:%S+00:00', time.gmtime())},
                  open(f'productos/producto-{slug}-p{i}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
