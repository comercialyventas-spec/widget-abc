// Temporal: abre cada post SIN gesto (¿carga solo?) y luego CON gesto, y apunta precios y de dónde salen los datos.
const fs = require('fs');
const { chromium } = require('playwright');
(async () => {
  const urls = process.argv.slice(2);
  const nav = await chromium.launch();
  for (const url of urls) {
    for (const gesto of [false, true]) {
      const ctx = await nav.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36', locale: 'es-ES', timezoneId: 'Europe/Madrid', viewport: { width: 1280, height: 900 } });
      const pag = await ctx.newPage();
      const fuentes = new Set();
      pag.on('response', r => { const u = r.url(); if (/jsdelivr|githubusercontent|synology|script\.google|allorigins/.test(u) && !/motor-productos/.test(u)) fuentes.add(u.replace(/\?.*/, '').replace(/^https:\/\//, '').slice(0, 90) + ' ' + r.status()); });
      try {
        await pag.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await pag.waitForTimeout(2000);
        if (gesto) { await pag.mouse.move(200, 300); await pag.mouse.move(400, 500); await pag.mouse.wheel(0, 400); }
        let n = 0;
        for (let i = 0; i < 20; i++) { n = await pag.locator('.mp-card').count(); if (n) break; await pag.waitForTimeout(1500); }
        await pag.waitForTimeout(1500);
        const d = await pag.evaluate(() => {
          const cards = Array.from(document.querySelectorAll('.mp-card'));
          return { n: cards.length, foto: cards.filter(c => { const im = c.querySelector('img'); return im && im.getAttribute('src'); }).length,
            precio: cards.filter(c => ((c.querySelector('.mp-precio') || {}).textContent || '').trim()).length,
            ej: cards.slice(0, 3).map(c => ((c.querySelector('.mp-tit') || {}).textContent || '').trim().slice(0, 30) + ' = ' + ((c.querySelector('.mp-precio') || {}).textContent || '').trim()),
            ver: !!document.querySelector('.mp-ver') };
        });
        console.log(`${gesto ? 'CON gesto' : 'SIN gesto'} | ${d.n} productos (${d.foto} foto, ${d.precio} precio) boton=${d.ver ? 'si' : 'no'} | ${url}`);
        d.ej.forEach(x => console.log('    ' + x));
        fuentes.forEach(x => console.log('    fuente: ' + x));
      } catch (e) { console.log('ERROR ' + e.message.slice(0, 100) + ' | ' + url); }
      await ctx.close();
    }
  }
  await nav.close();
})();
