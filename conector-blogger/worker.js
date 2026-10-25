// Conector Blogger para Claude (servidor MCP) — v1.3: Blogger (lectura + escritura con copia previa, KV COPIAS) + Search Console + AdSense (solo lectura).
// Secretos del Worker (los pone el workflow desde GitHub):
//   BLOGGER_CLIENT_ID, BLOGGER_CLIENT_SECRET, BLOGGER_REFRESH_TOKEN, MCP_CLAVE
// Dirección del conector: https://conector-blogger.<subdominio>.workers.dev/mcp/<MCP_CLAVE>

const API = "https://www.googleapis.com/blogger/v3";
let tokenCache = { valor: null, caduca: 0 };

async function tokenGoogle(env) {
  if (tokenCache.valor && Date.now() < tokenCache.caduca) return tokenCache.valor;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.BLOGGER_CLIENT_ID,
      client_secret: env.BLOGGER_CLIENT_SECRET,
      refresh_token: env.BLOGGER_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("No se pudo obtener acceso a Google: " + JSON.stringify(j));
  tokenCache = { valor: j.access_token, caduca: Date.now() + (j.expires_in - 120) * 1000 };
  return j.access_token;
}

async function blogger(env, ruta, params = {}, metodo = "GET", cuerpo = null) {
  const url = new URL(API + ruta);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const opciones = { method: metodo, headers: { Authorization: "Bearer " + (await tokenGoogle(env)) } };
  if (cuerpo) { opciones.headers["Content-Type"] = "application/json"; opciones.body = JSON.stringify(cuerpo); }
  const r = await fetch(url, opciones);
  const t = await r.text();
  if (!r.ok) throw new Error("Blogger respondió " + r.status + ": " + t.slice(0, 500));
  return JSON.parse(t);
}

function resumenPost(p) {
  return {
    id: p.id, titulo: p.title, url: p.url, estado: p.status,
    publicado: p.published, actualizado: p.updated, etiquetas: p.labels || [],
  };
}

async function idBlog(env, a) {
  if (a.blogId) return a.blogId;
  if (a.urlBlog) {
    let u = a.urlBlog.trim();
    if (!/^https?:\/\//.test(u)) u = "https://" + u;
    const b = await blogger(env, "/blogs/byurl", { url: new URL(u).origin + "/" });
    return b.id;
  }
  throw new Error("Falta blogId o urlBlog");
}

const PROP_BLOG = {
  blogId: { type: "string", description: "ID numérico del blog" },
  urlBlog: { type: "string", description: "Dirección del blog (p. ej. periodicosaliazon.blogspot.com), si no se sabe el ID" },
};

const HERRAMIENTAS = [
  {
    name: "listar_blogs",
    annotations: { readOnlyHint: true },
    description: "Lista los blogs de Blogger de la cuenta (ID, nombre, dirección, nº de posts).",
    inputSchema: { type: "object", properties: {} },
    run: async (env) => {
      const j = await blogger(env, "/users/self/blogs", { fetchUserInfo: false });
      const lineas = (j.items || []).map((b) => `${b.id} | ${b.name} | ${b.url.replace(/^https?:\/\//, "").replace(/\/$/, "")} | ${b.posts?.totalItems ?? "?"}`);
      return `${lineas.length} blogs (id | nombre | dirección | nº posts)\n` + lineas.join("\n");
    },
  },
  {
    name: "listar_posts",
    annotations: { readOnlyHint: true },
    description: "Lista posts de un blog (sin el HTML). estado: live, draft o scheduled. Devuelve siguientePagina para seguir.",
    inputSchema: {
      type: "object",
      properties: {
        ...PROP_BLOG,
        estado: { type: "string", enum: ["live", "draft", "scheduled"] },
        etiqueta: { type: "string", description: "Filtrar por etiqueta" },
        maximo: { type: "number", description: "Máximo de posts (1-500, por defecto 50)" },
        pagina: { type: "string", description: "siguientePagina de una llamada anterior" },
      },
    },
    run: async (env, a) => {
      const id = await idBlog(env, a);
      const j = await blogger(env, `/blogs/${id}/posts`, {
        status: a.estado, labels: a.etiqueta, maxResults: Math.min(a.maximo || 50, 500),
        pageToken: a.pagina, fetchBodies: false, view: "ADMIN",
      });
      return { blogId: id, posts: (j.items || []).map(resumenPost), siguientePagina: j.nextPageToken || null };
    },
  },
  {
    name: "buscar_posts",
    annotations: { readOnlyHint: true },
    description: "Busca posts publicados de un blog por texto (sin el HTML).",
    inputSchema: {
      type: "object",
      properties: { ...PROP_BLOG, texto: { type: "string" } },
      required: ["texto"],
    },
    run: async (env, a) => {
      const id = await idBlog(env, a);
      const j = await blogger(env, `/blogs/${id}/posts/search`, { q: a.texto, fetchBodies: false });
      return { blogId: id, posts: (j.items || []).map(resumenPost) };
    },
  },
  {
    name: "leer_post",
    annotations: { readOnlyHint: true },
    description: "Lee un post completo con su HTML. Indicar postId, o la dirección del post (urlPost) o su ruta (/2026/05/xxx.html).",
    inputSchema: {
      type: "object",
      properties: {
        ...PROP_BLOG,
        postId: { type: "string" },
        urlPost: { type: "string", description: "Dirección completa del post" },
        ruta: { type: "string", description: "Ruta del post, p. ej. /2026/05/ciencia-rtve.html" },
      },
    },
    run: async (env, a) => {
      let p;
      if (a.urlPost && !a.blogId && !a.urlBlog) a.urlBlog = new URL(a.urlPost).origin;
      const id = await idBlog(env, a);
      if (a.postId) {
        p = await blogger(env, `/blogs/${id}/posts/${a.postId}`, { view: "ADMIN" });
      } else {
        const ruta = a.ruta || (a.urlPost ? new URL(a.urlPost).pathname : null);
        if (!ruta) throw new Error("Falta postId, urlPost o ruta");
        p = await blogger(env, `/blogs/${id}/posts/bypath`, { path: ruta, view: "ADMIN" });
      }
      return { blogId: id, ...resumenPost(p), html: p.content };
    },
  },
];


// ---------- ESCRITURA (siempre con copia previa en KV) ----------
async function postCompleto(env, blogId, postId) {
  return blogger(env, `/blogs/${blogId}/posts/${postId}`, { view: "ADMIN" });
}
async function guardarCopia(env, blogId, p, motivo) {
  if (!env.COPIAS) throw new Error("No hay almacén de copias (KV): no se cambia nada.");
  const clave = `copia:${blogId}:${p.id}:${new Date().toISOString()}`;
  const copia = { blogId, postId: p.id, motivo, fecha: new Date().toISOString(),
    titulo: p.title, html: p.content, etiquetas: p.labels || [], estado: p.status, url: p.url };
  await env.COPIAS.put(clave, JSON.stringify(copia), { metadata: { titulo: p.title, motivo } });
  const leida = await env.COPIAS.get(clave);
  if (!leida || JSON.parse(leida).html !== p.content) throw new Error("La copia no se pudo verificar: no se cambia nada.");
  return clave;
}
// Cambio seguro: se reenvía el post ÍNTEGRO con PUT (método probado en la migración de etiquetas;
// posts.patch con fetchBody=false vació posts el 7 oct) y luego se comprueba leyéndolo de nuevo.
async function cambiarSeguro(env, blogId, antes, cambios) {
  const cuerpo = Object.assign({}, antes, cambios);
  await blogger(env, `/blogs/${blogId}/posts/${antes.id}`, {}, "PUT", cuerpo);
  const r = await postCompleto(env, blogId, antes.id);
  const problemas = [];
  if (typeof r.content !== "string" || r.content.length === 0) problemas.push("el post ha quedado sin contenido");
  else if (cuerpo.content.length && Math.abs(r.content.length - cuerpo.content.length) > cuerpo.content.length * 0.05 + 50) problemas.push(`contenido distinto del enviado (${cuerpo.content.length} → ${r.content.length} caracteres)`);
  if (r.title !== cuerpo.title) problemas.push("título distinto del enviado");
  if (r.status !== antes.status) problemas.push(`estado cambiado (${antes.status} → ${r.status})`);
  if (r.url !== antes.url) problemas.push("dirección cambiada");
  if (antes.published && r.published !== antes.published) problemas.push("fecha de publicación cambiada");
  const faltan = (cuerpo.labels || []).filter((l) => !(r.labels || []).includes(l));
  if (faltan.length) problemas.push("faltan etiquetas: " + faltan.join(", "));
  return { post: r, problemas };
}
async function idPost(env, a, blogId) {
  if (a.postId) return a.postId;
  const ruta = a.ruta || (a.urlPost ? new URL(a.urlPost).pathname : null);
  if (!ruta) throw new Error("Falta postId, urlPost o ruta");
  return (await blogger(env, `/blogs/${blogId}/posts/bypath`, { path: ruta, view: "ADMIN" })).id;
}
const PROP_POST = {
  ...PROP_BLOG,
  postId: { type: "string" },
  urlPost: { type: "string", description: "Dirección completa del post" },
  ruta: { type: "string", description: "Ruta del post, p. ej. /2026/05/ciencia-rtve.html" },
};
function prepararBlog(a) { if (a.urlPost && !a.blogId && !a.urlBlog) a.urlBlog = new URL(a.urlPost).origin; }

HERRAMIENTAS.push(
  {
    name: "modificar_post",
    description: "Cambia el HTML, el título y/o las etiquetas de un post (publicado o borrador). Antes guarda una copia completa del post y la verifica; si la copia falla, no cambia nada. No cambia el estado (no publica ni despublica).",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    inputSchema: {
      type: "object",
      properties: {
        ...PROP_POST,
        html: { type: "string", description: "HTML nuevo completo del post" },
        titulo: { type: "string" },
        etiquetas: { type: "array", items: { type: "string" }, description: "Lista COMPLETA de etiquetas (sustituye a las actuales)" },
      },
    },
    run: async (env, a) => {
      prepararBlog(a);
      const blogId = await idBlog(env, a);
      const postId = await idPost(env, a, blogId);
      if (a.html === undefined && a.titulo === undefined && a.etiquetas === undefined) throw new Error("No se ha indicado nada que cambiar");
      const antes = await postCompleto(env, blogId, postId);
      const copia = await guardarCopia(env, blogId, antes, "antes de modificar_post");
      const cambios = {};
      if (a.html !== undefined) cambios.content = a.html;
      if (a.titulo !== undefined) cambios.title = a.titulo;
      if (a.etiquetas !== undefined) cambios.labels = a.etiquetas;
      const { post: p, problemas } = await cambiarSeguro(env, blogId, antes, cambios);
      if (problemas.length) {
        const vuelta = await cambiarSeguro(env, blogId, p, { content: antes.content, title: antes.title, labels: antes.labels || [] });
        return { hecho: false, ERROR: "La comprobación falló: " + problemas.join("; "), restauradoAutomaticamente: vuelta.problemas.length === 0, problemasAlRestaurar: vuelta.problemas, copia };
      }
      return { hecho: true, comprobado: true, copia, ...resumenPost(p), cambiado: Object.keys(cambios) };
    },
  },
  {
    name: "crear_borrador",
    description: "Crea un post nuevo SIEMPRE como borrador (nunca publica). Avisa si ya existe un post o borrador con el mismo título.",
    annotations: { readOnlyHint: false, destructiveHint: false },
    inputSchema: {
      type: "object",
      properties: {
        ...PROP_BLOG,
        titulo: { type: "string" },
        html: { type: "string" },
        etiquetas: { type: "array", items: { type: "string" } },
        permitirDuplicado: { type: "boolean", description: "true para crearlo aunque exista otro con el mismo título" },
      },
      required: ["titulo", "html"],
    },
    run: async (env, a) => {
      const blogId = await idBlog(env, a);
      if (!a.permitirDuplicado) {
        for (const estado of ["draft", "live", "scheduled"]) {
          let pagina;
          do {
            const j = await blogger(env, `/blogs/${blogId}/posts`, { status: estado, fetchBodies: false, maxResults: 500, pageToken: pagina, view: "ADMIN" });
            const igual = (j.items || []).find((p) => (p.title || "").trim().toLowerCase() === a.titulo.trim().toLowerCase());
            if (igual) return { hecho: false, motivo: "Ya existe un post con ese título", existente: resumenPost(igual) };
            pagina = j.nextPageToken;
          } while (pagina);
        }
      }
      const p = await blogger(env, `/blogs/${blogId}/posts`, { isDraft: true }, "POST",
        { kind: "blogger#post", title: a.titulo, content: a.html, labels: a.etiquetas || [] });
      return { hecho: true, ...resumenPost(p) };
    },
  },
  {
    name: "pasar_a_borrador",
    description: "Retira un post publicado y lo deja como borrador (no lo borra). Guarda antes una copia.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    inputSchema: { type: "object", properties: { ...PROP_POST } },
    run: async (env, a) => {
      prepararBlog(a);
      const blogId = await idBlog(env, a);
      const postId = await idPost(env, a, blogId);
      const antes = await postCompleto(env, blogId, postId);
      if (antes.status === "DRAFT") return { hecho: false, motivo: "Ya era borrador", ...resumenPost(antes) };
      const copia = await guardarCopia(env, blogId, antes, "antes de pasar_a_borrador");
      const p = await blogger(env, `/blogs/${blogId}/posts/${postId}/revert`, {}, "POST");
      return { hecho: true, copia, ...resumenPost(p) };
    },
  },
  {
    name: "listar_copias",
    description: "Lista las copias de seguridad guardadas de un post (o todas las de un blog si no se indica post).",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { ...PROP_POST } },
    run: async (env, a) => {
      prepararBlog(a);
      const blogId = await idBlog(env, a);
      const postId = (a.postId || a.urlPost || a.ruta) ? await idPost(env, a, blogId) : "";
      const j = await env.COPIAS.list({ prefix: `copia:${blogId}:${postId}`, limit: 1000 });
      return j.keys.map((k) => ({ clave: k.name, titulo: k.metadata?.titulo, motivo: k.metadata?.motivo }));
    },
  },
  {
    name: "restaurar_copia",
    description: "Devuelve un post al HTML, título y etiquetas de una copia (clave de listar_copias). Antes guarda copia del estado actual. No cambia si está publicado o en borrador.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    inputSchema: { type: "object", properties: { clave: { type: "string" } }, required: ["clave"] },
    run: async (env, a) => {
      const raw = await env.COPIAS.get(a.clave);
      if (!raw) throw new Error("No existe esa copia");
      const c = JSON.parse(raw);
      const actual = await postCompleto(env, c.blogId, c.postId);
      const copiaActual = await guardarCopia(env, c.blogId, actual, "antes de restaurar " + a.clave);
      const { post: p, problemas } = await cambiarSeguro(env, c.blogId, actual, { content: c.html, title: c.titulo, labels: c.etiquetas });
      if (problemas.length) return { hecho: false, ERROR: "La comprobación falló: " + problemas.join("; "), copiaDelEstadoAnterior: copiaActual };
      return { hecho: true, comprobado: true, restauradaDesde: a.clave, copiaDelEstadoAnterior: copiaActual, ...resumenPost(p) };
    },
  },
);

// ===================== SEARCH CONSOLE (v1.2) =====================
// Permiso propio: el refresh token de Search Console se guarda en KV (clave "gsc:refresh"),
// lo obtiene la página /permiso/<MCP_CLAVE> sin que nadie lo vea ni lo copie.
const GSC_ALCANCE = "https://www.googleapis.com/auth/webmasters";
const GSC_API = "https://www.googleapis.com/webmasters/v3";
let tokenGscCache = { valor: null, caduca: 0 };

function gscCliente(env) {
  return {
    id: env.GSC_CLIENT_ID || env.BLOGGER_CLIENT_ID,
    secreto: env.GSC_CLIENT_SECRET || env.BLOGGER_CLIENT_SECRET,
  };
}

async function tokenGsc(env) {
  if (tokenGscCache.valor && Date.now() < tokenGscCache.caduca) return tokenGscCache.valor;
  const refresh = await env.COPIAS.get("gsc:refresh");
  if (!refresh) throw new Error("Search Console aún no tiene permiso. Hay que abrir la página /permiso/<clave> del conector y pulsar Permitir.");
  const c = gscCliente(env);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secreto, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("No se pudo obtener acceso a Search Console: " + (j.error || "") + " " + (j.error_description || ""));
  tokenGscCache = { valor: j.access_token, caduca: Date.now() + (j.expires_in - 120) * 1000 };
  return j.access_token;
}

async function gsc(env, urlCompleta, metodo = "GET", cuerpo = null) {
  const opciones = { method: metodo, headers: { Authorization: "Bearer " + (await tokenGsc(env)) } };
  if (cuerpo) { opciones.headers["Content-Type"] = "application/json"; opciones.body = JSON.stringify(cuerpo); }
  const r = await fetch(urlCompleta, opciones);
  const t = await r.text();
  if (!r.ok) throw new Error("Search Console respondió " + r.status + ": " + t.slice(0, 500));
  return t ? JSON.parse(t) : {};
}

// "periodicosaliazon.blogspot.com" -> "https://periodicosaliazon.blogspot.com/"; respeta "sc-domain:..."
function sitioGsc(s) {
  if (!s) throw new Error("Falta sitio");
  s = String(s).trim();
  if (s.startsWith("sc-domain:")) return s;
  if (!/^https?:\/\//.test(s)) s = "https://" + s;
  return new URL(s).origin + "/";
}
const enc = encodeURIComponent;

function fechaISO(diasAtras) {
  return new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
}

const PROP_SITIO = { sitio: { type: "string", description: "Blog o web, p. ej. periodicosaliazon.blogspot.com" } };

HERRAMIENTAS.push(
  {
    name: "sc_listar_sitios",
    annotations: { readOnlyHint: true },
    description: "Search Console: lista los sitios dados de alta y el nivel de permiso (siteOwner = verificado).",
    inputSchema: { type: "object", properties: {} },
    run: async (env) => {
      const j = await gsc(env, GSC_API + "/sites");
      const l = (j.siteEntry || []).map((s) => `${s.siteUrl} | ${s.permissionLevel}`).sort();
      return `${l.length} sitios (sitio | permiso)\n` + l.join("\n");
    },
  },
  {
    name: "sc_rendimiento",
    annotations: { readOnlyHint: true },
    description: "Search Console: clics, impresiones, CTR y posición media de un sitio. Agrupa por query (búsquedas), page (páginas), date, country o device. Por defecto últimos 28 días (Google tarda ~3 días en dar datos).",
    inputSchema: {
      type: "object",
      properties: {
        ...PROP_SITIO,
        agruparPor: { type: "string", enum: ["query", "page", "date", "country", "device", "ninguno"], description: "Por defecto query" },
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
        filtroPagina: { type: "string", description: "Solo páginas cuya URL contenga este texto" },
        filtroBusqueda: { type: "string", description: "Solo búsquedas que contengan este texto" },
        maximo: { type: "number", description: "Filas (1-1000, por defecto 50)" },
      },
      required: ["sitio"],
    },
    run: async (env, a) => {
      const sitio = sitioGsc(a.sitio);
      const cuerpo = {
        startDate: a.desde || fechaISO(31),
        endDate: a.hasta || fechaISO(3),
        rowLimit: Math.min(Math.max(Number(a.maximo) || 50, 1), 1000),
      };
      const dim = a.agruparPor || "query";
      if (dim !== "ninguno") cuerpo.dimensions = [dim];
      const filtros = [];
      if (a.filtroPagina) filtros.push({ dimension: "page", operator: "contains", expression: a.filtroPagina });
      if (a.filtroBusqueda) filtros.push({ dimension: "query", operator: "contains", expression: a.filtroBusqueda });
      if (filtros.length) cuerpo.dimensionFilterGroups = [{ filters: filtros }];
      const j = await gsc(env, `${GSC_API}/sites/${enc(sitio)}/searchAnalytics/query`, "POST", cuerpo);
      const filas = (j.rows || []).map((r) => ({
        clave: r.keys ? r.keys[0] : "(total)", clics: r.clicks, impresiones: r.impressions,
        ctr: Math.round(r.ctr * 1000) / 10 + "%", posicion: Math.round(r.position * 10) / 10,
      }));
      return { sitio, desde: cuerpo.startDate, hasta: cuerpo.endDate, agrupadoPor: dim, filas: filas.length, datos: filas };
    },
  },
  {
    name: "sc_inspeccionar_url",
    annotations: { readOnlyHint: true },
    description: "Search Console: dice si Google tiene indexada una URL concreta, cuándo la rastreó y por qué no la indexa si es el caso.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "URL completa de la entrada" }, ...PROP_SITIO },
      required: ["url"],
    },
    run: async (env, a) => {
      const sitio = sitioGsc(a.sitio || a.url);
      const j = await gsc(env, "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", "POST",
        { inspectionUrl: a.url, siteUrl: sitio, languageCode: "es" });
      const i = j.inspectionResult?.indexStatusResult || {};
      return {
        url: a.url, veredicto: i.verdict, estado: i.coverageState, indexacionPermitida: i.indexingState,
        robots: i.robotsTxtState, ultimoRastreo: i.lastCrawlTime, canonicaGoogle: i.googleCanonical,
        canonicaDeclarada: i.userCanonical, enlaceInforme: j.inspectionResult?.inspectionResultLink,
      };
    },
  },
  {
    name: "sc_listar_sitemaps",
    annotations: { readOnlyHint: true },
    description: "Search Console: mapas del sitio enviados de un sitio, con fecha, errores y nº de URLs.",
    inputSchema: { type: "object", properties: { ...PROP_SITIO }, required: ["sitio"] },
    run: async (env, a) => {
      const sitio = sitioGsc(a.sitio);
      const j = await gsc(env, `${GSC_API}/sites/${enc(sitio)}/sitemaps`);
      return (j.sitemap || []).map((s) => ({
        ruta: s.path, enviado: s.lastSubmitted, descargado: s.lastDownloaded, pendiente: s.isPending,
        errores: s.errors, avisos: s.warnings, urls: (s.contents || []).map((c) => `${c.type}: ${c.submitted}`).join(", "),
      }));
    },
  },
  {
    name: "sc_enviar_sitemap",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Search Console: envía (o reenvía) un mapa del sitio. Si no se indica, usa <sitio>/sitemap.xml (el de Blogger).",
    inputSchema: { type: "object", properties: { ...PROP_SITIO, sitemap: { type: "string", description: "URL completa del sitemap" } }, required: ["sitio"] },
    run: async (env, a) => {
      const sitio = sitioGsc(a.sitio);
      const mapa = a.sitemap || sitio + "sitemap.xml";
      await gsc(env, `${GSC_API}/sites/${enc(sitio)}/sitemaps/${enc(mapa)}`, "PUT");
      return { hecho: true, sitio, sitemap: mapa };
    },
  },
  {
    name: "sc_anadir_sitio",
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    description: "Search Console: da de alta un blog o web. Los blogs de Blogger de la misma cuenta suelen quedar verificados solos; se comprueba al terminar.",
    inputSchema: { type: "object", properties: { ...PROP_SITIO }, required: ["sitio"] },
    run: async (env, a) => {
      const sitio = sitioGsc(a.sitio);
      await gsc(env, `${GSC_API}/sites/${enc(sitio)}`, "PUT");
      const s = await gsc(env, `${GSC_API}/sites/${enc(sitio)}`);
      return { hecho: true, sitio, permiso: s.permissionLevel, verificado: s.permissionLevel === "siteOwner" || s.permissionLevel === "siteFullUser" };
    },
  },
);

// ===================== ADSENSE (v1.3, solo lectura) =====================
// Permiso propio igual que Search Console: refresh token en KV (clave "ads:refresh"),
// se obtiene con la página /permiso/<MCP_CLAVE>/adsense.
const ADS_ALCANCE = "https://www.googleapis.com/auth/adsense.readonly";
const ADS_API = "https://adsense.googleapis.com/v2";
let tokenAdsCache = { valor: null, caduca: 0 };
let cuentaAdsCache = null;

async function tokenAds(env) {
  if (tokenAdsCache.valor && Date.now() < tokenAdsCache.caduca) return tokenAdsCache.valor;
  const refresh = await env.COPIAS.get("ads:refresh");
  if (!refresh) throw new Error("AdSense aún no tiene permiso. Hay que abrir la página /permiso/<clave>/adsense del conector y pulsar Permitir.");
  const c = gscCliente(env);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secreto, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("No se pudo obtener acceso a AdSense: " + (j.error || "") + " " + (j.error_description || ""));
  tokenAdsCache = { valor: j.access_token, caduca: Date.now() + (j.expires_in - 120) * 1000 };
  return j.access_token;
}

async function ads(env, ruta, params = []) {
  const url = new URL(ADS_API + ruta);
  for (const [k, v] of params) if (v !== undefined && v !== null && v !== "") url.searchParams.append(k, String(v));
  const r = await fetch(url, { headers: { Authorization: "Bearer " + (await tokenAds(env)) } });
  const t = await r.text();
  if (!r.ok) throw new Error("AdSense respondió " + r.status + ": " + t.slice(0, 500));
  return t ? JSON.parse(t) : {};
}

async function cuentaAds(env, a = {}) {
  if (a.cuenta) return a.cuenta.startsWith("accounts/") ? a.cuenta : "accounts/" + a.cuenta;
  if (cuentaAdsCache) return cuentaAdsCache;
  const j = await ads(env, "/accounts");
  const c = (j.accounts || [])[0];
  if (!c) throw new Error("No se ha encontrado ninguna cuenta de AdSense con este permiso");
  cuentaAdsCache = c.name;
  return c.name;
}

const PROP_CUENTA = { cuenta: { type: "string", description: "Cuenta de AdSense (pub-...). Si no se indica, la primera" } };

function fechaPartes(prefijo, iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return [[prefijo + ".year", y], [prefijo + ".month", m], [prefijo + ".day", d]];
}

HERRAMIENTAS.push(
  {
    name: "ads_cuentas",
    annotations: { readOnlyHint: true },
    description: "AdSense: cuentas a las que da acceso el permiso (nombre, estado, zona horaria).",
    inputSchema: { type: "object", properties: {} },
    run: async (env) => {
      const j = await ads(env, "/accounts");
      return (j.accounts || []).map((c) => ({ cuenta: c.name, nombre: c.displayName, estado: c.state, zonaHoraria: c.timeZone?.id, creada: c.createTime }));
    },
  },
  {
    name: "ads_informe",
    annotations: { readOnlyHint: true },
    description: "AdSense: ingresos estimados, páginas vistas, impresiones, clics, CTR y RPM. Agrupa por dominio (blog), fecha, mes, país, plataforma o bloque de anuncios. Por defecto últimos 28 días por dominio.",
    inputSchema: {
      type: "object",
      properties: {
        ...PROP_CUENTA,
        agruparPor: { type: "string", enum: ["DOMAIN_NAME", "DATE", "MONTH", "COUNTRY_NAME", "PLATFORM_TYPE_NAME", "AD_UNIT_NAME", "ninguno"], description: "Por defecto DOMAIN_NAME (por blog)" },
        periodo: { type: "string", enum: ["TODAY", "YESTERDAY", "LAST_7_DAYS", "LAST_30_DAYS", "MONTH_TO_DATE", "YEAR_TO_DATE", "LAST_28_DAYS"], description: "Por defecto LAST_28_DAYS (se ignora si se dan desde/hasta)" },
        desde: { type: "string", description: "AAAA-MM-DD" },
        hasta: { type: "string", description: "AAAA-MM-DD" },
        maximo: { type: "number", description: "Filas (1-1000, por defecto 100)" },
      },
    },
    run: async (env, a) => {
      const cuenta = await cuentaAds(env, a);
      const dim = a.agruparPor || "DOMAIN_NAME";
      const metricas = ["ESTIMATED_EARNINGS", "PAGE_VIEWS", "IMPRESSIONS", "CLICKS", "PAGE_VIEWS_CTR", "PAGE_VIEWS_RPM"];
      const p = [];
      if (a.desde || a.hasta) {
        p.push(["dateRange", "CUSTOM"], ...fechaPartes("startDate", a.desde || fechaISO(28)), ...fechaPartes("endDate", a.hasta || fechaISO(0)));
      } else p.push(["dateRange", a.periodo || "LAST_28_DAYS"]);
      if (dim !== "ninguno") p.push(["dimensions", dim]);
      for (const m of metricas) p.push(["metrics", m]);
      if (dim !== "ninguno") p.push(["orderBy", dim === "DATE" || dim === "MONTH" ? "+" + dim : "-ESTIMATED_EARNINGS"]);
      p.push(["limit", Math.min(Math.max(Number(a.maximo) || 100, 1), 1000)], ["languageCode", "es"]);
      const j = await ads(env, `/${cuenta}/reports:generate`, p);
      const cab = (j.headers || []).map((h) => h.name);
      const moneda = (j.headers || []).find((h) => h.currencyCode)?.currencyCode || "";
      const fila = (r) => Object.fromEntries((r.cells || []).map((c, i) => [cab[i], c.value]));
      return {
        cuenta, moneda, desde: j.startDate ? `${j.startDate.year}-${j.startDate.month}-${j.startDate.day}` : null,
        hasta: j.endDate ? `${j.endDate.year}-${j.endDate.month}-${j.endDate.day}` : null,
        agrupadoPor: dim, filas: j.totalMatchedRows ?? (j.rows || []).length,
        totales: j.totals ? fila(j.totals) : null, datos: (j.rows || []).map(fila), avisos: j.warnings || [],
      };
    },
  },
  {
    name: "ads_sitios",
    annotations: { readOnlyHint: true },
    description: "AdSense: sitios dados de alta en AdSense y su estado (READY = aprobado, REQUIRES_REVIEW, GETTING_READY, NEEDS_ATTENTION) y si tienen anuncios automáticos.",
    inputSchema: { type: "object", properties: { ...PROP_CUENTA } },
    run: async (env, a) => {
      const cuenta = await cuentaAds(env, a);
      const lista = [];
      let pagina;
      do {
        const j = await ads(env, `/${cuenta}/sites`, [["pageSize", 1000], ["pageToken", pagina]]);
        lista.push(...(j.sites || []));
        pagina = j.nextPageToken;
      } while (pagina);
      return `${lista.length} sitios (dominio | estado | anuncios automáticos)\n` + lista.map((s) => `${s.domain} | ${s.state} | ${s.autoAdsEnabled ? "sí" : "no"}`).sort().join("\n");
    },
  },
  {
    name: "ads_alertas",
    annotations: { readOnlyHint: true },
    description: "AdSense: avisos y alertas de la cuenta (problemas de políticas, pagos, ads.txt, etc.).",
    inputSchema: { type: "object", properties: { ...PROP_CUENTA } },
    run: async (env, a) => {
      const cuenta = await cuentaAds(env, a);
      const j = await ads(env, `/${cuenta}/alerts`, [["languageCode", "es"]]);
      const l = (j.alerts || []).map((x) => ({ gravedad: x.severity, tipo: x.type, mensaje: x.message }));
      return l.length ? l : "Sin alertas";
    },
  },
  {
    name: "ads_pagos",
    annotations: { readOnlyHint: true },
    description: "AdSense: pagos realizados y saldo pendiente de pago.",
    inputSchema: { type: "object", properties: { ...PROP_CUENTA } },
    run: async (env, a) => {
      const cuenta = await cuentaAds(env, a);
      const j = await ads(env, `/${cuenta}/payments`);
      return (j.payments || []).map((x) => ({
        pago: x.name?.split("/").pop(), importe: x.amount,
        fecha: x.date ? `${x.date.year}-${x.date.month}-${x.date.day}` : "pendiente (saldo sin pagar)",
      }));
    },
  },
);

// Página de permiso de Search Console (y de AdSense con /permiso/<clave>/adsense)
function paginaHtml(titulo, texto) {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titulo}</title><body style="font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px"><h2>${titulo}</h2><p>${texto}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function permisoGsc(request, env, url, partes) {
  const vuelta = url.origin + "/permiso-vuelta";
  if (partes[0] === "permiso") {
    if (!(env.MCP_CLAVE && env.MCP_CLAVE.length >= 20 && partes[1] === env.MCP_CLAVE)) return new Response("No encontrado", { status: 404 });
    const esAds = partes[2] === "adsense";
    const estado = crypto.randomUUID();
    await env.COPIAS.put("gsc:estado:" + estado, esAds ? "adsense" : "1", { expirationTtl: 900 });
    const g = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    g.searchParams.set("client_id", gscCliente(env).id);
    g.searchParams.set("redirect_uri", vuelta);
    g.searchParams.set("response_type", "code");
    g.searchParams.set("scope", esAds ? ADS_ALCANCE : GSC_ALCANCE);
    g.searchParams.set("access_type", "offline");
    g.searchParams.set("prompt", "consent");
    g.searchParams.set("state", estado);
    return Response.redirect(g.toString(), 302);
  }
  // /permiso-vuelta
  const estado = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code");
  const servicio = estado ? await env.COPIAS.get("gsc:estado:" + estado) : null;
  const esAds = servicio === "adsense";
  if (!servicio) return paginaHtml("Permiso no válido", "El enlace ha caducado. Vuelve a abrir la página de permiso.");
  await env.COPIAS.delete("gsc:estado:" + estado);
  if (!code) return paginaHtml("Permiso no concedido", "Google no ha dado el permiso: " + (url.searchParams.get("error") || "cancelado") + ".");
  const c = gscCliente(env);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secreto, code, redirect_uri: vuelta, grant_type: "authorization_code" }),
  });
  const j = await r.json();
  if (!j.refresh_token) return paginaHtml("Algo ha fallado", "Google no devolvió la credencial (" + (j.error || "sin detalle") + "). Díselo a Claude.");
  if (esAds) {
    await env.COPIAS.put("ads:refresh", j.refresh_token);
    tokenAdsCache = { valor: null, caduca: 0 };
    cuentaAdsCache = null;
    return paginaHtml("Permiso guardado", "AdSense ya está conectado (solo lectura). Puedes cerrar esta pestaña.");
  }
  await env.COPIAS.put("gsc:refresh", j.refresh_token);
  tokenGscCache = { valor: null, caduca: 0 };
  return paginaHtml("Permiso guardado", "Search Console ya está conectado. Puedes cerrar esta pestaña.");
}

function respuesta(id, result) {
  return Response.json({ jsonrpc: "2.0", id, result });
}
function error(id, code, message) {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

async function atender(msg, env) {
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notificación
  if (method === "initialize") {
    return respuesta(id, {
      protocolVersion: params?.protocolVersion || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "conector-blogger", version: "1.3.0" },
    });
  }
  if (method === "ping") return respuesta(id, {});
  if (method === "tools/list") {
    return respuesta(id, { tools: HERRAMIENTAS.map(({ run, ...h }) => h) });
  }
  if (method === "tools/call") {
    const h = HERRAMIENTAS.find((x) => x.name === params?.name);
    if (!h) return error(id, -32602, "Herramienta desconocida: " + params?.name);
    try {
      const r = await h.run(env, params.arguments || {});
      return respuesta(id, { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r, null, 1) }] });
    } catch (e) {
      return respuesta(id, { content: [{ type: "text", text: "ERROR: " + e.message }], isError: true });
    }
  }
  return error(id, -32601, "Método no soportado: " + method);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const partes = url.pathname.split("/").filter(Boolean);
    if (request.method === "GET" && (partes[0] === "permiso" || partes[0] === "permiso-vuelta")) return permisoGsc(request, env, url, partes);
    const claveOk = env.MCP_CLAVE && env.MCP_CLAVE.length >= 20 && partes[0] === "mcp" && partes[1] === env.MCP_CLAVE;
    if (!claveOk) return new Response("No encontrado", { status: 404 });
    if (request.method !== "POST") return new Response("Método no permitido", { status: 405, headers: { Allow: "POST" } });
    let cuerpo;
    try { cuerpo = await request.json(); } catch { return error(null, -32700, "JSON no válido"); }
    if (Array.isArray(cuerpo)) {
      const rs = [];
      for (const m of cuerpo) { const r = await atender(m, env); if (r) rs.push(await r.json()); }
      return rs.length ? Response.json(rs) : new Response(null, { status: 202 });
    }
    const r = await atender(cuerpo, env);
    return r || new Response(null, { status: 202 });
  },
};
