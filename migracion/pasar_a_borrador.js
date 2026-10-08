// Pasa a BORRADOR (nunca borra) las entradas publicadas de un blog que no tienen ninguna etiqueta
// y no llevan widget (ni <script> ni <iframe>): los boletines/artículos copiados enteros.
// Usa la orden "revert" de Blogger, que no toca el contenido: la entrada sigue igual, solo deja de
// estar publicada. Se puede volver a publicar cuando se quiera.
//
// Uso (lo lanza el workflow "Pasar a borrador entradas sin etiqueta"):
//   node migracion/pasar_a_borrador.js <blogId> <modo> [maximo]
//   modo = simular -> lista lo que pasaría a borrador. No cambia nada.
//   modo = aplicar -> lo pasa a borrador, con una pausa entre cada una.
// Deja la lista completa en pasar_a_borrador_lista.json (se guarda como artefacto del workflow).

const fs = require('fs');
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

async function llamar(token, metodo, url) {
  for (let intento = 1; intento <= 3; intento++) {
    const r = await fetch(url, { method: metodo, headers: { Authorization: 'Bearer ' + token } });
    const txt = await r.text();
    if (r.ok) return txt ? JSON.parse(txt) : {};
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

async function main() {
  const [blogId, modo, maxArg] = process.argv.slice(2);
  if (!/^\d+$/.test(blogId || '')) throw new Error('blogId no válido: ' + blogId);
  if (!['simular', 'aplicar'].includes(modo)) throw new Error('Modo no válido: ' + modo);
  const maximo = parseInt(maxArg || '5000', 10);
  const token = await tokenAcceso();

  const blog = await llamar(token, 'GET', `${API}/blogs/${blogId}?fields=name,url`);
  console.log(`Blog: ${blog.name} (${blog.url})`);

  const candidatas = [];
  let total = 0, conEtiqueta = 0, conWidget = 0, pagina = '';
  do {
    const url = `${API}/blogs/${blogId}/posts?status=live&fetchBodies=true&maxResults=50&fields=items(id,title,url,published,labels,content),nextPageToken` + (pagina ? `&pageToken=${pagina}` : '');
    const j = await llamar(token, 'GET', url);
    for (const p of j.items || []) {
      total++;
      if (p.labels && p.labels.length) { conEtiqueta++; continue; }
      if (/<script|<iframe/i.test(p.content || '')) { conWidget++; continue; }
      candidatas.push({ id: p.id, titulo: p.title, url: p.url, publicado: p.published, largo: (p.content || '').length });
    }
    pagina = j.nextPageToken || '';
  } while (pagina);

  console.log(`Publicadas: ${total} — con etiqueta: ${conEtiqueta} — sin etiqueta pero con widget (se dejan): ${conWidget} — a borrador: ${candidatas.length}\n`);
  fs.writeFileSync('pasar_a_borrador_lista.json', JSON.stringify({ blogId, blog: blog.url, fecha: new Date().toISOString(), modo, entradas: candidatas }, null, 1));

  if (modo === 'simular') {
    candidatas.forEach((c, i) => console.log(`${i + 1}. ${c.publicado.slice(0, 10)}  ${c.titulo}  ${c.url}`));
    console.log(`\nSe pasarían a borrador: ${candidatas.length}`);
    return;
  }

  let hechas = 0;
  for (const c of candidatas) {
    if (hechas >= maximo) break;
    try {
      await llamar(token, 'POST', `${API}/blogs/${blogId}/posts/${c.id}/revert`);
      hechas++;
      c.borrador = true;
      if (hechas % 25 === 0) console.log(`  ${hechas} pasadas a borrador…`);
    } catch (e) {
      console.log(`PARADO en ${c.id} (${c.titulo}): ${e.message}. Vuelve a lanzarlo: seguirá con las que queden.`);
      break;
    }
    await esperar(1500);
  }
  fs.writeFileSync('pasar_a_borrador_lista.json', JSON.stringify({ blogId, blog: blog.url, fecha: new Date().toISOString(), modo, entradas: candidatas }, null, 1));
  console.log(`\nPasadas a borrador en esta ejecución: ${hechas} de ${candidatas.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
