# Filtro de enlaces del propio medio para el lector del NAS (PREPARADO, SIN APLICAR)

**Estado:** preparado el 4 oct 2026 y probado en local con PHP. No está copiado al NAS.

## Qué arregla

`scraper_generico.php` lee la página de una sección y a veces recoge enlaces que no son
noticias del medio: YouTube, Facebook, Microsoft, boletines (Acumbamail, Mailchimp) o anuncios.
Por ejemplo noticias-725 y noticias-746 (eldiario.es), noticias-2233 a 2236 (miteco.gob.es) o
noticias-132 (lavanguardia.com). La lista completa está en `docs/NOTICIAS_REVISION.csv`.

## Qué cambia

Solo `cache_scraper.php`, la capa que `scraper_generico.php` carga con `require_once` en su
primera línea. El scraper no se toca.

Antes de guardar o entregar lo que saca el scraper, se quitan las noticias cuyo enlace no es:

- del dominio de la web pedida o de sus subdominios (para `elmundo.es` vale también `cooking.elmundo.es`);
- en los enlaces de afiliado de Awin, del dominio de la tienda (parámetro `ued`), además de `awin1.com`.

Reglas de seguridad:

- **Nunca deja un widget vacío.** Si al filtrar no queda ninguna noticia, se entrega el feed tal cual.
  Por eso noticias-941 (El Mundo, con los 6 enlaces a una escuela) no se arregla con este filtro:
  necesita otra URL en la hoja.
- Las copias que ya están en la caché no se filtran. Se van sustituyendo en la siguiente lectura buena
  (como mucho en 25 minutos).
- La cabecera `X-Filtro-Enlaces` dice cuántas noticias se han quitado. Así se puede comprobar con `curl -I`.
- Los modos `?debug=` y `?nocache=1` siguen sin pasar por esta capa, igual que antes.

## Cómo aplicarlo en el NAS

1. Hacer copia del actual: `cp cache_scraper.php cache_scraper.php.bak-$(date +%F)`
2. Copiar `docs/nas/cache_scraper.php` encima del `cache_scraper.php` del NAS, en la misma carpeta
   que `scraper_generico.php`.
3. Comprobar la sintaxis: `php -l cache_scraper.php`
4. Probar un feed con enlaces ajenos y mirar la cabecera:
   `curl -s -D - "https://carmenprofe.synology.me/scraper_generico.php?url=https%3A%2F%2Fwww.eldiario.es%2Flamarina%2F&v=1" -o /dev/null | grep -i x-filtro`
5. Para volver atrás: `cp cache_scraper.php.bak-AAAA-MM-DD cache_scraper.php`

## Diferencia con el original

Respecto a `cache_scraper.php` (copia del repositorio):

- un punto 5 en el comentario de cabecera;
- tres funciones nuevas: `cs_dominio_base`, `cs_dominios_permitidos` y `cs_filtrar_enlaces`;
- una línea al principio de la función de cierre: `$salida = cs_filtrar_enlaces(...)`, solo si la respuesta no es un error.
