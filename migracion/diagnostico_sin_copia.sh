#!/bin/bash
# Diagnóstico temporal (5): precios en ₽ (≈ €) de State Venice y Chernimcherno con catalogo_desde_paginas.py
mkdir -p /tmp/prueba/productos && cd /tmp/prueba
printf '%s\n' 'https://statevenice.com/ | https://statevenice.com/sitemap.xml | /product/ | 8' 'https://chernimcherno.com/ | https://chernimcherno.com/sitemap.xml | /product/ | 8' > lista.txt
python3 $GITHUB_WORKSPACE/productos/catalogo_desde_paginas.py lista.txt
for f in productos/*-p1.json; do python3 -c '
import json,sys; d=json.load(open(sys.argv[1])); p=d["productos"]; print(sys.argv[1], len(p)); [print("  ",x["titulo"][:40],"|",x["precio"]) for x in p[:4]]' "$f"; done
