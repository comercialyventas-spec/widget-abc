// Crea BORRADORES automáticamente a partir de GENERADOR_NOTICIAS, sin listas a mano.
// Nunca publica: todo queda como borrador para que Dani lo revise y lo programe.
//
// Qué filas coge: las que tienen en la columna F (Blog) un blog de la lista BLOGS de abajo
// y la columna U (REGIÓN) rellena.
// Título:    "{NOMBRE SECCIÓN} {NOMBRE MEDIO}"   (columnas S y R; si S está vacía usa la sección E)
// Etiquetas: "{SECCIÓN} {MEDIO}", "{SECCIÓN}", "{MEDIO}", "{MEDIO} {SECCIÓN}", "{PAÍS}", "{REGIÓN}"
// Contenido: el widget de la columna G, con la variable BLOG y el utm_source puestos al blog de la fila.
//
// Se salta una fila si: ya hay en el blog una entrada (borrador, programada o publicada) con ese
// título o con ese widget (noticias-N); la columna G no tiene su widget o llama a un script de
// Google; o su JSON en GitHub aún no existe o no trae al menos 3 noticias y alguna foto
// (se vuelve a intentar en la siguiente pasada).
//
// Uso: node migracion/borradores_auto.js <modo> [maximo]
//   modo = simular -> dice qué crearía. No cambia nada.
//   modo = aplicar -> crea los borradores, con una pausa entre cada uno.

const HOJA_GN = '17HjbMWPmmfI6npzxfMlq3gcrBKZTm2MC4mfMDcSjnXA';
const API = 'https://www.googleapis.com/blogger/v3';
const RAW = 'https://raw.githubusercontent.com/comercialyventas-spec/widget-abc/main/';
const BLOGS = {
  prensainternacionalaliazon: '1272111941988362300',
};
const PAUSA_MS = 90000;

const limpiar = (s) => String(s || '').replace(/\s+/g, '');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const may = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();

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

async function llamar(token, metodo, url, cuerpo) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(url, {
      method: metodo,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const txt = await r.text();
    if (r.ok) return JSON.parse(txt);
    if ((r.status === 429 || r.status >= 500) && intento < 3) {
      console.log(`   (respuesta ${r.status}, reintento en 60 s)`);
      await esperar(60000);
      continue;
    }
    const e = new Error(`${metodo} ${r.status}: ${txt.slice(0, 300)}`);
    e.status = r.status;
    throw e;
  }
}

async function leerRango(token, rango) {
  const j = await llamar(token, 'GET', `https://sheets.googleapis.com/v4/spreadsheets/${HOJA_GN}/values/${encodeURIComponent(rango)}`);
  return j.values || [];
}

// Títulos y widgets (noticias-N) que ya hay en el blog, en cualquier estado.
async function existentes(token, blogId) {
  const titulos = new Set();
  const widgets = new Set();
  for (const estado of ['live', 'draft', 'scheduled']) {
    let pagina = '';
    do {
      const url = `${API}/blogs/${blogId}/posts?status=${estado}&fetchBodies=true&maxResults=50&view=ADMIN&fields=items(title,content),nextPageToken` + (pagina ? `&pageToken=${pagina}` : '');
      const j = await llamar(token, 'GET', url);
      (j.items || []).forEach((p) => {
        titulos.add(may(p.title));
        (String(p.content || '').match(/noticias-\d+/g) || []).forEach((w) => widgets.add(w));
      });
      pagina = j.nextPageToken || '';
    } while (pagina);
  }
  return { titulos, widgets };
}

async function jsonListo(fila) {
  try {
    const r = await fetch(`${RAW}noticias-${fila}.json?t=${Date.now()}`);
    if (!r.ok) return `sin JSON en GitHub (${r.status})`;
    const j = await r.json();
    const n = (j.noticias || []).filter((x) => x && x.titulo && x.link);
    if (n.length < 3) return `JSON con solo ${n.length} noticias`;
    if (!n.some((x) => x.imagen)) return 'JSON sin fotos';
    return '';
  } catch (e) {
    return 'JSON ilegible';
  }
}

function nombreMedio(r, d) {
  if (r) return may(r);
  return may(String(d || '').replace(/^www\./, '').replace(/\.[a-z.]+$/, '').replace(/[-_.]/g, ' '));
}

function etiquetasDe(secc, medio, pais, region) {
  const lista = [`${secc} ${medio}`, secc, medio, `${medio} ${secc}`, pais, region].map(may).filter(Boolean);
  return [...new Set(lista)];
}

function prepararHtml(html, blog) {
  return html
    .replace(/var BLOG = "[^"]*";/g, `var BLOG = "${blog}";`)
    .replace(/utm_source=[^&"'\s]+/g, 'utm_source=' + encodeURIComponent(blog));
}

async function main() {
  const [modo, maxArg] = process.argv.slice(2);
  if (!['simular', 'aplicar'].includes(modo)) throw new Error('Modo no válido: ' + modo);
  const maximo = parseInt(maxArg || '10', 10);
  const token = await tokenAcceso();

  // Columnas C:F (feed, medio, sección, blog) y R:V (nombre medio, nombre sección, país, región, idioma)
  const cf = await leerRango(token, 'GENERADOR_NOTICIAS!C2:F');
  const rv = await leerRango(token, 'GENERADOR_NOTICIAS!R2:V');
  const candidatas = [];
  cf.forEach((f, i) => {
    const blog = String(f[3] || '').trim();
    const extra = rv[i] || [];
    if (!BLOGS[blog] || !String(extra[3] || '').trim()) return;
    const fila = i + 2;
    const secc = may(extra[1]) || may(String(f[2] || '').replace(/[-_/]+/g, ' '));
    const medio = nombreMedio(extra[0], f[1]);
    candidatas.push({ fila, blog, titulo: `${secc} ${medio}`, etiquetas: etiquetasDe(secc, medio, extra[2], extra[3]) });
  });

  console.log(`MODO: ${modo.toUpperCase()} — ${candidatas.length} filas con blog y región\n`);
  const resumen = [];
  let creados = 0;
  const cache = {};
  for (const c of candidatas) {
    const blogId = BLOGS[c.blog];
    if (!cache[blogId]) cache[blogId] = await existentes(token, blogId);
    const ya = cache[blogId];
    if (ya.titulos.has(may(c.titulo))) { resumen.push(`YA EXISTE (título)  fila ${c.fila}  ${c.titulo}`); continue; }
    if (ya.widgets.has(`noticias-${c.fila}`)) { resumen.push(`YA EXISTE (widget)  fila ${c.fila}  ${c.titulo}`); continue; }
    const etiquetasLargo = c.etiquetas.join(',').length;
    if (etiquetasLargo > 200) { resumen.push(`SALTADA  fila ${c.fila}  ${c.titulo} — etiquetas de más de 200 caracteres (${etiquetasLargo}); acortar NOMBRE SECCIÓN`); continue; }
    const g = (await leerRango(token, `GENERADOR_NOTICIAS!G${c.fila}`))[0];
    const html = String((g && g[0]) || '');
    if (!html.includes(`noticias-${c.fila}-container`)) { resumen.push(`SALTADA  fila ${c.fila}  ${c.titulo} — la columna G no tiene su widget`); continue; }
    if (/script\.google\.com\/macros\/s\/(?!AKfycbw7seO|AKfycbymjaZZ)/.test(html)) { resumen.push(`SALTADA  fila ${c.fila}  ${c.titulo} — el widget llama a un script de Google`); continue; }
    const espera = await jsonListo(c.fila);
    if (espera) { resumen.push(`EN ESPERA  fila ${c.fila}  ${c.titulo} — ${espera}`); continue; }
    if (creados >= maximo) { resumen.push(`PARA LA PRÓXIMA  fila ${c.fila}  ${c.titulo} (máximo ${maximo} por pasada)`); continue; }
    const contenido = prepararHtml(html, c.blog);
    if (modo === 'simular') {
      creados++;
      resumen.push(`SE CREARÍA  fila ${c.fila}  ${c.titulo}  [${c.etiquetas.join(', ')}]  en ${c.blog}`);
      continue;
    }
    try {
      const p = await llamar(token, 'POST', `${API}/blogs/${blogId}/posts/?isDraft=true`, { title: c.titulo, content: contenido, labels: c.etiquetas });
      ya.titulos.add(may(c.titulo));
      ya.widgets.add(`noticias-${c.fila}`);
      creados++;
      resumen.push(`CREADO  fila ${c.fila}  ${c.titulo}  (borrador ${p.id})  [${c.etiquetas.join(', ')}]`);
      console.log(`Creado ${creados}: fila ${c.fila} ${c.titulo}`);
    } catch (e) {
      resumen.push(`PARADO en fila ${c.fila} (${c.titulo}): ${e.message}. Seguirá en la próxima pasada.`);
      break;
    }
    await esperar(PAUSA_MS);
  }

  console.log('\n===== RESUMEN =====');
  resumen.forEach((l) => console.log(l));
  console.log(`\n${modo === 'simular' ? 'Se crearían' : 'Borradores creados'}: ${creados}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
