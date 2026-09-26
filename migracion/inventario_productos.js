// INVENTARIO DE PRODUCTOS (solo lectura en Blogger):
// Recorre los blogs indicados (solo posts publicados) y guarda en migracion/inventario_productos.json
// los posts que llaman directamente a algún script de Google (script.google.com/macros/s/<id>),
// sin contar los contadores de clics, y también los que ya usan el motor común (como ejemplo).
//
// Uso: node migracion/inventario_productos.js "<blogId> <blogId> ..."

const fs = require('fs');
const path = require('path');

// Contadores de clics: no gastan cupo de urlfetch, no cuentan.
const IGNORAR = ['w7seO', 'mjaZZ'];
const limpiar = (s) => String(s || '').replace(/\s+/g, '');

async function tokenAcceso() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: limpiar(process.env.CLIENT_ID), client_secret: limpiar(process.env.CLIENT_SECRET),
      refresh_token: limpiar(process.env.REFRESH_TOKEN), grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo pedir el token: ' + JSON.stringify(j));
  console.log('::add-mask::' + j.access_token);
  return j.access_token;
}

async function getJson(token, url) {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    const t = await r.text();
    if (r.ok) return JSON.parse(t);
    if (i < 3 && (r.status === 429 || r.status >= 500)) { await new Promise((s) => setTimeout(s, 15000)); continue; }
    throw new Error(`${r.status} ${t.slice(0, 200)}`);
  }
}

function scriptsDe(c) {
  const ids = [...new Set((c.match(/script\.google\.com\/macros\/s\/([A-Za-z0-9_-]{20,})/g) || [])
    .map((m) => m.split('/s/')[1]))];
  return ids.filter((id) => !IGNORAR.some((x) => id.includes(x)));
}

async function main() {
  const blogs = String(process.argv[2] || '').split(/\s+/).filter(Boolean);
  const token = await tokenAcceso();
  const conScript = [];
  const conMotor = [];
  for (const blogId of blogs) {
    let nombre = blogId;
    try { nombre = (await getJson(token, `https://www.googleapis.com/blogger/v3/blogs/${blogId}?fields=name,url`)).name; } catch (e) {}
    let pageToken = '', total = 0, n = 0;
    do {
      const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=200&view=ADMIN&status=live` +
        `&fields=nextPageToken,items(id,title,url,published,labels,content)` + (pageToken ? `&pageToken=${pageToken}` : '');
      let j;
      try { j = await getJson(token, url); } catch (e) { console.log(`  ${nombre}: ERROR ${e.message}`); break; }
      for (const p of j.items || []) {
        total++;
        const c = String(p.content || '');
        const ids = scriptsDe(c);
        const reg = { blogId, blog: nombre, id: p.id, titulo: p.title, url: p.url, ruta: p.url ? new URL(p.url).pathname : '', publicado: p.published, etiquetas: p.labels || [], scripts: ids, contenido: c };
        if (ids.length) { conScript.push(reg); n++; }
        else if (c.includes('motor-productos')) conMotor.push(reg);
      }
      pageToken = j.nextPageToken || '';
    } while (pageToken);
    console.log(`${nombre} (${blogId}): ${total} posts publicados, ${n} con script de Google`);
  }

  // Resumen por script
  const porScript = {};
  conScript.forEach((p) => p.scripts.forEach((s) => { porScript[s] = (porScript[s] || 0) + 1; }));
  console.log('\n===== POSTS POR SCRIPT =====');
  Object.entries(porScript).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`${n}\t${s.slice(0, 24)}…`));
  console.log('\n===== POSTS CON SCRIPT =====');
  conScript.forEach((p) => console.log(`${p.blog}\t${p.id}\t${p.ruta}\t${p.titulo}\t${p.scripts.map((s) => s.slice(0, 14)).join(',')}`));
  console.log(`\nTOTAL con script: ${conScript.length} | ya con motor común: ${conMotor.length}`);

  fs.writeFileSync(path.join(__dirname, 'inventario_productos.json'), JSON.stringify({ fecha: new Date().toISOString(), conScript, conMotor }, null, 1));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
