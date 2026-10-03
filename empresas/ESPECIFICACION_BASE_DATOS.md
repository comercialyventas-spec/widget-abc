# Automatización de 000 BASE DATOS EMPRESAS MUNDO ALFABÉTICO (pestaña TODAS)

Hoja: 16VzQ170pK86enBNhIO53Bznq7HI1fcRBZjI6e8Eac8w · Decidido con Dani el 3 oct 2026.
Principio: Dani pone la URL en C (WEB). GitHub (sin cupo de Google) visita la web y rellena columnas.
Nunca pisa lo que Dani haya escrito a mano. Si no está seguro: "REVISAR". Unión entre hojas siempre por ID_EMPRESA, nunca por posición.
Antes de tocar la hoja: copia de seguridad, y convertir a valores fijos lo que hoy dan las fórmulas que se sustituyen.

## Columnas
- A ID_EMPRESA, B NOMBRE, E IFRAME: ya automáticas (no tocar). C: la pone Dani.
- D EMAIL: todos, separados por comas; primero el del dominio (info@, contacto@…), gmail/hotmail solo si no hay otro; los de terceros (agencia web) al final; sin falsos ni repetidos; entiende [at]/(arroba).
- F ROBOTS.TXT: mapa de productos primero, resto de sitemaps detrás; "BLOQUEA ROBOTS" si el robots.txt bloquea; "SIN SITEMAP".
- G URL_BUSQUEDA: URL del buscador (lupa) lista para añadir la palabra; si no, plantilla por plataforma; comprobada; "SIN BUSCADOR".
- H BLOG ALIAZON: un solo blog (de la lista DD:EP), clasificado aprendiendo de las filas ya clasificadas por Dani; aviso "REVISAR: X / Y" aparte; no pisa la de Dani. Genera la K.
- I CATEGORÍAS PRINCIPALES: primer nivel del menú sin páginas que no son producto. J SUBCATEGORÍAS: submenús o sitemap de categorías.
- K, L, M: ya funcionan, no tocar.
- N ACTIVO: SI / NO (no existe, error, dominio en venta) / REVISAR; recomprobación mensual.
- O RSS/FEED: blog/noticias primero, resto separados por comas; "SIN RSS".
- P NEWSLETTER: dirección de la página de suscripción.
- Q AÑO WEB: año de creación del dominio (RDAP/WHOIS; si no, Wayback).
- R DOMINIO: tiene fórmula, no tocar.
- S CONTACTO: dirección de la página de contacto.
- T TIPO EMPRESA: razón social, del aviso legal en cualquier idioma (Impressum, Mentions légales, Note legali…), formas jurídicas de varios países.
- U C.I.F.: número fiscal según país (CIF/NIF con letra de control, NIPC, SIREN/SIRET, USt-IdNr, P.IVA, VAT/Company number); si no, "REVISAR MANUAL". Sustituye a la fórmula IMPORTXML (gasta cupo).
- V TELÉFONO: con prefijo, como texto, varios separados por comas. W FAX: número o NO. X ATENCIÓN CLIENTE: canal (WhatsApp con número/enlace, chat, formulario).
- Y DIRECCIÓN, Z CÓDIGO POSTAL (poner título), AA LOCALIDAD, AB PROVINCIA, AC PAÍS: valores escritos por el programa (sustituyen fórmulas), internacional; provincia España por CP usando PROVINCIAS ID / CIUDADES.
- AD % 1ª compra, AE PROMOCIONES (URL), AF CUPONES (códigos), AG TARJETA CLIENTE (URL), AH OFERTAS (URL), AI OUTLET (URL), AJ DEVOLUCIONES (plazo/gratis/no), AK PRECIOS DESDE (mínimo del catálogo), AL PEDIDO MÍNIMO, AM-AP envíos península/Baleares/Ceuta-Melilla/internacional (resumen de TARIFAS ENVÍO), AQ GRATIS DESDE, AR EMPAQUETADO (SI – importe / NO), AS ENVÍO REDUCIDO DESDE, AT PLAZO ENTREGA, AU RECOGIDA TIENDA SI/NO. Con página de origen; "REVISAR" si duda.
- AV MUESTRAS SI/NO, AW PRESUPUESTOS (URL o NO), AX CATEGORÍAS: sobra (duplica I/J) — se usa la hoja 00 TODAS LAS CATEGORÍAS.
- AY CATÁLOGOS CODIFICADOS: el programa prepara resumen de la empresa; los catálogos los redacta Claude por tandas a demanda.
- AZ SINERGIAS: 5 empresas más afines (tabla de sectores complementarios + H/I + provincia/localidad) con motivo.
- BA GOOGLE MAPS (mapa incrustado o enlace de búsqueda con Y), BB MAPA WEB (URL o NO), BC ESTRUCTURA WEB: se rellena a la vez la hoja 00 ESTRUCTURA WEB EMPRESAS ESPAÑA.
- BD VENTA ONLINE SI/NO (+URL tienda). BE OFRECER VENTA ONLINE: "CANDIDATA" si BD=NO (carta preparada; no se envía nada sin permiso).
- BF AFILIACIÓN, BG BOLSA TRABAJO, BH BLOG, BI NOTICIAS, BJ CATÁLOGOS: URL o NO. BK PAGOS: lista de formas de pago.
- BL VERIFICADA: resultado de la última comprobación (SI – activa / NO – caída / CAMBIOS – qué cambió). BM FECHA ACTUALIZACIÓN: fecha. Repaso mensual por tandas.
- BN-BU redes (Facebook, Instagram, LinkedIn, Pinterest, TikTok, X, YouTube, WhatsApp): URL o NO.
- BV-CL páginas (FAQ, aviso legal, accesibilidad, canal denuncias, copyright, distribuidores, envíos y devoluciones, pagos, mi cuenta, cookies, protección datos, política ambiental, privacidad, calidad, sobre nosotros, términos, webmail): URL, nombres en varios idiomas.
- CM PROTECCIÓN COMPRADOR, CN SELLOS: sellos (Confianza Online, Trusted Shops, eKomi…) con enlace.
- CO-DC servicios (blog Servicios Auxiliares): "NECESITA" (lo que le falta y Dani podría ofrecer; principal) / "OFRECE" (la empresa presta ese servicio).
- DD-EP blogs: "ENCAJA" / "PUBLICADA" (su dominio aparece en el blog) / "CONTACTADA".

## Otras hojas
- TARIFAS ENVÍO: una fila por precio: ID_EMPRESA · TIENDA · ZONA · TRAMO (peso o importe) · PRECIO · GRATIS DESDE · PLAZO · EMPAQUETADO · PÁGINA ORIGEN · FECHA. Zonas: Península, Baleares, Canarias, Ceuta, Melilla, Portugal, Andorra, Gibraltar, UE, Resto Europa, EE.UU./Canadá, Latinoamérica, Resto mundo. Tramos: 1,2,3,5,10,15,20,30,+30 kg o por importe. Pasar lo existente de Es4Sense. Quitar la fórmula UNIQUE de la A (descoloca filas).
- 00 TODAS LAS CATEGORÍAS (1Tl2n2WCsGUpF103nS3SZ1i6Zd6Jkgs8D5-mEYzEJ_ys): CATEGORÍA · URL · TIENDA · ID_EMPRESA · BLOG, limpia.
- Ficha de cada empresa (K): columna A = URLs de secciones, categorías y productos (sitemap o recorrido, límite ~2.000), B = tipo; actualizable.
- Cadena: ficha → EXTRAER URL (1YcyXeXJP7BbcnRU3bYDnJzg9jxLdP1yCCBeZd-o51IE, pestaña según H) → GENERADOR_NOTICIAS (secciones de noticias) / GENERADOR_HTMLROBOTS (categorías) / 00PRODUCTOS pestaña TODOS LOS PRODUCTOS (productos). Estas hojas se revisan columna a columna más adelante.

## Pasos
1. Esta especificación. 2. Dani amplía el permiso de la credencial (spreadsheets escritura). 3. Copia de seguridad. 4. Programa en GitHub y prueba con 10 empresas. 5. Lanzar por tandas.
