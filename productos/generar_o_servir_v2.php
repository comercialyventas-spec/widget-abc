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

function detectarPlataformaHtml($html, $url) {
    if ($html === null || $html === '') return 'generico';
    $h = strtolower($html);
    if (strpos($h, 'insales') !== false) return 'insales';
    if (strpos($h, 'woocommerce') !== false || strpos($h, '/wp-content/plugins/woo') !== false) return 'woo';
    if (strpos($h, 'demandware') !== false || strpos($h, 'mobify') !== false || strpos($h, '/dw/image/') !== false) return 'sfcc';
    if (strpos($h, 'mage/') !== false || strpos($h, 'magento_') !== false || strpos($h, 'data-mage-init') !== false || strpos($h, '/static/version') !== false) return 'magento';
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
    if (isset($mapa[$host]['p']) && isset($mapa[$host]['t']) && (time() - (int) $mapa[$host]['t']) < 2592000) {
        return $mapa[$host]['p'];
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

/**
 * Algunas tiendas sirven la web en el idioma/pais de quien pregunta (no en el de la URL).
 * Si la URL del catalogo lleva prefijo de idioma (p. ej. /eur/es/) y los productos salen
 * con otro, se descartan: mejor no dar catalogo que darlo en ingles y en dolares.
 */
function filtrarPorIdioma($productos, $url) {
    if (!preg_match('#^https?://[^/]+((?:/[a-z]{2,4}){1,2})/#i', $url, $m)) return $productos;
    $prefijo = strtolower($m[1]) . '/';
    $buenos = [];
    foreach ($productos as $p) {
        if (strpos(strtolower($p['url']), $prefijo) !== false) $buenos[] = $p;
    }
    return $buenos;
}

function extraerPorPlataforma($plataforma, $url) {
    if ($plataforma === 'sfcc') return filtrarPorIdioma(extraerSfcc($url, 8), $url);
    if ($plataforma === 'woo') return extraerWoo($url, 8);
    return [];
}

$esUrlSitemap = (stripos($url, '.xml') !== false || stripos($url, 'sitemap') !== false);
$esUrlColeccion = (stripos($url, '/collections/') !== false && stripos($url, '.xml') === false);
$todosLosProductos = [];

if (!$esUrlSitemap && !$esUrlColeccion) {
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
