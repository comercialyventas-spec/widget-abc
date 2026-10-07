// Migración de posts de Blogger: cambia el contenido de cada post por el widget
// actual de su fila de GENERADOR_NOTICIAS (columna G). Sin cupo de Apps Script.
//
// Uso (lo lanza el workflow "Migrar posts Blogger"):
//   node migracion/migrar_posts.js <lista.json> <modo>
//   modo = simular  -> solo lee y cuenta lo que haría. No cambia nada.
//   modo = aplicar  -> guarda copia del HTML actual en migracion/backups/ y cambia el post.
//   modo = restaurar -> vuelve a poner en cada post el HTML guardado en migracion/backups/.
//
// Título, etiquetas, fecha y dirección del post NO se tocan (solo "content").
//
// MODOS DE ETIQUETAS (lista con "tipo": "etiquetas", ver etiquetasMain más abajo):
//   simular_etiquetas   -> solo lee y dice qué etiquetas generales añadiría a cada post.
//   anadir_etiquetas    -> guarda copia de las etiquetas en migracion/backups/etiquetas/<postId>.json
//                          y AÑADE las generales que faltan (posts.patch solo con "labels").
//                          No quita ni cambia ninguna etiqueta, ni el contenido, título, fecha o estado.
//   restaurar_etiquetas -> deja las etiquetas de cada post como estaban en su copia.

const fs = require('fs');
const path = require('path');

const HOJA_GN = '17HjbMWPmmfI6npzxfMlq3gcrBKZTm2MC4mfMDcSjnXA';
const VIEJOS = ['AKfycbxTehoGzJL9MT1Sv', 'AKfycbzeMKVUzOXYNngx1d8', 'AKfycbxMwKitb599oOi'];
// Listas de productos ("detectar": "cualquier_script"): vale cualquier script de Google salvo los contadores de clics.
const CONTADORES = ['w7seO', 'mjaZZ'];
function llevaScriptGoogle(c, modoDetectar) {
  if (modoDetectar !== 'cualquier_script') return VIEJOS.some((id) => c.includes(id));
  const ids = (c.match(/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}/g) || []);
  return ids.some((m) => !CONTADORES.some((x) => m.includes(x)));
}
const API = 'https://www.googleapis.com/blogger/v3';
const DIR_BACKUP = path.join(__dirname, 'backups');

const limpiar = (s) => String(s || '').replace(/\s+/g, '');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function blogger(token, metodo, url, cuerpo) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(url, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const txt = await r.text();
    if (r.ok) return JSON.parse(txt);
    if ((r.status === 429 || r.status >= 500) && intento < 3) {
      console.log(`   (Blogger respondió ${r.status}, reintento en 20 s)`);
      await esperar(20000);
      continue;
    }
    throw new Error(`Blogger ${metodo} ${r.status}: ${txt.slice(0, 300)}`);
  }
}

// Lee la celda G<fila> de GENERADOR_NOTICIAS con la API de Sheets (solo lectura, la hoja sigue privada).
async function widgetDeFila(token, fila) {
  const rango = encodeURIComponent(`GENERADOR_NOTICIAS!G${fila}`);
  const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HOJA_GN}/values/${rango}`, {
    headers: { Authorization: 'Bearer ' + token },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`No se pudo leer la fila ${fila} de GENERADOR_NOTICIAS (Sheets ${r.status}): ${txt.slice(0, 200)}`);
  const j = JSON.parse(txt);
  return String((j.values && j.values[0] && j.values[0][0]) || '');
}

// ======================= ETIQUETAS =======================
const DIR_BACKUP_ETQ = path.join(DIR_BACKUP, 'etiquetas');
const LIMITE_ETIQUETAS = 200;               // Blogger: 200 caracteres en total para las etiquetas de un post
const largoEtiquetas = (ls) => ls.join(', ').length;
class CorteBlogger extends Error {}

// Etiquetas generales que faltan en un post según la tabla aprobada (solo añade, nunca quita)
function etiquetasQueFaltan(labels, tabla, reglas) {
  const tiene = new Set(labels);
  const anadir = [];
  for (const l of labels) for (const g of (tabla[l] || [])) if (!tiene.has(g) && !anadir.includes(g)) anadir.push(g);
  for (const r of reglas || []) {   // p. ej. {si: "FEMINISMO", anadir: "IGUALDAD"}
    if ((tiene.has(r.si) || anadir.includes(r.si)) && !tiene.has(r.anadir) && !anadir.includes(r.anadir)) anadir.push(r.anadir);
  }
  return anadir;
}

// Llamada a Blogger que, si corta (429/5xx) tras los reintentos, para todo para seguir en el siguiente lanzamiento
async function bloggerEtq(token, metodo, url, cuerpo) {
  try { return await blogger(token, metodo, url, cuerpo); }
  catch (e) { if (/ (429|5\d\d):/.test(e.message)) throw new CorteBlogger(e.message); throw e; }
}

async function etiquetasMain(lista, modo, token) {
  const blogId = lista.blogId;
  const conf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', lista.tabla), 'utf8'));
  const tabla = conf.equivalencias, reglas = conf.reglas || [];
  const pausa = lista.pausa_ms || 4000;
  fs.mkdirSync(DIR_BACKUP_ETQ, { recursive: true });

  // Posts a revisar: una lista de postId, o "todos" (publicados y programados; nunca borradores)
  let ids;
  if (lista.posts === 'todos') {
    ids = [];
    for (const status of ['live', 'scheduled']) {
      let pt = '';
      do {
        const j = await bloggerEtq(token, 'GET', `${API}/blogs/${blogId}/posts?maxResults=500&status=${status}&view=ADMIN&fetchBodies=false&fields=nextPageToken,items(id,labels)` + (pt ? '&pageToken=' + pt : ''));
        for (const p of j.items || []) {
          const labels = p.labels || [];
          if (modo === 'restaurar_etiquetas' ? fs.existsSync(path.join(DIR_BACKUP_ETQ, p.id + '.json')) : etiquetasQueFaltan(labels, tabla, reglas).length) ids.push(p.id);
        }
        pt = j.nextPageToken || '';
      } while (pt);
    }
  } else ids = lista.posts.map(String);

  console.log(`MODO: ${modo.toUpperCase()}  —  ${ids.length} posts candidatos (blog ${blogId})\n`);
  const cuenta = { cambiados: 0, yaEstaban: 0, saltados: 0, errores: 0, restaurados: 0 };
  const porGeneral = {};
  const detalle = [];
  let cortado = false;

  for (const id of ids) {
    try {
      const post = await bloggerEtq(token, 'GET', `${API}/blogs/${blogId}/posts/${id}?view=ADMIN&fetchBody=false&fields=id,title,url,status,published,labels`);
      const labels = post.labels || [];
      const archivo = path.join(DIR_BACKUP_ETQ, `${id}.json`);

      if (modo === 'restaurar_etiquetas') {
        if (!fs.existsSync(archivo)) { cuenta.saltados++; detalle.push({ id, resultado: 'SIN COPIA' }); continue; }
        const copia = JSON.parse(fs.readFileSync(archivo, 'utf8'));
        if (JSON.stringify(copia.labels) === JSON.stringify(labels)) { cuenta.yaEstaban++; detalle.push({ id, resultado: 'YA ESTABA' }); continue; }
        await bloggerEtq(token, 'PATCH', `${API}/blogs/${blogId}/posts/${id}?fetchBody=false&fetchImages=false`, { labels: copia.labels });
        cuenta.restaurados++; detalle.push({ id, resultado: 'RESTAURADO', etiquetas: copia.labels });
        await esperar(pausa);
        continue;
      }

      if (post.status === 'DRAFT') { cuenta.saltados++; detalle.push({ id, resultado: 'SALTADO (borrador)' }); continue; }
      const anadir = etiquetasQueFaltan(labels, tabla, reglas);
      if (!anadir.length) { cuenta.yaEstaban++; detalle.push({ id, resultado: 'YA ESTABA' }); continue; }
      const nuevas = labels.concat(anadir);
      if (largoEtiquetas(nuevas) > LIMITE_ETIQUETAS) {
        cuenta.saltados++; detalle.push({ id, titulo: post.title, resultado: `SALTADO (pasaría de ${LIMITE_ETIQUETAS} caracteres: ${largoEtiquetas(nuevas)})`, anadiria: anadir });
        continue;
      }
      anadir.forEach((g) => { porGeneral[g] = (porGeneral[g] || 0) + 1; });

      if (modo === 'simular_etiquetas') {
        cuenta.cambiados++; detalle.push({ id, titulo: post.title, estado: post.status, url: post.url, anade: anadir });
        continue;
      }

      // anadir_etiquetas: primero la copia (la primera, la original, no se pisa), luego el cambio
      if (!fs.existsSync(archivo)) {
        fs.writeFileSync(archivo, JSON.stringify({ id, blogId, url: post.url, titulo: post.title, status: post.status,
          published: post.published, labels, fecha_copia: new Date().toISOString() }, null, 1));
      }
      const r = await bloggerEtq(token, 'PATCH', `${API}/blogs/${blogId}/posts/${id}?fetchBody=false&fetchImages=false`, { labels: nuevas });
      // Comprobación: no se ha perdido ninguna etiqueta y no han cambiado ni la fecha ni el estado
      const rl = r.labels || [];
      const problemas = [];
      if (!labels.every((l) => rl.includes(l))) problemas.push('falta alguna etiqueta original');
      if (!anadir.every((l) => rl.includes(l))) problemas.push('no se ha añadido alguna general');
      if (r.published !== post.published) problemas.push(`fecha cambiada (${post.published} → ${r.published})`);
      if (r.status !== post.status) problemas.push(`estado cambiado (${post.status} → ${r.status})`);
      if (problemas.length) { cuenta.errores++; detalle.push({ id, url: post.url, resultado: 'ERROR comprobación: ' + problemas.join('; '), anade: anadir }); }
      else { cuenta.cambiados++; detalle.push({ id, titulo: post.title, estado: post.status, url: post.url, resultado: 'CAMBIADO', anade: anadir }); }
      await esperar(pausa);
    } catch (e) {
      if (e instanceof CorteBlogger) {
        cortado = true;
        detalle.push({ id, resultado: 'PARADO: Blogger cortó (' + e.message.slice(0, 80) + '). Al relanzar sigue desde aquí.' });
        break;
      }
      cuenta.errores++; detalle.push({ id, resultado: 'ERROR ' + e.message.slice(0, 200) });
    }
  }

  // Detalle completo junto a las copias (el workflow lo guarda en el repositorio)
  const nombreLista = path.basename(lista._archivo || 'lista', '.json');
  fs.writeFileSync(path.join(DIR_BACKUP_ETQ, `_resultado_${nombreLista}_${modo}.json`),
    JSON.stringify({ fecha: new Date().toISOString(), modo, lista: lista._archivo, cuenta, porGeneral, cortado, detalle }, null, 1));

  const verbo = modo === 'simular_etiquetas' ? 'SE CAMBIARÍAN' : modo === 'restaurar_etiquetas' ? 'RESTAURADOS' : 'CAMBIADOS';
  console.log('\n===== RESUMEN =====');
  console.log(`MODO ${modo}: ${verbo} ${modo === 'restaurar_etiquetas' ? cuenta.restaurados : cuenta.cambiados} | YA ESTABAN ${cuenta.yaEstaban} | SALTADOS ${cuenta.saltados} | ERRORES ${cuenta.errores}${cortado ? ' | PARADO por Blogger (relanzar para seguir)' : ''}`);
  if (Object.keys(porGeneral).length) console.log('MODO etiquetas añadidas por general: ' + Object.entries(porGeneral).sort((a, b) => b[1] - a[1]).map(([g, n]) => `${g} +${n}`).join(', '));
  detalle.filter((d) => /^(ERROR|SALTADO|PARADO)/.test(d.resultado || '')).forEach((d) => console.log(`${d.resultado.startsWith('SALTADO') ? 'SALTADO' : d.resultado.startsWith('PARADO') ? 'ERROR PARADO' : 'ERROR'} [${d.id}] ${d.resultado}`));
  detalle.filter((d) => d.anade).forEach((d) => console.log(`  ${d.resultado || 'SIMULADO'} [${d.id}] ${d.estado || ''} + ${d.anade.join(', ')}  ${d.titulo || ''}`));
  if (cuenta.errores || cortado) process.exitCode = 1;
}

async function main() {
  const [listaArchivo, modo] = process.argv.slice(2);
  const MODOS_ETQ = ['simular_etiquetas', 'anadir_etiquetas', 'restaurar_etiquetas'];
  if (MODOS_ETQ.includes(modo)) {
    const lista = JSON.parse(fs.readFileSync(listaArchivo, 'utf8'));
    if (lista.tipo !== 'etiquetas') throw new Error('Los modos de etiquetas necesitan una lista con "tipo": "etiquetas"');
    lista._archivo = listaArchivo;
    return etiquetasMain(lista, modo, await tokenAcceso());
  }
  if (!['simular', 'aplicar', 'restaurar'].includes(modo)) throw new Error('Modo no válido: ' + modo);
  const lista = JSON.parse(fs.readFileSync(listaArchivo, 'utf8'));
  const blogPorDefecto = lista.blogId;
  const token = await tokenAcceso();
  fs.mkdirSync(DIR_BACKUP, { recursive: true });

  console.log(`MODO: ${modo.toUpperCase()}  —  ${lista.posts.length} posts\n`);
  const resumen = [];
  let errores = 0;

  for (const entrada of lista.posts) {
    // Entrada de noticias: [ruta, fila, nombre]. Entrada de productos: {ruta, nombre, html, blogId}
    const esObjeto = !Array.isArray(entrada);
    const ruta = esObjeto ? entrada.ruta : entrada[0];
    const fila = esObjeto ? null : entrada[1];
    const nombre = esObjeto ? entrada.nombre : entrada[2];
    // Entrada de noticias de otro blog: [ruta, fila, nombre, blogId]
    const blogId = (esObjeto ? entrada.blogId : entrada[3]) || blogPorDefecto;
    try {
      const post = await blogger(token, 'GET',
        `${API}/blogs/${blogId}/posts/bypath?path=${encodeURIComponent(ruta)}&view=ADMIN`);
      const viejo = String(post.content || '');
      const archivoBackup = path.join(DIR_BACKUP, `${post.id}.json`);

      if (modo === 'restaurar') {
        if (!fs.existsSync(archivoBackup)) { resumen.push(`SIN COPIA  ${nombre}: no hay backup, no se toca`); continue; }
        const copia = JSON.parse(fs.readFileSync(archivoBackup, 'utf8'));
        await blogger(token, 'PATCH', `${API}/blogs/${blogId}/posts/${post.id}`, { content: copia.contenido });
        resumen.push(`RESTAURADO ${nombre}  ${post.url}`);
        await esperar(3000);
        continue;
      }

      // Lista "detectar": "poner_moneda": solo añade data-moneda al motor de productos que ya lleva el post.
      // No toca nada más del post. La copia de backups/ (si ya existe, la original antes de migrar) no se pisa.
      if (lista.detectar === 'poner_moneda') {
        const moneda = String(entrada.moneda || '');
        if (!/^[A-Z]{3}$/.test(moneda)) { resumen.push(`SALTADO  ${nombre}: moneda no válida "${moneda}"`); continue; }
        const bloques = viejo.match(/<div class="motor-productos"[^>]*>/g) || [];
        if (bloques.length !== 1) { resumen.push(`SALTADO  ${nombre}: el post tiene ${bloques.length} bloques motor-productos (se esperaba 1)`); continue; }
        if (/data-moneda=/.test(bloques[0])) { resumen.push(`YA ESTABA BIEN  ${nombre}: ya lleva data-moneda`); continue; }
        const nuevoMon = viejo.replace(bloques[0], bloques[0].replace('<div class="motor-productos"', `<div class="motor-productos" data-moneda="${moneda}"`));
        if (modo === 'simular') {
          resumen.push(`SE CAMBIARÍA  ${nombre}  (post ${post.id}: añade data-moneda="${moneda}", ${viejo.length} → ${nuevoMon.length} caracteres)  ${post.url}`);
          continue;
        }
        if (!fs.existsSync(archivoBackup)) {
          fs.writeFileSync(archivoBackup, JSON.stringify({
            id: post.id, blogId, url: post.url, path: ruta, titulo: post.title, fila,
            contenido: viejo, fecha_copia: new Date().toISOString(),
          }, null, 1));
        }
        await blogger(token, 'PATCH', `${API}/blogs/${blogId}/posts/${post.id}`, { content: nuevoMon });
        resumen.push(`CAMBIADO  ${nombre} → data-moneda="${moneda}"  ${post.url}`);
        await esperar(3000);
        continue;
      }

      const llevaViejo = llevaScriptGoogle(viejo, lista.detectar);
      if (!llevaViejo) { resumen.push(`YA ESTABA BIEN  ${nombre}: no lleva el script viejo, no se toca`); continue; }

      let nuevo;
      if (esObjeto) {
        nuevo = fs.readFileSync(path.join(__dirname, '..', entrada.html), 'utf8');
        const esJsonGithub = entrada.tipo === 'json_github';
        if (esJsonGithub) {
          if (!nuevo.includes('raw.githubusercontent.com/comercialyventas-spec/widget-abc/main/') || !/["']datos\/[a-z0-9-]+\.json["']/.test(nuevo)) { resumen.push(`SALTADO  ${nombre}: el HTML nuevo no lee sus datos de GitHub (datos/)`); continue; }
        } else if (entrada.tipo === 'widget_noticias') {
          if (!/id="noticias-[0-9]+-container"/.test(nuevo) || !nuevo.includes('raw.githubusercontent.com/comercialyventas-spec/widget-abc/main/')) { resumen.push(`SALTADO  ${nombre}: el HTML nuevo no lleva un widget de noticias que lea de GitHub`); continue; }
        } else if (!nuevo.includes('motor-productos')) { resumen.push(`SALTADO  ${nombre}: el HTML nuevo no lleva el motor`); continue; }
      } else {
        nuevo = await widgetDeFila(token, fila);
        if (!nuevo.includes(`noticias-${fila}-container`)) {
          resumen.push(`SALTADO  ${nombre}: la fila ${fila} no tiene su widget en la columna G`);
          continue;
        }
      }
      if (llevaScriptGoogle(nuevo, 'cualquier_script')) {
        resumen.push(`SALTADO  ${nombre}: el contenido nuevo TAMBIÉN llama a un script de Google`);
        continue;
      }

      if (modo === 'simular') {
        resumen.push(`SE CAMBIARÍA  ${nombre}  (post ${post.id}, ${viejo.length} → ${nuevo.length} caracteres, ${esObjeto ? entrada.html : 'widget noticias-' + fila})  ${post.url}`);
        continue;
      }

      // aplicar: primero la copia, luego el cambio
      if (!fs.existsSync(archivoBackup)) {
        fs.writeFileSync(archivoBackup, JSON.stringify({
          id: post.id, blogId, url: post.url, path: ruta, titulo: post.title, fila,
          contenido: viejo, fecha_copia: new Date().toISOString(),
        }, null, 1));
      }
      await blogger(token, 'PATCH', `${API}/blogs/${blogId}/posts/${post.id}`, { content: nuevo });
      resumen.push(`CAMBIADO  ${nombre} → ${esObjeto ? (entrada.tipo === 'json_github' ? 'datos JSON de GitHub' : entrada.tipo === 'widget_noticias' ? 'widget de noticias (GitHub)' : 'motor de productos') : 'widget noticias-' + fila}  ${post.url}`);
      await esperar(3000);
    } catch (e) {
      errores++;
      resumen.push(`ERROR  ${nombre}: ${e.message}`);
    }
  }

  console.log('\n===== RESUMEN =====');
  resumen.forEach((l) => console.log(l));
  if (errores) { console.log(`\n${errores} con error`); process.exitCode = 1; }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
