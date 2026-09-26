// INVENTARIO (solo lectura, no cambia nada):
//  1) Lista los posts de un blog que todavía llevan algún script viejo de Google.
//  2) Para las filas de GENERADOR_NOTICIAS indicadas, dice medio/sección, si la columna G
//     tiene su widget y si el JSON noticias-<fila>.json existe en GitHub y cuántas noticias trae.
//
// Uso: node migracion/inventario.js <blogId> "<filas separadas por espacios>"

const HOJA_GN = '17HjbMWPmmfI6npzxfMlq3gcrBKZTm2MC4mfMDcSjnXA';
const VIEJOS = ['AKfycbxTehoGzJL9MT1Sv', 'AKfycbzeMKVUzOXYNngx1d8', 'AKfycbxMwKitb599oOi'];
const NOMBRE_VIEJO = { AKfycbxTehoGzJL9MT1Sv: 'proxy antiguo', AKfycbzeMKVUzOXYNngx1d8: 'PROXY_TRANSLATE', AKfycbxMwKitb599oOi: 'FILTRO_RSS' };
const RAW = 'https://raw.githubusercontent.com/comercialyventas-spec/widget-abc/main/';
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
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

async function postsConScriptViejo(token, blogId) {
  const out = [];
  let pageToken = '';
  let total = 0;
  for (const status of ['live', 'scheduled', 'draft']) {
    pageToken = '';
    do {
      const url = `https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts?maxResults=200&view=ADMIN&status=${status}` +
        `&fields=nextPageToken,items(id,title,url,status,content)` + (pageToken ? `&pageToken=${pageToken}` : '');
      const j = await getJson(token, url);
      for (const p of j.items || []) {
        total++;
        const c = String(p.content || '');
        const usados = VIEJOS.filter((id) => c.includes(id)).map((id) => NOMBRE_VIEJO[id]);
        if (usados.length) {
          const wids = [...new Set((c.match(/noticias-\d+/g) || []))].join(',');
          const ruta = p.url ? new URL(p.url).pathname : '(sin url: ' + p.status + ')';
          out.push(`${p.id}\t${ruta}\t${p.title}\t[${usados.join('+')}]\t${wids}\t${p.status}`);
        }
      }
      pageToken = j.nextPageToken || '';
    } while (pageToken);
  }
  return { out, total };
}

async function revisarFila(token, fila) {
  const rango = encodeURIComponent(`GENERADOR_NOTICIAS!C${fila}:G${fila}`);
  const j = await getJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${HOJA_GN}/values/${rango}`);
  const v = (j.values && j.values[0]) || [];
  const feed = v[0] || '', medio = v[1] || '', seccion = v[2] || '', blog = v[3] || '', g = v[4] || '';
  const tieneWidget = g.includes(`noticias-${fila}-container`);
  const usaViejo = VIEJOS.some((id) => g.includes(id));
  let json = 'NO EXISTE';
  try {
    const r = await fetch(`${RAW}noticias-${fila}.json?t=${Date.now()}`);
    if (r.ok) {
      const d = await r.json();
      const items = Array.isArray(d) ? d : (d.items || d.noticias || d.articulos || []);
      const conFoto = items.filter((x) => x && (x.imagen || x.image || x.img || x.thumbnail)).length;
      json = `${items.length} noticias (${conFoto} con foto)` + (d.actualizado ? `, actualizado ${d.actualizado}` : '');
    } else json = `NO EXISTE (HTTP ${r.status})`;
  } catch (e) { json = 'ERROR ' + e.message; }
  return `fila ${fila}\t${medio} | ${seccion}\tblog=${blog}\twidget G=${tieneWidget ? 'sí' : 'NO'}${usaViejo ? ' (¡usa script viejo!)' : ''}\tJSON: ${json}\tfeed: ${feed.slice(0, 120)}`;
}

async function main() {
  const [blogId, filasTxt] = process.argv.slice(2);
  const token = await tokenAcceso();

  console.log('===== POSTS QUE AÚN LLEVAN SCRIPT VIEJO DE GOOGLE =====');
  const { out, total } = await postsConScriptViejo(token, blogId);
  console.log(`Revisados ${total} posts; con script viejo: ${out.length}`);
  console.log('postId\truta\ttítulo\tscript\twidgets\testado');
  out.forEach((l) => console.log(l));

  const filas = String(filasTxt || '').split(/\s+/).filter(Boolean);
  if (filas.length) {
    console.log('\n===== FILAS DE GENERADOR_NOTICIAS =====');
    for (const f of filas) {
      try { console.log(await revisarFila(token, f)); } catch (e) { console.log(`fila ${f}\tERROR ${e.message}`); }
    }
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
