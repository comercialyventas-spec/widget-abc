// Conector Blogger para Claude (servidor MCP) — FASE 1: SOLO LECTURA.
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

async function blogger(env, ruta, params = {}) {
  const url = new URL(API + ruta);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, { headers: { Authorization: "Bearer " + (await tokenGoogle(env)) } });
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
    description: "Lista los blogs de Blogger de la cuenta (ID, nombre, dirección, nº de posts).",
    inputSchema: { type: "object", properties: {} },
    run: async (env) => {
      const j = await blogger(env, "/users/self/blogs", { fetchUserInfo: false });
      return (j.items || []).map((b) => ({ id: b.id, nombre: b.name, url: b.url, posts: b.posts?.totalItems }));
    },
  },
  {
    name: "listar_posts",
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
      serverInfo: { name: "conector-blogger", version: "1.0.0" },
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
      return respuesta(id, { content: [{ type: "text", text: JSON.stringify(r, null, 1) }] });
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
