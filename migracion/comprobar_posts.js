// Abre cada post en Chromium como una persona (mueve el ratón) y cuenta lo que carga el motor de productos
// y los widgets de noticias (bloques noticias-N-container).
// Solo lectura. Uso: node migracion/comprobar_posts.js migracion/comprobar_posts.txt
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const urls = fs.readFileSync(process.argv[2], 'utf8').split('\n').map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  const nav = await chromium.launch();
  const ctx = await nav.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    locale: 'es-ES', viewport: { width: 1280, height: 900 },
  });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  const salida = [];
  for (const url of urls) {
    const pag = await ctx.newPage();
    let linea;
    try {
      await pag.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await pag.waitForTimeout(3000);
      await pag.mouse.move(200, 300); await pag.mouse.move(400, 500);
      // Se espera a que aparezcan productos o noticias (lo primero que llegue)
      const TARJETAS = '.mp-card, [id^="noticias-"][id$="-container"] .nw-featured, [id^="noticias-"][id$="-container"] .nw-item';
      for (let i = 0; i < 30; i++) {
        if (await pag.locator(TARJETAS).count() > 0) { await pag.waitForTimeout(2000); break; }
        await pag.waitForTimeout(1500);
      }
      const n = await pag.locator('.mp-card').count();
      const datos = await pag.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.mp-card'));
        const conFoto = cards.filter(c => { const im = c.querySelector('img'); return im && im.getAttribute('src'); }).length;
        const conPrecio = cards.filter(c => (c.querySelector('.mp-precio') || {}).textContent).length;
        const t = cards[0] ? (cards[0].querySelector('.mp-tit') || {}).textContent || '' : '';
        const p = cards[0] ? (cards[0].querySelector('.mp-precio') || {}).textContent || '' : '';
        const estado = (document.querySelector('.mp-estado') || {}).textContent || '';
        const viejo = /script\.google\.com\/macros/.test(document.documentElement.innerHTML.replace(/w7seO|mjaZZ/g, ''));
        const html = document.documentElement.innerHTML;
        const pista = (html.match(/motor-productos|tienda-catalogo|script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{8}/g) || []).slice(0, 4).join(',');
        // Widgets de noticias: tarjetas .nw-featured / .nw-item dentro de cada noticias-N-container
        const cajas = Array.from(document.querySelectorAll('[id^="noticias-"][id$="-container"]'));
        // (los widgets sin tarjetas .nw-*, p. ej. los "-mini", se cuentan por sus enlaces con texto)
        const nws = cajas.map(c => c.querySelectorAll('.nw-featured, .nw-item').length || Array.from(c.querySelectorAll('a[href]')).filter(a => a.textContent.trim().length > 15).length);
        const nwCards = cajas.flatMap(c => Array.from(c.querySelectorAll('.nw-featured, .nw-item')));
        const nwFoto = nwCards.filter(c => { const im = c.querySelector('img'); return im && im.getAttribute('src'); }).length;
        const nwT = nwCards[0] ? ((nwCards[0].querySelector('.nw-title-featured, .nw-item-title') || nwCards[0].querySelector('a') || {}).textContent || '') : '';
        const noticias = { cajas: cajas.map(c => c.id.replace('-container', '')), n: nws.reduce((a, b) => a + b, 0), porCaja: nws, foto: nwFoto, t: nwT.trim().slice(0, 40) };
        return { noticias, pista, titulo: document.title.slice(0, 40), conFoto, conPrecio, t: t.trim().slice(0, 40), p: p.trim().slice(0, 20), estado: estado.trim().slice(0, 40), motor: !!document.querySelector('.motor-productos') };
      });
      const nw = datos.noticias;
      const parteNoticias = nw.cajas.length ? ` | noticias: ${nw.n} (${nw.foto} foto) ${nw.cajas.map((c, i) => c + '=' + nw.porCaja[i]).join(' ')} | ${nw.t}` : '';
      linea = `${n > 0 || nw.n > 0 ? 'OK ' : 'MAL'} ${n} productos (${datos.conFoto} foto, ${datos.conPrecio} precio) motor=${datos.motor ? 'si' : 'NO'} | ${datos.t} | ${datos.p} | ${datos.estado} | ${datos.titulo} | ${datos.pista} | ${url.replace(/^https:\/\//, '')}${parteNoticias}`;
    } catch (e) {
      linea = `ERROR ${e.message.slice(0, 100)} | ${url}`;
    }
    console.log(linea); salida.push(linea);
    await pag.close();
  }
  fs.writeFileSync('/tmp/comprobacion.txt', salida.join('\n') + '\n');
  await nav.close();
})();
