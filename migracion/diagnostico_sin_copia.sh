#!/bin/bash
# Diagnóstico temporal (2): por qué falla Brownie y si State Venice / Chernimcherno salen leyendo páginas de producto.
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
g() { curl -s -m 30 -L -A "$UA" -H 'Accept-Language: es-ES,es;q=0.9' "$1"; }
echo "===== brownie"
for u in https://www.browniespain.com/es-es/collections/faldas.json "https://www.browniespain.com/collections.json?limit=250&page=1" "https://www.browniespain.com/collections/faldas/products.json?limit=250&page=1" "https://www.browniespain.com/es-es/collections/collares.json"; do
  echo "-- $u"; g "$u" | python3 -c '
import sys,json
t=sys.stdin.read()
try: d=json.loads(t)
except Exception as e: print("NO JSON",len(t),t[:200]); sys.exit()
if "collection" in d: print("collection", d["collection"].get("id"), d["collection"].get("handle"))
if "collections" in d: print("collections", len(d["collections"]), [(c["id"],c["handle"]) for c in d["collections"] if c["handle"] in ("faldas","collares","skirts","necklaces")])
if "products" in d:
  ps=d["products"]; print("products",len(ps), sum(1 for p in ps if p.get("images")), ps[0]["title"] if ps else "", (ps[0].get("images") or [{}])[0].get("src","") if ps else "")
'
done
echo "-- PHP paso a paso"
cp productos/generar_o_servir.php /tmp/g.php
php -d display_errors=1 -r '$_GET=["url"=>"x"]; ' 2>&1 | head -2
cat > /tmp/t.php <<'P'
<?php
$_GET = ["url" => "https://www.browniespain.com/es-es/collections/faldas", "pagina" => "1", "refrescar" => "1"];
$src = file_get_contents("/tmp/g.php");
$cut = strpos($src, '$idiomaDistinto = false;');
eval('?>' . substr($src, 0, $cut));
$r = extraerDeColeccionShopify($_GET["url"], 2);
echo "shopify: " . (is_array($r) ? count($r) : var_export($r, true)) . "\n";
$b = descargarUrl("https://www.browniespain.com/es-es/collections/faldas.json");
echo "faldas.json: " . ($b === null ? "null" : strlen($b)) . "\n";
P
mkdir -p /tmp/cache_productos; cd /tmp && timeout 120 php -d display_errors=1 /tmp/t.php 2>&1 | tail -5; cd - >/dev/null
echo "===== InSales"
for b in https://statevenice.com https://chernimcherno.com; do
  echo "-- $b"; g "$b/" | grep -o -i -E 'insales|ecwid|tilda|bitrix|opencart' | sort | uniq -c
  echo "urls producto en sitemap: $(g $b/sitemap.xml | grep -o '<loc>[^<]*/product/[^<]*</loc>' | wc -l)"
  g "$b/sitemap.xml" | grep -o '<loc>[^<]*</loc>' | grep -v '/page/' | head -5
  for p in /collection/all.json "/products_by_id.json" ; do printf "%s " "$p"; g "$b$p" | head -c 300; echo; done
done
echo "===== catalogo_desde_paginas"
mkdir -p /tmp/prueba && cd /tmp/prueba && mkdir -p productos
cat > lista.txt <<'L'
https://statevenice.com/ | https://statevenice.com/sitemap.xml | /product/ | 30
https://chernimcherno.com/ | https://chernimcherno.com/sitemap.xml | /product/ | 30
L
timeout 900 python3 $GITHUB_WORKSPACE/productos/catalogo_desde_paginas.py lista.txt
for f in productos/*-p1.json; do echo "-- $f"; python3 -c '
import json,sys; d=json.load(open(sys.argv[1])); p=d["productos"]; print(len(p), sum(1 for x in p if x.get("imagen")), sum(1 for x in p if x.get("precio"))); [print(" ",x["titulo"][:50],"|",x["precio"],"|",x["imagen"][:90]) for x in p[:4]]' "$f"; done
