// Convierte una lista de blogs (IDs numéricos o nombres tipo "calzadoaliazon") en IDs de Blogger. Solo lectura.
// Uso: node migracion/resolver_blogs.js <archivo>   -> imprime los IDs separados por espacios
const fs = require('fs');
const limpiar = (s) => String(s || '').replace(/\s+/g, '');
async function main() {
  const toks = fs.readFileSync(process.argv[2], 'utf8').split(/\s+/).filter(Boolean);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: limpiar(process.env.CLIENT_ID), client_secret: limpiar(process.env.CLIENT_SECRET), refresh_token: limpiar(process.env.REFRESH_TOKEN), grant_type: 'refresh_token' }) });
  const token = (await r.json()).access_token;
  console.error('::add-mask::' + token);
  const ids = [];
  for (const t of toks) {
    if (/^\d+$/.test(t)) { ids.push(t); continue; }
    const url = 'https://' + t + (t.includes('.') ? '' : '.blogspot.com') + '/';
    const x = await fetch('https://www.googleapis.com/blogger/v3/blogs/byurl?fields=id,name&url=' + encodeURIComponent(url), { headers: { Authorization: 'Bearer ' + token } });
    if (x.ok) { const j = await x.json(); ids.push(j.id); console.error(`${t} -> ${j.id} (${j.name})`); }
    else console.error(`${t} -> NO ENCONTRADO (${x.status})`);
  }
  console.log([...new Set(ids)].join(' '));
}
main().catch((e) => { console.error(e.message); process.exit(1); });
