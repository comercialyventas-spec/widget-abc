// COPIAR GADGETS (solo lectura del blog): guarda el contenido actual de unos gadgets de la portada
// en migracion/gadgets_backup/<nombre>_<ID>.html, como copia de seguridad antes de cambiarlos.
// Uso: node migracion/copiar_gadgets.js migracion/copiar_gadgets_orden.txt
//   cada linea: <nombre_blog> <url_portada> <ID1> <ID2> ...
const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function contenidoWidget(html, id) {
  const i = html.indexOf(`id='${id}'`) !== -1 ? html.indexOf(`id='${id}'`) : html.indexOf(`id="${id}"`);
  if (i === -1) return null;
  const j = html.indexOf('class="widget-content"', i) !== -1 && (html.indexOf("class='widget-content'", i) === -1 || html.indexOf('class="widget-content"', i) < html.indexOf("class='widget-content'", i))
    ? html.indexOf('class="widget-content"', i) : html.indexOf("class='widget-content'", i);
  if (j === -1) return null;
  const inicio = html.indexOf('>', j) + 1;
  // buscar el </div> que cierra el div widget-content contando aperturas y cierres
  // (los <script>/<style> se saltan enteros: dentro suele haber '</div>' en cadenas de texto)
  const re = /<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<div\b|<\/div>/gi;
  re.lastIndex = inicio;
  let nivel = 1, m;
  while ((m = re.exec(html))) {
    const t = m[0].toLowerCase();
    if (t.startsWith('<script') || t.startsWith('<style')) continue;
    if (t === '</div>') { nivel--; if (nivel === 0) return html.slice(inicio, m.index).trim(); }
    else nivel++;
  }
  return null;
}

(async () => {
  const lineas = fs.readFileSync(process.argv[2], 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const dir = path.join(__dirname, 'gadgets_backup');
  fs.mkdirSync(dir, { recursive: true });
  const res = [];
  for (const l of lineas) {
    const [nombre, url, ...ids] = l.split(/\s+/);
    // Blogger a veces contesta 429 (demasiadas peticiones) a GitHub: se reintenta con espera
    let r, html = '';
    for (let intento = 0; intento < 6; intento++) {
      const u = intento % 2 === 0 ? url : url + (url.includes('?') ? '&' : '?') + 'm=0';
      r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
      html = await r.text();
      if (r.ok) break;
      console.log(`intento ${intento + 1}: ${r.status}, espero...`);
      await new Promise((ok) => setTimeout(ok, 45000));
    }
    if (!r.ok) { res.push(`${nombre}: portada ${r.status}`); continue; }
    for (const id of ids) {
      const c = contenidoWidget(html, id);
      if (c === null) { res.push(`${nombre} ${id}: NO ENCONTRADO`); continue; }
      const archivo = path.join(dir, `${nombre}_${id}.html`);
      if (fs.existsSync(archivo)) { res.push(`${nombre} ${id}: ya habia copia, no se pisa`); continue; }
      fs.writeFileSync(archivo, c);
      res.push(`${nombre} ${id}: copiado (${c.length} caracteres)`);
    }
  }
  console.log('::notice::COPIAS: ' + res.join(' ### '));
})().catch((e) => { console.log('::error::' + e.message); process.exit(1); });
