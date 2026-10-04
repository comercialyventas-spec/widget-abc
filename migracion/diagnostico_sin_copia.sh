#!/bin/bash
# Diagnóstico temporal: qué responden a GitHub las tiendas sin copia.
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
probar() { printf "%s  %s\n" "$(curl -s -o /tmp/r -w '%{http_code} %{size_download}B %{content_type}' -m 30 -L -A "$UA" -H 'Accept-Language: es-ES,es;q=0.9' "$1")" "$1"; }
for base in https://statevenice.com https://chernimcherno.com https://www.browniespain.com https://latiendadelrecreo.es; do
  echo "===== $base"
  for p in / /robots.txt /sitemap.xml /sitemap_index.xml /product-sitemap.xml /products.json /wp-json/wc/store/v1/products?per_page=5; do probar "$base$p"; done
  curl -s -m 30 -L -A "$UA" "$base/" | grep -o -i -E 'shopify|woocommerce|prestashop|magento|wix|squarespace|cdn\.shopify|wp-content' | sort | uniq -c | head
  curl -s -m 30 -L -A "$UA" "$base/robots.txt" | grep -i sitemap | head
done
echo "===== brownie"
for p in /es-es/collections/faldas /es-es/collections/faldas/products.json /es-es/collections/collares/products.json /collections/faldas/products.json /collections/collares/products.json /es-es/sitemap.xml; do probar "https://www.browniespain.com$p"; done
echo "===== sitemaps hijos"
for s in https://statevenice.com/sitemap.xml https://chernimcherno.com/sitemap.xml https://www.browniespain.com/sitemap.xml https://latiendadelrecreo.es/sitemap.xml https://latiendadelrecreo.es/sitemap_index.xml; do
  echo "-- $s"; curl -s -m 30 -L -A "$UA" "$s" | grep -o '<loc>[^<]*</loc>' | head -8
done
echo "===== generador PHP (como el NAS)"
MOTOR=/tmp/motor; mkdir -p $MOTOR/cache_productos; cp productos/generar_o_servir.php $MOTOR/
for url in https://statevenice.com/ https://chernimcherno.com/ https://www.browniespain.com/es-es/collections/faldas https://latiendadelrecreo.es; do
  out=$(timeout 120 php -d display_errors=1 -r '$_GET = ["url" => $argv[1], "pagina" => "1", "refrescar" => "1"]; include "/tmp/motor/generar_o_servir.php";' -- "$url" 2>&1 | head -c 400)
  echo "-- $url :: $out"
done
