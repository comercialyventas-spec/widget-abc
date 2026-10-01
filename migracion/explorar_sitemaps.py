# Explora robots.txt y sitemaps de cada tienda (solo lectura) y deja un informe.
# Uso: python3 migracion/explorar_sitemaps.py migracion/explorar_tiendas.txt > migracion/explorar_informe.txt
import sys, re, gzip, urllib.request, urllib.parse
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
def get(url, maxb=8_000_000):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9'}), timeout=40)
        b = r.read(maxb)
        if b[:2] == b'\x1f\x8b':
            b = gzip.decompress(b)
        return r.status, b.decode('utf-8', 'ignore'), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, '', url
    except Exception as e:
        return 0, str(e)[:80], url
def locs(x): return [l.strip() for l in re.findall(r'<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>', x, re.S)]
for dom in [l.strip() for l in open(sys.argv[1]) if l.strip() and not l.startswith('#')]:
    base = dom if dom.startswith('http') else 'https://' + dom
    st, rob, _ = get(base.rstrip('/') + '/robots.txt')
    sms = re.findall(r'(?im)^\s*sitemap:\s*(\S+)', rob)
    print(f'=== {dom}  robots={st}  sitemaps_en_robots={len(sms)}')
    if not sms:
        sms = [base.rstrip('/') + p for p in ('/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml')]
    # preferir español
    sms = sorted(dict.fromkeys(sms), key=lambda u: (0 if re.search(r'es[_-]es|/es/|_es\b|-es\b', u) else 1))[:4]
    for sm in sms:
        st, x, fin = get(sm)
        L = locs(x)
        es_indice = '<sitemapindex' in x[:3000].lower()
        print(f'  SM {st} {"INDICE" if es_indice else "URLSET"} locs={len(L)} imgs={x.count("<image:loc")} {sm}')
        if es_indice:
            hijos = L
            prod = [h for h in hijos if re.search(r'product|produit|prodotti|catalog|item|shop|tienda|p-|articulo', h, re.I)]
            for h in (prod or hijos)[:6]:
                print('     hijo', h)
            if prod or hijos:
                h = (prod or hijos)[0]
                st2, x2, _ = get(h)
                L2 = locs(x2)
                print(f'     -> {st2} locs={len(L2)} imgs={x2.count("<image:loc")} titulos_img={x2.count("<image:title")}')
                for u in L2[:3]: print('        ', u[:150])
                m = re.search(r'<image:title>(.*?)</image:title>', x2, re.S)
                if m: print('        titulo_img:', m.group(1)[:80])
        else:
            for u in L[:3]: print('     ', u[:150])
    sys.stdout.flush()
