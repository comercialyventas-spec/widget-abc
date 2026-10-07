# Etiquetas PERIÓDICOS ALIAZON: tanda de los posts restantes (7 oct 2026)

Aplicada el 2026-10-07 08:36 UTC con `anadir_etiquetas` corregido: lee el post completo con su content, guarda una copia completa en `migracion/backups/etiquetas/<postId>.json`, lo reenvía íntegro con `posts.update` cambiando solo las etiquetas y comprueba el content, el título, la fecha, el estado y la dirección.

## Resultado

- **Cambiados: 140**, todos con la comprobación correcta (content con la misma longitud, título, fecha, estado y dirección iguales).
- **Fallidos: 0.**
- **Saltados: 3**, porque pasarían de 200 caracteres de etiquetas (lista abajo).
- Son 140 y no 141 porque el post de MAGAZINE MODA (`6788054403342205516`), con la opción (b), ya no tenía nada que añadir: tenía MODA y no recibe SUPLEMENTOS.
- Prueba de 1 post (orden 53): `8895828563521694257`, cambiado (1).
- Los 20 posts de la prueba del 7 oct, restaurados a mano, no se han tocado.
- Recuento en Blogger después de la tanda (2026-10-07 08:44 UTC): en todos los cambiados están las etiquetas añadidas.

## Recuento de posts por etiqueta general (antes → después)

«Antes» es el inventario de las 05:42 UTC del 7 oct, previo a cualquier cambio. «Después» es el de las 08:44 UTC. Cuentan los posts publicados y programados.

| Etiqueta general | Antes | Después | Diferencia |
|---|---:|---:|---:|
| PORTADAS | 20 | 27 | +7 |
| ESPAÑA | 30 | 37 | +7 |
| INTERNACIONAL | 31 | 37 | +6 |
| OPINIÓN | 26 | 27 | +1 |
| ARTÍCULOS | 15 | 20 | +5 |
| POLÍTICA | 31 | 32 | +1 |
| ECONOMÍA | 56 | 62 | +6 |
| CULTURA | 48 | 62 | +14 |
| MODA | 16 | 23 | +7 |
| LIBROS | 7 | 7 | 0 |
| SOCIEDAD | 19 | 29 | +10 |
| DEPORTES | 52 | 58 | +6 |
| TECNOLOGÍA | 23 | 23 | 0 |
| GASTRONOMÍA | 6 | 12 | +6 |
| MEDIO AMBIENTE | 8 | 11 | +3 |
| CLIMA | 5 | 5 | 0 |
| educación | 9 | 9 | 0 |
| CIENCIA | 18 | 20 | +2 |
| SALUD | 22 | 33 | +11 |
| TURISMO | 7 | 17 | +10 |
| NEGOCIOS | 4 | 13 | +9 |
| AGRICULTURA | 4 | 4 | 0 |
| MOTOR | 21 | 21 | 0 |
| SERVICIOS | 0 | 0 | 0 |
| SUCESOS | 6 | 6 | 0 |
| COMUNICADOS DE PRENSA | 4 | 7 | +3 |
| FEMINISMO | 10 | 12 | +2 |
| TELEVISIÓN | 10 | 17 | +7 |
| VÍDEOS | 24 | 24 | 0 |
| PODCAST | 5 | 5 | 0 |
| CANALES | 0 | 0 | 0 |
| HEMEROTECAS | 4 | 7 | +3 |
| SUPLEMENTOS | 0 | 4 | +4 |
| DE COMPRAS | 0 | 3 | +3 |
| OTROS | 0 | 0 | 0 |
| EMPLEO | 1 | 3 | +2 |
| CONSUMO | 2 | 2 | 0 |
| TOROS | 2 | 2 | 0 |
| GUERRAS | 2 | 16 | +14 |
| ENTREVISTAS | 2 | 2 | 0 |
| REVISTAS | 1 | 2 | +1 |
| JUEGOS | 3 | 4 | +1 |
| IGUALDAD | 0 | 17 | +17 |
| VIVIENDA | 5 | 7 | +2 |
| GENTE | 9 | 11 | +2 |

Total de etiquetas generales puestas: +172.

## Saltados (no se han tocado)

| postId | Título | Etiquetas que añadiría | Motivo |
|---|---|---|---|
| `1689078416449319110` | Entre la alerta sanitaria y la agenda alimentaria: ¿Por qué los medios ponen la diana en la carne roja? | ARTÍCULOS | SALTADO (pasaría de 200 caracteres: 212) |
| `7678950838633507136` | Violencia contra las mujeres: una lacra social interminable | OPINIÓN, IGUALDAD | SALTADO (pasaría de 200 caracteres: 204) |
| `2103793066582249948` | CULTURA GAZETA SHQIPTARE | INTERNACIONAL | SALTADO (pasaría de 200 caracteres: 213) |

## Fallidos

Ninguno.

## Cambiados (140)

| # | postId | Título | Etiquetas añadidas | Post |
|---:|---|---|---|---|
| 1 | `5221479010919545067` | RECETAS ESDIARIO | GASTRONOMÍA | https://periodicosaliazon.blogspot.com/2026/10/recetas-esdiario.html |
| 2 | `4327067634928666077` | EMPLEO PÚBLICO MITECO | EMPLEO | https://periodicosaliazon.blogspot.com/2026/09/empleo-publico-miteco.html |
| 3 | `5178753558794941172` | FITNESS ABC | SALUD | https://periodicosaliazon.blogspot.com/2026/09/fitness-abc.html |
| 4 | `8153619486175821293` | PSICOLOGÍA SEXO ABC | SALUD | https://periodicosaliazon.blogspot.com/2026/09/psicologia-sexo-abc.html |
| 5 | `4987777047969566343` | ALIMENTACIÓN ABC | SALUD | https://periodicosaliazon.blogspot.com/2026/09/alimentacion-abc.html |
| 6 | `8578041262158738571` | BIENESTAR ABC | SALUD | https://periodicosaliazon.blogspot.com/2026/09/bienestar-abc_01401794932.html |
| 7 | `7689111069041981266` | MEDIOAMBIENTE INFOLIBRE | MEDIO AMBIENTE | https://periodicosaliazon.blogspot.com/2026/09/medioambiente-infolibre.html |
| 8 | `2643455556939256147` | COMPRAR COMPARATIVAS LA VANGUARDIA | DE COMPRAS | https://periodicosaliazon.blogspot.com/2026/09/comprar-comparativas-la-vanguardia.html |
| 9 | `7777485752014110056` | COMPRAR LA VANGUARDIA | DE COMPRAS | https://periodicosaliazon.blogspot.com/2026/09/comprar-la-vanguardia.html |
| 10 | `7529884508323273024` | MUNDO EL CONFIDENCIAL | INTERNACIONAL | https://periodicosaliazon.blogspot.com/2026/09/mundo-el-confidencial.html |
| 11 | `4717037663192743895` | HEMEROTECA ABC | HEMEROTECAS | https://periodicosaliazon.blogspot.com/2026/09/hemeroteca-abc.html |
| 12 | `8919637580214457311` | CUÍDATE EL CONFIDENCIAL DIGITAL | SALUD | https://periodicosaliazon.blogspot.com/2026/09/cuidate-el-confidencial-digital.html |
| 13 | `4004163660266656664` | DINERO VÍDEOS EL CONFIDENCIAL DIGITAL | ECONOMÍA | https://periodicosaliazon.blogspot.com/2026/09/dinero-videos-el-confidencial-digital.html |
| 14 | `2350958289700939233` | GOURMET EL CONFIDENCIAL DIGITAL | GASTRONOMÍA | https://periodicosaliazon.blogspot.com/2026/09/gourmet-el-confidencial-digital.html |
| 15 | `5035614121350534500` | ESTILO ESDIARIO | MODA | https://periodicosaliazon.blogspot.com/2026/09/estilo-esdiario_0720372883.html |
| 16 | `8110176686246448035` | NACIONAL ESDIARIO | ESPAÑA | https://periodicosaliazon.blogspot.com/2026/09/nacional-esdiario.html |
| 17 | `522547186824448083` | ESTILO ESDIARIO | MODA | https://periodicosaliazon.blogspot.com/2026/09/estilo-esdiario.html |
| 18 | `2639058194062277722` | RECETAS ESDIARIO | GASTRONOMÍA | https://periodicosaliazon.blogspot.com/2026/09/recetas-esdiario.html |
| 19 | `734135920706740579` | VIAJES 20 MINUTOS | TURISMO | https://periodicosaliazon.blogspot.com/2026/09/viajes-20-minutos_01485840108.html |
| 20 | `4030528549994163110` | MAGAZINE LA VANGUARDIA | SUPLEMENTOS | https://periodicosaliazon.blogspot.com/2026/09/magazine-la-vanguardia.html |
| 21 | `6721166633825908376` | SERIES LA VANGUARDIA | TELEVISIÓN | https://periodicosaliazon.blogspot.com/2026/09/series-la-vanguardia.html |
| 22 | `6276339132255844266` | GENTE LA VANGUARDIA | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/09/gente-la-vanguardia.html |
| 23 | `4192693094689387056` | PORTADA EL MUNDO | PORTADAS | https://periodicosaliazon.blogspot.com/2026/09/portada-el-mundo.html |
| 24 | `6920504704815640399` | BIENESTAR EL CONFIDENCIAL | SALUD | https://periodicosaliazon.blogspot.com/2026/09/bienestar-el-confidencial.html |
| 25 | `7902444593468250104` | EMPRENDEDORES EL CONFIDENCIAL | NEGOCIOS | https://periodicosaliazon.blogspot.com/2026/09/emprendedores-el-confidencial.html |
| 26 | `6984279282615755748` | PORTADA LO QUE SOMOS | PORTADAS | https://periodicosaliazon.blogspot.com/2026/09/portada-lo-que-somos.html |
| 27 | `9125138972205353275` | GENTE LA VANGUARDIA | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/07/gente-la-vanguardia.html |
| 28 | `3341599077895340033` | REVISTA BANDO EL PLURAL | REVISTAS | https://periodicosaliazon.blogspot.com/2026/08/revista-bando-el-plural.html |
| 29 | `232722480439851569` | FAMOSOS EL CONFIDENCIAL DIGITAL | SOCIEDAD, GENTE | https://periodicosaliazon.blogspot.com/2026/09/famosos-el-confidencial-digital.html |
| 30 | `733440063295380646` | MÚSICA LO QUE SOMOS | CULTURA | https://periodicosaliazon.blogspot.com/2026/09/musica-lo-que-somos.html |
| 31 | `2704905172364818416` | PORTADA EMPRENDEDORES | NEGOCIOS, PORTADAS | https://periodicosaliazon.blogspot.com/2026/09/portada-emprendedores.html |
| 32 | `6871379309127359209` | VIAJES 20 MINUTOS | TURISMO | https://periodicosaliazon.blogspot.com/2026/09/viajes-20-minutos.html |
| 33 | `141086690306630432` | MÚSICA 20 MINUTOS | CULTURA | https://periodicosaliazon.blogspot.com/2026/09/musica-20-minutos.html |
| 34 | `2547318290884974521` | IGUALDAD INFOLIBRE | FEMINISMO, IGUALDAD | https://periodicosaliazon.blogspot.com/2026/09/igualdad-infolibre.html |
| 35 | `4796310513693903004` | PORTADA EUROPAPRESS | PORTADAS | https://periodicosaliazon.blogspot.com/2026/09/portada-europapress.html |
| 36 | `2279727657844493540` | CINE ABC | CULTURA | https://periodicosaliazon.blogspot.com/2026/09/cine-abc.html |
| 37 | `2841596102095158459` | GENTE ABC | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/09/gente-abc.html |
| 38 | `1507296715899801942` | DECORACIÓN ABC | MODA | https://periodicosaliazon.blogspot.com/2026/09/decoracion-abc.html |
| 39 | `9024980809418095936` | GENTE EL PERIÓDICO | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/09/gente-el-periodico.html |
| 40 | `6144909629886370211` | CINE LO QUE SOMOS | CULTURA | https://periodicosaliazon.blogspot.com/2026/09/cine-lo-que-somos.html |
| 41 | `1382989998663137361` | BALONCESTO ABC | DEPORTES | https://periodicosaliazon.blogspot.com/2026/09/baloncesto-abc.html |
| 42 | `8174782226914604690` | CIENCIA EL PAÍS | CIENCIA | https://periodicosaliazon.blogspot.com/2026/09/ciencia-el-pais.html |
| 43 | `4501370392900191207` | HEMEROTECA HISPANIDAD | HEMEROTECAS | https://periodicosaliazon.blogspot.com/2026/09/hemeroteca-hispanidad.html |
| 44 | `4841688958010593116` | BIENESTAR ABC | SALUD | https://periodicosaliazon.blogspot.com/2026/09/bienestar-abc.html |
| 45 | `8358873183054907584` | JAZZ IS DEAD | CULTURA | https://periodicosaliazon.blogspot.com/2026/09/jazz-is-dead.html |
| 46 | `5048261549413190922` | PUBLICIDAD OSLO SKIN LAB | MODA | https://periodicosaliazon.blogspot.com/2026/09/blog-post.html |
| 47 | `3746811120257789592` | RADAR FEMINISTA PÚBLICO | IGUALDAD | https://periodicosaliazon.blogspot.com/2026/09/radar-feminista-publico.html |
| 48 | `7897467197284375988` | VELA ABC | DEPORTES | https://periodicosaliazon.blogspot.com/2026/09/vela-abc.html |
| 49 | `2724279278256022490` | MÚSICA ABC | CULTURA | https://periodicosaliazon.blogspot.com/2026/09/musica-abc.html |
| 50 | `7394763351727612978` | MUNDO EFE | INTERNACIONAL | https://periodicosaliazon.blogspot.com/2026/08/mundo-efe.html |
| 51 | `1732074197581984278` | HEMEROTECA HISPANIDAD | HEMEROTECAS | https://periodicosaliazon.blogspot.com/2026/08/hemeroteca-hispanidad.html |
| 52 | `2733948051040783322` | VIAJES EL DIARIO.ES | TURISMO | https://periodicosaliazon.blogspot.com/2026/08/viajes-el-diarioes.html |
| 53 | `3744129907815258750` | PASATIEMPOS ABC | JUEGOS | https://periodicosaliazon.blogspot.com/2026/08/pasatiempos-abc.html |
| 54 | `7365929608208130172` | MUNDO EL ORDEN MUNDIAL | INTERNACIONAL | https://periodicosaliazon.blogspot.com/2026/08/mundo-el-orden-mundial.html |
| 55 | `8690175217961323357` | OCIO Y CULTURA LA VANGUARDIA | CULTURA | https://periodicosaliazon.blogspot.com/2026/08/ocio-y-cultura-la-vanguardia.html |
| 56 | `6253865653111569119` | MAGAZINE VIAJES LA VANGUARDIA | TURISMO, SUPLEMENTOS | https://periodicosaliazon.blogspot.com/2026/08/magazine-viajes-la-vanguardia.html |
| 57 | `1291200916148516491` | BIENESTAR EL CONFIDENCIAL | SALUD | https://periodicosaliazon.blogspot.com/2026/08/bienestar-el-confidencial.html |
| 58 | `5502559387822016230` | MAGAZINE LA VANGUARDIA | SUPLEMENTOS | https://periodicosaliazon.blogspot.com/2026/08/magazine-la-vanguardia.html |
| 59 | `2865335865743441273` | EMPRESAS DE VANGUARDIA LA VANGUARDIA | NEGOCIOS | https://periodicosaliazon.blogspot.com/2026/08/empresas-de-vanguardia-la-vanguardia.html |
| 60 | `6702131503981520830` | BABELIA EL PAÍS | CULTURA | https://periodicosaliazon.blogspot.com/2026/07/babelia-el-pais.html |
| 61 | `1275976869468734974` | FÚTBOL ABC | DEPORTES | https://periodicosaliazon.blogspot.com/2026/07/futbol-abc.html |
| 62 | `2305597602048271810` | DIRECTORIO EMPRESAS DE VANGUARDIA LA VANGUARDIA | NEGOCIOS | https://periodicosaliazon.blogspot.com/2026/07/directorio-empresas-de-vanguardia-la.html |
| 63 | `9182721960747859736` | INMOBILIARIO ABC | VIVIENDA | https://periodicosaliazon.blogspot.com/2026/07/inmobiliario-abc.html |
| 64 | `5250555024500664327` | GENTE EL PAÍS | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/07/gente-el-pais_0596579814.html |
| 65 | `3249079436835622609` | BELLEZA ABC | MODA | https://periodicosaliazon.blogspot.com/2026/07/belleza-abc.html |
| 66 | `1397602666413795711` | GASTRONOMÍA ABC | GASTRONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/gastronomia-abc.html |
| 67 | `1336891787429386164` | CIENCIAS PUBLICO.ES | CIENCIA | https://periodicosaliazon.blogspot.com/2026/07/ciencias-publicoes.html |
| 68 | `4178223274276481353` | COMPRAR LA VANGUARDIA | DE COMPRAS | https://periodicosaliazon.blogspot.com/2026/07/comprar-la-vanguardia.html |
| 69 | `4699208739106385032` | MUNDO EL CONFIDENCIAL | INTERNACIONAL | https://periodicosaliazon.blogspot.com/2026/07/mundo-el-confidencial_01682336309.html |
| 70 | `6288962322497904548` | EMPRESAS EL CONFIDENCIAL | NEGOCIOS | https://periodicosaliazon.blogspot.com/2026/07/empresas-el-confidencial_0923548258.html |
| 71 | `3182964240575785014` | FINANZAS PERSONALES EL CONFIDENCIAL | ECONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/finanzas-personales-el-confidencial_01535614634.html |
| 72 | `1327861664941779026` | FONDOS DE INVERSIÓN EL CONFIDENCIAL | ECONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/fondos-de-inversion-abc.html |
| 73 | `7482395011557930404` | DINERO LA VANGUARDIA | ECONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/dinero-la-vanguardia.html |
| 74 | `7246681081516807962` | LIBROS EL DEBATE | CULTURA | https://periodicosaliazon.blogspot.com/2026/07/libros-el-debate.html |
| 75 | `7341228413435931465` | GENTE EL DEBATE | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/07/gente-el-debate.html |
| 76 | `1785523989887973726` | FINANZAS PERSONALES EL CONFIDENCIAL | ECONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/finanzas-personales-el-confidencial.html |
| 77 | `4755758052872179613` | EMPRESAS EL CONFIDENCIAL | NEGOCIOS | https://periodicosaliazon.blogspot.com/2026/07/empresas-el-confidencial.html |
| 78 | `3709945691261473253` | ARTE ABC | CULTURA | https://periodicosaliazon.blogspot.com/2026/07/arte-abc.html |
| 79 | `5551216972844987271` | SERIES LA VANGUARDIA | TELEVISIÓN | https://periodicosaliazon.blogspot.com/2026/07/series-la-vanguardia_0449931441.html |
| 80 | `5936354551759421040` | LIBROS, PELÍCULAS Y SERIES EL ORDEN MUNDIAL | TELEVISIÓN | https://periodicosaliazon.blogspot.com/2026/07/libros-peliculas-y-series-el-orden.html |
| 81 | `3658018699185025489` | VIAJES EL MUNDO | TURISMO | https://periodicosaliazon.blogspot.com/2026/07/viajes-el-mundo.html |
| 82 | `3726674824749890833` | ESTILO ABC | MODA | https://periodicosaliazon.blogspot.com/2026/07/estilo-abc.html |
| 83 | `225137365870373842` | CINE 20 MINUTOS | CULTURA | https://periodicosaliazon.blogspot.com/2026/07/cine-20-minutos.html |
| 84 | `6298234892206977425` | FEMINISMO NEWTRAL | IGUALDAD | https://periodicosaliazon.blogspot.com/2026/07/feminismo-newtral.html |
| 85 | `45726424855038221` | MAGAZINE LA VANGUARDIA | SUPLEMENTOS | https://periodicosaliazon.blogspot.com/2026/07/magazine-la-vanguardia.html |
| 86 | `5418777909681644885` | VIAJES LA VANGUARDIA | TURISMO | https://periodicosaliazon.blogspot.com/2026/07/viajes-la-vanguardia.html |
| 87 | `791007935365798364` | SERIES LA VANGUARDIA | TELEVISIÓN | https://periodicosaliazon.blogspot.com/2026/07/series-la-vanguardia.html |
| 88 | `1336493505405491616` | BIENESTAR EL CONFIDENCIAL | SALUD | https://periodicosaliazon.blogspot.com/2026/07/bienestar-el-confidencial.html |
| 89 | `4708323731607850203` | RECETAS EL CONFIDENCIAL | GASTRONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/recetas-el-confidencial.html |
| 90 | `5076631681085103607` | MERCADOS EL CONFIDENCIAL | ECONOMÍA | https://periodicosaliazon.blogspot.com/2026/07/mercados-el-confidencial.html |
| 91 | `8109374152115937911` | MUNDO EL CONFIDENCIAL | INTERNACIONAL | https://periodicosaliazon.blogspot.com/2026/07/mundo-el-confidencial.html |
| 92 | `6049381109001833370` | PORTADA EL CONFIDENCIAL | PORTADAS | https://periodicosaliazon.blogspot.com/2026/07/portada-el-confidencial_01482304645.html |
| 93 | `3090423924014609200` | GENTE EL PAÍS | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/07/gente-el-pais.html |
| 94 | `7628809082258091274` | VIAJES EN LA VANGUARDIA | TURISMO | https://periodicosaliazon.blogspot.com/2026/06/viajes-en-la-vanguardia.html |
| 95 | `462942689300168985` | ARTÍCULOS VOGUE | ARTÍCULOS | https://periodicosaliazon.blogspot.com/2026/04/articulos-vogue.html |
| 96 | `9049582775926538176` | GENTE EN LA VANGUARDIA | SOCIEDAD | https://periodicosaliazon.blogspot.com/2026/04/gente-en-la-vanguardia.html |
| 97 | `2550136822937815149` | EL VIAJERO EL PAÍS | TURISMO | https://periodicosaliazon.blogspot.com/2026/03/el-viajero-el-pais.html |
| 98 | `6012021357808603661` | Nacional en El Debate | ESPAÑA | https://periodicosaliazon.blogspot.com/2026/03/nacional-en-el-debate.html |
| 99 | `1877831912773273899` | NACIONAL EN ABC | ESPAÑA | https://periodicosaliazon.blogspot.com/2026/03/nacional-en-abc.html |
| 100 | `6581056411114699359` | NACIONAL EN 20 MINUTOS | ESPAÑA | https://periodicosaliazon.blogspot.com/2026/03/nacional-en-20-minutos.html |
| 101 | `5426994177947694280` | La Gran Brecha Digital | TELEVISIÓN | https://periodicosaliazon.blogspot.com/2025/12/la-gran-brecha-digital.html |
| 102 | `1790123566115990799` | Nota de Prensa: Principales Temas en la Prensa Rusa de la Última Semana | COMUNICADOS DE PRENSA | https://periodicosaliazon.blogspot.com/2025/11/nota-de-prensa-principales-temas-en-la.html |
| 103 | `441357696026553492` | Nota de Prensa: Lo Más Relevante Hoy en la Prensa Española | COMUNICADOS DE PRENSA | https://periodicosaliazon.blogspot.com/2025/11/nota-de-prensa-lo-mas-relevante-hoy-en.html |
| 104 | `8272056548518282242` | El Factor ESG y la Bolsa: ¿El Informe de Sostenibilidad de una Empresa Puede Desplomar sus Acciones? | NEGOCIOS | https://periodicosaliazon.blogspot.com/2025/10/el-factor-esg-y-la-bolsa-el-informe-de.html |
| 105 | `2461202024428521651` | El Pentágono frena a Ucrania: Washington restringe el uso de misiles de largo alcance para evitar una escalada | GUERRAS | https://periodicosaliazon.blogspot.com/2025/08/el-pentagono-frena-ucrania-washington.html |
| 106 | `7120944171650732270` | ¿La juventud europea en el frente? El dilema de la guerra en Ucrania y el futuro de la seguridad continental | GUERRAS | https://periodicosaliazon.blogspot.com/2025/08/la-juventud-europea-en-el-frente-el.html |
| 107 | `7578963696095061703` | Un ataque ucraniano provoca un incendio en la central nuclear de Kursk en Rusia | GUERRAS | https://periodicosaliazon.blogspot.com/2025/08/un-ataque-ucraniano-provoca-un-incendio.html |
| 108 | `2471732509273610971` | La amenaza de destrucción en Gaza: Un reflejo de la guerra sin límites | GUERRAS | https://periodicosaliazon.blogspot.com/2025/08/la-amenaza-de-destruccion-en-gaza-un.html |
| 109 | `5795350097770923215` | Aún no hemos cambiado nada, ¿por qué? | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/08/aun-no-hemos-cambiado-nada-por-que.html |
| 110 | `4727970413060250447` | ¿Se acerca la Tercera Guerra Mundial? | GUERRAS | https://periodicosaliazon.blogspot.com/2025/07/se-acerca-la-tercera-guerra-mundial.html |
| 111 | `3480777274633826444` | El sionismo y el adoctrinamiento social | ARTÍCULOS, OPINIÓN | https://periodicosaliazon.blogspot.com/2025/07/el-sionismo-y-el-adoctrinamiento-social.html |
| 112 | `3700996831912151947` | Medios israelíes: Israel considera una "ocupación militar total" de la Franja de Gaza. | GUERRAS | https://periodicosaliazon.blogspot.com/2025/07/medios-israelies-israel-considera-una.html |
| 113 | `4696751786804317717` | La importancia de la sororidad | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/07/la-importancia-de-la-sororidad.html |
| 114 | `1613824307829706327` | LA ABOLICIÓN DEL TRABAJO | EMPLEO | https://periodicosaliazon.blogspot.com/2025/07/la-abolicion-del-trabajo.html |
| 115 | `2858429965486443827` | Pensar en la democracia: una entrevista con Fatmagül Berktay | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/07/pensar-en-la-democracia-una-entrevista.html |
| 116 | `487004996417597518` | Se ha descubierto quién pudo haber influido en el repentino alto el fuego en Oriente Medio. | GUERRAS | https://periodicosaliazon.blogspot.com/2025/06/se-ha-descubierto-quien-pudo-haber.html |
| 117 | `3490613589480525174` | El jeque Qassem: La agresión estadounidense-israelí contra Irán no logró sus objetivos | GUERRAS | https://periodicosaliazon.blogspot.com/2025/06/el-jeque-qassem-la-agresion.html |
| 118 | `1828780071554180838` | La resolución demócrata para bloquear la acción militar en Irán no avanza en el Senado de EEUU | GUERRAS | https://periodicosaliazon.blogspot.com/2025/06/democratic-resolution-to-block-military.html |
| 119 | `1713891272548950809` | ¿Qué tan cerca estuvo Irán de fabricar una bomba nuclear? | GUERRAS | https://periodicosaliazon.blogspot.com/2025/06/que-tan-cerca-estuvo-iran-de-fabricar.html |
| 120 | `5495012589182659250` | Representación de la mujer y matriarcado: ¿otra posibilidad social? | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/04/representacion-de-la-mujer-y.html |
| 121 | `6540533909523979356` | Sobre “La mujer y el socialismo” de Bebel | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/04/sobre-la-mujer-y-el-socialismo-de-bebel.html |
| 122 | `5859812802172400204` | MUJERES Y FUERZAS ARMADAS | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/04/mujeres-y-fuerzas-armadas.html |
| 123 | `1253373141332414337` | Un ataque aéreo israelí mató al menos a 29 personas, incluidos niños, en una casa en Shejaia, en la ciudad de Gaza | GUERRAS | https://periodicosaliazon.blogspot.com/2025/04/un-ataque-aereo-israeli-mato-al-menos.html |
| 124 | `4887165952292960341` | FÚTBOL Y NEGOCIO ILEGAL DE APUESTAS | DEPORTES, NEGOCIOS | https://periodicosaliazon.blogspot.com/2025/04/futbol-y-negocio-ilegal-de-apuestas.html |
| 125 | `8777714870679566542` | ¿QUÉ DEBE HACER UN "MONO" CUANDO LOS TIGRES PELEAN? | GUERRAS | https://periodicosaliazon.blogspot.com/2025/04/que-debe-hacer-un-mono-cuando-los.html |
| 126 | `8437359521190313410` | Del feminismo a un nuevo humanismo | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/04/del-feminismo-un-nuevo-humanismo.html |
| 127 | `2768012929130890872` | POETAS Y ESCRITORAS COMPROMETIDAS | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/04/poetas-y-escritoras-comprometidas.html |
| 128 | `6407160053042630374` | (RE) POSICIONANDO EL FEMINISMO ISLÁMICO | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/04/re-posicionando-el-feminismo-islamico.html |
| 129 | `6602855665041380746` | FRANCMASONERÍA, REVOLUCIÓN FRANCESA Y APROPIACIONES IDEOLÓGICAS | CULTURA | https://periodicosaliazon.blogspot.com/2025/03/francmasoneria-revolucion-francesa-y.html |
| 130 | `726312834361014770` | VÍCTIMAS DE FEMINICIDIO EN MÉXICO | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/03/victimas-de-feminicidio-en-mexico.html |
| 131 | `2773844802447367969` | Geopolítica del fútbol | DEPORTES | https://periodicosaliazon.blogspot.com/2025/03/geopolitica-del-futbol.html |
| 132 | `1180511661289851125` | CATALUÑA EN DIARIO CRÍTICO | ESPAÑA | https://periodicosaliazon.blogspot.com/2025/03/cataluna-en-diario-critico.html |
| 133 | `3151576215417938712` | SOBRE LAS ESTAFAS BANCARIAS EN LA INDIA REALIZADAS POR IMPORTANTE EMPRESARIOS | ARTÍCULOS | https://periodicosaliazon.blogspot.com/2025/03/sobre-las-estafas-bancarias-en-la-india.html |
| 134 | `5889252484843183052` | MUJER EN PERIÓDICO PÚBLICO | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/03/mujer-en-periodico-publico.html |
| 135 | `6913934027885003305` | Cuanto más, más saludable: la diversidad de árboles reduce las plagas y los patógenos forestales | MEDIO AMBIENTE | https://periodicosaliazon.blogspot.com/2025/02/cuanto-mas-mas-saludable-la-diversidad.html |
| 136 | `8268132025567426500` | TURQUÍA: ZONGULDAK PRIMERA DIPUTADA NACIONAL ESTUDIOS PARLAMENTARIOS DE EDIBE SAYAR (1954-1957) | IGUALDAD | https://periodicosaliazon.blogspot.com/2025/02/zonguldak-primera-diputada-nacional.html |
| 137 | `253606339179185380` | LA INTELIGENCIA ARTIFICIAL GUIANDO AL PUEBLO | CULTURA | https://periodicosaliazon.blogspot.com/2025/02/la-inteligencia-artificial-guiando-al.html |
| 138 | `6586862041490276277` | PORTADA BBC | PORTADAS | https://periodicosaliazon.blogspot.com/2025/01/portada-bbc.html |
| 139 | `6179003535422019` | El tiempo es esencial: la importancia de considerar los ritmos biológicos en un mundo cada vez más contaminado | MEDIO AMBIENTE | https://periodicosaliazon.blogspot.com/2025/01/el-tiempo-es-esencial-la-importancia-de.html |
| 140 | `7251213462661851525` | ARTÍCULOS DE OPINIÓN CNN | ARTÍCULOS | https://periodicosaliazon.blogspot.com/2024/03/articulos-de-opinion-cnn.html |

Lista de postId cambiados (para copiar):

```
5221479010919545067 4327067634928666077 5178753558794941172 8153619486175821293 4987777047969566343 8578041262158738571 7689111069041981266 2643455556939256147 7777485752014110056 7529884508323273024 4717037663192743895 8919637580214457311 4004163660266656664 2350958289700939233 5035614121350534500 8110176686246448035 522547186824448083 2639058194062277722 734135920706740579 4030528549994163110 6721166633825908376 6276339132255844266 4192693094689387056 6920504704815640399 7902444593468250104 6984279282615755748 9125138972205353275 3341599077895340033 232722480439851569 733440063295380646 2704905172364818416 6871379309127359209 141086690306630432 2547318290884974521 4796310513693903004 2279727657844493540 2841596102095158459 1507296715899801942 9024980809418095936 6144909629886370211 1382989998663137361 8174782226914604690 4501370392900191207 4841688958010593116 8358873183054907584 5048261549413190922 3746811120257789592 7897467197284375988 2724279278256022490 7394763351727612978 1732074197581984278 2733948051040783322 3744129907815258750 7365929608208130172 8690175217961323357 6253865653111569119 1291200916148516491 5502559387822016230 2865335865743441273 6702131503981520830 1275976869468734974 2305597602048271810 9182721960747859736 5250555024500664327 3249079436835622609 1397602666413795711 1336891787429386164 4178223274276481353 4699208739106385032 6288962322497904548 3182964240575785014 1327861664941779026 7482395011557930404 7246681081516807962 7341228413435931465 1785523989887973726 4755758052872179613 3709945691261473253 5551216972844987271 5936354551759421040 3658018699185025489 3726674824749890833 225137365870373842 6298234892206977425 45726424855038221 5418777909681644885 791007935365798364 1336493505405491616 4708323731607850203 5076631681085103607 8109374152115937911 6049381109001833370 3090423924014609200 7628809082258091274 462942689300168985 9049582775926538176 2550136822937815149 6012021357808603661 1877831912773273899 6581056411114699359 5426994177947694280 1790123566115990799 441357696026553492 8272056548518282242 2461202024428521651 7120944171650732270 7578963696095061703 2471732509273610971 5795350097770923215 4727970413060250447 3480777274633826444 3700996831912151947 4696751786804317717 1613824307829706327 2858429965486443827 487004996417597518 3490613589480525174 1828780071554180838 1713891272548950809 5495012589182659250 6540533909523979356 5859812802172400204 1253373141332414337 4887165952292960341 8777714870679566542 8437359521190313410 2768012929130890872 6407160053042630374 6602855665041380746 726312834361014770 2773844802447367969 1180511661289851125 3151576215417938712 5889252484843183052 6913934027885003305 8268132025567426500 253606339179185380 6586862041490276277 6179003535422019 7251213462661851525
```

## Cómo deshacer un post

`restaurar_etiquetas` está desactivado. Para dejar un post como estaba, usa su copia completa en `migracion/backups/etiquetas/<postId>.json` (clave `post`, con content y etiquetas). Hazlo desde el editor de Blogger o con una corrección del script que reenvíe ese post íntegro. Nunca con `posts.patch` y `fetchBody=false`.
