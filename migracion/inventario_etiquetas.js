// SOLO LECTURA: lista los posts PUBLICADOS y PROGRAMADOS de un blog con sus etiquetas (sin borradores).
// Uso: node migracion/inventario_etiquetas.js <blogId> <salida.json>
// Salida: {blogId, fecha, posts: [{id, s: "live"|"scheduled", f: fecha publicación, t: título, l: [etiquetas]}]}
const fs = require('fs');
const limpiar = (s) => String(s || '').replace(/\s+/g, '');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const [blogId, salida] = process.argv.slice(2);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: limpiar(process.env.CLIENT_ID), client_secret: limpiar(process.env.CLIENT_SECRET), refresh_token: limpiar(process.env.REFRESH_TOKEN), grant_type: 'refresh_token' }) });
  const token = (await r.json()).access_token; if (!token) throw new Error('Sin token');
  console.log('::add-mask::' + token);
  const get = async (u) => {
    for (let i = 1; ; i++) {
      const x = await fetch(u, { headers: { Authorization: 'Bearer ' + token } });
      if (x.ok) return x.json();
      if (i >= 6 || ![429, 500, 502, 503, 504].includes(x.status)) throw new Error('Blogger ' + x.status + ' ' + (await x.text()).slice(0, 200));
      console.log(`  Blogger ${x.status}, reintento en ${i * 15} s`); await esperar(i * 15000);
    }
  };
  const posts = []; let llamadas = 0;
  for (const status of ['live', 'scheduled']) {
    let pt = '';
    do {
      const j = await get(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=500&status=${status}&view=ADMIN&fetchBodies=false` +
        `&fields=nextPageToken,items(id,title,published,labels)` + (pt ? '&pageToken=' + pt : ''));
      llamadas++;
      for (const p of j.items || []) posts.push({ id: p.id, s: status, f: p.published, t: p.title || '', l: p.labels || [] });
      pt = j.nextPageToken || '';
    } while (pt);
    console.log(`${status}: ${posts.filter((p) => p.s === status).length} posts`);
  }
  fs.writeFileSync(salida, JSON.stringify({ blogId, fecha: new Date().toISOString(), posts }));
  console.log(`Total ${posts.length} posts | llamadas a la API: ${llamadas}`);
})().catch((e) => { console.log('::error::' + e.message); process.exit(1); });
