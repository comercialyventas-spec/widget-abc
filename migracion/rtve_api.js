// Noticias de RTVE por su API pública de temas (las páginas de sección mezclan menú y otras secciones).
// Escribe noticias-<fila>.json con el mismo formato que feeds-generico: {noticias:[{titulo,link,imagen,tipo}]}
// Uso: node migracion/rtve_api.js     (lista de secciones abajo)
const fs = require('fs');
const SECCIONES = [
  { wid: 'noticias-2435', tema: 1012, nombre: 'Ciencia y tecnología' },
  { wid: 'noticias-2438', tema: 133072, nombre: 'Loterías' },
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139 Safari/537.36';
(async () => {
  for (const s of SECCIONES) {
    try {
      const r = await fetch(`https://www.rtve.es/api/tematicas/${s.tema}/noticias.json?size=20`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const items = ((await r.json()).page || {}).items || [];
      const vistos = new Set();
      const noticias = [];
      for (const i of items) {
        const titulo = String(i.title || i.longTitle || '').replace(/\s+/g, ' ').trim();
        const link = String(i.htmlUrl || '').split('?')[0];
        const imagen = String(i.image || i.imageSEO || '');
        if (!titulo || !link || vistos.has(link)) continue;
        vistos.add(link);
        noticias.push({ titulo, link, imagen, tipo: imagen ? 'imagen' : '' });
        if (noticias.length >= 6) break;
      }
      if (noticias.length < 3) throw new Error('solo ' + noticias.length + ' noticias');
      const nuevo = JSON.stringify({ noticias }, null, 2);
      const viejo = fs.existsSync(s.wid + '.json') ? fs.readFileSync(s.wid + '.json', 'utf8') : '';
      if (viejo.trim() !== nuevo.trim()) fs.writeFileSync(s.wid + '.json', nuevo);
      console.log(`::notice::${s.wid} (${s.nombre}): ${noticias.length} noticias, ${noticias.filter((n) => n.imagen).length} con foto · ${noticias[0].titulo.slice(0, 60)}`);
    } catch (e) {
      console.log(`::warning::${s.wid} (${s.nombre}): ERROR ${e.message} — se conserva la copia anterior`);
    }
  }
})();
