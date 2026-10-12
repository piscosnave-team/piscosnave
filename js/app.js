/* ===================== CONFIGURACIÓN =====================
   Los valores editables (WHATSAPP y PRECIOS) viven en el bloque JSON #nave-config de index.html. */
window.NAVE_CONFIG = JSON.parse(document.getElementById('nave-config').textContent);
const PRECIOS = window.NAVE_CONFIG.PRECIOS;

/* ===================== MODO: única escritura de html[data-ready|data-modo|data-motivo] =====================
   data-ready se escribe una sola vez, cuando se decide el primer modo ('3d' o 'estatica'). data-modo puede pasar de '3d' a
   'estatica' después (contexto WebGL perdido, fallo en un fotograma) y nunca al revés sin recargar. data-motivo explica la versión
   estática: reduce, sin-gsap, sin-webgl, sin-modulo, error, desplazado, tiempo, contexto-perdido, apaisado (móvil en horizontal).
   El vigilante cubre lo que el módulo no puede contar: que no llegue a arrancar (sin-modulo) o que se quede esperando (tiempo). Su plazo
   corre desde que carga este script y no depende del evento load, que las propias texturas atascadas retrasarían. */
window.NAVE_MODO = (function(){
  const raiz = document.documentElement;
  const PLAZO = 12000;
  function fija(modo, motivo){
    const listo = raiz.hasAttribute('data-ready');
    if (listo && !(modo === 'estatica' && raiz.getAttribute('data-modo') === '3d')) return false;
    raiz.setAttribute('data-modo', modo);
    if (modo === 'estatica') raiz.setAttribute('data-motivo', motivo); else raiz.removeAttribute('data-motivo');
    if (!listo) raiz.setAttribute('data-ready', '');
    return true;
  }
  /* NAVE_3D lo pone el módulo como primera sentencia: si falta, el módulo (o three.js) no se cargó */
  const sinModulo = ()=>{ if (!window.NAVE_3D) fija('estatica', 'sin-modulo'); };
  addEventListener('load', sinModulo);
  setTimeout(()=>{ if (raiz.hasAttribute('data-ready')) return; sinModulo(); fija('estatica', 'tiempo'); }, PLAZO);
  return { fija, get listo(){ return raiz.hasAttribute('data-ready'); } };
})();

/* ===================== ARCOS (hornacinas) ===================== */
window.NAVE_ARCOS = (function(){
  let n = 0;
  const W = 400, H = 625, R = 200;
  const arco = i => `M${i} ${H} V${R} A${R-i} ${R-i} 0 0 1 ${W-i} ${R} V${H}`;
  /* mitades que nacen en la clave del arco y bajan por cada lado */
  const mitades = i => [`M${W/2} ${i} A${R-i} ${R-i} 0 0 0 ${i} ${R} V${H}`, `M${W/2} ${i} A${R-i} ${R-i} 0 0 1 ${W-i} ${R} V${H}`];
  const lleno = `M0 ${H} V${R} A${R} ${R} 0 0 1 ${W} ${R} V${H} Z`;
  const trazo = (i, color, ancho, clase) => mitades(i).map(d=>`<path class="${clase}" d="${d}" fill="none" stroke="${color}" stroke-width="${ancho}" pathLength="1"/>`).join('');
  function donaire(id){
    return `<defs><clipPath id="c${id}"><path d="${lleno}"/></clipPath>
      <radialGradient id="r${id}" cx="50%" cy="22%" r="80%"><stop offset="0" stop-color="#7a3349"/><stop offset=".6" stop-color="#572333"/><stop offset="1" stop-color="#3f1824"/></radialGradient></defs>
      <g clip-path="url(#c${id})"><rect width="${W}" height="${H}" fill="url(#r${id})"/>
        <g class="pliegues">
          <path d="M-60 ${H} L170 60 L215 60 L-10 ${H}Z" fill="#fff" opacity=".045"/>
          <path d="M120 ${H} L250 40 L300 40 L190 ${H}Z" fill="#fff" opacity=".035"/>
          <path d="M300 ${H} L330 80 L400 80 L400 ${H}Z" fill="#000" opacity=".08"/>
        </g>
        <ellipse cx="200" cy="${H-14}" rx="150" ry="16" fill="#000" opacity=".25"/>
      </g>
      <g class="franjas">${trazo(12,'#DC0A23',16,'f')}${trazo(27,'#FBFAF6',3,'f')}${trazo(36,'#DC0A23',4,'f')}${trazo(46,'#DC0A23',4,'f')}</g>`;
  }
  function sunqu(id){
    const filas = [['#D61F7A',34],['#120A10',6],['#1E8C46',18],['#120A10',6],['#2140B8',22],['#E8B21A',5],['#C0102A',30],['#F7F5F0',4],['#C0102A',30],['#E8B21A',5],['#2140B8',22],['#120A10',6],['#1E8C46',18],['#120A10',6],['#6B2FA0',26],['#120A10',10]];
    let y = -40, k = 0, bandas = '';
    while (y < H + 40){ for (const [c,h] of filas){ bandas += `<rect class="b${k++%2}" x="-120" y="${y}" width="${W+240}" height="${h}" fill="${c}"/>`; y += h; if (y > H + 40) break; } }
    let rombos = ''; for (let yy=230; yy<H; yy+=46){ for (let xx=88; xx<=312; xx+=56){ rombos += `<path d="M${xx} ${yy-14} L${xx+14} ${yy} L${xx} ${yy+14} L${xx-14} ${yy}Z" fill="none" stroke="#D7A0A6" stroke-opacity=".14" stroke-width="1.5"/>`; } }
    return `<defs><clipPath id="c${id}"><path d="${lleno}"/></clipPath>
      <mask id="m${id}"><path d="${lleno}" fill="#fff"/><path d="M58 ${H} V${R} A142 142 0 0 1 342 ${R} V${H}Z" fill="#000"/></mask>
      <radialGradient id="r${id}" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#3a1a33"/><stop offset="1" stop-color="#150b13"/></radialGradient></defs>
      <g clip-path="url(#c${id})"><rect width="${W}" height="${H}" fill="url(#r${id})"/>${rombos}
        <g class="tejido" mask="url(#m${id})">${bandas}</g>
        <path d="M58 ${H} V${R} A142 142 0 0 1 342 ${R} V${H}" fill="none" stroke="#E8B21A" stroke-width="2"/>
        <ellipse cx="200" cy="${H-14}" rx="140" ry="15" fill="#000" opacity=".35"/>
      </g>`;
  }
  function nii(id){
    let capas = '';
    for (let k=0;k<11;k++){ capas += trazo(14 + k*15, k%2 ? '#E0A060' : '#AD321C', k%2 ? 2.5 : 8, 'capa-l'); }
    return `<defs><clipPath id="c${id}"><path d="${lleno}"/></clipPath>
      <radialGradient id="r${id}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#47200f"/><stop offset="1" stop-color="#220c06"/></radialGradient></defs>
      <g clip-path="url(#c${id})"><rect width="${W}" height="${H}" fill="url(#r${id})"/><g class="capas">${capas}</g>
        <ellipse cx="200" cy="${H-14}" rx="130" ry="15" fill="#000" opacity=".35"/></g>`;
  }
  function presencia(){
    return `<path d="${arco(1)}" fill="none" stroke="#D7A0A6" stroke-opacity=".55" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
      <path d="${arco(18)}" fill="none" stroke="#D7A0A6" stroke-opacity=".22" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  }
  const tipos = {donaire, sunqu, nii, presencia};
  function montar(el, tipo){
    const id = 'a' + (n++);
    el.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${tipos[tipo](id)}</svg>`);
    return el.querySelector('svg');
  }
  /* movimiento propio de cada arco (p de 0 a 1) */
  function mover(svg, tipo, p){
    if (!svg) return;
    if (tipo === 'donaire'){
      svg.querySelectorAll('.f').forEach((f,i)=>{ const t = Math.min(1, Math.max(0, p*1.6 - Math.floor(i/2)*0.1)); f.style.strokeDasharray = '1'; f.style.strokeDashoffset = String(1 - t); });
      svg.querySelector('.pliegues').style.transform = `translateX(${(p-0.5)*-50}px) skewX(${(p-0.5)*-6}deg)`;
    } else if (tipo === 'sunqu'){
      svg.querySelectorAll('.tejido rect').forEach(r=>{ r.style.transform = `translateX(${(r.classList.contains('b0') ? 1 : -1)*(p-0.5)*90}px)`; });
    } else if (tipo === 'nii'){
      const ls = svg.querySelectorAll('.capa-l'), N = ls.length/2;
      ls.forEach((l,i)=>{ const k = Math.floor(i/2), t = Math.min(1, Math.max(0, p*1.7 - (N-1-k)/N*0.7)); l.style.strokeDasharray = '1'; l.style.strokeDashoffset = String(1 - t); });
    }
  }
  return {montar, mover};
})();


/* ===================== REGIONES: Perú (español, soles) y Unión Europea (inglés, euros) =====================
   El HTML está escrito en español. Cada región reemplaza los textos que cambian. */
window.NAVE_REGION = (function(){
  const PE = {
    '750 ml · 40 € · Caja incluida':`750 ml · S/ ${PRECIOS.pe.botella} · Caja incluida`,
    '40 €':`S/ ${PRECIOS.pe.botella}`,
    'Colección completa · 120 €':`Colección completa · S/ ${PRECIOS.pe.coleccion}`,
    'Pisco puro de quebranta · 750 ml · 40 € · Caja incluida':`Pisco puro de quebranta · 750 ml · S/ ${PRECIOS.pe.botella} · Caja incluida`,
    'Titular del sitio: [Nombre o razón social] · NIF: [NIF] · Domicilio: [Dirección] · Contacto: [correo electrónico].':'Titular del sitio: [Nombre o razón social] · RUC: [RUC] · Domicilio: [Dirección] · Contacto: [correo electrónico].',
    'Para recordar que has confirmado tu mayoría de edad, este sitio guarda esa preferencia en el almacenamiento local de tu navegador. No es necesario crear una cuenta ni rellenar un formulario para consultar la colección.':'Para recordar que confirmaste tu mayoría de edad, este sitio guarda esa preferencia en el almacenamiento local de tu navegador. No necesitas crear una cuenta ni llenar un formulario para ver la colección.'
  };
  const EU = {
    'Confirma que tienes 18 años o más para entrar.':'Please confirm you are 18 or older to enter.',
    'Tengo 18 años o más':'I am 18 or older',
    'Soy menor de 18':'I am under 18',
    'Bebe con moderación.':'Please drink responsibly.',
    'NAVE, inicio':'NAVE, home',
    'Principal':'Main',
    'Saltar al contenido':'Skip to content',
    'Ir al pedido':'Go to order',
    'Región y moneda':'Region and currency',
    'Colección':'Collection',
    'Nuestra historia':'Our story',
    'Pedidos':'Order',
    'NAVE Pisco Premium':'NAVE Premium Pisco',
    'Colección NAVE: Donaire, Sunqu y Nii, tres botellas con prendas hechas a mano.':'The NAVE collection: Donaire, Sunqu and Nii, three bottles dressed in handmade garments.',
    'El alma del Perú en cada gota':'The soul of Peru in every drop',
    'Pisco puro de quebranta, elaborado artesanalmente en Ica y vestido a mano por Nancy Ventura.':'Pure Quebranta pisco, handcrafted in Ica and dressed by hand by Nancy Ventura.',
    'Elegir mi edición':'Choose my edition',
    'Descubrir la colección':'Discover the collection',
    '750 ml · 40 € · Caja incluida':`750 ml · €${PRECIOS.eu.botella} · Gift box included`,
    'Sigue descubriendo':'Keep exploring',
    'Edición I · Costa':'Edition I · Coast',
    'Edición II · Sierra':'Edition II · Highlands',
    'Edición III · Selva':'Edition III · Rainforest',
    'La elegancia de encontrarnos.':'The elegance of coming together.',
    'Lo que llevamos dentro.':'What we carry within.',
    'La vida que nos conecta.':'The life that connects us.',
    'El porte del chalán y la gracia de la marinera inspiran Donaire: un homenaje a la costa en blanco y rojo.':'The bearing of the chalán horseman and the grace of the marinera dance inspire Donaire: a tribute to Peru’s coast in white and red.',
    'Nancy da forma al poncho y al chullo de Sunqu, una edición que celebra el color y los tejidos de la sierra.':'Nancy shapes the poncho and chullo of Sunqu, an edition that celebrates the colour and weaving of the Andes.',
    'Los tonos tierra, los trazos y el tocado de Nii evocan la selva. Una invitación a descubrir cada detalle.':'The earth tones, linework and headdress of Nii evoke the rainforest. An invitation to discover every detail.',
    'Elegante':'Elegant','Luminosa':'Luminous','Cercana':'Warm',
    'Serena':'Serene','Afectuosa':'Affectionate','Firme':'Steadfast',
    'Vital':'Vital','Contemplativa':'Contemplative','Curiosa':'Curious',
    'gracia y soltura en el movimiento.':'grace and ease in movement.',
    '«corazón» en quechua.':'“heart” in Quechua.',
    '«bosque» en shipibo-konibo.':'“forest” in Shipibo-Konibo.',
    '40 €':`€${PRECIOS.eu.botella}`,
    '750 ml · caja incluida':'750 ml · gift box included',
    'Pedir Donaire':'Order Donaire','Pedir Sunqu':'Order Sunqu','Pedir Nii':'Order Nii',
    'Tres ediciones. Un mismo pisco.':'Three editions. One pisco.',
    'Donaire, Sunqu y Nii comparten el mismo pisco puro de quebranta de Ica.':'Donaire, Sunqu and Nii share the same pure Quebranta pisco from Ica.',
    'Selecciona una edición':'Select an edition',
    'Colección completa · 120 €':`Full collection · €${PRECIOS.eu.coleccion}`,
    'Pedir por WhatsApp':'Order on WhatsApp',
    'Selecciona una edición o elige las tres. Cada botella incluye su caja.':'Select an edition or choose all three. Each bottle comes in its own gift box.',
    'Costa':'Coast','Sierra':'Highlands','Selva':'Rainforest',
    'Arrastra la botella para girarla':'Drag the bottle to turn it',
    'De Ica, con la firma de Nancy.':'From Ica, signed by Nancy.',
    'NAVE nace de Nancy Ventura y de su vínculo con Ica. El pisco de su chacra y las prendas que confecciona a mano se encuentran en una colección que celebra la costa, la sierra y la selva del Perú.':'NAVE was born from Nancy Ventura and her bond with Ica. The pisco from her farm and the garments she makes by hand come together in a collection that celebrates Peru’s coast, highlands and rainforest.',
    'Origen':'Origin',
    'El origen está en Ica.':'It all begins in Ica.',
    'Nuestro pisco se elabora artesanalmente en la chacra de Nancy. Es puro de uva quebranta: una sola variedad para las tres ediciones.':'Our pisco is handcrafted on Nancy’s farm. It is pure Quebranta: a single grape variety for all three editions.',
    'Autoría':'Authorship',
    'La firma es de Nancy.':'Signed by Nancy.',
    'Nacida en Ica, Nancy Ventura da nombre a NAVE y confecciona las prendas y los accesorios que visten cada botella.':'Born in Ica, Nancy Ventura gives NAVE its name and makes the garments and accessories that dress each bottle.',
    'Tres formas de vestir el Perú.':'Three ways to dress Peru.',
    'Donaire, Sunqu y Nii se distinguen por sus prendas, inspiradas en tres regiones del país. Cada presentación es una forma de acercarse al Perú a través del trabajo de Nancy.':'Donaire, Sunqu and Nii differ only in their garments, inspired by three regions of the country. Each one is a way to discover Peru through Nancy’s craft.',
    'Puro de uva quebranta':'Pure Quebranta grape',
    'Ica, Perú':'Ica, Peru',
    'Prendas':'Garments',
    'Hechas a mano por Nancy':'Handmade by Nancy',
    'Botella':'Bottle',
    'Manifiesto':'Manifesto',
    'Ica es nuestro punto de partida.':'Ica is where we begin.',
    'La quebranta, nuestra uva.':'Quebranta, our grape.',
    'Nancy, nuestra firma.':'Nancy, our signature.',
    'Cada prenda, una forma de contar el Perú.':'Each garment, a way to tell the story of Peru.',
    'Cada botella, una invitación a compartir.':'Each bottle, an invitation to share.',
    'El valor está en el origen del pisco y en las manos que visten cada botella.':'Its value lies in where the pisco comes from and in the hands that dress each bottle.',
    'Hecho en Ica. Vestido a mano.':'Made in Ica. Dressed by hand.',
    'Pisco puro de quebranta · 750 ml · 40 € · Caja incluida':`Pure Quebranta pisco · 750 ml · €${PRECIOS.eu.botella} · Gift box included`,
    'Pisco Premium · Ica, Perú':'Pisco Premium · Ica, Peru',
    'Escríbenos por WhatsApp':'Message us on WhatsApp',
    'Aviso legal':'Legal notice',
    'Privacidad':'Privacy',
    'Titular del sitio: [Nombre o razón social] · NIF: [NIF] · Domicilio: [Dirección] · Contacto: [correo electrónico].':'Site owner: [Name or company name] · Tax ID: [Tax ID] · Address: [Address] · Contact: [email].',
    'NAVE comercializa pisco, una bebida alcohólica. La venta está dirigida exclusivamente a personas de 18 años o más. Los pedidos se gestionan por WhatsApp. No se realizan pagos en este sitio.':'NAVE sells pisco, an alcoholic beverage. Sales are restricted to people aged 18 or over. Orders are handled on WhatsApp. No payments are made on this site.',
    'Los textos, el logotipo y las imágenes de este sitio pertenecen a su titular. No se permite su reproducción sin autorización.':'The texts, logo and images on this site belong to their owner and may not be reproduced without permission.',
    'Para recordar que has confirmado tu mayoría de edad, este sitio guarda esa preferencia en el almacenamiento local de tu navegador. No es necesario crear una cuenta ni rellenar un formulario para consultar la colección.':'To remember that you have confirmed your age, this site stores that preference in your browser’s local storage. You do not need an account or to fill in a form to browse the collection.',
    'Si nos escribes por WhatsApp, utilizamos los datos que nos facilites para atender tu consulta y gestionar tu pedido. Responsable: [Nombre o razón social]. Puedes solicitar el acceso, la rectificación o la supresión de tus datos en [correo electrónico].':'If you message us on WhatsApp, we use the details you share only to answer your enquiry and manage your order. Data controller: [Name or company name]. You can request access to, correction or deletion of your data at [email].',
    'NAVE · Pisco Premium. Todos los derechos reservados.':'NAVE · Pisco Premium. All rights reserved.',
    'Bebe con moderación. Venta exclusiva a personas de 18 años o más.':'Please drink responsibly. Sales restricted to people aged 18 or over.'
  };
  /* textos que genera el script */
  const JS = {
    pe: {
      lang:'es-PE', titulo:'NAVE | Pisco Premium de Ica, Perú',
      desc:'Descubre NAVE: pisco puro de quebranta elaborado artesanalmente en Ica y vestido a mano por Nancy Ventura. Tres ediciones: Donaire, Sunqu y Nii.',
      menor:'El acceso está reservado a personas de 18 años o más.',
      pedir:'Pedir por WhatsApp', pedirEd: ed=>`Pedir ${ed} por WhatsApp`, pedirTres:'Pedir las tres por WhatsApp',
      notaBase:'Selecciona una edición o elige las tres. Cada botella incluye su caja.',
      notaUna:`1 botella de 750 ml con caja · S/ ${PRECIOS.pe.botella}. Consulta las opciones de entrega.`,
      notaTres:`3 botellas de 750 ml, cada una con su caja · S/ ${PRECIOS.pe.coleccion}. Consulta las opciones de entrega.`,
      tres:'las tres ediciones (Donaire, Sunqu y Nii)',
      wa: ed=> ed ? `Hola, me interesa ${ed} de NAVE. ¿Me pueden confirmar la disponibilidad, el precio total y las opciones de entrega?` : 'Hola, me gustaría hacer un pedido de NAVE. ¿Qué ediciones tienen disponibles y cuáles son las opciones de entrega?'
    },
    eu: {
      lang:'en', titulo:'NAVE | Premium Pisco from Ica, Peru',
      desc:'Discover NAVE: pure Quebranta pisco, handcrafted in Ica and dressed by hand by Nancy Ventura. Three editions: Donaire, Sunqu and Nii.',
      menor:'Access is restricted to people aged 18 or over.',
      pedir:'Order on WhatsApp', pedirEd: ed=>`Order ${ed} on WhatsApp`, pedirTres:'Order all three on WhatsApp',
      notaBase:'Select an edition or choose all three. Each bottle comes in its own gift box.',
      notaUna:`1 bottle of 750 ml in its gift box · €${PRECIOS.eu.botella}. Ask about delivery options.`,
      notaTres:`3 bottles of 750 ml, each in its gift box · €${PRECIOS.eu.coleccion}. Ask about delivery options.`,
      tres:'all three editions (Donaire, Sunqu and Nii)',
      wa: ed=> ed ? `Hello, I’m interested in ${ed} from NAVE. Could you confirm availability, the total price and delivery options?` : 'Hello, I’d like to place an order with NAVE. Which editions are available and what are the delivery options?'
    }
  };
  const DIC = {pe: PE, eu: EU};
  /* recoge una vez los textos y atributos originales */
  const nodos = [], attrs = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {acceptNode: n => n.parentElement.closest('script,style,svg,noscript') || !n.nodeValue.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT});
  while (w.nextNode()) nodos.push({n: w.currentNode, orig: w.currentNode.nodeValue, clave: w.currentNode.nodeValue.trim()});
  document.querySelectorAll('[alt],[aria-label]').forEach(el=>['alt','aria-label'].forEach(a=>{ if (el.hasAttribute(a) && !el.closest('svg')) attrs.push({el, a, orig: el.getAttribute(a)}); }));
  let actual = 'pe';
  const oyentes = [];
  function aplica(r){
    actual = r; const d = DIC[r], j = JS[r];
    nodos.forEach(x=>{ const v = d[x.clave]; x.n.nodeValue = v ? x.orig.replace(x.clave, v) : x.orig; });
    attrs.forEach(x=>{ const v = d[x.orig]; x.el.setAttribute(x.a, v || x.orig); });
    document.documentElement.lang = j.lang; document.title = j.titulo;
    document.querySelector('meta[name="description"]').setAttribute('content', j.desc);
    document.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.region === r)));
    try { localStorage.setItem('nave-region', r); } catch(e){}
    oyentes.forEach(f=>f(r));
  }
  /* región inicial: enlace (?region=pe|eu), elección guardada o zona horaria del visitante */
  let ini = null;
  try { ini = new URLSearchParams(location.search).get('region'); } catch(e){}
  if (ini !== 'pe' && ini !== 'eu'){ try { ini = localStorage.getItem('nave-region'); } catch(e){} }
  if (ini !== 'pe' && ini !== 'eu'){ let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch(e){} ini = tz.startsWith('America/') ? 'pe' : 'eu'; }
  document.querySelectorAll('[data-region]').forEach(b=>b.addEventListener('click', ()=>{ if (b.dataset.region !== actual){ aplica(b.dataset.region); window.ScrollTrigger && ScrollTrigger.refresh(); } }));
  return { aplica, inicial: ini, get actual(){ return actual; }, t: k => JS[actual][k], alCambiar: f => oyentes.push(f) };
})();

/* ===================== Pedido por WhatsApp ===================== */
window.NAVE_WA = function(a, ed){
  const R = window.NAVE_REGION;
  const num = String((window.NAVE_CONFIG.WHATSAPP||{})[R.actual]||'').replace(/\D/g,'');
  const msg = R.t('wa')(ed);
  a.href = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`; a.target = '_blank'; a.rel = 'noopener noreferrer';
};
window.NAVE_ELECCION = -1;

/* ===================== Enlaces [data-ir] =====================
   Cada enlace trae un href real (sin JS salta al ancla). Un solo oyente delegado, instalado una vez aquí, decide al hacer
   clic: en 3D llama a la función que registra el módulo (NAVE_IR.alPin); en la versión estática se desplaza al destino del href. */
window.NAVE_IR = { alPin: null };
document.addEventListener('click', ev=>{
  const a = ev.target.closest && ev.target.closest('[data-ir]');
  if (!a || ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  ev.preventDefault();
  if (document.documentElement.classList.contains('con-3d') && NAVE_IR.alPin){ NAVE_IR.alPin(+a.dataset.ir); return; }
  const destino = document.getElementById((a.getAttribute('href') || '').slice(1));
  if (destino) destino.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
});
(function(){
  document.querySelectorAll('[data-wa]').forEach(a=>NAVE_WA(a, a.dataset.wa));
  document.getElementById('anio').textContent = new Date().getFullYear();
  document.querySelectorAll('[data-arco-mini]').forEach(el=>{ const s = NAVE_ARCOS.montar(el, el.dataset.arcoMini); NAVE_ARCOS.mover(s, el.dataset.arcoMini, 1); });
  /* las hornacinas del trío se montan aquí y no en el módulo 3D: la versión estática las necesita aunque three.js falle */
  document.querySelectorAll('.trio-arco').forEach(el=>{ const s = NAVE_ARCOS.montar(el, el.dataset.arco); NAVE_ARCOS.mover(s, el.dataset.arco, 1); });

  /* elección de edición: un solo botón de pedido que cambia según la botella elegida */
  const slots = [...document.querySelectorAll('.slot')], tres = document.getElementById('lasTres');
  const cta = document.getElementById('ctaPedido'), ctaT = document.getElementById('ctaTexto'), nota = document.getElementById('ctaNota');
  const T = k => NAVE_REGION.t(k);
  function elige(i){
    window.NAVE_ELECCION = i;
    document.getElementById('trioArcos').classList.toggle('con-eleccion', i >= 0 && i <= 2);
    slots.forEach((s,k)=>s.setAttribute('aria-pressed', String(i === 3 || i === k)));
    tres.setAttribute('aria-pressed', String(i === 3));
    if (i === -1){ ctaT.textContent = T('pedir'); nota.textContent = T('notaBase'); NAVE_WA(cta, ''); return; }
    const ed = i === 3 ? T('tres') : slots[i].dataset.ed;
    ctaT.textContent = i === 3 ? T('pedirTres') : T('pedirEd')(slots[i].dataset.ed);
    nota.textContent = i === 3 ? T('notaTres') : T('notaUna');
    NAVE_WA(cta, ed);
  }
  /* al cambiar de región: textos, precios y mensajes de WhatsApp */
  NAVE_REGION.alCambiar(()=>{ document.querySelectorAll('[data-wa]').forEach(a=>NAVE_WA(a, a.dataset.wa)); elige(window.NAVE_ELECCION); });
  NAVE_REGION.aplica(NAVE_REGION.inicial);
  slots.forEach((s,i)=>s.addEventListener('click', ()=>elige(window.NAVE_ELECCION === i ? -1 : i)));
  tres.addEventListener('click', ()=>elige(window.NAVE_ELECCION === 3 ? -1 : 3));

  /* avisos legales: cada enlace [data-abre] refleja en aria-expanded si su <details> está abierto; abrir uno cierra el otro */
  const paneles = [...document.querySelectorAll('.legal details')];
  const sincroniza = ()=>document.querySelectorAll('[data-abre]').forEach(a=>a.setAttribute('aria-expanded', String(document.getElementById(a.dataset.abre).open)));
  paneles.forEach(d=>d.addEventListener('toggle', sincroniza));
  document.querySelectorAll('[data-abre]').forEach(a=>a.addEventListener('click', ev=>{ ev.preventDefault(); paneles.forEach(d=>{ d.open = d.id === a.dataset.abre ? !d.open : false; }); sincroniza(); }));
  /* puerta de edad: la abre, la cierra y guarda el consentimiento el script de <head> de index.html; aquí solo el aviso a menores */
  document.getElementById('edad-no').addEventListener('click', ()=>{ document.getElementById('edad-msg').textContent = NAVE_REGION.t('menor'); });
})();
