// CHEQUEO SEMANAL (solo lectura): revisa los widgets de noticias y los catálogos de productos
// que están en posts PUBLICADOS de todos los blogs, y escribe:
//   docs/ESTADO_SEMANAL.md   informe legible (nuevos fallos, empeorados, siguen mal, mejorados, bien)
//   docs/estado_semanal.json estado de esta semana, para compararlo con el de la semana que viene
// No cambia ningún post, ni la hoja, ni los noticias-*.json / productos/*.json.
// Los fallos NUEVOS se sacan como avisos (::warning) en el run.
// Lo lanza .github/workflows/estado-semanal.yml (lunes de madrugada).
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36';
const ESTADO = 'docs/estado_semanal.json';
const INFORME = 'docs/ESTADO_SEMANAL.md';
const ahora = Date.now();
const limpiarSecreto = (s) => String(s || '').replace(/\s+/g, '');
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');
const ROTO = /�|Ã[\u0080-¿¡-¿]|â€/;
const GRAVEDAD = { 3: 'en blanco / sin copia', 2: 'desactualizado', 1: 'calidad', 0: 'bien' };

async function bajar(url, ms, cabeceras) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: Object.assign({ 'User-Agent': UA }, cabeceras || {}) });
    const b = await r.text();
    return { st: r.status, ok: r.ok, b, cache: r.headers.get('x-cache-scraper') || '' };
  } catch (e) { return { st: e.name === 'AbortError' ? 'tiempo agotado' : 'sin respuesta', ok: false, b: '', cache: '' }; }
  finally { clearTimeout(t); }
}

// ---- 1. Posts publicados: widgets de noticias y catálogos que usa cada uno ----
async function postsPublicados() {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: limpiarSecreto(process.env.CLIENT_ID), client_secret: limpiarSecreto(process.env.CLIENT_SECRET), refresh_token: limpiarSecreto(process.env.REFRESH_TOKEN), grant_type: 'refresh_token' }) });
  const token = (await r.json()).access_token;
  if (!token) throw new Error('No se pudo pedir el token de Blogger');
  console.log('::add-mask::' + token);
  // Blogger devuelve a veces 500/503 pasajeros con páginas grandes: se reintenta con espera creciente
  const get = async (u) => {
    for (let intento = 1; ; intento++) {
      const x = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
      if (x.ok) return x.json();
      if (intento >= 5 || ![429, 500, 502, 503, 504].includes(x.status)) throw new Error('Blogger ' + x.status);
      await new Promise((ok) => setTimeout(ok, intento * 10000));
    }
  };
  const blogs = (await get('https://www.googleapis.com/blogger/v3/users/self/blogs?fields=items(id,name,url)')).items || [];
  const usos = {};   // id -> [{blog, post, titulo}]
  const apuntar = (id, uso) => { (usos[id] = usos[id] || []).push(uso); };
  let total = 0;
  for (const b of blogs) {
    let pt = '';
    do {
      const j = await get(`https://www.googleapis.com/blogger/v3/blogs/${b.id}/posts?maxResults=50&status=live&fields=nextPageToken,items(url,title,content)` + (pt ? '&pageToken=' + pt : ''));
      for (const p of j.items || []) {
        total++;
        const c = String(p.content || '');
        const uso = { blog: b.name, post: p.url, titulo: String(p.title || '').replace(/\s+/g, ' ') };
        const vistos = new Set();
        let m; const re = /noticias-(\d+)(?:-mini)?(?:-container|\.json)/g;
        while ((m = re.exec(c))) vistos.add('noticias-' + m[1]);
        // Catálogos del motor de productos: <div class="motor-productos" data-url="a | b" ...>
        for (const div of c.match(/<div[^>]*class=["'][^"']*motor-productos[^"']*["'][^>]*>/gi) || []) {
          const du = (div.match(/data-url=["']([^"']+)["']/i) || [])[1] || '';
          du.replace(/&amp;/g, '&').split('|').map((s) => s.trim()).filter(Boolean).forEach((u) => vistos.add('catalogo:' + u));
        }
        vistos.forEach((id) => apuntar(id, uso));
      }
      pt = j.nextPageToken || '';
    } while (pt);
  }
  console.log(`Blogs: ${blogs.length} | posts publicados: ${total} | widgets y catálogos en ellos: ${Object.keys(usos).length}`);
  return usos;
}

// ---- 2. Lista de feeds (la misma que usa feeds-generico.yml) ----
async function listaFeeds() {
  const r = await fetch(process.env.LISTAR_FEEDS_URL + '?accion=listarFeeds&token=' + encodeURIComponent(process.env.LISTAR_FEEDS_TOKEN));
  const t = await r.text();
  try { const m = {}; (JSON.parse(t).feeds || []).forEach((f) => { m[f.wid] = f.url; }); return m; }
  catch (e) { console.log('::warning title=Lista de feeds no disponible::No se pudo leer la lista de feeds; se revisan los archivos sin mirar su feed.'); return {}; }
}

// ---- 3. Última vez que cambió cada noticias-*.json (historial de git) ----
function ultimosCambios() {
  const ult = {}; let t = 0;
  const salida = execSync("git log --since='15 days ago' --name-only --format='@%ct' -- 'noticias-*.json'", { maxBuffer: 1 << 28 }).toString();
  for (const l of salida.split('\n')) { if (l.startsWith('@')) t = +l.slice(1) * 1000; else if (l && !(l in ult)) ult[l] = t; }
  return ult;
}

function dominioBase(h) {
  const p = String(h || '').toLowerCase().replace(/^www\./, '').split('.');
  if (p.length <= 2) return p.join('.');
  const s2 = p.slice(-2).join('.');
  return ['gob.es', 'com.es', 'org.es', 'co.uk', 'com.mx', 'com.ar', 'com.co'].includes(s2) ? p.slice(-3).join('.') : s2;
}
function origenFeed(u) {
  try { const x = new URL(u); return x.searchParams.get('url') ? new URL(x.searchParams.get('url')).hostname : (x.searchParams.get('sitio') || x.hostname); } catch (e) { return ''; }
}

// ---- 4. Revisión de un widget de noticias ----
async function revisarNoticias(id, feed, ult) {
  const p = []; let sev = 0; const sube = (n, txt) => { sev = Math.max(sev, n); p.push(txt); };
  let ns = null;
  try { ns = JSON.parse(fs.readFileSync(id + '.json', 'utf8')).noticias || []; } catch (e) { ns = null; }
  if (!ns) sube(3, 'no existe ' + id + '.json (el widget sale en blanco)');
  else if (!ns.length) sube(3, 'archivo vacío (el widget sale en blanco)');
  const dias = ult[id + '.json'] ? (ahora - ult[id + '.json']) / 86400000 : null;
  if (ns && ns.length) {
    if (dias === null) sube(2, 'sin cambios en más de 15 días');
    else if (dias > 3) sube(2, `sin cambios desde hace ${dias.toFixed(1)} días`);
    if (ns.length < 3) sube(1, `solo ${ns.length} noticias`);
    const fotos = ns.filter((x) => x.imagen).length;
    if (!fotos) sube(1, 'sin fotos');
    if (ns.some((x) => ROTO.test(x.titulo || ''))) sube(1, 'acentos rotos');
    const o = dominioBase(origenFeed(feed || ''));
    if (o && !['uecdn.es', 'google.com', 'githubusercontent.com', 'co.uk'].includes(o)) {
      const ajenos = [...new Set(ns.map((x) => { try { return dominioBase(new URL(x.link).hostname); } catch (e) { return ''; } }).filter((d) => d && d !== o))];
      if (ajenos.length) sube(1, 'enlaces de otras webs (' + ajenos.slice(0, 3).join(', ') + ')');
    }
  }
  let feedTxt = '';
  if (feed) {
    const r = await bajar(feed, 25000);
    feedTxt = typeof r.st === 'number' ? 'HTTP ' + r.st : r.st;
    if (r.cache) feedTxt += ', NAS: ' + r.cache;
    const items = (r.b.match(/<item\b/gi) || r.b.match(/<entry\b/gi) || []).length || (r.b.trim().startsWith('{') ? ((() => { try { return (JSON.parse(r.b).noticias || []).length; } catch (e) { return 0; } })()) : 0);
    if (!r.ok) p.push('feed: ' + feedTxt);
    else if (!items) p.push('el feed responde sin noticias');
    else if (/^retirada|copia-anterior/.test(r.cache)) p.push('el NAS sirve una copia vieja (la web no le da noticias)');
  } else p.push('no está en la lista de feeds');
  return { tipo: 'noticias', sev, problemas: p, dias: dias === null ? null : +dias.toFixed(1), feed: feed || '' };
}

// ---- 5. Revisión de un catálogo de productos (copia de GitHub que lee el motor sin gesto) ----
function revisarCatalogo(url) {
  const p = []; let sev = 0; const sube = (n, txt) => { sev = Math.max(sev, n); p.push(txt); };
  const archivo = `productos/producto-${md5(url).slice(0, 16)}-p1.json`;
  let d = null;
  try { d = JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch (e) { d = null; }
  const ps = (d && d.productos) || [];
  if (!d || !ps.length) sube(3, 'sin copia en GitHub: depende del NAS (sale «Ver productos» hasta que el lector toca la página)');
  let horas = null;
  if (ps.length) {
    horas = d.generado ? (ahora - new Date(d.generado).getTime()) / 3600000 : null;
    if (horas === null || horas > 72) sube(2, `copia de GitHub antigua (${horas === null ? '¿?' : Math.round(horas) + ' h'}; el motor la da por caducada a las 72 h)`);
    if (d.totalPaginas === 1 && ps.length < 6) sube(1, `solo ${ps.length} productos`);
    const fotos = ps.filter((x) => x.imagen).length;
    if (fotos < ps.length) sube(1, `${ps.length - fotos} productos sin foto`);
    if (d.idioma_distinto) sube(1, 'la copia está en otro idioma/moneda (para lectores de aquí se pide al NAS)');
  }
  return { tipo: 'catalogo', sev, problemas: p, horas: horas === null ? null : Math.round(horas), archivo };
}

(async () => {
  const usos = await postsPublicados();
  const feeds = await listaFeeds();
  const ult = ultimosCambios();
  const ids = Object.keys(usos).sort();
  const res = {};
  const cola = ids.slice();
  async function trabajador() {
    while (cola.length) {
      const id = cola.shift();
      res[id] = id.startsWith('catalogo:') ? revisarCatalogo(id.slice(9)) : await revisarNoticias(id, feeds[id], ult);
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabajador));

  // ---- 6. Comparación con la semana anterior ----
  let antes = null;
  try { antes = JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch (e) { antes = null; }
  const prev = (antes && antes.items) || {};
  const nuevos = [], peores = [], siguen = [], mejores = [], bien = [];
  for (const id of ids) {
    const r = res[id]; const a = prev[id];
    if (r.sev > 0 && antes && (!a || a.sev === 0)) nuevos.push(id);
    else if (r.sev > 0 && a && r.sev > a.sev) peores.push(id);
    else if (r.sev > 0) siguen.push(id);
    else if (a && a.sev > 0) mejores.push(id);
    else bien.push(id);
  }
  const porGravedad = (x, y) => res[y].sev - res[x].sev || x.localeCompare(y, 'es', { numeric: true });
  [nuevos, peores, siguen].forEach((l) => l.sort(porGravedad));

  // ---- 7. Informe ----
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const nombre = (id) => id.startsWith('catalogo:') ? 'Catálogo ' + id.slice(9) : id;
  const postsDe = (id) => usos[id].map((u) => `[${u.titulo || u.post}](${u.post})`).slice(0, 3).join(', ') + (usos[id].length > 3 ? ` y ${usos[id].length - 3} más` : '');
  const fila = (id) => `| ${res[id].sev} · ${GRAVEDAD[res[id].sev]} | \`${nombre(id)}\` | ${res[id].problemas.join('; ')}${prev[id] && prev[id].sev !== res[id].sev ? ` (antes: ${GRAVEDAD[prev[id].sev]})` : ''} | ${postsDe(id)} |`;
  const tabla = (l) => l.length ? ['| Gravedad | Widget / catálogo | Problema | Posts publicados |', '|---|---|---|---|', ...l.map(fila)].join('\n') : '_Ninguno._';
  const cuenta = (l, t) => l.filter((id) => res[id].tipo === t).length;
  const md = [
    '# Estado semanal de widgets de noticias y catálogos',
    '',
    `Generado: ${fecha} por \`.github/workflows/estado-semanal.yml\` (solo lectura).`,
    antes ? `Comparado con la revisión del ${String(antes.fecha || '').slice(0, 16).replace('T', ' ')} UTC.` : '**Primera revisión: no hay semana anterior con la que comparar.** Desde la próxima se marcarán los fallos nuevos.',
    '',
    'Solo se revisan los widgets de noticias (`noticias-N`) y los catálogos del motor de productos que aparecen en **posts publicados**.',
    'Gravedad: **3** en blanco o sin copia en GitHub · **2** desactualizado · **1** calidad (pocas noticias o productos, sin fotos, acentos, enlaces ajenos) · **0** bien.',
    '',
    '## Resumen',
    '',
    '| | Noticias | Catálogos |',
    '|---|---|---|',
    `| Nuevos fallos | ${cuenta(nuevos, 'noticias')} | ${cuenta(nuevos, 'catalogo')} |`,
    `| Han empeorado | ${cuenta(peores, 'noticias')} | ${cuenta(peores, 'catalogo')} |`,
    `| Siguen mal | ${cuenta(siguen, 'noticias')} | ${cuenta(siguen, 'catalogo')} |`,
    `| Han mejorado | ${cuenta(mejores, 'noticias')} | ${cuenta(mejores, 'catalogo')} |`,
    `| Bien | ${cuenta(bien, 'noticias')} | ${cuenta(bien, 'catalogo')} |`,
    '',
    '## Nuevos fallos', '', tabla(nuevos), '',
    '## Han empeorado', '', tabla(peores), '',
    '## Siguen mal', '', tabla(siguen), '',
    '## Han mejorado', '', mejores.length ? mejores.map((id) => `- \`${nombre(id)}\` (antes: ${GRAVEDAD[prev[id].sev]}: ${(prev[id].problemas || []).join('; ')})`).join('\n') : '_Ninguno._', '',
    '## Bien', '', bien.length ? bien.map((id) => '`' + nombre(id) + '`').join(' · ') : '_Ninguno._', '',
  ].join('\n');
  fs.mkdirSync('docs', { recursive: true });
  fs.writeFileSync(INFORME, md);
  const items = {}; ids.forEach((id) => { items[id] = { sev: res[id].sev, problemas: res[id].problemas, posts: usos[id].map((u) => u.post) }; });
  fs.writeFileSync(ESTADO, JSON.stringify({ fecha: new Date().toISOString(), items }, null, 1));

  // ---- 8. Avisos en el run ----
  const linea = (id) => `${nombre(id)} [${GRAVEDAD[res[id].sev]}]: ${res[id].problemas.join('; ')} — ${usos[id][0].post}`;
  for (let i = 0; i < nuevos.length; i += 5) console.log('::warning title=Nuevos fallos en posts publicados::' + nuevos.slice(i, i + 5).map(linea).join(' ### '));
  for (let i = 0; i < peores.length; i += 5) console.log('::warning title=Han empeorado::' + peores.slice(i, i + 5).map(linea).join(' ### '));
  const resumen = `Nuevos fallos: ${nuevos.length} | empeorados: ${peores.length} | siguen mal: ${siguen.length} | mejorados: ${mejores.length} | bien: ${bien.length}`;
  console.log('::notice title=Estado semanal::' + resumen + (antes ? '' : ' (primera revisión: sin semana anterior)'));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(resumen);
})().catch((e) => { console.log('::error title=Estado semanal::' + e.message); process.exit(1); });
