#!/usr/bin/env python3
# Lee sitemaps (o la lista publica de ofertas de Workday) y guarda datos/<salida>.json
# para que los posts lo lean desde GitHub sin pasar por Apps Script.
# Formato de cada linea:  salida | url | tipo | opciones
#   tipo: con_imagen | sin_imagen | imagen_opcional | workday
#   opciones (separadas por comas, opcional):
#     og_imagen        -> si un elemento no trae imagen, se toma la og:image de su pagina (se guarda y no se vuelve a pedir)
#     imagen_pagina    -> igual, pero toma la primera foto propia de la pagina (descarta las que se repiten en casi todas: logo, menu...)
#     incluir=REGEX    -> solo se quedan las URL que cumplan la expresion
# Si una fuente falla o sale vacia, NO se pisa el JSON anterior.
import json, os, re, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')
OMITIR = {'sin-categoria', 'uncategorized'}

def bajar(url, datos=None, aceptar='application/xml,text/xml,*/*', intentos=3):
    ultimo = None
    for intento in range(intentos):
        try:
            cab = {'User-Agent': UA, 'Accept': aceptar, 'Accept-Language': 'es-ES,es;q=0.9'}
            cuerpo = None
            if datos is not None:
                cuerpo = json.dumps(datos).encode('utf-8')
                cab['Content-Type'] = 'application/json'
            req = urllib.request.Request(url, data=cuerpo, headers=cab)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            ultimo = e
            time.sleep(5 * (intento + 1))
    raise ultimo

def nombre_de(slug):
    slug = urllib.parse.unquote(slug)
    return re.sub(r'\b\w', lambda m: m.group(0).upper(), slug.replace('-', ' ').replace('_', ' ')).strip()

def procesar(xml, tipo):
    items, vistos = [], set()
    for bloque in xml.split('<url>')[1:]:
        loc = re.search(r'<loc>\s*([^<\s]+)\s*</loc>', bloque)
        if not loc:
            continue
        url = loc.group(1).replace('&amp;', '&')
        slug = url.rstrip('/').split('/')[-1]
        if slug in OMITIR or url in vistos:
            continue
        item = {'nombre': nombre_de(slug), 'url': url, 'slug': slug}
        img = re.search(r'<image:loc>\s*([^<\s]+)\s*</image:loc>', bloque)
        if tipo == 'con_imagen' and not img:
            continue
        if img and tipo in ('con_imagen', 'imagen_opcional'):
            item['img'] = img.group(1).replace('&amp;', '&')
        mod = re.search(r'<lastmod>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})', bloque)
        if mod and tipo == 'imagen_opcional':
            item['fecha'] = mod.group(1)
        vistos.add(url)
        items.append(item)
    return items

def workday(base):
    # base: https://<tenant>.wdN.myworkdayjobs.com/<sitio>
    p = urllib.parse.urlparse(base)
    tenant = p.netloc.split('.')[0]
    sitio = p.path.strip('/').split('/')[0]
    api = f'{p.scheme}://{p.netloc}/wday/cxs/{tenant}/{sitio}/jobs'
    items, vistos, offset, total = [], set(), 0, None
    while offset < 1000:
        d = json.loads(bajar(api, {'appliedFacets': {}, 'limit': 20, 'offset': offset, 'searchText': ''},
                             aceptar='application/json'))
        if total is None:
            total = d.get('total') or 0
        lote = d.get('jobPostings') or []
        if not lote:
            break
        for j in lote:
            ruta = j.get('externalPath') or ''
            if not ruta or ruta in vistos:
                continue
            vistos.add(ruta)
            it = {'nombre': (j.get('title') or '').strip(), 'url': f'{p.scheme}://{p.netloc}/{sitio}{ruta}',
                  'slug': ruta.rstrip('/').split('/')[-1]}
            if j.get('locationsText'):
                it['lugar'] = j['locationsText'].strip()
            if j.get('postedOn'):
                it['publicado'] = j['postedOn'].strip()
            if it['nombre']:
                items.append(it)
        offset += 20
        if total and offset >= total:
            break
        time.sleep(1)
    return items

def og_imagen(url):
    try:
        html = bajar(url, aceptar='text/html,*/*', intentos=2)
    except Exception:
        return ''
    m = (re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', html)
         or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html))
    return m.group(1).replace('&amp;', '&') if m else ''

RX_UPLOAD = re.compile(r'https?://[^"\'\s()<>]+?/wp-content/uploads/[^"\'\s()<>]+?\.(?:jpe?g|png)(?=["\'\s()<>]|$)', re.I)

def fotos_pagina(url):
    try:
        html = bajar(url, aceptar='text/html,*/*', intentos=2)
    except Exception:
        return []
    vistas, lista = set(), []
    for f in RX_UPLOAD.findall(html):
        f = f.replace('&amp;', '&')
        if re.search(r'-\d{2,4}x\d{2,4}\.(?:jpe?g|png)$', f, re.I):   # miniaturas
            continue
        if re.search(r'logo|icon|favicon|recurso', f, re.I):
            continue
        if f not in vistas:
            vistas.add(f)
            lista.append(f)
    return lista

def main(lista):
    base = os.path.dirname(os.path.abspath(__file__))
    for linea in open(lista, encoding='utf-8'):
        linea = linea.strip()
        if not linea or linea.startswith('#'):
            continue
        partes = [p.strip() for p in linea.split('|')]
        if len(partes) < 3:
            print(f'LINEA MAL: {linea}')
            continue
        salida, url, tipo = partes[0], partes[1], partes[2]
        opciones = [o.strip() for o in (partes[3] if len(partes) > 3 else '').split(',') if o.strip()]
        if not re.fullmatch(r'[a-z0-9-]+', salida):
            print(f'NOMBRE DE SALIDA NO VALIDO: {salida}')
            continue
        destino = os.path.join(base, salida + '.json')
        anterior = []
        if os.path.exists(destino):
            try:
                anterior = json.load(open(destino, encoding='utf-8')).get('items') or []
            except Exception:
                anterior = []
        try:
            items = workday(url) if tipo == 'workday' else procesar(bajar(url), tipo)
        except Exception as e:
            print(f'ERROR {salida}: {e} (se deja el JSON anterior)')
            continue
        for o in opciones:
            if o.startswith('incluir='):
                rx = re.compile(o[len('incluir='):])
                items = [i for i in items if rx.search(i['url'])]
        if 'og_imagen' in opciones:
            guardadas = {i['url']: i.get('img') for i in anterior if i.get('img')}
            pedidas = 0
            for i in items:
                if i.get('img'):
                    continue
                if i['url'] in guardadas:
                    i['img'] = guardadas[i['url']]
                elif pedidas < 150:
                    pedidas += 1
                    img = og_imagen(i['url'])
                    if img:
                        i['img'] = img
                    time.sleep(0.5)
        comunes_previas = []
        if 'imagen_pagina' in opciones:
            guardadas = {i['url']: i.get('img') for i in anterior if i.get('img')}
            hecho_con_pagina = False
            try:
                previo = json.load(open(destino, encoding='utf-8'))
                hecho_con_pagina = 'comunes' in previo
                comunes_previas = previo.get('comunes') or []
            except Exception:
                comunes_previas = []
            if not hecho_con_pagina:
                guardadas = {}   # el JSON anterior no se hizo con imagen_pagina: se recalculan todas
            candidatas = {}
            pedidas = 0
            for i in items:
                if i.get('img'):
                    continue
                if i['url'] in guardadas:
                    i['img'] = guardadas[i['url']]
                elif pedidas < 150:
                    pedidas += 1
                    candidatas[i['url']] = fotos_pagina(i['url'])
                    time.sleep(0.5)
            if candidatas:
                cuenta = {}
                for fs in candidatas.values():
                    for f in fs:
                        cuenta[f] = cuenta.get(f, 0) + 1
                limite = max(2, int(len(candidatas) * 0.3))
                comunes = set(comunes_previas) | {f for f, n in cuenta.items() if n >= limite and len(candidatas) >= 5}
                comunes_previas = sorted(comunes)
                for i in items:
                    fs = candidatas.get(i['url'])
                    if fs:
                        buenas = [f for f in fs if f not in comunes]
                        if buenas:
                            i['img'] = buenas[0]
        if not items:
            print(f'VACIO {salida}: no salieron elementos (se deja el JSON anterior)')
            continue
        if anterior == items:
            print(f'SIN CAMBIOS {salida}: {len(items)} elementos')
            continue
        salida_json = {'actualizado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                       'fuente': url, 'items': items}
        if 'imagen_pagina' in opciones:
            salida_json['comunes'] = comunes_previas
        json.dump(salida_json,
                  open(destino, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        con_img = sum(1 for i in items if i.get('img'))
        print(f'OK {salida}: {len(items)} elementos ({con_img} con imagen)')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sitemaps_lista.txt'))
