#!/bin/bash
# Diagnóstico temporal (3): generador corregido con Brownie (y colecciones que ya funcionaban), y La Tienda del Recreo por páginas.
MOTOR=/tmp/motor; mkdir -p $MOTOR/cache_productos; cp productos/generar_o_servir.php $MOTOR/
for url in https://www.browniespain.com/es-es/collections/faldas https://www.browniespain.com/es-es/collections/collares https://ador.com/es/collections/novedades https://yumbiltong.com/es/collections/miel https://danielleguiziony.com/collections/best-sellers/ https://kondimenta-store.com/collections/condimentos; do
  slug=$(php -r 'echo substr(md5(trim($argv[1])), 0, 16);' -- "$url")
  timeout 300 php -d display_errors=0 -r '$_GET = ["url" => $argv[1], "pagina" => "1", "refrescar" => "1"]; include "/tmp/motor/generar_o_servir.php";' -- "$url" > /dev/null 2>&1
  n=$(ls $MOTOR/cache_productos/producto-$slug-p*.json 2>/dev/null | wc -l)
  echo "-- $url :: $n paginas"
  [ -f $MOTOR/cache_productos/producto-$slug-p1.json ] && python3 -c '
import json,sys; d=json.load(open(sys.argv[1])); p=d["productos"]; print("  p1:",len(p),"con foto",sum(1 for x in p if x.get("imagen")),"con precio",sum(1 for x in p if x.get("precio"))); [print("  ",x["titulo"][:50],"|",x.get("precio"),"|",x["url"][:80]) for x in p[:3]]' $MOTOR/cache_productos/producto-$slug-p1.json
done
echo "===== La Tienda del Recreo por páginas"
mkdir -p /tmp/prueba/productos && cd /tmp/prueba
echo 'https://latiendadelrecreo.es | https://latiendadelrecreo.es/product-sitemap.xml | /producto/ | 30' > lista.txt
timeout 600 python3 $GITHUB_WORKSPACE/productos/catalogo_desde_paginas.py lista.txt
for f in productos/*-p1.json; do python3 -c '
import json,sys; d=json.load(open(sys.argv[1])); p=d["productos"]; print(sys.argv[1], len(p), sum(1 for x in p if x.get("imagen")), sum(1 for x in p if x.get("precio"))); [print("  ",x["titulo"][:50],"|",x["precio"],"|",x["imagen"][:90]) for x in p[:4]]' "$f"; done
