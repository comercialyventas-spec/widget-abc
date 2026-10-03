// Exporta la columna G (widget) de filas de GENERADOR_NOTICIAS a migracion/filas_g/fila-<N>.html (solo lectura de la hoja).
// Uso: node migracion/exportar_filas.js migracion/exportar_filas.txt   (números de fila separados por espacios)
const fs = require('fs'), path = require('path');
const HOJA_GN = '17HjbMWPmmfI6npzxfMlq3gcrBKZTm2MC4mfMDcSjnXA';
const limpiar = (s) => String(s || '').replace(/\s+/g, '');
async function main() {
  const filas = fs.readFileSync(process.argv[2], 'utf8').split(/\s+/).filter((x) => /^\d+$/.test(x));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: limpiar(process.env.CLIENT_ID), client_secret: limpiar(process.env.CLIENT_SECRET), refresh_token: limpiar(process.env.REFRESH_TOKEN), grant_type: 'refresh_token' }) });
  const token = (await r.json()).access_token;
  if (!token) throw new Error('sin token');
  console.log('::add-mask::' + token);
  const dir = path.join(__dirname, 'filas_g'); fs.mkdirSync(dir, { recursive: true });
  for (const f of filas) {
    const x = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${HOJA_GN}/values/${encodeURIComponent('GENERADOR_NOTICIAS!G' + f)}`, { headers: { Authorization: 'Bearer ' + token } });
    const j = await x.json();
    const g = String((j.values && j.values[0] && j.values[0][0]) || '');
    fs.writeFileSync(path.join(dir, `fila-${f}.html`), g);
    console.log(`::notice::fila ${f}: ${g.length} caracteres`);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
