/*!
 * MOTOR COMÚN DE PRODUCTOS v1 (widgets de catálogo de la red de blogs)
 * Repositorio: comercialyventas-spec/widget-abc  ->  motor/motor-productos-v1.js
 *
 * El post solo lleva un <div class="motor-productos" data-url="..."> con su configuración
 * y el cargador. Este archivo hace todo lo demás. Orden de capas para cada catálogo:
 *   1. GitHub (copia nocturna de productos-generico.yml), vía jsDelivr y si falla raw.githubusercontent
 *   2. NAS (generar_o_servir.php u otro endpoint indicado en data-nas)
 *   3. Tienda directa desde el navegador (Shopify /products.json; WooCommerce Store API si data-plataforma="woocommerce")
 *   4. Proxy de texto (Apps Script y allorigins) + extracción en el navegador (JSON de tienda, sitemap con imágenes, datos embebidos en la página)
 *   5. Última copia buena guardada en el navegador del visitante (o copia vieja de GitHub)
 *   6. Botón a la tienda (siempre al final)
 *
 * Atributos del <div class="motor-productos">:
 *   data-url         URL del catálogo (categoría o sitemap). Varias separadas por " | " (se cargan seguidas)
 *   data-nas         (opcional) endpoint del NAS, p. ej. "sfcc_categoria.php". Por defecto generar_o_servir.php
 *   data-plataforma  (opcional) shopify | woocommerce | ... (solo ayuda a la capa 3)
 *   data-tienda      URL del botón final (por defecto, la raíz de la primera data-url)
 *   data-boton       texto del botón final (por defecto "IR A LA TIENDA")
 *   data-blog        utm_source (por defecto "blog")
 *   data-campana     utm_campaign = catalogo_<campana>
 *   data-comprar     texto del botón de cada producto (por defecto "Comprar ahora")
 *   data-club        "0" para quitar "Unirme al Club de Ahorro"
 *   data-form        URL del formulario del Club (termina en entry.X=)
 *   data-moneda      símbolo para precios numéricos (por defecto "€")
 *   data-lote        productos que se añaden en cada tanda (por defecto 12)
 */
(function () {
  "use strict";
  if (window.MotorProductos && window.MotorProductos.version) { window.MotorProductos.iniciarTodos(); return; }

  var VERSION = "1.0";
  var GH_BASES = [
    "https://cdn.jsdelivr.net/gh/comercialyventas-spec/widget-abc@main/productos/",
    "https://raw.githubusercontent.com/comercialyventas-spec/widget-abc/main/productos/"
  ];
  var NAS_BASE = "https://carmenprofe.synology.me/generador_htmlrobots/";
  var NAS_POR_DEFECTO = "generar_o_servir.php";
  var PROXIES = [
    function (u) { return "https://script.google.com/macros/s/AKfycbzeMKVUzOXYNngx1d8OMhEF6ebsFmfXa8Iyd9ZOgpBoX4zqvs93rMJuortAtPxnu-2v/exec?url=" + encodeURIComponent(u); },
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); }
  ];
  var CLICS = "https://script.google.com/macros/s/AKfycbymjaZZpelLTpLoZ5t19Y_ppTRW0JH_qbOLxhUHANIH4Yk_OWzCkoXefdSRcQw3qRyu0Q/exec";
  var FORM_POR_DEFECTO = "https://docs.google.com/forms/d/e/1FAIpQLSeWdB-lcCJ-K0nsBV6WqB-GZ2ZvA9KkTd798_4n1dmBh1tngA/viewform?usp=pp_url&entry.182236341=";
  var GH_CADUCA_HORAS = 72;      // una copia de GitHub más vieja se usa solo si fallan las demás
  var POR_PAGINA_PROXY = 24;

  /* ---------- utilidades ---------- */
  function md5(str) {
    function rh(n) { var s = "", j; for (j = 0; j <= 3; j++) s += ("0" + ((n >> (j * 8)) & 255).toString(16)).slice(-2); return s; }
    function ad(x, y) { var l = (x & 65535) + (y & 65535); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 65535); }
    function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
    function cm(q, a, b, x, s, t) { return ad(rl(ad(ad(a, q), ad(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cm((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cm((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cm(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cm(c ^ (b | ~d), a, b, x, s, t); }
    var bytes = unescape(encodeURIComponent(str)), n = bytes.length, nb = ((n + 8) >> 6) + 1, x = new Array(nb * 16), i;
    for (i = 0; i < nb * 16; i++) x[i] = 0;
    for (i = 0; i < n; i++) x[i >> 2] |= bytes.charCodeAt(i) << ((i % 4) * 8);
    x[i >> 2] |= 128 << ((i % 4) * 8); x[nb * 16 - 2] = n * 8;
    var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
    for (i = 0; i < x.length; i += 16) {
      var oa = a, ob = b, oc = c, od = d;
      a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
      a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
      a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
      a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
      a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
      a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
      a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
      a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
      a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
      a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
      a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
      a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
      a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
      a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
      a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
      a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
      a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od);
    }
    return rh(a) + rh(b) + rh(c) + rh(d);
  }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  var decoTxt = document.createElement("textarea");
  function decodificar(s) { decoTxt.innerHTML = String(s == null ? "" : s); return decoTxt.value; }
  function limpiarTitulo(s) { return decodificar(s).replace(/<[^>]*>/g, "").replace(/^\s*\d{4,}\s*[-–:]?\s*/, "").replace(/\s+/g, " ").trim(); }
  function origenDe(u) { var m = String(u).match(/^(https?:\/\/[^\/]+)/i); return m ? m[1] : ""; }
  function absoluta(u, base) {
    if (!u) return "";
    u = String(u).replace(/\\u002F/gi, "/").trim();
    if (/^\/\//.test(u)) return "https:" + u;
    if (/^https?:\/\//i.test(u)) return u;
    if (u.charAt(0) === "/") return origenDe(base) + u;
    return "";
  }
  function conTiempo(url, ms, comoTexto) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, ctrl ? { signal: ctrl.signal } : {}).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return comoTexto ? r.text() : r.json();
    }, function (e) { clearTimeout(t); throw e; });
  }
  function primeraQueFunciona(lista, fn) {
    var i = 0;
    function sig(errAnt) { if (i >= lista.length) return Promise.reject(errAnt || new Error("sin opciones")); var x = lista[i++]; return fn(x).catch(sig); }
    return sig();
  }
  function formatoPrecio(v, moneda) {
    if (v == null || v === "") return "";
    if (typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v))) {
      var n = Number(v); if (!isFinite(n) || n <= 0) return "";
      return n.toLocaleString("es-ES", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " " + moneda;
    }
    return decodificar(String(v)).trim();
  }
  function normalizar(p, base, moneda) {
    if (!p) return null;
    var url = absoluta(p.url, base), img = absoluta(p.imagen, base), tit = limpiarTitulo(p.titulo);
    if (!url || !tit) return null;
    return { titulo: tit, url: url, imagen: img, precio: formatoPrecio(p.precio, moneda), precio_antes: formatoPrecio(p.precio_antes, moneda) };
  }

  /* ---------- de donde entra el visitante ---------- */
  // Sin servicios externos: se mira el idioma del navegador y su zona horaria.
  function visitanteEsDeAqui() {
    try {
      var idioma = (navigator.language || "").toLowerCase();
      var zona = "";
      try { zona = (Intl.DateTimeFormat().resolvedOptions().timeZone || ""); } catch (e) {}
      if (/^es/.test(idioma)) return true;
      if (/^Europe\//.test(zona) || zona === "Atlantic/Canary" || zona === "Africa/Ceuta") return true;
      return false;
    } catch (e) { return true; }
  }

  /* ---------- capa 1: GitHub ---------- */
  function capaGitHub(w, url, pagina) {
    var archivo = "producto-" + md5(url).slice(0, 16) + "-p" + pagina + ".json";
    return primeraQueFunciona(GH_BASES, function (base) { return conTiempo(base + archivo, 7000); }).then(function (d) {
      if (!d || !d.productos || !d.productos.length) throw new Error("GitHub vacío");
      if (pagina === 1 && d.generado) {
        var edad = (Date.now() - new Date(d.generado).getTime()) / 3600000;
        if (edad > GH_CADUCA_HORAS) { w.ghViejo = w.ghViejo || d.productos; throw new Error("GitHub antiguo"); }
      }
      // Copia que la tienda sirvio en otro idioma/moneda: vale tal cual para un visitante
      // de fuera; para uno de aqui se guarda como reserva y se intenta antes el NAS.
      if (d.idioma_distinto && visitanteEsDeAqui()) {
        w.ghOtroIdioma = w.ghOtroIdioma || d.productos;
        throw new Error("GitHub en otro idioma");
      }
      return { productos: d.productos, hayMas: d.hayMas != null ? d.hayMas : pagina < (d.totalPaginas || 1) };
    });
  }

  /* ---------- capa 2: NAS ---------- */
  function capaNas(w, url, pagina) {
    var ep = NAS_BASE + (w.nas || NAS_POR_DEFECTO) + "?url=" + encodeURIComponent(url) + "&pagina=" + pagina;
    return conTiempo(ep, pagina === 1 ? 25000 : 20000).then(function (d) {
      if (!d || !d.productos || !d.productos.length) throw new Error("NAS vacío");
      return { productos: d.productos, hayMas: d.hayMas != null ? d.hayMas : pagina < (d.totalPaginas || 1) };
    });
  }

  /* ---------- capa 3: tienda directa ---------- */
  function urlShopifyJson(url, pagina) {
    var o = origenDe(url); if (!o) return "";
    var m = url.match(/^https?:\/\/[^\/]+(\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?collections\/[^\/?#.]+)/i);
    return o + (m ? m[1] : "") + "/products.json?limit=24&page=" + pagina;
  }
  function pareceShopify(w, url) { return w.plataforma === "shopify" || /\/collections\/|\/products\.json|sitemap_products_\d/i.test(url); }
  function desdeShopifyJson(d, url) {
    var o = origenDe(url);
    return (d && d.products || []).map(function (p) {
      var v = (p.variants || [])[0] || {};
      return { titulo: p.title, url: o + "/products/" + p.handle, imagen: ((p.images || [])[0] || {}).src || "", precio: v.price, precio_antes: v.compare_at_price && Number(v.compare_at_price) > Number(v.price) ? v.compare_at_price : "" };
    });
  }
  function capaDirecta(w, url, pagina) {
    if (pareceShopify(w, url)) {
      return conTiempo(urlShopifyJson(url, pagina), 9000).then(function (d) {
        var ps = desdeShopifyJson(d, url);
        if (!ps.length) throw new Error("Shopify vacío");
        return { productos: ps, hayMas: ps.length >= 24 };
      });
    }
    if (w.plataforma === "woocommerce") {
      return conTiempo(origenDe(url) + "/wp-json/wc/store/v1/products?per_page=24&page=" + pagina, 9000).then(function (d) {
        var ps = (d || []).map(function (p) {
          var pr = p.prices || {}, div = Math.pow(10, pr.currency_minor_unit || 0);
          return { titulo: p.name, url: p.permalink, imagen: ((p.images || [])[0] || {}).src || "", precio: pr.price ? Number(pr.price) / div : "", precio_antes: pr.regular_price && pr.regular_price !== pr.price ? Number(pr.regular_price) / div : "" };
        });
        if (!ps.length) throw new Error("Woo vacío");
        return { productos: ps, hayMas: ps.length >= 24 };
      });
    }
    return Promise.reject(new Error("sin vía directa"));
  }

  /* ---------- capa 4: proxy de texto + extracción en el navegador ---------- */
  function porProxy(u) { return primeraQueFunciona(PROXIES, function (px) { return conTiempo(px(u), 25000, true).then(function (t) { if (!t || t.length < 50) throw new Error("vacío"); return t; }); }); }

  function extraerSitemap(xml) {
    var out = [], bloques = xml.split(/<url>/i).slice(1);
    bloques.forEach(function (b) {
      var loc = (b.match(/<loc>\s*([^<\s]+)\s*<\/loc>/i) || [])[1];
      var img = (b.match(/<image:loc>\s*([^<\s]+)\s*<\/image:loc>/i) || [])[1];
      var tit = (b.match(/<image:title>\s*([\s\S]*?)\s*<\/image:title>/i) || [])[1];
      if (!loc || !img) return;
      if (!tit) tit = decodeURIComponent(loc.replace(/[?#].*$/, "").split("/").filter(Boolean).pop() || "").replace(/\.html?$/i, "").replace(/[-_]+/g, " ");
      out.push({ titulo: tit.replace(/<!\[CDATA\[|\]\]>/g, ""), url: decodificar(loc), imagen: decodificar(img) });
    });
    return out;
  }

  // Busca "fichas de producto" dentro de cualquier JSON embebido en la página (JSON-LD, __NEXT_DATA__, Salesforce PWA, etc.)
  function extraerDeHtml(html, base) {
    var out = [], vistos = {}, re = /<script[^>]*>([\s\S]*?)<\/script>/gi, m, n = 0;
    function valor(o, claves) { for (var i = 0; i < claves.length; i++) { var v = o[claves[i]]; if (v != null && v !== "") return v; } return null; }
    function imagenDe(o) {
      var v = valor(o, ["c_imageURL", "image", "imagen", "featured_image", "images", "thumbnail", "img"]);
      if (Array.isArray(v)) v = v[0];
      if (v && typeof v === "object") v = v.disBaseLink || v.link || v.src || v.url || v.contentUrl || null;
      return typeof v === "string" ? v : "";
    }
    function recorrer(o, prof) {
      if (!o || typeof o !== "object" || prof > 40 || out.length > 400) return;
      if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) recorrer(o[i], prof + 1); return; }
      var tit = valor(o, ["productName", "name", "title"]);
      var url = valor(o, ["c_productDetailPageURL", "productUrl", "url", "link", "href", "permalink"]);
      var img = imagenDe(o);
      if (typeof tit === "string" && typeof url === "string" && img && (/product|produ|\.html|\/p\//i.test(url) || o["@type"] === "Product" || o.productId || o.sku)) {
        var abs = absoluta(url, base);
        if (abs && !vistos[abs]) {
          vistos[abs] = 1;
          var pr = valor(o, ["c_salesPriceFormatted", "price", "precio", "salePrice"]);
          if (pr && typeof pr === "object") pr = pr.formatted || pr.value || pr.amount || null;
          if (o.offers) { var of = Array.isArray(o.offers) ? o.offers[0] : o.offers; if (of && of.price) pr = pr || of.price; }
          out.push({ titulo: tit, url: abs, imagen: absoluta(img, base), precio: pr || "" });
        }
      }
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] && typeof o[k] === "object") recorrer(o[k], prof + 1);
    }
    while ((m = re.exec(html)) && n < 60) {
      var txt = m[1].trim(); if (txt.length < 30) continue;
      var ini = txt.search(/[\[{]/); if (ini < 0) continue;
      if (ini > 0) { var pre = txt.slice(0, ini); if (!/=\s*$/.test(pre)) continue; }
      var cuerpo = txt.slice(ini).replace(/;\s*$/, "");
      try { recorrer(JSON.parse(cuerpo), 0); n++; } catch (e) {}
    }
    return out;
  }

  // Algunas tiendas sirven la web en el idioma/pais del visitante (o del proxy). Si la URL del
  // catalogo lleva prefijo de idioma (p. ej. /eur/es/), se descartan los productos de otro idioma.
  function filtrarIdioma(ps, base) {
    var m = String(base).match(/^https?:\/\/[^\/]+((?:\/[a-z]{2,4}){1,2})\//i);
    if (!m) return ps;
    var pref = m[1].toLowerCase();
    var buenos = ps.filter(function (p) { return String(p.url).toLowerCase().indexOf(pref + "/") !== -1; });
    return buenos.length ? buenos : [];
  }

  function capaProxy(w, url, pagina) {
    if (pareceShopify(w, url)) {
      return porProxy(urlShopifyJson(url, pagina)).then(function (t) {
        var ps = desdeShopifyJson(JSON.parse(t), url);
        if (!ps.length) throw new Error("vacío");
        return { productos: ps, hayMas: ps.length >= 24 };
      });
    }
    var todos = w.proxyTodos && w.proxyTodos[url];
    var listo = todos ? Promise.resolve(todos) : porProxy(url).then(function (t) {
      if (/<sitemapindex/i.test(t)) {
        var hijos = (t.match(/<loc>\s*[^<\s]+\s*<\/loc>/gi) || []).map(function (x) { return decodificar(x.replace(/<\/?loc>/gi, "").trim()); });
        var hijo = hijos.filter(function (h) { return /product/i.test(h); })[0] || hijos[0];
        if (!hijo) throw new Error("índice vacío");
        return porProxy(hijo).then(extraerSitemap);
      }
      if (/<urlset/i.test(t)) return extraerSitemap(t);
      var j = null; try { j = JSON.parse(t); } catch (e) {}
      if (j && j.products) return desdeShopifyJson(j, url);
      return filtrarIdioma(extraerDeHtml(t, url), url);
    }).then(function (ps) {
      if (!ps || !ps.length) throw new Error("sin productos");
      w.proxyTodos = w.proxyTodos || {}; w.proxyTodos[url] = ps; return ps;
    });
    return listo.then(function (ps) {
      var trozo = ps.slice((pagina - 1) * POR_PAGINA_PROXY, pagina * POR_PAGINA_PROXY);
      if (!trozo.length) throw new Error("fin");
      return { productos: trozo, hayMas: pagina * POR_PAGINA_PROXY < ps.length };
    });
  }

  var CAPAS = [
    { nombre: "github", fn: capaGitHub },
    { nombre: "nas", fn: capaNas },
    { nombre: "directa", fn: capaDirecta },
    { nombre: "proxy", fn: capaProxy }
  ];

  /* ---------- última copia buena (navegador del visitante) ---------- */
  function claveCopia(w) { return "motorprod:" + md5(w.urls.join("|")).slice(0, 16); }
  function guardarCopia(w) {
    try { localStorage.setItem(claveCopia(w), JSON.stringify({ t: Date.now(), productos: w.productos.slice(0, 60) })); } catch (e) {}
  }
  function leerCopia(w) {
    try { var c = JSON.parse(localStorage.getItem(claveCopia(w)) || "null"); return c && c.productos && c.productos.length ? c.productos : null; } catch (e) { return null; }
  }

  /* ---------- estilos ---------- */
  function ponerEstilos() {
    if (document.getElementById("motor-productos-css")) return;
    var css = ".mp-grid{display:grid;gap:20px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin:auto;max-width:1000px;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#333}" +
      ".mp-card{border:1px solid #eaeaea;padding:15px;border-radius:10px;text-align:center;background:#fff;display:flex;flex-direction:column}" +
      ".mp-card img{width:100%;height:250px;object-fit:contain;border-radius:8px;margin-bottom:10px;background:#fafafa}" +
      ".mp-sinimg{height:250px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:20px;border-radius:8px;margin-bottom:10px}" +
      ".mp-tit{font-size:13px;margin-bottom:5px;color:#333;min-height:40px;text-transform:uppercase;letter-spacing:.5px}" +
      ".mp-precio{font-size:16px;font-weight:500;color:#111;margin-bottom:8px}.mp-precio s{color:#999;font-weight:normal;font-size:13px;margin-right:6px}" +
      ".mp-comprar{display:block;background:#111;color:#fff!important;padding:10px;text-decoration:none!important;border-radius:6px;font-size:11px;font-weight:500;margin-top:auto;letter-spacing:1px}.mp-comprar:hover{background:#333}" +
      ".mp-club{margin-top:6px;display:block;background:#e8f0fe;color:#1a73e8!important;padding:10px;text-decoration:none!important;border-radius:6px;font-size:11px;font-weight:500;border:1px solid #1a73e8}" +
      ".mp-estado{color:#999;font-size:13px;margin-top:16px;text-align:center}" +
      ".mp-final{grid-column:1/-1;text-align:center;padding:20px}.mp-final a{display:inline-block;background:#111;color:#fff!important;padding:14px 35px;text-decoration:none!important;border-radius:8px;font-size:14px;font-weight:500;letter-spacing:1px}";
    var st = document.createElement("style"); st.id = "motor-productos-css"; st.textContent = css; document.head.appendChild(st);
  }

  /* ---------- pintar ---------- */
  function utm(u, w, medio) { return u + (u.indexOf("?") !== -1 ? "&" : "?") + "utm_source=" + encodeURIComponent(w.blog) + "&utm_medium=" + medio + "&utm_campaign=catalogo_" + encodeURIComponent(w.campana); }
  function tarjeta(p, w) {
    var clic = CLICS + "?producto=" + encodeURIComponent(p.titulo) + "&url=" + encodeURIComponent(p.url);
    var h = '<div class="mp-card">';
    h += p.imagen ? '<img src="' + esc(p.imagen) + '" alt="' + esc(p.titulo) + '" loading="lazy" referrerpolicy="no-referrer">' : '<div class="mp-sinimg">' + esc(w.marca) + "</div>";
    h += '<div class="mp-tit">' + esc(p.titulo) + "</div>";
    if (p.precio) h += '<div class="mp-precio">' + (p.precio_antes ? "<s>" + esc(p.precio_antes) + "</s>" : "") + esc(p.precio) + "</div>";
    h += '<a class="mp-comprar" href="' + esc(utm(p.url, w, "tarjeta_producto")) + '" rel="nofollow sponsored" target="_blank" data-clic="' + esc(clic) + '">' + esc(w.comprar) + "</a>";
    if (w.club) h += '<a class="mp-club" href="' + esc(w.form + encodeURIComponent(p.titulo)) + '" target="_blank" rel="nofollow">Unirme al Club de Ahorro</a>';
    return h + "</div>";
  }
  function anadir(w, lista) {
    var h = "";
    lista.forEach(function (p) {
      p = normalizar(p, w.urls[w.idx] || w.urls[0], w.moneda);
      if (!p || w.vistos[p.url]) return;
      w.vistos[p.url] = 1; w.productos.push(p); h += tarjeta(p, w);
    });
    if (h) { quitarAviso(w); w.grid.insertAdjacentHTML("beforeend", h); }
  }
  function quitarAviso(w) { var a = w.grid.querySelector(".mp-aviso"); if (a) a.parentNode.removeChild(a); }
  function estado(w, t) { w.estado.textContent = t; }
  function botonFinal(w) {
    if (w.grid.querySelector(".mp-final")) return;
    quitarAviso(w);
    w.grid.insertAdjacentHTML("beforeend", '<div class="mp-final"><a href="' + esc(utm(w.tienda, w, "boton_oficial")) + '" rel="nofollow sponsored" target="_blank">' + esc(w.boton) + "</a></div>");
  }

  /* ---------- carga por tandas ---------- */
  function cargarSiguiente(w) {
    if (w.ocupado || w.fin) return;
    w.ocupado = true;
    var url = w.urls[w.idx], pagina = w.pagina;
    var orden = w.capa != null ? CAPAS.slice(w.capa).concat(CAPAS.slice(0, w.capa)) : CAPAS;
    var i = 0;
    function probar() {
      if (i >= orden.length) return Promise.reject(new Error("todas las capas fallaron"));
      var capa = orden[i++];
      return capa.fn(w, url, pagina).then(function (r) { w.capa = CAPAS.indexOf(capa); w.capaNombre = capa.nombre; return r; }, probar);
    }
    probar().then(function (r) {
      anadir(w, r.productos);
      if (w.productos.length && !w.copiaGuardada && (pagina >= 2 || !r.hayMas)) { guardarCopia(w); w.copiaGuardada = true; }
      if (r.hayMas) w.pagina++; else siguienteUrl(w);
    }, function () {
      if (pagina === 1 && !w.productos.length && w.idx === w.urls.length - 1) {
        var copia = leerCopia(w) || w.ghViejo || w.ghOtroIdioma;
        if (copia) { anadir(w, copia); w.deCopia = true; }
      }
      siguienteUrl(w);
    }).then(function () {
      w.ocupado = false;
      if (w.fin) {
        if (w.reloj) { clearInterval(w.reloj); w.reloj = null; }
        botonFinal(w);
        estado(w, w.productos.length ? w.productos.length + " productos" : "");
      } else {
        estado(w, w.productos.length ? "Mostrando " + w.productos.length + " productos" : "Cargando productos...");
        if (casiVisible(w)) cargarSiguiente(w);
      }
      if (w.productos.length && !w.copiaGuardada && w.fin && !w.deCopia) { guardarCopia(w); w.copiaGuardada = true; }
    });
  }
  function siguienteUrl(w) {
    w.idx++; w.pagina = 1; w.capa = null;
    if (w.idx >= w.urls.length) w.fin = true;
  }
  function casiVisible(w) { var r = w.grid.getBoundingClientRect(); return r.bottom < (window.innerHeight || 800) + 600; }

  /* ---------- arranque ---------- */
  function iniciar(el) {
    if (el.getAttribute("data-mp-ok")) return;
    el.setAttribute("data-mp-ok", "1");
    var urls = (el.getAttribute("data-url") || "").split("|").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!urls.length) return;
    var tienda = el.getAttribute("data-tienda") || (origenDe(urls[0]) + "/");
    var w = {
      el: el, urls: urls, idx: 0, pagina: 1, capa: null, productos: [], vistos: {},
      nas: el.getAttribute("data-nas") || "",
      plataforma: (el.getAttribute("data-plataforma") || "").toLowerCase(),
      tienda: tienda,
      marca: (tienda.replace(/^https?:\/\/(www\.)?/i, "").split(/[\/.]/)[0] || "").toUpperCase(),
      boton: el.getAttribute("data-boton") || "IR A LA TIENDA",
      blog: el.getAttribute("data-blog") || "blog",
      campana: el.getAttribute("data-campana") || "tienda",
      comprar: el.getAttribute("data-comprar") || "Comprar ahora",
      club: el.getAttribute("data-club") !== "0",
      form: el.getAttribute("data-form") || FORM_POR_DEFECTO,
      moneda: el.getAttribute("data-moneda") || "€"
    };
    ponerEstilos();
    el.innerHTML = '<div class="mp-grid"><p class="mp-aviso" style="grid-column:1/-1;text-align:center;color:#999">Cargando productos...</p></div><div class="mp-estado"></div>';
    w.grid = el.querySelector(".mp-grid"); w.estado = el.querySelector(".mp-estado");
    // Si una foto falla, se reintenta a través de images.weserv.nl
    w.grid.addEventListener("error", function (e) {
      var t = e.target;
      if (t && t.tagName === "IMG" && !t.getAttribute("data-resp")) { t.setAttribute("data-resp", "1"); t.src = "https://images.weserv.nl/?url=" + encodeURIComponent(t.src.replace(/^https?:\/\//, "")); }
    }, true);
    // Registro de clics sin romper el enlace
    w.grid.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest("a[data-clic]") : null;
      if (a) { try { fetch(a.getAttribute("data-clic"), { mode: "no-cors" }); } catch (x) {} }
    });
    if (window.IntersectionObserver) {
      var cent = document.createElement("div"); cent.style.height = "1px"; el.appendChild(cent);
      new IntersectionObserver(function (ent) { if (ent[0].isIntersecting) cargarSiguiente(w); }, { rootMargin: "600px" }).observe(cent);
    }
    window.addEventListener("scroll", function () { if (casiVisible(w)) cargarSiguiente(w); }, { passive: true });
    document.addEventListener("scroll", function () { if (casiVisible(w)) cargarSiguiente(w); }, { passive: true, capture: true });
    // Red de seguridad: algunas plantillas de blog no disparan el evento de scroll en window
    w.reloj = setInterval(function () {
      if (w.fin) { clearInterval(w.reloj); return; }
      if (casiVisible(w)) cargarSiguiente(w);
    }, 800);
    cargarSiguiente(w);
  }
  function iniciarTodos() { var els = document.querySelectorAll(".motor-productos"); for (var i = 0; i < els.length; i++) iniciar(els[i]); }

  window.MotorProductos = { version: VERSION, iniciarTodos: iniciarTodos, _md5: md5, _extraerDeHtml: extraerDeHtml, _extraerSitemap: extraerSitemap };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciarTodos); else iniciarTodos();
})();
