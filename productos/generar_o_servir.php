<?php
/**
 * generar_o_servir.php
 * Endpoint HTTP para el NAS: dada la URL de una tienda (sitemap o página de
 * categoría), sirve el catálogo de productos en JSON, generándolo primero si
 * no existe o está caducado. Pensado para que lo llame directamente el JS del
 * widget publicado en el blog (?url=...&pagina=N) — el NAS nunca necesita
 * conocer la Google Sheet: la URL viaja siempre dentro del propio widget,
 * igual que hoy viaja hacia el proxy de Apps Script.
 *
 * Uso: GET generar_o_servir.php?url=<url_tienda>&pagina=<N>[&refrescar=1]
 */

error_reporting(E_ALL);
ini_set('display_errors', 0);

header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json; charset=utf-8');

$TTL_HORAS = 20;
$POR_PAGINA = 24;
$MAX_PAGINAS_CATEGORIA = 60;   // 26 nov: antes 12; catalogos completos de tiendas con paginas de 12 productos

// 17 sept: mismo semáforo de concurrencia compartido con scraper_generico.php
// (pipeline de noticias) — misma carpeta de locks, mismo cupo total de huecos
// para todo el NAS, sin importar cuál de los dos sistemas genera la carga.
// 20 sept: movido a la carpeta temporal del sistema, igual que en scraper_generico.php (19 sept).
// En /volume2/web/noticias el usuario de PHP-FPM (http) solo tiene permiso de LECTURA, asi que no podia
// crear/abrir los archivos de bloqueo y el semaforo respondia 503 SIEMPRE. Misma ruta = mismo cupo compartido.
define('SEMAFORO_SCRAPER_DIR', rtrim(sys_get_temp_dir(), '/') . '/semaforo_scraper');
define('SEMAFORO_SCRAPER_MAX_HUECOS', 2);

function tomarHuecoScraper($maxHuecos = SEMAFORO_SCRAPER_MAX_HUECOS) {
    if (!is_dir(SEMAFORO_SCRAPER_DIR)) { @mkdir(SEMAFORO_SCRAPER_DIR, 0777, true); }
    for ($i = 0; $i < $maxHuecos; $i++) {
        $rutaSlot = SEMAFORO_SCRAPER_DIR . '/slot_' . $i . '.lock';
        $handle = @fopen($rutaSlot, 'c');
        if ($handle === false) continue;
        if (flock($handle, LOCK_EX | LOCK_NB)) { return $handle; }
        fclose($handle);
    }
    return false;
}

function liberarHuecoScraper($handle) {
    if ($handle) { flock($handle, LOCK_UN); fclose($handle); }
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
// Filtro opcional en la propia URL: "...sitemap.xml#filtro=falda" deja solo los productos cuya
// dirección o título contienen ese texto (la caché sigue usando la URL completa, con el filtro).
$FILTRO_URL = '';
if (preg_match('/#filtro=([^#&]+)/i', $url, $mFiltro)) { $FILTRO_URL = mb_strtolower(rawurldecode($mFiltro[1]), 'UTF-8'); }
$pagina = isset($_GET['pagina']) ? max(1, (int)$_GET['pagina']) : 1;
$forzar = isset($_GET['refrescar']) && $_GET['refrescar'] == '1';

if (!$url || !preg_match('#^https?://#i', $url)) {
    http_response_code(400);
    echo json_encode(['error' => 'Falta el parámetro url, o no es una URL válida']);
    exit;
}

$slug = substr(md5($url), 0, 16);
$dirCache = __DIR__ . '/cache_productos';
if (!is_dir($dirCache)) { mkdir($dirCache, 0775, true); }

$rutaPagina = $dirCache . "/producto-{$slug}-p{$pagina}.json";

// 20 sept (AÑADIDO): lista pública de catálogos pedidos por los visitantes, para que el
// workflow de GitHub (capa de respaldo) sepa qué tiendas generar sin leer nunca la hoja.
// Solo se apunta una URL cuando de verdad hay catálogo (se sirve una página cacheada).
function registrarCatalogo() {
    global $url, $dirCache;
    if (empty($url) || empty($dirCache)) return;
    $lista = $dirCache . '/_catalogos_pedidos.txt';
    $actual = @file_get_contents($lista);
    $lineas = $actual ? preg_split('/\r?\n/', trim($actual)) : [];
    if (in_array($url, $lineas, true) || count($lineas) >= 3000) return;
    @file_put_contents($lista, $url . "\n", FILE_APPEND | LOCK_EX);
}

function servirYSalir($ruta) {
    registrarCatalogo();
    echo file_get_contents($ruta);
    exit;
}

function cacheValido($ruta, $ttlHoras) {
    if (!file_exists($ruta)) return false;
    $edadHoras = (time() - filemtime($ruta)) / 3600;
    return $edadHoras < $ttlHoras;
}

if (!$forzar && cacheValido($rutaPagina, $TTL_HORAS)) {
    servirYSalir($rutaPagina);
}

// 17 sept: a partir de aquí ya sabemos que hace falta generar (no había
// caché válida). Esto puede implicar hasta 13 descargas seguidas (ver
// extraerDeCategoria mas abajo), así que se pide un hueco del semáforo antes
// de arrancar. Si no hay hueco libre pero existe una versión en caché
// (aunque esté caducada), se sirve esa en vez de fallar — mejor un catálogo
// con datos de hace unas horas que un error visible en el widget del
// visitante. Solo si tampoco hay ninguna caché se responde 503.
// 20 sept: las peticiones de visitantes (este script) pueden usar un hueco extra reservado,
// para que el pipeline de noticias en segundo plano (scraper_generico.php, max. 2 huecos) no las deje sin sitio.
$huecoScraper = tomarHuecoScraper(SEMAFORO_SCRAPER_MAX_HUECOS + 1);
if ($huecoScraper === false) {
    if (file_exists($rutaPagina)) { servirYSalir($rutaPagina); }
    http_response_code(503);
    header('Retry-After: 5');
    echo json_encode(['error' => 'NAS ocupado, reintenta en unos segundos', 'reintentar_tras_segundos' => 5]);
    exit;
}
register_shutdown_function(function () {
    global $huecoScraper;
    if (!empty($huecoScraper)) { liberarHuecoScraper($huecoScraper); $huecoScraper = null; }
});
function soltarHueco() {
    global $huecoScraper;
    if (!empty($huecoScraper)) { liberarHuecoScraper($huecoScraper); $huecoScraper = null; }
}

function descargarUrl($url) {
    // 20 sept: la extension curl de PHP esta desactivada en este perfil (desde el 10 sept, para que proxy.php
    // no se cuelgue), asi que curl_init() no existe y el script moria con error 500. Si no esta disponible,
    // se usa el binario curl del sistema, igual que hace scraper_generico.php.
    if (!function_exists('curl_init')) {
        $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
        $cmd = 'curl -s -L --max-time 25 -A ' . escapeshellarg($ua) . ' -H ' . escapeshellarg('Accept-Language: es-ES,es;q=0.9') . ' -w ' . escapeshellarg("\n%{http_code}") . ' ' . escapeshellarg($url) . ' 2>/dev/null';
        $salida = shell_exec($cmd);
        if (!is_string($salida) || $salida === '') return null;
        $pos = strrpos($salida, "\n");
        if ($pos === false) return null;
        $codigo = (int) substr($salida, $pos + 1);
        $body = substr($salida, 0, $pos);
        if ($codigo === 0 || $codigo >= 400) return null;
        return $body;
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Accept-Language: es-ES,es;q=0.9'],
    ]);
    $body = curl_exec($ch);
    $codigo = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $codigo >= 400) return null;
    return $body;
}

function esSitemapXml($body) {
    return $body !== null && (stripos($body, '<urlset') !== false || stripos(ltrim($body), '<?xml') === 0);
}

function extraerDeSitemap($xml) {
    $xml = str_replace(['<![CDATA[', ']]>'], '', $xml);

    $productos = [];
    preg_match_all('#<url>(.*?)</url>#s', $xml, $bloques);
    foreach ($bloques[1] as $bloque) {
        if (!preg_match('#<loc>\s*([^<]+?)\s*</loc>#', $bloque, $mLoc)) continue;
        if (!preg_match('#<image:loc>\s*([^<]+?)\s*</image:loc>#', $bloque, $mImg)) continue;

        $titulo = '';
        if (preg_match('#<image:title>\s*([^<]*?)\s*</image:title>#', $bloque, $mTit)) {
            $titulo = html_entity_decode(trim($mTit[1]), ENT_QUOTES, 'UTF-8');
        }
        if (!$titulo) {
            $partes = explode('/', rtrim($mLoc[1], '/'));
            $slugPart = preg_replace('/\.\w+$/', '', end($partes));
            $slugPart = preg_replace('/^(\d+-)+/', '', $slugPart);
            $slugPart = trim($slugPart, '-');
            $titulo = ucwords(str_replace('-', ' ', $slugPart));
        }

        // Títulos que son solo un número de modelo (p. ej. "42717"): se antepone la marca
        // tomada del primer tramo de la dirección ("/jovani/..." -> "Jovani 42717").
        if (preg_match('/^\d+$/', $titulo)) {
            $ruta = trim((string) parse_url(trim($mLoc[1]), PHP_URL_PATH), '/');
            $primero = $ruta !== '' ? explode('/', $ruta)[0] : '';
            if ($primero !== '' && !preg_match('/^\d+$/', $primero)) {
                $titulo = ucwords(str_replace('-', ' ', $primero)) . ' ' . $titulo;
            }
        }
        $productos[] = [
            'titulo' => $titulo,
            'url' => trim($mLoc[1]),
            'imagen' => trim($mImg[1]),
        ];
    }
    return $productos;
}

function extraerProductosDeCategoria($html) {
    // 25 nov (AÑADIDO, se prueba PRIMERO; si no encuentra nada, sigue el metodo de siempre): temas PrestaShop donde el enlace va ANTES de
    // class="thumbnail product-thumbnail" (<a href="..." class="thumbnail product-thumbnail">), p.ej. 365Rider.
    $productos = [];
    if (true) {
        if (preg_match_all('/<a\s+href="([^"#][^"]*)"\s+class="thumbnail product-thumbnail"[^>]*>(.*?)<\/a>(?=(.{0,2500}))/s', $html, $ms, PREG_SET_ORDER)) {
            foreach ($ms as $m) {
                $imagen = '';
                foreach (['data-src', 'src'] as $attr) {
                    if (preg_match('/\b' . preg_quote($attr, '/') . '\s*=\s*"([^"]+)"/i', $m[2], $mi)) {
                        $val = trim($mi[1]);
                        if (stripos($val, 'data:') === 0) continue;
                        if (stripos($val, 'http') === 0) { $imagen = $val; break; }
                    }
                }
                $titulo = '';
                if (preg_match('/alt="([^"]+)"/', $m[2], $mt)) {
                    $titulo = html_entity_decode(trim($mt[1]), ENT_QUOTES, 'UTF-8');
                }
                if (!$titulo || $titulo === 'Producto') continue;
                $precio = '';
                $resto = preg_split('/class="thumbnail product-thumbnail/', $m[3])[0];
                if (preg_match('/class="price"[^>]*>\s*([^<]+?)\s*<\/span>/i', $resto, $mp)) {
                    $precio = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp[1], ENT_QUOTES, 'UTF-8')));
                }
                // COPIA DE PRUEBA 25 nov (AÑADIDO, solo si el precio sigue vacio): span con varias clases, p.ej. class="price product-price".
                if ($precio === '' && preg_match('/class="[^"]*\bprice\b[^"]*"[^>]*>\s*([^<]*\d[^<]*?)\s*<\/span>/i', $resto, $mp2)) {
                    $precio = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp2[1], ENT_QUOTES, 'UTF-8')));
                }
                $productos[] = ['titulo' => $titulo, 'url' => $m[1], 'imagen' => $imagen, 'precio' => $precio];
            }
        }
    }
    if (!empty($productos)) return $productos;
    $productos = [];

    $productos = [];
    $bloques = preg_split('/class="thumbnail product-thumbnail/', $html);
    array_shift($bloques);

    foreach ($bloques as $bloqueCompleto) {
        $bloque = substr($bloqueCompleto, 0, 2500);

        if (!preg_match('/href="([^"#][^"]+)"/', $bloque, $m)) continue;
        $urlProducto = $m[1];

        $imagen = '';
        foreach (['data-src', 'src'] as $attr) {
            if (preg_match('/\b' . preg_quote($attr, '/') . '\s*=\s*"([^"]+)"/i', $bloque, $mi)) {
                $val = trim($mi[1]);
                if (stripos($val, 'data:') === 0) continue;
                if (stripos($val, 'http') === 0) { $imagen = $val; break; }
            }
        }

        $titulo = '';
        if (preg_match('/alt="([^"]+)"/', $bloque, $mt)) {
            $titulo = html_entity_decode(trim($mt[1]), ENT_QUOTES, 'UTF-8');
        }
        if (!$titulo || $titulo === 'Producto') continue;

        $precio = '';
        if (preg_match('/class="price"[^>]*>\s*([^<]+?)\s*<\/span>/i', $bloque, $mp)) {
            $precio = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp[1], ENT_QUOTES, 'UTF-8')));
        }
        // COPIA DE PRUEBA 25 nov (AÑADIDO, solo si el precio sigue vacio): span con varias clases.
        if ($precio === '' && preg_match('/class="[^"]*\bprice\b[^"]*"[^>]*>\s*([^<]*\d[^<]*?)\s*<\/span>/i', $bloque, $mp2)) {
            $precio = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp2[1], ENT_QUOTES, 'UTF-8')));
        }

        $productos[] = [
            'titulo' => $titulo,
            'url' => $urlProducto,
            'imagen' => $imagen,
            'precio' => $precio,
        ];
    }
    // 25 nov (AÑADIDO, solo si lo anterior no encontro nada): tienda propia con bloques "item-wrapper" y
    // <a class="... product-title" title="Marca - Modelo" href="/p/...">, precio en class="product-price" (43einhalb.com).
    if (empty($productos) && strpos($html, 'product-title') !== false && strpos($html, 'item-wrapper') !== false) {
        $bloquesW = preg_split('/class="item-wrapper/', $html);
        array_shift($bloquesW);
        foreach ($bloquesW as $bw) {
            $bw = substr($bw, 0, 4000);
            if (!preg_match('/<a[^>]*class="[^"]*product-title[^"]*"[^>]*>/', $bw, $ma)) continue;
            $etiqueta = $ma[0];
            if (!preg_match('/\bhref="([^"#][^"]*)"/', $etiqueta, $mh)) continue;
            if (!preg_match('/\btitle="([^"]+)"/', $etiqueta, $mt)) continue;
            $titulo = html_entity_decode(trim($mt[1]), ENT_QUOTES, 'UTF-8');
            if ($titulo === '') continue;
            $imagen = '';
            if (preg_match('/data-srcset="\s*(https?:\/\/[^\s"]+)/i', $bw, $mi)) { $imagen = html_entity_decode($mi[1], ENT_QUOTES, 'UTF-8'); }
            elseif (preg_match('/<img[^>]+(?:data-src|src)="(https?:\/\/[^"]+)"/i', $bw, $mi)) { $imagen = html_entity_decode($mi[1], ENT_QUOTES, 'UTF-8'); }
            $precio = '';
            if (preg_match('/class="product-price"[^>]*>\s*([^<]+?)\s*</', $bw, $mp)) {
                $precio = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp[1], ENT_QUOTES, 'UTF-8')));
            }
            $productos[] = ['titulo' => $titulo, 'url' => $mh[1], 'imagen' => $imagen, 'precio' => $precio];
        }
    }
    // 25 nov (AÑADIDO, COPIA DE PRUEBA; solo si todo lo anterior no encontro nada): OpenCart (Ageridis, Aquimejor, etc.).
    // Bloques class="product-thumb" (o "product-layout"), titulo y enlace en <h4><a href>, imagen en data-src o src, precio en class="price".
    if (empty($productos) && (strpos($html, 'product-thumb') !== false || strpos($html, 'product-layout') !== false)) {
        $bloquesOc = preg_split('/class="[^"]*\bproduct-(?:thumb|layout)\b/', $html);
        array_shift($bloquesOc);
        $vistosOc = [];
        foreach ($bloquesOc as $bo) {
            $bo = substr($bo, 0, 4000);
            $urlOc = ''; $tituloOc = '';
            if (preg_match('/<h[2-5][^>]*>\s*<a[^>]*\bhref="([^"#][^"]*)"[^>]*>\s*(.*?)\s*<\/a>/is', $bo, $mh)) {
                $urlOc = html_entity_decode($mh[1], ENT_QUOTES, 'UTF-8');
                $tituloOc = trim(html_entity_decode(strip_tags($mh[2]), ENT_QUOTES, 'UTF-8'));
            }
            if ($urlOc === '' || $tituloOc === '') continue;
            if (isset($vistosOc[$urlOc])) continue;
            $imagenOc = '';
            foreach (['data-src', 'data-original', 'src'] as $attrOc) {
                if (preg_match('/<img[^>]*\b' . $attrOc . '="([^"]+)"/i', $bo, $mi)) {
                    $valOc = trim(html_entity_decode($mi[1], ENT_QUOTES, 'UTF-8'));
                    if ($valOc === '' || stripos($valOc, 'data:') === 0) continue;
                    $imagenOc = $valOc; break;
                }
            }
            $precioOc = '';
            if (preg_match('/class="[^"]*\bprice-new\b[^"]*"[^>]*>\s*([^<]*\d[^<]*?)\s*</i', $bo, $mp)) {
                $precioOc = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp[1], ENT_QUOTES, 'UTF-8')));
            } elseif (preg_match('/class="[^"]*\bprice\b[^"]*"[^>]*>\s*([^<]*\d[^<]*?)\s*</i', $bo, $mp)) {
                $precioOc = trim(preg_replace('/\s+/', ' ', html_entity_decode($mp[1], ENT_QUOTES, 'UTF-8')));
            }
            $vistosOc[$urlOc] = true;
            $productos[] = ['titulo' => $tituloOc, 'url' => $urlOc, 'imagen' => $imagenOc, 'precio' => $precioOc];
        }
    }
    return $productos;
}

function extraerDeCategoria($urlBase, $maxPaginas) {
    $todos = [];
    $vistos = [];
    for ($p = 1; $p <= $maxPaginas; $p++) {
        $urlPagina = $p === 1 ? $urlBase : (!empty($urlSiguiente) ? $urlSiguiente : rtrim($urlBase, '/') . '?page=' . $p);
        $html = descargarUrl($urlPagina);
        if ($html === null) break;
        // 25 nov (AÑADIDO): si la pagina declara <link rel="next" href="...">, esa es la siguiente (p.ej. /new-arrivals/page/2).
        $urlSiguiente = '';
        if (preg_match('/<link[^>]+rel="next"[^>]+href="([^"]+)"/i', $html, $mn)) {
            $urlSiguiente = html_entity_decode($mn[1], ENT_QUOTES, 'UTF-8');
            if (strpos($urlSiguiente, '//') === 0) { $urlSiguiente = 'https:' . $urlSiguiente; }
            elseif ($urlSiguiente !== '' && $urlSiguiente[0] === '/') { $urlSiguiente = origenDeUrl($urlBase) . $urlSiguiente; }
        }
        $productosPagina = extraerProductosDeCategoria($html);
        // 25 nov (AÑADIDO): direcciones relativas (/p/...) -> absolutas con el dominio de la tienda.
        foreach ($productosPagina as $k => $prodRel) {
            foreach (['url', 'imagen'] as $campoRel) {
                $vRel = isset($prodRel[$campoRel]) ? $prodRel[$campoRel] : '';
                if ($vRel !== '' && $vRel[0] === '/' && strpos($vRel, '//') !== 0) { $productosPagina[$k][$campoRel] = origenDeUrl($urlBase) . $vRel; }
            }
        }
        if (empty($productosPagina)) break;
        $nuevos = 0;
        foreach ($productosPagina as $prod) {
            if (isset($vistos[$prod['url']])) continue;
            $vistos[$prod['url']] = true;
            $todos[] = $prod;
            $nuevos++;
        }
        if ($nuevos === 0) break;
    }
    return $todos;
}

// ============================================================================
// 20 sept (AÑADIDO): soporte de sitemaps índice (<sitemapindex>, p.ej. Natori o Agatha,
// que apuntan a varios sitemap_products_N.xml) y de colecciones Shopify
// (/collections/x o /es/collections/x traducida), usando el listado público
// /products.json de la tienda. Todo lo anterior sigue igual para el resto de URLs.
// ============================================================================
function esSitemapIndice($body) {
    return $body !== null && stripos($body, '<sitemapindex') !== false;
}

function extraerDeSitemapIndice($xml, $maxHijos = 10) {
    preg_match_all('#<sitemap>.*?<loc>\s*([^<]+?)\s*</loc>.*?</sitemap>#s', $xml, $m);
    $hijos = [];
    foreach ($m[1] as $u) { $hijos[] = html_entity_decode(trim($u), ENT_QUOTES | ENT_XML1, 'UTF-8'); }
    $deProductos = array_values(array_filter($hijos, function ($u) { return stripos($u, 'product') !== false; }));
    if (!empty($deProductos)) { $hijos = $deProductos; }
    $todos = [];
    $vistos = [];
    foreach (array_slice($hijos, 0, $maxHijos) as $hijo) {
        $cuerpo = descargarUrl($hijo);
        if ($cuerpo === null || !esSitemapXml($cuerpo) || esSitemapIndice($cuerpo)) continue;
        foreach (extraerDeSitemap($cuerpo) as $p) {
            if (isset($vistos[$p['url']])) continue;
            $vistos[$p['url']] = true;
            $todos[] = $p;
        }
    }
    return $todos;
}

function extraerDeColeccionShopify($url, $maxPaginas = 8) {
    if (!preg_match('#^(https?://[^/]+)(/(?:[a-z]{2}(?:-[a-z]{2})?/)?collections/([^/?\#.]+))#i', $url, $m)) return null;
    $origen = $m[1];
    $ruta = $m[2];
    $handle = $m[3];
    // Si el nombre de la colección está traducido (p.ej. "novedades"), se busca el original ("new-arrivals"),
    // que es el único que acepta /products.json.
    $info = json_decode((string) descargarUrl($origen . $ruta . '.json'), true);
    $id = isset($info['collection']['id']) ? (string) $info['collection']['id'] : '';
    if ($id !== '') {
        for ($p = 1; $p <= 4; $p++) {
            $lista = json_decode((string) descargarUrl($origen . '/collections.json?limit=250&page=' . $p), true);
            $cols = isset($lista['collections']) ? $lista['collections'] : [];
            foreach ($cols as $c) {
                if ((string) $c['id'] === $id) { $handle = $c['handle']; break 2; }
            }
            if (count($cols) < 250) break;
        }
    }
    $todos = extraerProductosColeccionShopify($origen, $handle, $maxPaginas);
    // 4 oct (AÑADIDO): en algunas tiendas (p. ej. Brownie) el nombre original ("skirts") no da productos
    // y el traducido de la URL ("faldas") sí. Solo se reintenta cuando no ha salido nada.
    if (empty($todos) && $handle !== $m[3]) { $todos = extraerProductosColeccionShopify($origen, $m[3], $maxPaginas); }
    return $todos;
}

function extraerProductosColeccionShopify($origen, $handle, $maxPaginas) {
    $todos = [];
    for ($p = 1; $p <= $maxPaginas; $p++) {
        $j = json_decode((string) descargarUrl($origen . '/collections/' . rawurlencode($handle) . '/products.json?limit=250&page=' . $p), true);
        $prods = isset($j['products']) ? $j['products'] : [];
        foreach ($prods as $pr) {
            $img = isset($pr['images'][0]['src']) ? $pr['images'][0]['src'] : '';
            if (!$img || empty($pr['title'])) continue;
            $item = [
                'titulo' => $pr['title'],
                'url' => $origen . '/products/' . $pr['handle'],
                'imagen' => $img,
            ];
            if (!empty($pr['variants'][0]['price'])) { $item['precio'] = $pr['variants'][0]['price']; }
            $todos[] = $item;
        }
        if (count($prods) < 250) break;
    }
    return $todos;
}


// ============================================================================
// 22 sept (AÑADIDO): PUERTA ÚNICA. Si la URL no es un sitemap ni una colección
// Shopify, se mira de qué plataforma es la tienda (una vez por dominio, con
// caché de 30 días) y se atiende por el camino que le corresponda:
//   1. Los endpoints hermanos de este mismo NAS (sfcc_categoria.php,
//      magento_categoria.php, woo_store.php, insales_store.php), si existen.
//      Se llaman por HTTP para no mezclar su código con el de este archivo.
//   2. Si no existen (p. ej. cuando este archivo corre en GitHub Actions como
//      capa de respaldo), extractores propios incluidos aquí abajo.
// Si nada de esto da productos, sigue funcionando el camino de siempre.
// ============================================================================
function textoJson($s) {
    $v = json_decode('"' . str_replace('"', '\\"', $s) . '"');
    return is_string($v) ? $v : $s;
}

function origenDeUrl($url) {
    $u = parse_url($url);
    if (empty($u['scheme']) || empty($u['host'])) return '';
    return $u['scheme'] . '://' . $u['host'];
}

// COPIA DE PRUEBA 25 nov: 'mage/' ya no casa dentro de 'image/webp' ni 'image/svg+xml' (PrestaShop se tomaba por Magento).
function detectarPlataformaHtml($html, $url) {
    if ($html === null || $html === '') return 'generico';
    $h = strtolower($html);
    if (strpos($h, 'insales') !== false) return 'insales';
    if (strpos($h, 'woocommerce') !== false || strpos($h, '/wp-content/plugins/woo') !== false) return 'woo';
    if (strpos($h, 'demandware') !== false || strpos($h, 'mobify') !== false || strpos($h, '/dw/image/') !== false) return 'sfcc';
    if (preg_match('#(?<![a-z0-9])mage/#', $h) || strpos($h, 'magento_') !== false || strpos($h, 'data-mage-init') !== false || strpos($h, '/static/version') !== false) return 'magento';
    if (strpos($h, 'cdn.shopify.com') !== false || strpos($h, 'shopify') !== false) return 'shopify';
    return 'generico';
}

function plataformaDeTienda($url) {
    global $dirCache;
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host) return 'generico';
    $fich = $dirCache . '/_plataformas.json';
    $mapa = json_decode((string) @file_get_contents($fich), true);
    if (!is_array($mapa)) $mapa = [];
    // Una deteccion buena vale 30 dias; si salio 'generico' (a veces por una descarga fallida)
    // se reintenta a las 2 horas, para no quedarse un mes con un fallo pasajero.
    if (isset($mapa[$host]['p']) && isset($mapa[$host]['t'])) {
        $edad = time() - (int) $mapa[$host]['t'];
        $validez = $mapa[$host]['p'] === 'generico' ? 7200 : 2592000;
        if ($edad < $validez) return $mapa[$host]['p'];
    }
    $plat = detectarPlataformaHtml(descargarUrl($url), $url);
    $mapa[$host] = ['p' => $plat, 't' => time()];
    @file_put_contents($fich, json_encode($mapa), LOCK_EX);
    return $plat;
}

function endpointDePlataforma($plataforma) {
    $mapa = [
        'sfcc' => 'sfcc_categoria.php',
        'magento' => 'magento_categoria.php',
        'woo' => 'woo_store.php',
        'insales' => 'insales_store.php',
    ];
    return isset($mapa[$plataforma]) ? $mapa[$plataforma] : '';
}

/** Llama por HTTP al endpoint hermano de este mismo NAS. Devuelve el JSON tal cual, o null. */
function delegarEnHermano($plataforma, $url, $pagina) {
    if (!empty($_GET['_delegado'])) return null;            // evita cualquier bucle
    if (php_sapi_name() === 'cli' || empty($_SERVER['HTTP_HOST'])) return null;
    $fichero = endpointDePlataforma($plataforma);
    if ($fichero === '' || !file_exists(__DIR__ . '/' . $fichero)) return null;
    soltarHueco();                                           // el hermano pedirá el suyo
    $esquema = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $base = $esquema . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/';
    $destino = $base . $fichero . '?url=' . rawurlencode($url) . '&pagina=' . (int) $pagina . '&_delegado=1';
    $salida = descargarUrl($destino);
    if ($salida === null) return null;
    $j = json_decode($salida, true);
    if (!is_array($j) || empty($j['productos'])) return null;
    return $salida;
}

/** Salesforce Commerce Cloud (PWA Kit): productos dentro del JSON que la propia página lleva incrustado. */
function extraerSfccDeHtml($html, $base) {
    $origen = origenDeUrl($base);
    $out = [];
    $pos = 0;
    while (($i = strpos($html, '"c_productDetailPageURL"', $pos)) !== false) {
        $pos = $i + 24;
        $ini = max(0, $i - 2500);
        $antes = substr($html, $ini, $i - $ini);
        $despues = substr($html, $i, 1500);

        if (!preg_match('/"c_productDetailPageURL"\s*:\s*"([^"]+)"/', $despues, $mu)) continue;
        $urlProd = textoJson($mu[1]);
        if ($urlProd === '') continue;
        if (strpos($urlProd, 'http') !== 0) $urlProd = $origen . $urlProd;

        $titulo = '';
        if (preg_match_all('/"(?:productName|name)"\s*:\s*"([^"]+)"/', $antes, $mt) && !empty($mt[1])) {
            $titulo = textoJson(end($mt[1]));
        }
        if ($titulo === '') continue;

        $imagen = '';
        if (preg_match('/"c_imageURL"\s*:\s*"([^"]+)"/', $despues, $mi)) {
            $imagen = textoJson($mi[1]);
        } elseif (preg_match_all('/"(?:disBaseLink|link)"\s*:\s*"(https?:[^"]+)"/', $antes, $mim) && !empty($mim[1])) {
            $imagen = textoJson(end($mim[1]));
        }
        if ($imagen !== '' && strpos($imagen, 'http') !== 0) $imagen = $origen . $imagen;
        if ($imagen === '') continue;

        $precio = '';
        if (preg_match('/"c_salesPriceFormatted"\s*:\s*"([^"]*)"/', $despues, $mp)) $precio = textoJson($mp[1]);
        if ($precio === '' && preg_match_all('/"price"\s*:\s*([0-9.]+)/', $antes, $mpn) && !empty($mpn[1])) {
            $precio = rtrim(rtrim(number_format((float) end($mpn[1]), 2, ',', '.'), '0'), ',') . '€';
        }
        $antesPrecio = '';
        if (preg_match('/"c_standardPriceFormatted"\s*:\s*"([^"]*)"/', $despues, $ma)) $antesPrecio = textoJson($ma[1]);

        $out[] = [
            'titulo' => $titulo,
            'url' => $urlProd,
            'imagen' => $imagen,
            'precio' => $precio,
            'precio_antes' => $antesPrecio,
        ];
    }
    return $out;
}

function extraerSfcc($url, $maxPaginas = 8) {
    $todos = [];
    $vistos = [];
    for ($p = 0; $p < $maxPaginas; $p++) {
        $sep = strpos($url, '?') !== false ? '&' : '?';
        $u = $p === 0 ? $url : $url . $sep . 'start=' . ($p * 24) . '&sz=24';
        $html = descargarUrl($u);
        if ($html === null) break;
        $nuevos = 0;
        foreach (extraerSfccDeHtml($html, $url) as $prod) {
            if (isset($vistos[$prod['url']])) continue;
            $vistos[$prod['url']] = true;
            $todos[] = $prod;
            $nuevos++;
        }
        if ($nuevos === 0) break;
    }
    return $todos;
}

/** WooCommerce por su Store API pública (no necesita clave). */
function extraerWoo($url, $maxPaginas = 8) {
    $origen = origenDeUrl($url);
    if ($origen === '') return [];
    $categoria = '';
    $ruta = trim((string) parse_url($url, PHP_URL_PATH), '/');
    if ($ruta !== '') {
        $segmentos = explode('/', $ruta);
        $slug = end($segmentos);
        $cats = json_decode((string) descargarUrl($origen . '/wp-json/wc/store/v1/products/categories?per_page=100'), true);
        if (is_array($cats)) {
            foreach ($cats as $c) {
                if (!empty($c['slug']) && strcasecmp($c['slug'], $slug) === 0) { $categoria = (string) $c['id']; break; }
            }
        }
    }
    $todos = [];
    for ($p = 1; $p <= $maxPaginas; $p++) {
        $u = $origen . '/wp-json/wc/store/v1/products?per_page=50&page=' . $p . ($categoria !== '' ? '&category=' . $categoria : '');
        $lista = json_decode((string) descargarUrl($u), true);
        if (!is_array($lista) || empty($lista)) break;
        foreach ($lista as $pr) {
            $img = '';
            if (!empty($pr['images'][0]['src'])) $img = $pr['images'][0]['src'];
            if ($img === '' || empty($pr['name']) || empty($pr['permalink'])) continue;
            $precio = '';
            $antes = '';
            if (!empty($pr['prices']['price'])) {
                $dec = isset($pr['prices']['currency_minor_unit']) ? (int) $pr['prices']['currency_minor_unit'] : 2;
                $sim = isset($pr['prices']['currency_symbol']) ? $pr['prices']['currency_symbol'] : '';
                $precio = number_format($pr['prices']['price'] / pow(10, $dec), 2, ',', '.') . ' ' . $sim;
                if (!empty($pr['prices']['regular_price']) && $pr['prices']['regular_price'] !== $pr['prices']['price']) {
                    $antes = number_format($pr['prices']['regular_price'] / pow(10, $dec), 2, ',', '.') . ' ' . $sim;
                }
            }
            $todos[] = [
                'titulo' => html_entity_decode(strip_tags($pr['name']), ENT_QUOTES, 'UTF-8'),
                'url' => $pr['permalink'],
                'imagen' => $img,
                'precio' => trim($precio),
                'precio_antes' => trim($antes),
            ];
        }
        if (count($lista) < 50) break;
    }
    return $todos;
}

// ============================================================================
// 27 nov (AÑADIDO): LECTORES PROPIOS para tiendas de videojuegos que no son Shopify/Woo/etc.
// Solo se activan por dominio (xtralife.com, game.es); cualquier otra URL sigue por el camino de siempre.
// Si el lector no saca nada, tampoco cambia nada: se sigue con el flujo anterior.
// ============================================================================
function precioDeNumero($n) {
    return number_format((float) $n, 2, ',', '.') . '€';
}

/** Productos de una lista JSON-LD (ItemList -> Product con name, url, image y offers.price). */
function extraerDeJsonLdLista($html) {
    $out = [];
    if (!is_string($html) || $html === '') return $out;
    if (!preg_match_all('#<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>#is', $html, $bloques)) return $out;
    foreach ($bloques[1] as $b) {
        $j = json_decode(trim($b), true);
        if (!is_array($j)) continue;
        $nodos = isset($j['@graph']) && is_array($j['@graph']) ? $j['@graph'] : [$j];
        foreach ($nodos as $n) {
            if (!is_array($n) || empty($n['itemListElement']) || !is_array($n['itemListElement'])) continue;
            foreach ($n['itemListElement'] as $el) {
                $it = (is_array($el) && isset($el['item']) && is_array($el['item'])) ? $el['item'] : $el;
                if (!is_array($it) || empty($it['name']) || empty($it['url'])) continue;
                $img = '';
                if (!empty($it['image'])) { $img = is_array($it['image']) ? (string) reset($it['image']) : (string) $it['image']; }
                if ($img === '') continue;
                $of = isset($it['offers']) ? $it['offers'] : null;
                if (is_array($of) && isset($of[0])) $of = $of[0];
                $precio = '';
                if (is_array($of) && isset($of['price']) && $of['price'] !== '') $precio = precioDeNumero($of['price']);
                $out[] = [
                    'titulo' => html_entity_decode(strip_tags((string) $it['name']), ENT_QUOTES, 'UTF-8'),
                    'url' => (string) $it['url'],
                    'imagen' => $img,
                    'precio' => $precio,
                    'precio_antes' => '',
                ];
            }
        }
    }
    return $out;
}

/** Xtralife: cada pagina de categoria (/seleccion/..., /catalogo/...) trae 24 productos en JSON-LD. Si la URL es la portada, recorre sus categorias. */
function extraerXtralife($url) {
    $url = preg_replace('/#.*$/', '', $url);
    $html = descargarUrl($url);
    if ($html === null) return [];
    $todos = extraerDeJsonLdLista($html);
    $paginas = [];
    if (empty($todos)) {
        if (preg_match_all('#href="(/(?:seleccion|catalogo)/[^"?\#]+)"#i', $html, $m)) {
            $paginas = array_slice(array_values(array_unique($m[1])), 0, 12);
        }
        foreach ($paginas as $ruta) {
            $h = descargarUrl(origenDeUrl($url) . $ruta);
            if ($h !== null) $todos = array_merge($todos, extraerDeJsonLdLista($h));
            usleep(500000);
        }
    }
    $vistos = [];
    $out = [];
    foreach ($todos as $p) {
        if (isset($vistos[$p['url']])) continue;
        $vistos[$p['url']] = true;
        $out[] = $p;
    }
    return $out;
}

/** Game: las fichas vienen en el HTML (enlace /nombre/ID con imagen; precio recomendado y precio actual en el texto). */
function extraerGameDeHtml($html) {
    $out = [];
    if (!is_string($html) || $html === '') return $out;
    $prev = libxml_use_internal_errors(true);
    $dom = new DOMDocument();
    $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
    libxml_clear_errors();
    libxml_use_internal_errors($prev);
    $xp = new DOMXPath($dom);
    $vistos = [];
    foreach ($xp->query('//a[@href][.//img]') as $a) {
        $href = $a->getAttribute('href');
        if (!preg_match('#^(?:https?://(?:www\.)?game\.es)?(/[a-z0-9\-]+/\d{5,})$#i', $href, $mh)) continue;
        $ruta = $mh[1];
        if (isset($vistos[$ruta])) continue;
        $img = $xp->query('.//img', $a)->item(0);
        $src = $img->getAttribute('src');
        $imagen = $src;
        $q = parse_url($src, PHP_URL_QUERY);
        if ($q) { parse_str($q, $par); if (!empty($par['url'])) $imagen = $par['url']; }
        if ($imagen === '' || strpos($imagen, 'data:') === 0) continue;
        if (strpos($imagen, 'http') !== 0) $imagen = 'https://www.game.es' . $imagen;
        $nombre = trim($a->getAttribute('title'));
        if ($nombre === '') $nombre = trim($img->getAttribute('alt'));
        if ($nombre === '') continue;
        $el = $a;
        for ($k = 0; $k < 4 && $el->parentNode; $k++) {
            $el = $el->parentNode;
            if (preg_match('/\d,\d{2}\s*€/u', $el->textContent)) break;
        }
        $texto = preg_replace('/\s+/u', ' ', $el->textContent);
        $texto = preg_replace('/M[ií]n\..*$/u', '', $texto);
        preg_match_all('/\d{1,3}(?:\.\d{3})*,\d{2}\s*€/u', $texto, $pm);
        $precios = array_map(function ($x) { return str_replace(' ', '', $x); }, $pm[0]);
        $precio = '';
        $antes = '';
        if (stripos($texto, 'Precio recomendado') !== false && count($precios) >= 2) { $antes = $precios[0]; $precio = $precios[1]; }
        elseif (count($precios) >= 1) { $precio = $precios[0]; }
        if ($precio === '') continue;
        $vistos[$ruta] = true;
        $out[] = [
            'titulo' => $nombre,
            'url' => 'https://www.game.es' . $ruta,
            'imagen' => $imagen,
            'precio' => $precio,
            'precio_antes' => $antes,
        ];
    }
    return $out;
}

function extraerGame($url, $maxPaginas = 40) {
    $url = preg_replace('/#.*$/', '', $url);
    $todos = [];
    $vistos = [];
    for ($p = 1; $p <= $maxPaginas; $p++) {
        $u = $p === 1 ? $url : $url . (strpos($url, '?') !== false ? '&' : '?') . 'pagina=' . $p;
        $html = descargarUrl($u);
        if ($html === null) break;
        $nuevos = 0;
        foreach (extraerGameDeHtml($html) as $prod) {
            if (isset($vistos[$prod['url']])) continue;
            $vistos[$prod['url']] = true;
            $todos[] = $prod;
            $nuevos++;
        }
        if ($nuevos === 0) break;
        usleep(700000);
    }
    return $todos;
}

/**
 * MMOGA: las categorias traen en el HTML los enlaces a las fichas (sin precio ni foto) y cada ficha
 * trae un JSON-LD Product con nombre, foto y precio. Se leen hasta $maxFichas fichas, con pausa.
 */
function extraerMmoga($url, $maxFichas = 48) {
    $url = preg_replace('/#.*$/', '', $url);
    $html = descargarUrl($url);
    if ($html === null) return [];
    $ruta = (string) parse_url($url, PHP_URL_PATH);
    $enlaces = [];
    if (preg_match_all('#href="((?:https?://(?:www\.)?mmoga\.es)?/[^"?\#]+\.html)"#i', $html, $m)) {
        foreach ($m[1] as $h) {
            $h = preg_replace('#^https?://(?:www\.)?mmoga\.es#i', '', $h);
            if (preg_match('#^/(content|Bestseller|mtodos)#i', $h)) continue;
            if (substr_count(trim($h, '/'), '/') < 1) continue;
            if ($ruta !== '' && $ruta !== '/' && strpos($h, $ruta) !== 0) continue;
            $enlaces[$h] = true;
        }
    }
    $enlaces = array_slice(array_keys($enlaces), 0, $maxFichas);
    $out = [];
    foreach ($enlaces as $h) {
        $furl = origenDeUrl($url) . $h;
        $f = descargarUrl($furl);
        usleep(500000);
        if ($f === null) continue;
        if (!preg_match_all('#<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>#is', $f, $bl)) continue;
        foreach ($bl[1] as $b) {
            $j = json_decode(trim($b), true);
            if (!is_array($j) || (isset($j['@type']) ? $j['@type'] : '') !== 'Product' || empty($j['name'])) continue;
            $img = '';
            if (!empty($j['image'])) { $img = is_array($j['image']) ? (string) reset($j['image']) : (string) $j['image']; }
            if ($img === '') continue;
            $of = isset($j['offers']) ? $j['offers'] : null;
            if (is_array($of) && isset($of[0])) $of = $of[0];
            $precio = '';
            if (is_array($of)) {
                if (isset($of['price']) && $of['price'] !== '') $precio = precioDeNumero($of['price']);
                elseif (isset($of['lowPrice']) && $of['lowPrice'] !== '') $precio = precioDeNumero($of['lowPrice']);
            }
            $out[] = [
                'titulo' => html_entity_decode(strip_tags((string) $j['name']), ENT_QUOTES, 'UTF-8'),
                'url' => $furl,
                'imagen' => $img,
                'precio' => $precio,
                'precio_antes' => '',
            ];
            break;
        }
    }
    return $out;
}

function extraerLectorPropio($url) {
    $host = strtolower((string) parse_url($url, PHP_URL_HOST));
    $host = preg_replace('/^www\./', '', $host);
    if ($host === 'xtralife.com') return extraerXtralife($url);
    if ($host === 'game.es') return extraerGame($url, 40);
    if ($host === 'mmoga.es') return extraerMmoga($url, 48);
    return [];
}

/**
 * Algunas tiendas sirven la web en el idioma/pais de quien pregunta, no en el de la URL
 * (p. ej. LOEWE responde en ingles y dolares si se le pregunta desde fuera de Europa).
 * No se descarta ese catalogo: se marca, y el widget solo lo usa para visitantes de
 * fuera o cuando no hay nada mejor.
 */
function marcarSiOtroIdioma($productos, $url) {
    if (!preg_match('#^https?://[^/]+((?:/[a-z]{2,4}){1,2})/#i', $url, $m)) return $productos;
    if (empty($productos)) return $productos;
    $prefijo = strtolower($m[1]) . '/';
    $coinciden = 0;
    foreach ($productos as $p) {
        if (strpos(strtolower($p['url']), $prefijo) !== false) $coinciden++;
    }
    if ($coinciden < (count($productos) / 2)) { $GLOBALS['idiomaDistinto'] = true; }
    return $productos;
}

function extraerPorPlataforma($plataforma, $url) {
    if ($plataforma === 'sfcc') return marcarSiOtroIdioma(extraerSfcc($url, 8), $url);
    if ($plataforma === 'woo') return extraerWoo($url, 40);   // 26 nov: antes 8 paginas (400 productos); 40 = hasta 2000 para el catalogo completo de la tienda
    return [];
}

$idiomaDistinto = false;   // se pone a true si la tienda respondio en otro idioma/moneda
$esUrlSitemap = (stripos($url, '.xml') !== false || stripos($url, 'sitemap') !== false);
$esUrlColeccion = (stripos($url, '/collections/') !== false && stripos($url, '.xml') === false);
$todosLosProductos = [];

if (!$esUrlSitemap && !$esUrlColeccion) { $todosLosProductos = extraerLectorPropio($url); }   // 27 nov: lectores propios (xtralife.com, game.es)

if (!$esUrlSitemap && !$esUrlColeccion && empty($todosLosProductos)) {
    $plataforma = isset($_GET['plataforma']) ? strtolower(trim($_GET['plataforma'])) : '';
    if ($plataforma === '') { $plataforma = plataformaDeTienda($url); }
    $delegado = delegarEnHermano($plataforma, $url, $pagina);
    if ($delegado !== null) { registrarCatalogo(); echo $delegado; exit; }
    $todosLosProductos = extraerPorPlataforma($plataforma, $url);
}

if (empty($todosLosProductos)) {
$deColeccionShopify = (stripos($url, '/collections/') !== false && stripos($url, '.xml') === false) ? extraerDeColeccionShopify($url, 8) : null;

$primerFetch = !empty($deColeccionShopify) ? null : descargarUrl($url);

if ($primerFetch !== null && esSitemapIndice($primerFetch)) {
    $todosLosProductos = extraerDeSitemapIndice($primerFetch, 10);
} elseif ($primerFetch !== null && esSitemapXml($primerFetch)) {
    $todosLosProductos = extraerDeSitemap($primerFetch);
} elseif ($primerFetch !== null) {
    $todosLosProductos = extraerDeCategoria($url, $MAX_PAGINAS_CATEGORIA);
}
if (empty($todosLosProductos) && !empty($deColeccionShopify)) { $todosLosProductos = $deColeccionShopify; }
}

if ($FILTRO_URL !== '' && !empty($todosLosProductos)) {
    $todosLosProductos = array_values(array_filter($todosLosProductos, function ($p) use ($FILTRO_URL) {
        return mb_stripos((string)($p['url'] ?? ''), $FILTRO_URL, 0, 'UTF-8') !== false
            || mb_stripos((string)($p['titulo'] ?? ''), $FILTRO_URL, 0, 'UTF-8') !== false;
    }));
}
$total = count($todosLosProductos);

if ($total === 0) {
    if (file_exists($rutaPagina)) { servirYSalir($rutaPagina); }
    echo json_encode(['productos' => [], 'pagina' => 1, 'totalPaginas' => 0, 'hayMas' => false, 'generado' => date('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$paginas = array_chunk($todosLosProductos, $POR_PAGINA);
$totalPaginas = count($paginas);

foreach ($paginas as $i => $productosPagina) {
    $numPagina = $i + 1;
    $payload = [
        'productos' => $productosPagina,
        'pagina' => $numPagina,
        'totalPaginas' => $totalPaginas,
        'hayMas' => $numPagina < $totalPaginas,
        'generado' => date('c'),
    ];
    if (!empty($GLOBALS['idiomaDistinto'])) { $payload['idioma_distinto'] = true; }
    file_put_contents($dirCache . "/producto-{$slug}-p{$numPagina}.json", json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

if (file_exists($rutaPagina)) {
    servirYSalir($rutaPagina);
}

echo json_encode(['productos' => [], 'pagina' => $pagina, 'totalPaginas' => $totalPaginas, 'hayMas' => false, 'generado' => date('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
