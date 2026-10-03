#!/usr/bin/env python3
# Lee sitemaps de webs (tiendas, categorias...) y guarda una lista en datos/<salida>.json
# para que los posts la lean desde GitHub sin pasar por Apps Script.
# Formato de cada linea de la lista:  salida | url_del_sitemap | con_imagen|sin_imagen|imagen_opcional
# Si un sitemap falla o sale vacio, NO se pisa el JSON anterior.
import json, os, re, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/124.0 Safari/537.36')
OMITIR = {'sin-categoria', 'uncategorized'}

def bajar(url):
    ultimo = None
    for intento in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/xml,text/xml,*/*'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            ultimo = e
            time.sleep(5 * (intento + 1))
    raise ultimo

def nombre_de(slug):
    slug = urllib.parse.unquote(slug)
    slug = re.sub(r'_(R|JR|REQ)?[-_]?\d{3,}(-\d+)?$', '', slug)   # codigo de oferta de Workday al final
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
        if mod and tipo != 'con_imagen' and tipo != 'sin_imagen':
            item['fecha'] = mod.group(1)
        vistos.add(url)
        items.append(item)
    return items

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
        if not re.fullmatch(r'[a-z0-9-]+', salida):
            print(f'NOMBRE DE SALIDA NO VALIDO: {salida}')
            continue
        try:
            items = procesar(bajar(url), tipo)
        except Exception as e:
            print(f'ERROR {salida}: {e} (se deja el JSON anterior)')
            continue
        if not items:
            print(f'VACIO {salida}: el sitemap no dio elementos (se deja el JSON anterior)')
            continue
        destino = os.path.join(base, salida + '.json')
        anterior = None
        if os.path.exists(destino):
            try:
                anterior = json.load(open(destino, encoding='utf-8')).get('items')
            except Exception:
                anterior = None
        if anterior == items:
            print(f'SIN CAMBIOS {salida}: {len(items)} elementos')
            continue
        json.dump({'actualizado': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
                   'fuente': url, 'items': items},
                  open(destino, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'OK {salida}: {len(items)} elementos')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sitemaps_lista.txt'))
