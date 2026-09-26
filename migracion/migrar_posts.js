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

const fs = require('fs');
const path = require('path');

const HOJA_GN = '17HjbMWPmmfI6npzxfMlq3gcrBKZTm2MC4mfMDcSjnXA';
const VIEJOS = ['AKfycbxTehoGzJL9MT1Sv', 'AKfycbzeMKVUzOXYNngx1d8', 'AKfycbxMwKitb599oOi'];
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

async function main() {
  const [listaArchivo, modo] = process.argv.slice(2);
  if (!['simular', 'aplicar', 'restaurar'].includes(modo)) throw new Error('Modo no válido: ' + modo);
  const lista = JSON.parse(fs.readFileSync(listaArchivo, 'utf8'));
  const blogId = lista.blogId;
  const token = await tokenAcceso();
  fs.mkdirSync(DIR_BACKUP, { recursive: true });

  console.log(`MODO: ${modo.toUpperCase()}  —  ${lista.posts.length} posts\n`);
  const resumen = [];
  let errores = 0;

  for (const [ruta, fila, nombre] of lista.posts) {
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

      const llevaViejo = VIEJOS.some((id) => viejo.includes(id));
      if (!llevaViejo) { resumen.push(`YA ESTABA BIEN  ${nombre}: no lleva el script viejo, no se toca`); continue; }

      const nuevo = await widgetDeFila(token, fila);
      if (!nuevo.includes(`noticias-${fila}-container`)) {
        resumen.push(`SALTADO  ${nombre}: la fila ${fila} no tiene su widget en la columna G`);
        continue;
      }
      if (VIEJOS.some((id) => nuevo.includes(id))) {
        resumen.push(`SALTADO  ${nombre}: el widget nuevo de la fila ${fila} TAMBIÉN usa un script de Google`);
        continue;
      }

      if (modo === 'simular') {
        resumen.push(`SE CAMBIARÍA  ${nombre}  (post ${post.id}, ${viejo.length} → ${nuevo.length} caracteres, widget noticias-${fila})  ${post.url}`);
        continue;
      }

      // aplicar: primero la copia, luego el cambio
      if (!fs.existsSync(archivoBackup)) {
        fs.writeFileSync(archivoBackup, JSON.stringify({
          id: post.id, url: post.url, path: ruta, titulo: post.title, fila,
          contenido: viejo, fecha_copia: new Date().toISOString(),
        }, null, 1));
      }
      await blogger(token, 'PATCH', `${API}/blogs/${blogId}/posts/${post.id}`, { content: nuevo });
      resumen.push(`CAMBIADO  ${nombre} → widget noticias-${fila}  ${post.url}`);
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
