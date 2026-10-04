#!/bin/bash
# Diagnóstico temporal (4): cómo da el NAS los precios de State Venice y Chernimcherno, y qué enseñan hoy los 4 posts.
for u in https://statevenice.com/ https://chernimcherno.com/; do
  echo "== NAS $u"
  curl -s -m 90 "https://carmenprofe.synology.me/generador_htmlrobots/generar_o_servir.php?url=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "$u")&pagina=1" | python3 -c '
import json,sys
t=sys.stdin.read()
try: d=json.loads(t)
except Exception: print("no json:",t[:300]); sys.exit()
p=d.get("productos",[]); print(len(p),"productos; claves:",sorted(set(k for x in p for k in x)), {k:v for k,v in d.items() if k!="productos"})
for x in p[:4]: print("  ",json.dumps(x,ensure_ascii=False)[:300])'
done
npm install --no-save playwright@1.47.2 >/dev/null 2>&1 && npx playwright install --with-deps chromium >/dev/null 2>&1
node migracion/diagnostico_posts.js https://ropaycomplementosaliazon.blogspot.com/2026/05/state-venice.html https://ropaycomplementosaliazon.blogspot.com/2026/05/chernimcherno.html https://ropaycomplementosaliazon.blogspot.com/2026/06/faldas-brownie-spain.html https://joyeriaaliazon.blogspot.com/2026/06/collares-mujer-brownie-spain.html
