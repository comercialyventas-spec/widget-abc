#!/usr/bin/env python3
"""PRUEBA (28 nov 2026): lee tiendas que cargan el catalogo con JavaScript usando un navegador sin pantalla.
No escribe en productos/ ni toca nada existente: solo imprime un resumen en el log y en avisos."""
import json, re, sys, time
from urllib.parse import urljoin, urlparse
from playwright.sync_api import sync_playwright

JS = r"""
() => {
  const out = [];
  const seen = new Set();
  const add = (t, u, i, p) => { if (!t || !u || seen.has(u)) return; seen.add(u); out.push({titulo: t.trim().slice(0,160), url: u, imagen: i || '', precio: p || ''}); };
  // 1) JSON-LD
  document.querySelectorAll('script[type="application/ld+json"]').forEach(s => {
    try {
      const walk = (n) => {
        if (!n) return;
        if (Array.isArray(n)) return n.forEach(walk);
        if (typeof n !== 'object') return;
        if (n['@type'] === 'Product' || (Array.isArray(n['@type']) && n['@type'].includes('Product'))) {
          const img = Array.isArray(n.image) ? n.image[0] : (n.image && n.image.url) || n.image;
          const of = Array.isArray(n.offers) ? n.offers[0] : n.offers;
          add(n.name, n.url || (of && of.url), typeof img === 'string' ? img : '', of && (of.price || of.lowPrice));
        }
        Object.values(n).forEach(v => { if (v && typeof v === 'object') walk(v); });
      };
      walk(JSON.parse(s.textContent));
    } catch (e) {}
  });
  // 2) enlaces con imagen que parecen fichas de producto
  const reProd = /(\/p\/|\/product|\/producto|\/products\/|\/item|\/prodotto|\/artikel|-p-?\d|\/dp\/|\.html$|\/[a-z0-9-]+-\d{4,})/i;
  document.querySelectorAll('a[href]').forEach(a => {
    const img = a.querySelector('img');
    if (!img) return;
    const href = a.href;
    if (!reProd.test(href)) return;
    const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    const t = (a.getAttribute('title') || img.alt || a.innerText || '').replace(/\s+/g, ' ');
    add(t, href, src, '');
  });
  return out;
}
"""

def main(path):
    urls = [l.strip() for l in open(path, encoding='utf-8') if l.strip().startswith('http')]
    with sync_playwright() as p:
        br = p.chromium.launch()
        ctx = br.new_context(user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', locale='es-ES', viewport={'width': 1366, 'height': 900})
        for u in urls:
            t0 = time.time(); estado = ''; items = []
            try:
                pg = ctx.new_page()
                resp = pg.goto(u, wait_until='domcontentloaded', timeout=45000)
                estado = str(resp.status if resp else '?')
                try: pg.wait_for_load_state('networkidle', timeout=15000)
                except Exception: pass
                for _ in range(6):
                    pg.mouse.wheel(0, 2500); pg.wait_for_timeout(700)
                titulo = pg.title()[:70]
                items = pg.evaluate(JS)
                pg.close()
            except Exception as e:
                titulo = 'ERROR ' + str(e)[:80]
            con_img = sum(1 for i in items if i['imagen'])
            print(f"RESULTADO {u} | http {estado} | {len(items)} productos ({con_img} con imagen) | {time.time()-t0:.0f}s | titulo: {titulo}")
            for i in items[:3]:
                print("   -", i['titulo'][:60], '|', i['url'][:80], '|', i['imagen'][:60], '|', i['precio'])
            print(f"::notice::{u} => http {estado}, {len(items)} productos ({con_img} con imagen), titulo: {titulo}")
        br.close()

if __name__ == '__main__':
    main(sys.argv[1])
