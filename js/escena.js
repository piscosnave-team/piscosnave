import * as THREE from 'three';

window.NAVE_3D = 'iniciando'; // el vigilante de js/app.js distingue así «el módulo no arrancó» de «arrancó y se quedó esperando»
const MODO = window.NAVE_MODO;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsap = window.gsap, ST = window.ScrollTrigger, ARC = window.NAVE_ARCOS;
const mobile = () => innerWidth < 900;
/* Móviles en horizontal (U-06, decisión f1): la etapa fijada mide lo que la pantalla y recorta el botón de pedido, así que usan la
   versión estática. La consulta también coincide con una ventana de escritorio baja (alto <= 500 px y más ancha que alta): ahí también
   se sirve la versión estática, sin 3D. */
const apaisado = matchMedia('(max-height:500px) and (orientation:landscape)');
const clamp01 = x => Math.min(1, Math.max(0, x));
const sstep = (a,b,x)=>{ const t = clamp01((x-a)/(b-a)); return t*t*(3-2*t); };
const lerp = (a,b,t)=>a+(b-a)*t;
const etapa = document.getElementById('inicio');
const html = document.documentElement;
const trioArcosEl = [...document.querySelectorAll('.trio-arco')];

/* La página se sirve en su versión estática (.estatica en el HTML); este módulo solo la sustituye por la 3D cuando todo lo que
   puede fallar ya salió bien (ver mejora() al final). Estado compartido con aEstatica(), que vuelve atrás si algo falla después. */
let st = null, renderer = null, activo = false, bucleActivo = false, raf = 0, etapaEnVista = true, observaEtapa = null;
const ESTILOS_3D = '.intro-a > *, .intro-b > *, .h-texto, .h-arco, .desliza, .luz, .nichos, .nicho, .nombre-fondo, .ed-texto, .ed-texto > *, .trio-cabeza, .trio-cabeza > *, .trio-arcos, .trio-arco, .trio-arco .respaldo, .slot .etiqueta, .trio-pie, .trio-pie > *, .pasos, .arrastra, .zona-arrastre';

/* Vuelve a la versión estática: para el bucle, mata el pin, borra los estilos en línea que escribió la escena 3D y suelta WebGL */
function aEstatica(motivo){
  activo = false;
  bucleActivo = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  html.dataset.bucle = 'pausado';
  observaEtapa?.disconnect();
  observaEtapa = null;
  gsap.killTweensOf('.intro-a > *, .intro-b > *');
  if (st){ st.kill(true); st = null; }
  document.querySelectorAll(ESTILOS_3D).forEach(el=>el.removeAttribute('style'));
  etapa.classList.add('estatica');
  html.classList.remove('con-3d');
  ST.refresh();
  if (renderer) renderer.dispose();
  MODO.fija('estatica', motivo);
}

/* Todo el trabajo 3D vive en este bloque etiquetado: se sale con `break inicio` (sin GSAP, movimiento reducido, sin WebGL) y
   cualquier fallo cae en el catch del final, que deja la versión estática. */
inicio: try {
if (!gsap || !ST){ MODO.fija('estatica', 'sin-gsap'); break inicio; }
gsap.registerPlugin(ST);

if (!apaisado.matches) try { renderer = new THREE.WebGLRenderer({canvas:document.getElementById('escena'), antialias:true, alpha:true, powerPreference:'high-performance'}); } catch(e){ renderer = null; }

/* textos fuera de la etapa: aparecen con el scroll */
/* cada texto entra desde abajo al aparecer y sale hacia arriba al irse, siempre ligado al scroll */
if (!reduce) gsap.utils.toArray('[data-r]').forEach(el=>{
  const tl = gsap.timeline({scrollTrigger:{trigger:el, start:'top 96%', end:'bottom 4%', scrub:0.6, refreshPriority:-1}});
  tl.fromTo(el, {opacity:0, y:46, filter:'blur(10px)'}, {opacity:1, y:0, filter:'blur(0px)', duration:0.28, ease:'power2.out'})
    .to(el, {opacity:1, duration:0.44})
    .to(el, {opacity:0, y:-46, filter:'blur(10px)', duration:0.28, ease:'power2.in'});
});

if (reduce){ MODO.fija('estatica', 'reduce'); break inicio; }
if (apaisado.matches){ MODO.fija('estatica', 'apaisado'); break inicio; } // sin renderer: no se llegó a crear un contexto WebGL
if (!renderer){ MODO.fija('estatica', 'sin-webgl'); break inicio; }
renderer.domElement.addEventListener('webglcontextlost', ev=>{ ev.preventDefault(); aEstatica('contexto-perdido'); });
/* al girar el móvil con la escena 3D activa se deshace igual que con el contexto perdido (la vuelta a vertical no la restaura: hasta recargar) */
apaisado.addEventListener('change', ()=>{ if (apaisado.matches && activo) aEstatica('apaisado'); });
addEventListener('resize', ()=>{ if (apaisado.matches && activo) aEstatica('apaisado'); }); // algunos navegadores no emiten MediaQueryList.change al rotar
/* al confirmar la edad desaparece el bloqueo de scroll de la puerta: ScrollTrigger recalcula */
addEventListener('nave:edad-ok', ()=>ST.refresh());

/* ===================== ETAPA FIJADA =====================
   P de 0 a 5: 0-1 presencia y apertura del arco de luz, 1-2 Donaire, 2-3 Sunqu, 3-4 Nii, 4-5 las tres juntas. */
const FIN = 5;
const P = ()=> st.progress*FIN;
/* el oyente delegado de [data-ir] (js/app.js) llama a esta función mientras la escena está en 3D */
window.NAVE_IR.alPin = v=>{
  const destino = st.start + (st.end - st.start)*(v/FIN);
  scrollTo({top: destino, behavior: Math.abs(scrollY - destino) > innerHeight*3 ? 'auto' : 'smooth'});
};

/* Los controles de la etapa nunca se ocultan con visibility (siguen en el orden de Tab y en el árbol de accesibilidad); fuera de su
   segmento solo pierden el puntero. Al enfocar uno con el teclado, la página salta al segmento donde se ve: hero P=0, edición k
   P=k+1.5, las tres juntas P=4.75. Un enfoque nacido de un puntero no salta: moverse entre pulsar y soltar perdería el clic. */
function segmentoDe(el){
  const art = el.closest('.ed-texto');
  if (el.closest('.h-texto')) return 0;
  if (art) return [...document.querySelectorAll('.ed-texto')].indexOf(art) + 1.5;
  return el.closest('#trioArcos, #trioPie') ? 4.75 : null;
}
function irAlSegmento(el){
  if (!st) return;
  const v = segmentoDe(el);
  if (v !== null) scrollTo({top: st.start + (st.end - st.start)*(v/FIN), behavior: 'instant'});
}
let puntero = false, sueltaPuntero = 0;
addEventListener('pointerdown', ()=>{ puntero = true; clearTimeout(sueltaPuntero); }, true);
const alSoltar = ()=>{ sueltaPuntero = setTimeout(()=>{ puntero = false; }, 500); };
addEventListener('pointerup', alSoltar, true); addEventListener('pointercancel', alSoltar, true);
etapa.addEventListener('focusin', ev=>{ if (!puntero) irAlSegmento(ev.target); });
/* «Ir al pedido»: el ancla nativa no llega al último paso de la etapa fijada; se enfoca el primer botón y se va a su segmento */
document.querySelector('.salto[href="#trioArcos"]').addEventListener('click', ev=>{
  if (!st) return;
  ev.preventDefault();
  const primero = document.querySelector('.slot');
  primero.focus({preventScroll: true});
  irAlSegmento(primero);
});

ARC.montar(document.getElementById('hArco'), 'presencia');
const nichos = [...document.querySelectorAll('.nicho')];
const arcos = nichos.map(n=>ARC.montar(n, n.dataset.arco));
const nombresF = [...document.querySelectorAll('.nombre-fondo')];
const textos = [...document.querySelectorAll('.ed-texto')].map(t=>({el:t, hijos:[...t.children]}));
const trioCab = document.getElementById('trioCabeza'), trioPie = document.getElementById('trioPie'), trioArcos = document.getElementById('trioArcos');
const etiquetas = [...document.querySelectorAll('.slot .etiqueta')];
const pasos = document.getElementById('pasos'), marcas = [...pasos.children], arrastra = document.getElementById('arrastra');
const hTexto = document.getElementById('hTexto'), desliza = document.getElementById('desliza'), hArcoEl = document.getElementById('hArco');
const luz = document.getElementById('luz'), hCaja = document.getElementById('hCaja'), nichosEl = document.getElementById('nichos'), zona = document.getElementById('zonaArrastre');

gsap.from('.intro-a > *, .intro-b > *', {opacity:0, y:28, filter:'blur(6px)', duration:1.1, ease:'expo.out', stagger:0.08, delay:0.15, clearProps:'filter'});

/* revela una lista de elementos en cascada según el scroll */
/* cada línea entra desde abajo y, al salir, sube y se desvanece una tras otra */
function cascada(hijos, e, desde, paso, hasta){
  hijos.forEach((h,i)=>{
    const a = desde + i*paso, vin = sstep(a, a + 0.16, e);
    const vout = hasta == null ? 0 : sstep(hasta + i*0.022, hasta + i*0.022 + 0.13, e);
    const v = vin*(1 - vout), b = Math.max(1 - vin, vout);
    h.style.opacity = v; h.style.transform = `translate3d(0,${((1-vin)*40 - vout*40).toFixed(1)}px,0)`;
    h.style.filter = b < 0.01 ? 'none' : `blur(${(b*9).toFixed(1)}px)`;
  });
}
function pintaDom(p){
  const W = innerWidth, H = innerHeight, e = p - 1;
  /* presencia */
  const ht = 1 - sstep(0.04, 0.3, p);
  hTexto.style.opacity = ht; hTexto.style.pointerEvents = ht > 0.5 ? 'auto' : 'none';
  hTexto.style.transform = `translate3d(0,${(1-ht)*-30}px,0)`;
  desliza.style.opacity = 1 - sstep(0, 0.1, p);
  hArcoEl.style.opacity = 1 - sstep(0.15, 0.4, p);
  /* luz: crece desde la base del arco hasta llenar la pantalla */
  const r = hCaja.getBoundingClientRect();
  const aw = Math.min(r.width, r.height*0.64), ax = r.left + r.width/2;
  const a1 = sstep(0.18, 0.55, p), a2 = sstep(0.5, 0.95, p), half = aw/2*a1;
  const top = lerp(lerp(r.bottom, r.top, a1), 0, a2), bottom = lerp(H - r.bottom, 0, a2);
  const left = lerp(ax - half, 0, a2), right = lerp(W - ax - half, 0, a2), rad = lerp(half, 0, a2);
  luz.style.clipPath = a1 <= 0 ? 'inset(100% 50% 0 50%)' : `inset(${top}px ${right}px ${bottom}px ${left}px round ${rad}px ${rad}px 0 0)`;

  /* ediciones: el arco nuevo sube como un telón sobre el anterior */
  for (let k=0;k<3;k++){
    const entra = k===0 ? sstep(-0.25, 0.05, e) : sstep(k-0.18, k+0.06, e);
    nichos[k].style.opacity = entra > 0.001 ? 1 : 0;
    nichos[k].style.zIndex = k;
    nichos[k].style.clipPath = k===0 ? `inset(${(1-entra)*100}% 0 0 0 round 50% 50% 0 0 / 32% 32% 0 0)` : `inset(${(1-entra)*100}% 0 0 0)`;
    ARC.mover(arcos[k], nichos[k].dataset.arco, clamp01((e - k + 0.2)/1.1));
    const salida = sstep(k+0.66, k+0.92, e);
    const t = textos[k];
    cascada(t.hijos, e, k===0 ? -0.1 : k-0.02, 0.045, k+0.62);
    const vis = sstep(k-0.1, k+0.1, e)*(1 - salida);
    t.el.style.pointerEvents = vis > 0.5 ? 'auto' : 'none';
    nombresF[k].style.opacity = vis*0.9;
    nombresF[k].style.transform = `translate3d(${-8 - (e-k)*22}vw,0,0)`;
  }
  /* las tres: el arco de Nii viaja a su lugar y llegan las otras dos con el mismo telón */
  trioArcos.style.pointerEvents = e > 3.3 ? 'auto' : 'none';
  const viaje = sstep(3.0, 3.5, e);
  const rTrio = trioArcosEl.map(el=>el.getBoundingClientRect());
  if (viaje > 0){
    const s3 = rTrio[2], ox = nichosEl.offsetLeft, oy = nichosEl.offsetTop, oh = nichosEl.offsetHeight;
    nichosEl.style.transform = `translate3d(${(s3.left - ox)*viaje}px,${(s3.top - oy)*viaje}px,0) scale(${lerp(1, s3.height/oh, viaje)})`;
  } else nichosEl.style.transform = '';
  nichosEl.style.opacity = 1 - sstep(0.96, 1, viaje);
  const rev = [sstep(3.1, 3.4, e), sstep(3.2, 3.5, e), sstep(0.94, 1, viaje)];
  trioArcosEl.forEach((el,i)=>{ el.style.opacity = rev[i] > 0.001 ? 1 : 0; el.style.clipPath = i===2 || rev[i] > 0.999 ? 'none' : `inset(${(1-rev[i])*100}% 0 0 0)`; });
  cascada(etiquetas, e, 3.4, 0.05);
  cascada([...trioCab.children], e, 3.15, 0.06);
  cascada([...trioPie.children], e, 3.45, 0.05);
  /* ya colocadas, las botellas del trío pasan a imagen para que el enfoque y desenfoque las afecte */
  const fijo = sstep(3.56, 3.7, e);
  trioArcosEl.forEach(el=>{ el.querySelector('.respaldo').style.opacity = fijo; });
  trioCab.style.pointerEvents = trioPie.style.pointerEvents = e > 3.3 ? 'auto' : 'none';

  const activo = Math.max(0, Math.min(2, Math.floor(e + 0.1)));
  marcas.forEach((m,i)=>m.classList.toggle('activo', i===activo));
  const enCol = sstep(0.85, 1.0, p)*(1 - sstep(2.85, 3.0, e));
  pasos.style.opacity = enCol; arrastra.style.opacity = enCol;
  zona.style.display = enCol > 0.5 ? 'block' : 'none';
  if (enCol > 0.5){ const nr = nichosEl.getBoundingClientRect(); Object.assign(zona.style, {left:nr.left+'px', top:nr.top+'px', width:nr.width+'px', height:nr.height+'px'}); }
  return {trio: rTrio, rev, fijo};
}

/* ===================== 3D ===================== */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(26, innerWidth/innerHeight, 0.1, 100);
const CAMZ = 10; camera.position.set(0, 0, CAMZ);
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile() ? 1.75 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
scene.add(new THREE.HemisphereLight(0xfffaf4, 0x6a4550, 1.25));
const key = new THREE.DirectionalLight(0xffffff, 1.15); key.position.set(2.5, 3.5, 6); scene.add(key);
const rim = new THREE.DirectionalLight(0xD7A0A6, 1.6); rim.position.set(-5, 3, -4); scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xfff0e6, 1.0); rim2.position.set(5, 1.5, -3); scene.add(rim2);
const brilloLuz = new THREE.PointLight(0xffffff, 6, 8, 2); scene.add(brilloLuz);

const MOD = JSON.parse(document.getElementById('modelos').textContent);
/* texturas: solo URLs; el navegador las pide en tex() más abajo, cuando el renderer WebGL ya existe */
const TEX = JSON.parse(document.getElementById('texturas').textContent);
const loader = new THREE.TextureLoader();
const tex = (u, srgb=true)=>new Promise((res,rej)=>loader.load(u, t=>{ if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); res(t); }, undefined, rej));
const S = 2.55/1000, SUELO = 1012, MITAD = 1.25, ROW = 4, SEG = 96, ALTO = 2.62;
/* La fotografía es frontal: la botella gira como máximo ~30° para no mostrar nunca el costado */
const GIRO_MAX = 0.52;
const limita = x => GIRO_MAX*Math.tanh(x/GIRO_MAX);

/* Volumen a partir de la silueta real: radio izquierdo y derecho por fila y la fotografía proyectada de frente. */
function geometria(m){
  const H = m.height, texW = m.halfWidth*2, L = m.left, R = m.right;
  const ys = []; for (let y=0;y<H;y+=ROW) ys.push(y); if (ys[ys.length-1] !== H-1) ys.push(H-1);
  const filas = [{y:ys[0],l:0,r:0}, ...ys.map(y=>({y,l:L[y],r:R[y]})), {y:ys[ys.length-1],l:0,r:0}];
  const pos=[], uv=[], idx=[];
  for (const f of filas){
    const prof = (f.l + f.r)*0.5*0.7;
    for (let j=0;j<=SEG;j++){
      const th = Math.PI + j/SEG*Math.PI*2, sn = Math.sin(th);
      const x = sn < 0 ? sn*f.l : sn*f.r, z = Math.cos(th)*prof;
      /* el canto toma color de un píxel ya dentro de la silueta, nunca del borde recortado */
      const ux = Math.sign(x)*Math.max(0, Math.abs(x) - 3);
      pos.push(x*S, (SUELO-(m.top+f.y))*S - MITAD, z*S);
      uv.push(0.5 + ux/texW, 1 - (f.y+0.5)/H);
    }
  }
  for (let i=0;i<filas.length-1;i++) for (let j=0;j<SEG;j++){ const a=i*(SEG+1)+j, b=a+SEG+1; idx.push(a,b,a+1, b,b+1,a+1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos,3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function canvasTex(w, h, pinta){ const c = document.createElement('canvas'); c.width = w; c.height = h; pinta(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); }
const sombraT = canvasTex(128,128,(x)=>{ const g=x.createRadialGradient(64,64,0,64,64,64); g.addColorStop(0,'rgba(0,0,0,.6)'); g.addColorStop(.55,'rgba(0,0,0,.2)'); g.addColorStop(1,'rgba(0,0,0,0)'); x.fillStyle=g; x.fillRect(0,0,128,128); });
const reflejoT = canvasTex(4,256,(x,w,h)=>{ const g=x.createLinearGradient(0,0,0,h); g.addColorStop(0,'#000'); g.addColorStop(.62,'#000'); g.addColorStop(1,'#fff'); x.fillStyle=g; x.fillRect(0,0,w,h); });
const gotaT = canvasTex(32,128,(x,w,h)=>{ const g=x.createLinearGradient(0,0,0,h); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(.75,'rgba(255,255,255,.55)'); g.addColorStop(1,'rgba(255,255,255,1)'); x.fillStyle=g; x.beginPath(); x.ellipse(w/2,h/2,3,h/2,0,0,Math.PI*2); x.fill(); });

const nombres = ['donaire','sunqu','nii'];
const recursos = {};
await Promise.all(nombres.map(async n=>{
  const m = MOD[n];
  const [body, brillo, extra] = await Promise.all([tex(TEX[n+'-body']), tex(TEX[n+'-brillo'], false), m.extra ? tex(TEX[n+'-extra']) : null]);
  recursos[n] = {m, body, brillo, extra, geo: geometria(m)};
}));

function vestir(n, conReflejo){
  const {m, body, brillo, extra, geo} = recursos[n];
  const grupo = new THREE.Group(), mats = [], refl = [];
  const mb = new THREE.MeshPhysicalMaterial({map:body, alphaTest:0.5, side:THREE.DoubleSide, roughness:0.6, clearcoat:1, clearcoatRoughness:0.05, clearcoatMap:brillo}); mats.push(mb);
  grupo.add(new THREE.Mesh(geo, mb));
  if (extra){
    const me = new THREE.MeshStandardMaterial({map:extra, alphaTest:0.4, side:THREE.DoubleSide, roughness:0.85}); mats.push(me);
    const plano = new THREE.Mesh(new THREE.PlaneGeometry(m.halfWidth*2*S, m.height*S), me);
    plano.position.y = (SUELO-(m.top+m.height/2))*S - MITAD; grupo.add(plano);
  }
  if (conReflejo){
    const espejo = new THREE.Group(); espejo.scale.y = -1; espejo.position.y = -2*MITAD;
    const rm = new THREE.MeshBasicMaterial({map:body, alphaMap:reflejoT, transparent:true, opacity:.32, depthWrite:false, side:THREE.DoubleSide, color:0xb08890});
    espejo.add(new THREE.Mesh(geo, rm)); refl.push(rm); grupo.add(espejo);
  }
  return {grupo, mats, refl};
}
function opacidad(mats, a){ mats.forEach(m=>{ m.transparent = a < 0.999; m.opacity = a; }); }
function botella(lista, conReflejo){
  const g = new THREE.Group(), giro = new THREE.Group(); g.add(giro);
  const trajes = lista.map((n,i)=>{ const v = vestir(n, conReflejo && i===0); v.grupo.visible = i===0; giro.add(v.grupo); return v; });
  const sm = new THREE.MeshBasicMaterial({map:sombraT, transparent:true, depthWrite:false});
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1.8,0.5), sm); s.rotation.x = -Math.PI/2; s.position.y = -MITAD - 0.004; g.add(s);
  scene.add(g);
  return {g, giro, trajes, sombra: sm, actual: 0, esc: 1};
}

const prota = botella(nombres, true);                       // Donaire → Sunqu → Nii
const acomp = [botella(['sunqu'], true), botella(['nii'], true)];  // presencia
const trioB = [botella(['donaire'], false), botella(['sunqu'], false)]; // las tres juntas

const NG = mobile() ? 70 : 140;
const gg = new THREE.BufferGeometry(), gp = new Float32Array(NG*3), gv = new Float32Array(NG);
for (let i=0;i<NG;i++){ gp[i*3] = (Math.random()-.5)*6; gp[i*3+1] = (Math.random()-.5)*5; gp[i*3+2] = (Math.random()-.5)*3 - 0.6; gv[i] = 0.25 + Math.random()*0.6; }
gg.setAttribute('position', new THREE.BufferAttribute(gp,3));
const gmat = new THREE.PointsMaterial({size:0.11, map:gotaT, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, color:0xF2C9CE, opacity:.75});
const gotas = new THREE.Points(gg, gmat); scene.add(gotas);

let arrastre = 0, vel = 0, tomando = false, ultX = 0, mx = 0, my = 0;
zona.addEventListener('pointerdown', e=>{ tomando = true; ultX = e.clientX; vel = 0; zona.setPointerCapture?.(e.pointerId); });
addEventListener('pointermove', e=>{ mx = e.clientX/innerWidth*2-1; my = e.clientY/innerHeight*2-1; if (!tomando) return; const d = (e.clientX-ultX)*0.008; ultX = e.clientX; arrastre += d; vel = d; }, {passive:true});
const suelta = ()=>{ tomando = false; }; addEventListener('pointerup', suelta); addEventListener('pointercancel', suelta);

const vista = ()=>{ const vh = 2*CAMZ*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)); return {vh, vw: vh*camera.aspect}; };
const aMundo = (px, py)=>{ const {vh, vw} = vista(); return {x:(px/innerWidth - 0.5)*vw, y:-(py/innerHeight - 0.5)*vh}; };
function enCaja(r, cx, fAlto){
  const {vh} = vista(), s = (r.height*fAlto/innerHeight)*vh/ALTO;
  const base = aMundo(cx, r.bottom - r.height*0.035);
  return {x:base.x, y:base.y + MITAD*s, s};
}
function ajusta(){ renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', ajusta); ajusta();

const reloj = new THREE.Clock(); let intro = 0;
function frame(){
  const dt = Math.min(reloj.getDelta(), 0.05), t = reloj.elapsedTime;
  intro = Math.min(1, t*0.7);
  const ei = 1 - Math.pow(1 - intro, 3);
  const p = P(), e = p - 1, mov = mobile();
  const dom = pintaDom(p);
  if (!tomando){ arrastre += vel; vel *= 0.88; arrastre = lerp(arrastre, 0, 1 - Math.exp(-dt*2)); }
  arrastre = Math.max(-1.2, Math.min(1.2, arrastre));

  const rEt = etapa.getBoundingClientRect(), {vh, vw} = vista();
  const desp = -(rEt.top/innerHeight)*vh;
  const vivaEtapa = rEt.bottom > innerHeight*0.04;
  const rH = hCaja.getBoundingClientRect(), rN = nichosEl.getBoundingClientRect();
  const cxs = [0.17, 0.5, 0.83], alturas = mov ? [0.78, 0.88, 0.8] : [0.74, 0.84, 0.76];
  const hero = [0,1,2].map(i=>enCaja(rH, rH.left + rH.width*cxs[i], alturas[i]));
  const nicho = enCaja(rN, rN.left + rN.width/2, 0.86);
  const viaje = sstep(0.12, 0.98, p), salida = sstep(0.06, 0.5, p);

  /* protagonista: al cambiar de edición se hunde en su arco y sube con la vestimenta nueva */
  let baja = 0, alfa = 1;
  const traje = e < 1 ? 0 : e < 2 ? 1 : 2;
  for (const k of [1,2]){ const d = e - k; if (d > -0.2 && d < 0){ const q = sstep(-0.16, 0, d); baja = q; alfa = 1 - q; } if (d >= 0 && d < 0.2){ const q = 1 - sstep(0, 0.16, d); baja = q; alfa = 1 - q; } }
  if (traje !== prota.actual){ prota.trajes[prota.actual].grupo.visible = false; prota.trajes[traje].grupo.visible = true; prota.actual = traje; }
  const pos = {x: lerp(hero[0].x, nicho.x, viaje), y: lerp(hero[0].y, nicho.y, viaje), s: lerp(hero[0].s, nicho.s, viaje)};
  const balanceo = Math.sin(t*0.5)*0.26 - 0.28;
  const quieta = 1 - sstep(3.38, 3.56, e);
  const vaiven = e > 0 && e < 3 ? 0.4*Math.sin(Math.PI*2*e) : Math.sin(t*0.5)*0.14*quieta;
  prota.g.position.set(pos.x, pos.y + desp + (1-ei)*-0.4 - baja*pos.s*0.9, 0.15*(1-viaje));
  prota.g.scale.setScalar(pos.s*(0.82 + 0.18*ei));
  prota.giro.rotation.y = limita(lerp(balanceo, 0, viaje) + vaiven + arrastre*quieta) + (1-ei)*-1.2;
  prota.g.rotation.x = my*0.04;
  const alfaP = alfa*(1 - dom.fijo);
  prota.trajes.forEach(tr=>opacidad(tr.mats, alfaP));
  prota.sombra.opacity = alfaP;
  prota.trajes[0].refl.forEach(m=>m.opacity = 0.32*(1 - sstep(0.05, 0.35, p)));
  prota.g.visible = vivaEtapa && alfaP > 0.01;

  acomp.forEach((a,j)=>{
    const i = j+1, h = hero[i];
    a.g.position.set(h.x + salida*(i===1 ? 0.6 : 1.4)*vw*0.5, h.y + desp + (1-ei)*-0.4, i===1 ? 0.3 : 0);
    a.g.scale.setScalar(h.s*(0.82 + 0.18*ei)*(1 - salida*0.15));
    a.giro.rotation.y = Math.sin(t*0.5 + i*1.9)*0.26 + (i-1)*-0.28 + (1-ei)*-1.2;
    opacidad(a.trajes[0].mats, 1 - salida); a.sombra.opacity = 1 - salida;
    a.trajes[0].refl.forEach(m=>m.opacity = 0.32*(1 - sstep(0.05, 0.35, p)));
    a.g.visible = salida < 0.98 && vivaEtapa;
  });

  trioB.forEach((b,i)=>{
    const r = dom.trio[i], q = dom.rev[i], c = enCaja(r, r.left + r.width/2, 0.86);
    const a = q*(1 - dom.fijo);
    b.g.position.set(c.x, c.y + desp - (1-q)*c.s*0.9, 0);
    b.g.scale.setScalar(c.s);
    b.giro.rotation.y = limita(Math.sin(t*0.5 + i*1.7)*0.22)*quieta;
    opacidad(b.trajes[0].mats, a); b.sombra.opacity = a;
    b.g.visible = a > 0.01 && vivaEtapa;
  });

  const ga = 1 - sstep(0.1, 0.4, p);
  gmat.opacity = 0.75*ga; gotas.visible = ga > 0.01;
  const ar = gg.attributes.position.array;
  for (let i=0;i<NG;i++){ ar[i*3+1] -= dt*gv[i]*0.5; if (ar[i*3+1] < -2.6) ar[i*3+1] = 2.6; }
  gg.attributes.position.needsUpdate = true;
  const centroH = aMundo(rH.left + rH.width/2, rH.top + rH.height/2);
  gotas.position.set(centroH.x, centroH.y + desp, 0);

  brilloLuz.position.set(pos.x + Math.cos(t*0.7)*1.6, pos.y + 0.8, 2.2);
  camera.position.x = lerp(camera.position.x, mx*0.16, 0.05); camera.position.y = lerp(camera.position.y, -my*0.1, 0.05); camera.lookAt(0,0,0);
  renderer.render(scene, camera);
}
/* un fallo en un fotograma devuelve la página a la versión estática en lugar de dejar la escena congelada */
function bucle(){
  raf = 0;
  if (!activo || !bucleActivo) return;
  try { frame(); } catch(e){ console.warn('NAVE: la escena 3D falló, vuelve la versión estática', e); aEstatica('error'); return; }
  if (activo && bucleActivo) raf = requestAnimationFrame(bucle);
}
function pausaBucle(){
  bucleActivo = false;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  html.dataset.bucle = 'pausado';
}
function reanudaBucle(){
  if (!activo || document.visibilityState !== 'visible' || !etapaEnVista || bucleActivo) return;
  reloj.getDelta();
  bucleActivo = true;
  html.dataset.bucle = 'activo';
  raf = requestAnimationFrame(bucle);
}

/* ===================== Mejora a 3D =====================
   Todo lo que puede fallar ya pasó con la página todavía estática. Este paso es síncrono: quita .estatica, crea el pin y arranca el
   bucle; si algo falla a medias, el catch de abajo deshace el pin y deja la versión estática. */
function mejora(){
  if (MODO.listo){ renderer.dispose(); return; } // el vigilante o un fallo ya decidieron: la mejora tardía se descarta sin parpadeo
  const ancla = location.hash.length > 1 && location.hash !== '#inicio' && document.getElementById(location.hash.slice(1));
  if (apaisado.matches){ renderer.dispose(); MODO.fija('estatica', 'apaisado'); return; } // el móvil se giró mientras cargaban las texturas
  if (scrollY > innerHeight*0.5 || ancla){ renderer.dispose(); MODO.fija('estatica', 'desplazado'); return; } // la visita ya está más abajo: fijar la etapa sería un salto
  etapa.classList.remove('estatica');
  st = ST.create({trigger:etapa, start:'top top', end:'+=470%', pin:true, anticipatePin:1});
  html.classList.add('con-3d');
  ST.refresh();
  activo = true;
  etapaEnVista = true;
  observaEtapa = new IntersectionObserver(([entrada])=>{
    etapaEnVista = entrada.isIntersecting;
    if (etapaEnVista) reanudaBucle();
    else pausaBucle();
  });
  observaEtapa.observe(etapa);
  document.addEventListener('visibilitychange', ()=>{
    if (document.visibilityState === 'visible') reanudaBucle();
    else pausaBucle();
  });
  reanudaBucle();
  MODO.fija('3d');
}
mejora();
} catch(e){
  console.warn('NAVE: la escena 3D falló, se queda la versión estática', e);
  aEstatica('error');
}
