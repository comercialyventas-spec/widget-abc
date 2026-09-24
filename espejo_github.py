#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
espejo_github.py  (24 sept 2026)

Mantiene al día las copias noticias-*.json del NAS con las de GitHub
(repo comercialyventas-spec/widget-abc), para que los posts que leen primero
el NAS enseñen noticias del día sin tener que tocar ningún post.

Pensado para lanzarse cada 30 min desde el Programador de tareas de DSM.

- Solo 2 llamadas a la API de GitHub por pasada (rama + árbol de archivos);
  con eso sabe qué archivos han cambiado en GitHub desde la pasada anterior.
- Solo descarga los que han cambiado (como mucho MAX_DESCARGAS por pasada;
  el resto queda para la siguiente).
- No pisa una copia del NAS que sea más nueva que el cambio de GitHub
  (por ejemplo, la que escribe el motor nocturno).
- No copia basura: menos de 3 noticias, todas con la misma foto o el mismo título.
- Escribe sobre el mismo archivo para no romper los permisos (ACL) de Synology.
- La primera pasada solo apunta el estado; desde la segunda ya copia cambios.
- No visita ningún periódico ni pasa por el scraper.
"""
import fcntl
import json
import os
import re
import subprocess
import sys
import time

REPO = "comercialyventas-spec/widget-abc"
DESTINO = "/volume2/web/noticias"
BASE = os.path.dirname(os.path.abspath(__file__))
ESTADO = os.path.join(BASE, "espejo_github_estado.json")
BLOQUEO = os.path.join(BASE, "espejo_github.lock")
PATRON = re.compile(r"^noticias-\d+\.json$")
MAX_DESCARGAS = 400


def log(m):
    print(time.strftime("[%Y-%m-%d %H:%M:%S] ") + m, flush=True)


def curl(url):
    r = subprocess.run(
        ["curl", "-fsSL", "--max-time", "30", "-H", "User-Agent: espejo-nas-noticias", url],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        raise RuntimeError("curl %s -> %s" % (url, r.stderr.decode("utf-8", "replace").strip()[:200]))
    return r.stdout


def api(ruta):
    return json.loads(curl("https://api.github.com/repos/%s/%s" % (REPO, ruta)).decode("utf-8"))


def copia_valida(d):
    ns = [n for n in (d.get("noticias") or []) if isinstance(n, dict) and n.get("titulo") and n.get("link")]
    if len(ns) < 3:
        return False
    imgs = [n.get("imagen") for n in ns if n.get("imagen")]
    if len(imgs) >= 3 and len(set(imgs)) == 1:
        return False
    if len(set(str(n["titulo"]).strip() for n in ns)) == 1:
        return False
    return True


def escribir(ruta, datos):
    if os.path.exists(ruta):
        with open(ruta, "r+b") as f:      # mismo archivo: conserva los permisos de Synology
            f.seek(0)
            f.write(datos)
            f.truncate()
    else:
        with open(ruta, "wb") as f:       # archivo nuevo: hereda los permisos de la carpeta
            f.write(datos)
        try:
            os.chmod(ruta, 0o644)
        except OSError:
            pass


def guardar_estado(estado):
    tmp = ESTADO + ".tmp"
    with open(tmp, "w") as f:
        json.dump(estado, f)
    os.replace(tmp, ESTADO)


def main():
    lock = open(BLOQUEO, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log("Ya hay otra pasada en marcha; salgo.")
        return 0

    try:
        with open(ESTADO) as f:
            estado = json.load(f)
    except Exception:
        estado = {}

    rama = api("branches/main")
    commit = rama["commit"]["sha"]
    arbol_sha = rama["commit"]["commit"]["tree"]["sha"]
    anteriores = estado.get("shas")
    if estado.get("commit") == commit and not estado.get("pendientes"):
        log("Sin cambios en GitHub desde la pasada anterior.")
        return 0

    arbol = api("git/trees/%s?recursive=1" % arbol_sha)
    shas = {e["path"]: e["sha"] for e in arbol.get("tree", [])
            if e.get("type") == "blob" and PATRON.match(e.get("path", ""))}
    if not shas:
        log("GitHub no devolvió la lista de archivos; no se toca nada.")
        return 1

    if anteriores is None:
        guardar_estado({"commit": commit, "hora": time.time(), "shas": shas, "nuestros": {}, "pendientes": []})
        log("Primera pasada: estado inicial guardado (%d archivos). Desde la siguiente se copian los cambios." % len(shas))
        return 0

    desde = float(estado.get("hora", 0))
    nuestros = estado.get("nuestros", {})          # archivos escritos por este script -> mtime
    cambiados = sorted(p for p, s in shas.items() if anteriores.get(p) != s)
    cambiados = sorted(set(cambiados) | set(p for p in estado.get("pendientes", []) if p in shas))

    copiados = nuevos = conservados = rechazados = errores = 0
    pendientes = []
    for i, p in enumerate(cambiados):
        if i >= MAX_DESCARGAS:
            pendientes.append(p)
            continue
        ruta = os.path.join(DESTINO, p)
        if os.path.exists(ruta):
            mt = os.path.getmtime(ruta)
            es_nuestro = abs(mt - float(nuestros.get(p, -1))) < 1
            if mt >= desde and not es_nuestro:
                conservados += 1                    # el NAS la escribió después: es más nueva
                continue
        try:
            datos = curl("https://raw.githubusercontent.com/%s/%s/%s" % (REPO, commit, p))
            d = json.loads(datos.decode("utf-8"))
        except Exception as e:
            errores += 1
            pendientes.append(p)
            continue
        if not copia_valida(d):
            rechazados += 1
            continue
        existia = os.path.exists(ruta)
        try:
            escribir(ruta, datos)
        except OSError as e:
            errores += 1
            log("No se pudo escribir %s: %s" % (p, e))
            continue
        nuestros[p] = os.path.getmtime(ruta)
        if existia:
            copiados += 1
        else:
            nuevos += 1

    guardar_estado({"commit": commit, "hora": time.time(), "shas": shas,
                    "nuestros": {k: v for k, v in nuestros.items() if k in shas},
                    "pendientes": pendientes})
    log("Cambiados en GitHub: %d | actualizados en el NAS: %d | nuevos: %d | NAS más nuevo (se conserva): %d | "
        "copia de GitHub no válida: %d | errores: %d | para la próxima pasada: %d"
        % (len(cambiados), copiados, nuevos, conservados, rechazados, errores, len(pendientes)))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log("ERROR: %s (no se ha tocado nada más)" % e)
        sys.exit(1)
