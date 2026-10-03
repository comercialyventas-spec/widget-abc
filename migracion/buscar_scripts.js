// BUSCAR SCRIPTS (solo lectura): dice si unos scripts de Google aparecen en las PÁGINAS de Blogger
// o en la PORTADA de cada blog (ahí salen los gadgets de la barra lateral, cabecera y pie).
// Uso: node migracion/buscar_scripts.js migracion/buscar_scripts_orden.txt
//   línea 1: IDs de blogs separados por espacios
//   línea 2: IDs (o principios de ID) de los scripts, separados por espacios
const fs = require('fs');
const limpiar = (s) => String(s || '').replace(/\s+/g, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

async function tokenAcceso() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: limpiar(process.env.CLIENT_ID), client_secret: limpiar(process.env.CLIENT_SECRET),
      refresh_token: limpiar(process.env.REFRESH_TOKEN), grant_type: 'refresh_token' }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('No se pudo pedir el token');
  console.log('::add-mask::' + j.access_token);
  return j.access_token;
}
async function api(token, url) {
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 120));
  return r.json();
}
const encontrados = (texto, scripts) => scripts.filter((s) => texto.includes(s));

async function main() {
  const [l1, l2] = fs.readFileSync(process.argv[2], 'utf8').split('\n');
  const blogs = l1.split(/\s+/).filter(Boolean), scripts = l2.split(/\s+/).filter(Boolean);
  const token = await tokenAcceso();
  const uso = {}; scripts.forEach((s) => { uso[s] = []; });
  const lineas = [], sinPortada = [];
  for (const id of blogs) {
    let nombre = id, url = '';
    try { const b = await api(token, `https://www.googleapis.com/blogger/v3/blogs/${id}?fields=name,url`); nombre = b.name; url = b.url; } catch (e) {}
    // páginas (publicadas y borradores)
    let nPag = 0;
    for (const st of ['live', 'draft']) {
      try {
        const j = await api(token, `https://www.googleapis.com/blogger/v3/blogs/${id}/pages?status=${st}&fetchBodies=true&fields=items(title,url,content)`);
        for (const p of j.items || []) { nPag++; encontrados(p.content || '', scripts).forEach((s) => uso[s].push(`${nombre} · página "${p.title}" (${st})`)); }
      } catch (e) { lineas.push(`${nombre}: páginas ERROR ${e.message}`); }
    }
    // portada (gadgets)
    let estado = 'sin url';
    if (url) {
      try {
        const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
        const h = await r.text();
        estado = `${r.status} ${h.length}b`;
        if (r.ok && h.length > 20000) encontrados(h, scripts).forEach((s) => uso[s].push(`${nombre} · portada/gadget`));
        else sinPortada.push(`${nombre} ${url}`);
      } catch (e) { estado = 'ERROR ' + e.message; sinPortada.push(`${nombre} ${url}`); }
    }
    lineas.push(`${nombre}: ${nPag} páginas, portada ${estado}`);
    await new Promise((s) => setTimeout(s, 1500));
  }
  console.log('::notice::BLOGS: ' + lineas.join(' ### '));
  const res = scripts.map((s) => `${s.slice(0, 16)}… → ${uso[s].length ? uso[s].join(' | ') : 'NO APARECE'}`);
  console.log('::notice::SCRIPTS: ' + res.join(' ### ').slice(0, 3900));
  console.log('::notice::PORTADAS NO LEÍDAS (revisar a mano): ' + (sinPortada.join(' ### ') || 'ninguna'));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
