<?php
/**
 * cache_scraper.php — capa de caché y "retirada" para scraper_generico.php (24 sept 2026)
 *
 * Se carga con un require_once en la primera línea de scraper_generico.php.
 * No toca nada de la extracción de noticias: solo decide si hace falta ir a la web
 * y, al terminar, qué respuesta se entrega.
 *
 *  1. Misma petición hecha hace menos de 25 min con resultado bueno -> se sirve la copia
 *     guardada sin ir a la web (hay muchas filas repetidas en FEEDS).
 *  2. Resultado vacío (0 noticias, 403 de la web, error) -> se entrega la última copia buena
 *     en vez de un RSS vacío, y esa URL no se vuelve a pedir en 1 hora.
 *  3. Si una misma web da 3 resultados vacíos en 15 min (señal de que nos está bloqueando)
 *     -> no se le pide nada durante 1 hora y se sirven las copias buenas. Así el bloqueo
 *     por exceso de visitas se levanta solo en vez de alargarse.
 *  4. NAS ocupado (503 del semáforo) -> si hay copia buena se entrega esa (200); no cuenta
 *     como fallo de la web.
 *  5. (PREPARADO 4 oct, sin aplicar) Antes de guardar o entregar lo que saca el scraper, se quitan
 *     las noticias cuyo enlace no es del propio medio (YouTube, Facebook, anuncios, boletines...).
 *     Se aceptan el dominio de la web pedida y sus subdominios (cooking.elmundo.es para elmundo.es);
 *     en los enlaces de afiliado de Awin, también el dominio de la tienda (parámetro ued).
 *     Si el filtro dejara el feed sin ninguna noticia, se entrega tal cual (nunca deja un widget vacío).
 *     Cabecera X-Filtro-Enlaces: número de noticias quitadas.
 *
 * Los modos ?debug=... y ?nocache=1 no pasan por aquí (van siempre a la web).
 * Si la carpeta de caché no se puede crear/escribir, todo funciona exactamente como antes.
 */
if (!defined('CS_CARGADO')) {
    define('CS_CARGADO', 1);
    define('CS_DIR', __DIR__ . '/.cache_scraper');
    define('CS_FRESCO', 25 * 60);            // copia reciente: no se vuelve a pedir
    define('CS_RETIRADA_URL', 60 * 60);      // URL que salió vacía: 1 h sin pedirla
    define('CS_RETIRADA_WEB', 60 * 60);      // web que parece bloquear: 1 h sin pedirle nada
    define('CS_VENTANA_FALLOS', 15 * 60);
    define('CS_FALLOS_WEB', 3);

    function cs_items($xml) { return preg_match_all('/<item[\s>]/i', (string)$xml); }

    function cs_leer_json($f) {
        $t = @file_get_contents($f);
        $d = $t ? json_decode($t, true) : null;
        return is_array($d) ? $d : [];
    }

    function cs_guardar($f, $contenido) {
        $tmp = $f . '.' . getmypid() . '.tmp';
        if (@file_put_contents($tmp, $contenido) !== false) { @rename($tmp, $f); }
    }

    function cs_servir($xml, $origen) {
        if (!headers_sent()) {
            http_response_code(200);
            header('Content-Type: application/rss+xml; charset=UTF-8');
            header('Access-Control-Allow-Origin: *');
            header('X-Cache-Scraper: ' . $origen);
        }
        echo $xml;
    }

    function cs_rss_vacio() {
        return '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Scraper genérico</title></channel></rss>';
    }

    // ---- 5. Filtro de enlaces del propio medio ----------------------------------------
    // Dominio "base" de un host: los dos últimos trozos, o tres si el penúltimo es un sufijo
    // de segundo nivel (gob.es, com.es, co.uk...).
    function cs_dominio_base($host) {
        $host = strtolower(preg_replace('/^www\./i', '', trim((string)$host, '.')));
        $p = explode('.', $host);
        if (count($p) <= 2) return $host;
        $sufijo2 = $p[count($p) - 2] . '.' . $p[count($p) - 1];
        if (in_array($sufijo2, ['gob.es', 'com.es', 'org.es', 'nom.es', 'edu.es', 'co.uk', 'org.uk', 'com.mx', 'com.ar', 'com.co', 'com.br', 'com.pe', 'gob.mx'], true)) {
            return implode('.', array_slice($p, -3));
        }
        return $sufijo2;
    }

    function cs_dominios_permitidos($url) {
        $host = (string)parse_url((string)$url, PHP_URL_HOST);
        $ok = [cs_dominio_base($host)];
        // Enlaces de afiliado de Awin: la tienda real va en el parámetro ued
        parse_str((string)parse_url((string)$url, PHP_URL_QUERY), $q);
        if (!empty($q['ued'])) {
            $destino = (string)parse_url(rawurldecode((string)$q['ued']), PHP_URL_HOST);
            if ($destino !== '') $ok[] = cs_dominio_base($destino);
        }
        return array_values(array_unique(array_filter($ok)));
    }

    function cs_filtrar_enlaces($xml, $url) {
        $permitidos = cs_dominios_permitidos($url);
        if (!$permitidos || cs_items($xml) === 0) return $xml;
        $quitadas = 0;
        $filtrado = preg_replace_callback('/<item\b[\s\S]*?<\/item>/i', function ($m) use ($permitidos, &$quitadas) {
            if (!preg_match('/<link[^>]*>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/i', $m[0], $l)) return $m[0];
            $host = (string)parse_url(html_entity_decode($l[1]), PHP_URL_HOST);
            if ($host === '' || in_array(cs_dominio_base($host), $permitidos, true)) return $m[0];
            $quitadas++;
            return '';
        }, $xml);
        if ($filtrado === null || cs_items($filtrado) === 0) return $xml;   // nunca dejar el feed vacío
        if (!headers_sent()) header('X-Filtro-Enlaces: ' . $quitadas);
        return $filtrado;
    }

    $cs_activo = isset($_GET['url']) && trim((string)$_GET['url']) !== ''
        && !isset($_GET['debug']) && !isset($_GET['nocache'])
        && (is_dir(CS_DIR) || @mkdir(CS_DIR, 0775, true)) && is_writable(CS_DIR);

    if ($cs_activo) {
        // Clave de la petición: todos los parámetros menos los "rompe-caché".
        $cs_params = $_GET;
        foreach (['v', '_', 't', 'ts', 'nocache'] as $p) { unset($cs_params[$p]); }
        ksort($cs_params);
        $cs_clave = md5(http_build_query($cs_params));

        $cs_host = strtolower(preg_replace('/^www\./i', '', (string)parse_url((string)$_GET['url'], PHP_URL_HOST)));
        $cs_fxml  = CS_DIR . '/' . $cs_clave . '.xml';
        $cs_fmeta = CS_DIR . '/' . $cs_clave . '.json';
        $cs_fweb  = CS_DIR . '/web_' . md5($cs_host) . '.json';

        $cs_ahora = time();
        $cs_meta  = cs_leer_json($cs_fmeta);
        $cs_web   = cs_leer_json($cs_fweb);
        $cs_copia = is_file($cs_fxml) ? (string)@file_get_contents($cs_fxml) : '';
        if (cs_items($cs_copia) === 0) { $cs_copia = ''; }

        // 1) Copia reciente y buena: se sirve sin ir a la web.
        if ($cs_copia !== '' && ($cs_ahora - (int)($cs_meta['bueno'] ?? 0)) < CS_FRESCO) {
            cs_servir($cs_copia, 'fresca');
            exit;
        }

        // 2) Esta URL, o toda la web, están en retirada: no se molesta a la web.
        if ((int)($cs_meta['retirada'] ?? 0) > $cs_ahora || (int)($cs_web['retirada'] ?? 0) > $cs_ahora) {
            cs_servir($cs_copia !== '' ? $cs_copia : cs_rss_vacio(), $cs_copia !== '' ? 'retirada-copia' : 'retirada-vacia');
            exit;
        }

        // 3) Toca ir a la web: corre el scraper de siempre y al final se revisa lo que ha sacado.
        ob_start();
        register_shutdown_function(function () use ($cs_fxml, $cs_fmeta, $cs_fweb, $cs_copia, $cs_meta, $cs_web) {
            $salida = '';
            while (ob_get_level() > 0) { $salida = ob_get_clean() . $salida; }

            $codigo = http_response_code();
            $codigo = $codigo === false ? 200 : (int)$codigo;
            if ($codigo < 400) { $salida = cs_filtrar_enlaces($salida, (string)$_GET['url']); }
            $n = cs_items($salida);

            if ($n > 0 && $codigo < 400) {                 // bueno: se guarda y se entrega
                cs_guardar($cs_fxml, $salida);
                $cs_meta['bueno'] = time();
                unset($cs_meta['retirada']);
                cs_guardar($cs_fmeta, json_encode($cs_meta));
                echo $salida;
                return;
            }

            $nasOcupado = ($codigo === 503) || stripos($salida, 'NAS ocupado') !== false;
            if (!$nasOcupado) {                             // la web no dio noticias
                $cs_meta['retirada'] = time() + CS_RETIRADA_URL;
                cs_guardar($cs_fmeta, json_encode($cs_meta));
                $fallos = array_values(array_filter((array)($cs_web['fallos'] ?? []), function ($t) {
                    return (int)$t > time() - CS_VENTANA_FALLOS;
                }));
                $fallos[] = time();
                $cs_web['fallos'] = $fallos;
                if (count($fallos) >= CS_FALLOS_WEB) { $cs_web['retirada'] = time() + CS_RETIRADA_WEB; }
                cs_guardar($cs_fweb, json_encode($cs_web));
            }

            if ($cs_copia !== '') {
                cs_servir($cs_copia, $nasOcupado ? 'nas-ocupado-copia' : 'copia-anterior');
            } else {
                echo $salida;                               // sin copia: lo mismo que antes
            }
        });
    }
}
