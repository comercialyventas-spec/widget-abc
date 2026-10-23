// Mapas de Google con loading="lazy" en RESEÑAS DE ALOJAMIENTOS (reservadehoteles.blogspot.com).
// Añade loading="lazy" a los <iframe> de mapas de Google (maps.google.es, maps.google.com, www.google.com/maps/embed)
// que no tengan ya un atributo loading. Solo se inserta ' loading="lazy"' detrás de "<iframe": el src, el tamaño y el
// resto del HTML quedan igual. Título, etiquetas, fecha y dirección NO se tocan (solo "content", con PATCH).
//
// Uso (lo lanza el workflow "Mapas lazy (por orden)"):
//   node migracion/mapas_lazy.js <modo> [tope]
//   simular    -> lee todas las entradas publicadas y escribe el informe (cuántas entradas e iframes, 3 ejemplos). No cambia nada.
//   aplicar    -> por cada entrada a cambiar: copia en migracion/backup_mapas_lazy/<postId>.json (no se pisa si ya existe),
//                 PATCH del content, vuelve a leerla y comprueba que solo ha cambiado eso. Pausa entre entradas.
//                 Como mucho <tope> entradas por ejecución (por defecto 150). Se reanuda solo: lo ya cambiado ya lleva
//                 loading y no se vuelve a tocar. Si Blogger corta (503 repetido), para y guarda lo hecho.
//   restaurar  -> vuelve a poner el content de cada copia de migracion/backup_mapas_lazy/ (solo si la entrada sigue
//                 exactamente como la dejó «aplicar»; si se ha editado después, no se toca y se avisa).
//   comprobar  -> 5 entradas cambiadas al azar: el iframe lleva loading="lazy", el src es el mismo que en la copia y la
//                 dirección del mapa responde (HTTP 200).
// Informe de cada ejecución: migracion/backup_mapas_lazy/informe_<modo>.txt

const fs = require('fs');
const path = require('path');

const BLOG_ID = '6501274874552764479';
const API = 'https://www.googleapis.com/blogger/v3';
const DIR = path.join(__dirname, 'backup_mapas_lazy');
const PAUSA_MS = 5000;              // entre entradas, para no provocar el 503 de Blogger
const RE_IFRAME = /<iframe\b[^>]*>/gi;
const RE_MAPA = /\bsrc\s*=\s*["']?\s*(?:https?:)?\/\/(?:maps\.google\.(?:es|com)\/|www\.google\.com\/maps\/embed)/i;
const RE_LOADING = /\sloading\s*=/i;

const limpiar = (s) => String(s || '').replace(/\s+/g, '');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const lineas = [];
const log = (s) => { console.log(s); lineas.push(s); };

async function tokenAcceso() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: limpiar(process.env.CLIENT_ID),
      client_secret: limpiar(process.env.CLIENT_SECRET),
      refresh_token: limpiar(process.env.REFRESH_TOKEN),
      grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo pedir el token: ' + JSON.stringify(j));
  console.log('::add-mask::' + j.access_token);
  return j.access_token;
}

class Corte extends Error {}

async function blogger(token, metodo, url, cuerpo) {
  for (let intento = 1; intento <= 4; intento++) {
    const r = await fetch(url, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const txt = await r.text();
    if (r.ok) return JSON.parse(txt);
    if (r.status === 429 || r.status >= 500) {
      if (intento < 4) { console.log(`   (Blogger respondió ${r.status}, reintento en ${30 * intento} s)`); await esperar(30000 * intento); continue; }
      throw new Corte(`Blogger ${metodo} ${r.status} cuatro veces seguidas`);
    }
    throw new Error(`Blogger ${metodo} ${r.status}: ${txt.slice(0, 300)}`);
  }
}

/** Devuelve { nuevo, n, ejemplos } : n = iframes de mapa sin loading a los que se añade loading="lazy". */
function transformar(contenido) {
  let n = 0;
  const ejemplos = [];
  const nuevo = contenido.replace(RE_IFRAME, (tag) => {
    if (!RE_MAPA.test(tag) || RE_LOADING.test(tag)) return tag;
    n++;
    const cambiado = tag.replace(/^<iframe/i, (m) => m + ' loading="lazy"');
    if (ejemplos.length < 1) ejemplos.push({ antes: tag, despues: cambiado });
    return cambiado;
  });
  return { nuevo, n, ejemplos };
}

async function todasLasEntradas(token) {
  const posts = [];
  let pt = '';
  do {
    const j = await blogger(token, 'GET', `${API}/blogs/${BLOG_ID}/posts?maxResults=50&status=live&view=ADMIN&fetchBodies=true` +
      '&fields=nextPageToken,items(id,title,url,published,content)' + (pt ? '&pageToken=' + pt : ''));
    posts.push(...(j.items || []));
    pt = j.nextPageToken || '';
  } while (pt);
  return posts;
}

const archivo = (id) => path.join(DIR, `${id}.json`);

async function main() {
  const modo = process.argv[2];
  const tope = Number(process.argv[3] || 150);
  if (!['simular', 'aplicar', 'restaurar', 'comprobar'].includes(modo)) throw new Error('Modo no válido: ' + modo);
  fs.mkdirSync(DIR, { recursive: true });
  const token = await tokenAcceso();
  log(`MODO: ${modo.toUpperCase()}  —  blog ${BLOG_ID}  —  ${new Date().toISOString()}`);

  if (modo === 'restaurar') return restaurar(token);
  if (modo === 'comprobar') return comprobar(token);

  const posts = await todasLasEntradas(token);
  const aCambiar = [];
  let iframes = 0, conMapaYaLazy = 0;
  const ejemplos = [];
  for (const p of posts) {
    const c = String(p.content || '');
    (c.match(RE_IFRAME) || []).forEach((t) => { if (RE_MAPA.test(t) && RE_LOADING.test(t)) conMapaYaLazy++; });
    const t = transformar(c);
    if (!t.n) continue;
    aCambiar.push({ p, t });
    iframes += t.n;
    if (ejemplos.length < 3) ejemplos.push({ url: p.url, ...t.ejemplos[0] });
  }
  log(`Entradas publicadas leídas: ${posts.length}`);
  log(`Entradas que SE CAMBIARÍAN: ${aCambiar.length}  ·  iframes de mapa a los que se añade loading="lazy": ${iframes}`);
  log(`iframes de mapa que ya llevan loading (no se tocan): ${conMapaYaLazy}`);
  ejemplos.forEach((e, k) => {
    log(`\nEjemplo ${k + 1}: ${e.url}\n  ANTES:   ${e.antes}\n  DESPUÉS: ${e.despues}`);
  });

  if (modo === 'aplicar') {
    let hechas = 0, errores = 0;
    for (const { p, t } of aCambiar) {
      if (hechas >= tope) { log(`\nTope de ${tope} entradas en esta ejecución: quedan ${aCambiar.length - hechas}. Volver a lanzar «aplicar» para seguir.`); break; }
      try {
        if (!fs.existsSync(archivo(p.id))) {
          fs.writeFileSync(archivo(p.id), JSON.stringify({ id: p.id, url: p.url, title: p.title, fecha_copia: new Date().toISOString(), contenido: p.content, nuevo: t.nuevo }, null, 1));
        }
        await blogger(token, 'PATCH', `${API}/blogs/${BLOG_ID}/posts/${p.id}`, { content: t.nuevo });
        const r = await blogger(token, 'GET', `${API}/blogs/${BLOG_ID}/posts/${p.id}?view=ADMIN&fetchBody=true`);
        const problemas = [];
        if (r.content !== t.nuevo) problemas.push(`content distinto de lo enviado (${t.nuevo.length} → ${String(r.content || '').length} caracteres)`);
        if (r.title !== p.title) problemas.push('título cambiado');
        if (r.published !== p.published) problemas.push('fecha cambiada');
        if (r.url !== p.url) problemas.push('dirección cambiada');
        if (problemas.length) { errores++; log(`ERROR ${p.url}: ${problemas.join('; ')}. SE PARA.`); break; }
        hechas++;
        log(`CAMBIADO ${p.url} (${t.n} iframe${t.n > 1 ? 's' : ''})`);
      } catch (e) {
        if (e instanceof Corte) { log(`\nBLOGGER HA CORTADO (${e.message}) tras ${hechas} entradas. Lo hecho queda hecho; volver a lanzar «aplicar» para seguir.`); break; }
        errores++; log(`ERROR ${p.url}: ${e.message}. SE PARA.`); break;
      }
      await esperar(PAUSA_MS);
    }
    log(`\nRESUMEN APLICAR: ${hechas} entradas cambiadas en esta ejecución, ${errores} con error.`);
  }
}

async function restaurar(token) {
  const copias = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f));
  let hechas = 0, saltadas = 0;
  for (const f of copias) {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    try {
      const r = await blogger(token, 'GET', `${API}/blogs/${BLOG_ID}/posts/${c.id}?view=ADMIN&fetchBody=true`);
      if (r.content === c.contenido) { saltadas++; continue; }                 // ya está como antes
      if (r.content !== c.nuevo) { saltadas++; log(`SALTADO ${c.url}: se ha editado después del cambio, no se toca`); continue; }
      await blogger(token, 'PATCH', `${API}/blogs/${BLOG_ID}/posts/${c.id}`, { content: c.contenido });
      hechas++; log(`RESTAURADO ${c.url}`);
    } catch (e) {
      if (e instanceof Corte) { log(`BLOGGER HA CORTADO tras ${hechas}: volver a lanzar «restaurar».`); break; }
      log(`ERROR ${c.url}: ${e.message}`);
    }
    await esperar(PAUSA_MS);
  }
  log(`\nRESUMEN RESTAURAR: ${hechas} restauradas, ${saltadas} sin tocar, de ${copias.length} copias.`);
}

async function comprobar(token) {
  const copias = fs.readdirSync(DIR).filter((f) => /^\d+\.json$/.test(f));
  const elegidas = copias.sort(() => Math.random() - 0.5).slice(0, 5);
  let bien = 0;
  for (const f of elegidas) {
    const c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const r = await blogger(token, 'GET', `${API}/blogs/${BLOG_ID}/posts/${c.id}?view=ADMIN&fetchBody=true`);
    const antes = (c.contenido.match(RE_IFRAME) || []).filter((t) => RE_MAPA.test(t));
    const ahora = (String(r.content || '').match(RE_IFRAME) || []).filter((t) => RE_MAPA.test(t));
    const src = (t) => (/\bsrc\s*=\s*["']([^"']+)["']/i.exec(t) || [])[1] || '';
    const problemas = [];
    if (ahora.length !== antes.length) problemas.push(`${antes.length} mapas antes y ${ahora.length} ahora`);
    ahora.forEach((t, k) => {
      if (!/\sloading\s*=\s*["']?lazy/i.test(t) && !RE_LOADING.test(antes[k] || '')) problemas.push(`mapa ${k + 1} sin loading="lazy"`);
      if (src(t) !== src(antes[k] || '')) problemas.push(`mapa ${k + 1} con otro src`);
    });
    for (const t of ahora) {
      const u = src(t).replace(/&amp;/g, '&');
      try {
        const h = await fetch(u.startsWith('//') ? 'https:' + u : u, { redirect: 'follow' });
        if (h.status !== 200) problemas.push(`el mapa responde ${h.status}`);
      } catch (e) { problemas.push('el mapa no responde: ' + e.message); }
    }
    if (!problemas.length) bien++;
    log(`${problemas.length ? 'MAL' : 'BIEN'} ${c.url}  (${ahora.length} mapa${ahora.length > 1 ? 's' : ''})${problemas.length ? ': ' + problemas.join('; ') : ''}`);
  }
  log(`\nRESUMEN COMPROBAR: ${bien} de ${elegidas.length} entradas bien.`);
}

main()
  .catch((e) => { log('ERROR GENERAL: ' + e.message); process.exitCode = 1; })
  .finally(() => {
    const modo = process.argv[2] || 'x';
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(path.join(DIR, `informe_${modo}.txt`), lineas.join('\n') + '\n');
  });
