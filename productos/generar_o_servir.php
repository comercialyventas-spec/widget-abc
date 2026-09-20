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
$MAX_PAGINAS_CATEGORIA = 12;

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
register_shutdown_function('liberarHuecoScraper', $huecoScraper);

function descargarUrl($url) {
    // 20 sept: la extension curl de PHP esta desactivada en este perfil (desde el 10 sept, para que proxy.php
    // no se cuelgue), asi que curl_init() no existe y el script moria con error 500. Si no esta disponible,
    // se usa el binario curl del sistema, igual que hace scraper_generico.php.
    if (!function_exists('curl_init')) {
        $ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
        $cmd = 'curl -s -L --max-time 25 -A ' . escapeshellarg($ua) . ' -w ' . escapeshellarg("\n%{http_code}") . ' ' . escapeshellarg($url) . ' 2>/dev/null';
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

        $productos[] = [
            'titulo' => $titulo,
            'url' => trim($mLoc[1]),
            'imagen' => trim($mImg[1]),
        ];
    }
    return $productos;
}

function extraerProductosDeCategoria($html) {
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

        $productos[] = [
            'titulo' => $titulo,
            'url' => $urlProducto,
            'imagen' => $imagen,
            'precio' => $precio,
        ];
    }
    return $productos;
}

function extraerDeCategoria($urlBase, $maxPaginas) {
    $todos = [];
    $vistos = [];
    for ($p = 1; $p <= $maxPaginas; $p++) {
        $urlPagina = $p === 1 ? $urlBase : rtrim($urlBase, '/') . '?page=' . $p;
        $html = descargarUrl($urlPagina);
        if ($html === null) break;
        $productosPagina = extraerProductosDeCategoria($html);
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

$deColeccionShopify = (stripos($url, '/collections/') !== false && stripos($url, '.xml') === false) ? extraerDeColeccionShopify($url, 8) : null;
$primerFetch = !empty($deColeccionShopify) ? null : descargarUrl($url);
$todosLosProductos = [];

if ($primerFetch !== null && esSitemapIndice($primerFetch)) {
    $todosLosProductos = extraerDeSitemapIndice($primerFetch, 10);
} elseif ($primerFetch !== null && esSitemapXml($primerFetch)) {
    $todosLosProductos = extraerDeSitemap($primerFetch);
} elseif ($primerFetch !== null) {
    $todosLosProductos = extraerDeCategoria($url, $MAX_PAGINAS_CATEGORIA);
}
if (empty($todosLosProductos) && !empty($deColeccionShopify)) { $todosLosProductos = $deColeccionShopify; }

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
    file_put_contents($dirCache . "/producto-{$slug}-p{$numPagina}.json", json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

if (file_exists($rutaPagina)) {
    servirYSalir($rutaPagina);
}

echo json_encode(['productos' => [], 'pagina' => $pagina, 'totalPaginas' => $totalPaginas, 'hayMas' => false, 'generado' => date('c')], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
