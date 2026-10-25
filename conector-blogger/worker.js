// Conector Blogger para Claude (servidor MCP) — fase 2: lectura + escritura con copia previa (KV COPIAS).
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
      serverInfo: { name: "conector-blogger", version: "1.1.0" },
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
