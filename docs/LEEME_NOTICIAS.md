# Revisión de los widgets de noticias (4 oct 2026)

Archivos de esta carpeta:

| Archivo | Qué es |
|---|---|
| `NOTICIAS_REVISION.csv` | Todos los widgets de la hoja FEEDS con algún problema, con su causa y los posts publicados donde aparecen. |
| `CAMBIOS_HOJA_FEEDS.csv` | Cambios propuestos para la hoja **GENERADOR_NOTICIAS**, pestaña **FEEDS**, columna **C**. Indica la fila exacta y el valor nuevo. **No están aplicados.** |
| `nas/cache_scraper.php` y `nas/LEEME.md` | Filtro para que el lector del NAS solo acepte enlaces del propio medio. **Preparado, sin aplicar.** |

## NOTICIAS_REVISION.csv

Una fila por widget con problema. Ordenadas así: primero los que salen en blanco, luego los
desactualizados por bloqueo, luego el resto. Dentro de cada grupo, primero los que están en posts publicados.

- `estado`: problemas del archivo `noticias-N.json`, más lo que respondía el feed el 4 oct
  (código HTTP, número de noticias, fecha de la última y tipo de copia que sirve el NAS).
  - `no existe`: el widget sale en blanco.
  - `sin cambios`: el archivo lleva más de 3 días igual.
  - `menos de 3`, `sin fotos`, `acentos rotos`.
  - `enlaces ajenos`: noticias que no son de ese medio.
- `causa`: causa probable.
- `en_post_publicado`, `blog`, `url_post`: cruce con los posts **publicados** de todos los blogs
  (API de Blogger, 4 oct). Solo se miran los posts: si un widget está en un gadget lateral, aquí sale como «no».

## CAMBIOS_HOJA_FEEDS.csv

- `fila` y `columna`: celda de la pestaña FEEDS que hay que cambiar. Siempre es la columna C (URL).
  Antes de cambiarla, comprobar que la columna A de esa fila es el widget indicado.
- `valor_nuevo`: el valor exacto que hay que poner. Si está vacío, no hay sustituto comprobado
  (blog cerrado, web que bloquea…) y la columna `comprobado` explica por qué.
- `comprobado`: resultado de pedir la URL nueva desde GitHub el 4 oct (noticias, fotos, fecha de la última, dominios de los enlaces).
  Solo se proponen URLs que dieron 3 o más noticias, con la última de los últimos 15 días o sin fecha.
- Las URLs `scraper_generico.php?url=...` hacen que el NAS lea la página de la sección.
  Las de `wpcom_generico.php` usan la API de WordPress de EFE, igual que noticias-2240, que funciona bien.
- La variable `FEED` del HTML de cada widget, en GENERADOR_NOTICIAS columna G, solo se usa como último recurso.
  Basta con cambiar FEEDS!C.

El arreglo de los acentos de El Mundo (ISO-8859-15) no necesita cambios en la hoja. Está hecho en
`.github/workflows/feeds-generico.yml`.
