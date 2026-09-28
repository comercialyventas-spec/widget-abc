// Crea BORRADORES en Blogger a partir de filas de GENERADOR_NOTICIAS (columna G = HTML del widget).
// Nunca publica: todo queda como borrador para que Dani lo revise y lo programe.
//
// Uso (lo lanza el workflow "Crear borradores Blogger"):
//   node migracion/crear_borradores.js <lote.json> <modo>
//   modo = simular -> comprueba cada fila y dice qué crearía. No cambia nada.
//   modo = aplicar -> crea los borradores que falten, con una pausa entre cada uno.
//
// Se puede lanzar las veces que haga falta: si ya existe una entrada (borrador, programada
// o publicada) con el mismo título, esa fila se salta. Si Blogger corta por exceso de
// peticiones, se para y en la siguiente ejecución sigue donde lo dejó.

const fs = require('fs');

const HOJA_GN = '17HjbMWPmmfI6npzxfMlq3gcrBKZTm2MC4mfMDcSjnXA';
const API = 'https://www.googleapis.com/blogger/v3';

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

async function titulosExistentes(token, blogId) {
  const titulos = new Set();
  let pagina = '';
  do {
    const url = `${API}/blogs/${blogId}/posts?status=live&status=draft&status=scheduled&fetchBodies=false&maxResults=500&view=ADMIN&fields=items(title),nextPageToken` + (pagina ? `&pageToken=${pagina}` : '');
    const j = await llamar(token, 'GET', url);
    (j.items || []).forEach((p) => titulos.add(String(p.title || '').trim().toUpperCase()));
    pagina = j.nextPageToken || '';
  } while (pagina);
  return titulos;
}

async function widgetDeFila(token, fila) {
  const rango = encodeURIComponent(`GENERADOR_NOTICIAS!G${fila}`);
  const j = await llamar(token, 'GET', `https://sheets.googleapis.com/v4/spreadsheets/${HOJA_GN}/values/${rango}`);
  return String((j.values && j.values[0] && j.values[0][0]) || '');
}

async function main() {
  const [archivo, modo] = process.argv.slice(2);
  if (!['simular', 'aplicar'].includes(modo)) throw new Error('Modo no válido: ' + modo);
  const lote = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const blogId = lote.blogId;
  const pausa = (lote.pausaSegundos || 90) * 1000;
  const token = await tokenAcceso();

  console.log(`MODO: ${modo.toUpperCase()} — ${lote.borradores.length} filas\n`);
  const existentes = await titulosExistentes(token, blogId);
  console.log(`Entradas ya existentes en el blog: ${existentes.size}\n`);

  const resumen = [];
  let creados = 0;
  for (const b of lote.borradores) {
    const titulo = b.titulo.trim();
    if (existentes.has(titulo.toUpperCase())) { resumen.push(`YA EXISTE  fila ${b.fila}  ${titulo} — no se crea`); continue; }
    const html = await widgetDeFila(token, b.fila);
    if (!html.includes(`noticias-${b.fila}-container`)) { resumen.push(`SALTADA  fila ${b.fila}  ${titulo} — la columna G no tiene su widget`); continue; }
    if (/script\.google\.com\/macros\/s\/(?!AKfycbw7seO|AKfycbymjaZZ)/.test(html)) { resumen.push(`SALTADA  fila ${b.fila}  ${titulo} — el widget llama a un script de Google`); continue; }
    const etiquetas = b.etiquetas;
    if (modo === 'simular') {
      resumen.push(`SE CREARÍA  fila ${b.fila}  ${titulo}  [${etiquetas.join(', ')}]  (${html.length} caracteres)`);
      continue;
    }
    try {
      const p = await llamar(token, 'POST', `${API}/blogs/${blogId}/posts/?isDraft=true`, { title: titulo, content: html, labels: etiquetas });
      existentes.add(titulo.toUpperCase());
      creados++;
      resumen.push(`CREADO  fila ${b.fila}  ${titulo}  (borrador ${p.id})`);
      console.log(`Creado ${creados}: fila ${b.fila} ${titulo}`);
    } catch (e) {
      resumen.push(`PARADO en fila ${b.fila} (${titulo}): ${e.message}. Vuelve a lanzarlo más tarde: seguirá desde aquí.`);
      break;
    }
    await esperar(pausa);
  }

  console.log('\n===== RESUMEN =====');
  resumen.forEach((l) => console.log(l));
  console.log(`\nBorradores creados en esta ejecución: ${creados}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
