/*
==============================================================================
FONDO DE ESTRELLAS Y SONIDO
==============================================================================
*/
const sky = document.getElementById('sky');
for (let i = 0; i < 150; i++) crearEstrella();

function crearEstrella() {
  const star = document.createElement('div');
  star.classList.add('star');
  star.style.left   = `${Math.random() * 100}vw`;
  star.style.top    = `${Math.random() * 100}vh`;
  const size = Math.random() * 2 + 1;
  star.style.width  = `${size}px`;
  star.style.height = `${size}px`;
  star.style.animationDuration = `${Math.random() * 3 + 2}s`;
  star.style.animationDelay   = `${Math.random() * 5}s`;
  sky.appendChild(star);
}

function reproducirPropulsion() {
  const audio = new Audio('explosion.wav');
  audio.volume = 0.1;
  audio.play().catch(() => {});
}
function reproducirSonido()  { new Audio('explosion.wav').play().catch(() => {}); }
function reproducirDisparo() { new Audio('missile_launcher.wav').play().catch(() => {}); }
function reproducirRecolect(){ new Audio('coin_recolect_s.wav').play().catch(() => {}); }
function reproducirMusica()  { new Audio('musica.wav').play().catch(() => {}); }

/*
==============================================================================
CONSTANTES DE ARENA (deben coincidir con el servidor)
==============================================================================
*/
const ARENA_W = 1280;
const ARENA_H = 720;

// Escala coordenadas lógicas del servidor a píxeles de pantalla
function scaleX(x) { return x * (window.innerWidth  / ARENA_W); }
function scaleY(y) { return y * (window.innerHeight / ARENA_H); }

/*
==============================================================================
SKINS Y CONFIGURACIÓN VISUAL
==============================================================================
*/
const skins = [
  { nombre: 'Atom',       nave: 'atom.png',       fuego: 'destello.png',       humo: 'destello.png',       disparo: 'destello.png' },
  { nombre: 'Prototype',  nave: 'prototype.png',  fuego: 'destello_verde.png', humo: 'destello_verde.png', disparo: 'destello_verde.png' },
  { nombre: 'Toxic Worm', nave: 'toxic_worm.png', fuego: 'destello_rosa.png',  humo: 'destello_rosa.png',  disparo: 'destello_rosa.png' },
];

const radio            = 30;   // solo para efectos visuales (posición humo)
const intervaloHumo    = 80;
const maxParticulas    = 20;
const dispersionHumo   = 25;
const MAX_HP           = 3;
const ITEM_RADIO       = 22;

/*
==============================================================================
GENERACION DE LOS JUGADORES
==============================================================================
*/
function crearJugador({ id, startX, startY, startAngle, skinIndex, containerId }) {
  const container = document.getElementById(containerId);
  return {
    id,
    x: startX, y: startY, angulo: startAngle,
    hp: MAX_HP, skinActual: skinIndex,
    container,
    fuego:     container.querySelector('.fuego'),
    coheteImg: container.querySelector('.cohete'),
    ultimoHumo: 0, particulas: [],
    _acelera:     false,
    _invulnerable: false,
  };
}

const jugadores = [
  crearJugador({ id: 1, startX: ARENA_W * 0.25, startY: ARENA_H / 2, startAngle:  90, skinIndex: 0, containerId: 'nave-p1' }),
  crearJugador({ id: 2, startX: ARENA_W * 0.75, startY: ARENA_H / 2, startAngle: 270, skinIndex: 1, containerId: 'nave-p2' }),
];
jugadores.forEach(j => aplicarSkin(j, j.skinActual));

function aplicarSkin(jugador, indice) {
  const skin = skins[indice];
  jugador.coheteImg.src = skin.nave;
  jugador.fuego.src     = skin.fuego;
  jugador.skinActual    = indice;
  mostrarNombreSkin(jugador, skin.nombre);
}

function mostrarNombreSkin(jugador, nombre) {
  const labelId = `skin-label-p${jugador.id}`;
  let label = document.getElementById(labelId);
  if (!label) {
    label = document.createElement('div');
    label.id = labelId;
    label.classList.add('skin-label');
    label.style.cssText += jugador.id === 1 ? 'left: 16px;' : 'right: 16px;';
    document.body.appendChild(label);
  }
  label.textContent = nombre;
  label.style.opacity = '1';
  clearTimeout(label._timer);
  label._timer = setTimeout(() => (label.style.opacity = '0'), 1500);
}

/*
==============================================================================
LÓGICA DE RED — WebSocket (solo inputs hacia el servidor)
==============================================================================
*/
const SERVER_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://api.cloudflare.com/client/v4/zones/04748d3ef23d45eaf7a1351d57db82a1/settings/websocket' // ← reemplazar con la URL de tu servidor

const socket = io(SERVER_URL, { autoConnect: true });

let miSala         = null;
let miRol          = null;
let juegoIniciado  = false;
let juegoTerminado = false;

// Envía un input al servidor
function enviarInput(tipo, tecla) {
  if (miSala) socket.emit('input', { roomId: miSala, tipo, tecla });
}

// ── Conexión ──────────────────────────────────────────────────────────────────
socket.on('connect', () => {
  document.getElementById('status-text').innerText = '';
});
socket.on('connect_error', () => {
  document.getElementById('status-text').innerText = '⚠ No se pudo conectar al servidor.';
});

// ── Botones del menú ──────────────────────────────────────────────────────────
document.getElementById('btn-buscar').addEventListener('click', () => {
  document.getElementById('status-text').innerText = 'Conectando...';
  document.getElementById('btn-buscar').style.display   = 'none';
  document.getElementById('btn-cancelar').style.display = 'inline-block';
  socket.emit('buscar_partida');
});
document.getElementById('btn-cancelar').addEventListener('click', () => {
  socket.emit('cancelar_busqueda');
  document.getElementById('status-text').innerText = '';
  document.getElementById('btn-buscar').style.display   = 'inline-block';
  document.getElementById('btn-cancelar').style.display = 'none';
});

// ── Eventos del servidor ──────────────────────────────────────────────────────
socket.on('esperando', () => {
  document.getElementById('status-text').innerText = '⏳ Esperando oponente...';
});

socket.on('partida_encontrada', ({ rol, roomId }) => {
  miRol  = rol;
  miSala = roomId;
  iniciarPartidaOnline();
  if (rol === 'p2') reproducirMusica();
});

socket.on('oponente_desconectado', () => {
  if (!juegoIniciado) return;
  juegoTerminado = true;
  limpiarProyectiles();
  sincronizarItem(null, true);
  document.getElementById('win-text').textContent = '¡Rival desconectado!';
  document.getElementById('win-screen').classList.add('visible');
});

/*
==============================================================================
INICIO DE PARTIDA
==============================================================================
*/
function iniciarPartidaOnline() {
  document.getElementById('mp-menu').style.display = 'none';
  juegoIniciado = true;

  // ── Recibir estado autoritativo del servidor cada tick (60fps) ──────────────
  socket.on('sync_estado', estado => {
    if (juegoTerminado) return;

    // Aplicar posiciones y estado de P1
    const p1 = jugadores[0];
    p1.x           = estado.p1.x;
    p1.y           = estado.p1.y;
    p1.angulo      = estado.p1.angulo;
    p1.hp          = estado.p1.hp;
    p1._acelera    = estado.p1.acelera;
    p1._invulnerable = estado.p1.invulnerable;
    if (estado.p1.skinActual !== p1.skinActual) aplicarSkin(p1, estado.p1.skinActual);

    // Aplicar posiciones y estado de P2
    const p2 = jugadores[1];
    p2.x           = estado.p2.x;
    p2.y           = estado.p2.y;
    p2.angulo      = estado.p2.angulo;
    p2.hp          = estado.p2.hp;
    p2._acelera    = estado.p2.acelera;
    p2._invulnerable = estado.p2.invulnerable;
    if (estado.p2.skinActual !== p2.skinActual) aplicarSkin(p2, estado.p2.skinActual);

    actualizarHUD();
    sincronizarProyectiles(estado.proyectiles);
    sincronizarItem(estado.item);
  });

  // ── Eventos puntuales (efectos de audio y visual) ──────────────────────────
  socket.on('game_event', ev => {
    if (ev.tipo === 'evento_disparo') {
      reproducirDisparo();
    }
    if (ev.tipo === 'evento_danio') {
      const j = jugadores[ev.playerId === 'p1' ? 0 : 1];
      reproducirSonido();
      j.container.style.filter = 'brightness(4) saturate(0)';
      setTimeout(() => (j.container.style.filter = ''), 200);
    }
    if (ev.tipo === 'evento_pickup') {
      const j = jugadores[ev.playerId === 'p1' ? 0 : 1];
      reproducirRecolect();
      j.container.style.filter = 'brightness(2) saturate(2) hue-rotate(100deg)';
      setTimeout(() => (j.container.style.filter = ''), 300);
    }
    // skin_change llega en sync_estado → aplicarSkin se llama ahí automáticamente
  });

  // ── Fin de partida ─────────────────────────────────────────────────────────
  socket.on('game_over', ({ ganador }) => {
    juegoTerminado = true;
    limpiarProyectiles();
    sincronizarItem(null, true);
    const ganadorNum = ganador === 'p1' ? 1 : 2;
    document.getElementById('win-text').textContent = `¡Jugador ${ganadorNum} gana!`;
    document.getElementById('win-screen').classList.add('visible');
  });
}

document.getElementById('restart-btn').addEventListener('click', () => location.reload());

/*
==============================================================================
PROYECTILES — DOM sincronizado con el estado del servidor
==============================================================================
*/
const proyectilesDOM = new Map(); // id → <img>

function sincronizarProyectiles(proyectilesServidor) {
  const idsActivos = new Set(proyectilesServidor.map(p => p.id));

  // Eliminar proyectiles que ya no existen
  for (const [id, el] of proyectilesDOM) {
    if (!idsActivos.has(id)) {
      el.remove();
      proyectilesDOM.delete(id);
    }
  }

  // Crear o actualizar cada proyectil
  for (const p of proyectilesServidor) {
    if (!proyectilesDOM.has(p.id)) {
      const img = document.createElement('img');
      img.src = skins[p.skinActual].disparo;
      img.style.cssText = 'position:fixed;width:80px;height:80px;pointer-events:none;transform-origin:center;z-index:999;';
      document.body.appendChild(img);
      proyectilesDOM.set(p.id, img);
    }
    const el = proyectilesDOM.get(p.id);
    el.style.left      = scaleX(p.x) + 'px';
    el.style.top       = scaleY(p.y) + 'px';
    el.style.transform = `translate(-50%,-50%) rotate(${p.angulo}deg)`;
  }
}

function limpiarProyectiles() {
  for (const el of proyectilesDOM.values()) el.remove();
  proyectilesDOM.clear();
}

/*
==============================================================================
ÍTEM DE VIDA — DOM sincronizado con el estado del servidor
==============================================================================
*/
let itemActivoEl  = null;
let itemActivaPos = null;

function sincronizarItem(itemServidor, forzarLimpiar = false) {
  if (itemServidor && !itemActivoEl) {
    // Crear nuevo ítem
    const el = document.createElement('img');
    el.id = 'health-item';
    el.classList.add('health-item');
    el.src        = 'healt.png';
    el.style.left = (scaleX(itemServidor.x) - ITEM_RADIO) + 'px';
    el.style.top  = (scaleY(itemServidor.y) - ITEM_RADIO) + 'px';
    document.body.appendChild(el);
    itemActivoEl  = el;
    itemActivaPos = itemServidor;
  } else if ((!itemServidor || forzarLimpiar) && itemActivoEl) {
    // Animar y remover
    itemActivoEl.classList.add('health-item--recogido');
    const viejo = itemActivoEl;
    setTimeout(() => viejo.remove(), 350);
    itemActivoEl  = null;
    itemActivaPos = null;
  }
}

/*
==============================================================================
HUD
==============================================================================
*/
function actualizarHUD() {
  jugadores.forEach(j => {
    const el      = document.getElementById(`hearts-p${j.id}`);
    const llenos  = '❤️'.repeat(j.hp);
    const vacios  = '🖤'.repeat(MAX_HP - j.hp);
    el.textContent = llenos + vacios;
  });
}

/*
==============================================================================
LOOP VISUAL (requestAnimationFrame — solo efectos, sin física)
==============================================================================
*/
function loopVisual() {
  const ahora = performance.now();

  jugadores.forEach(j => {
    // Posición escalada de coordenadas lógicas a píxeles de pantalla
    const sx = scaleX(j.x) - radio;
    const sy = scaleY(j.y) - radio;
    j.container.style.transform = `translate(${sx}px, ${sy}px) rotate(${j.angulo}deg)`;

    // Parpadeo de invulnerabilidad
    j.container.style.opacity = j._invulnerable && Math.sin(ahora / 70) > 0 ? '0.25' : '1';

    // Fuego y humo de propulsión
    if (j._acelera) {
      j.fuego.style.opacity   = '1';
      j.fuego.style.transform = `scale(${0.8 + Math.random() * 0.4})`;
      if (ahora - j.ultimoHumo > intervaloHumo) {
        crearHumo(j);
        j.ultimoHumo = ahora;
      }
    } else {
      j.fuego.style.opacity = '0';
    }

    actualizarHumo(j, ahora);
  });

  requestAnimationFrame(loopVisual);
}
requestAnimationFrame(loopVisual);

/*
==============================================================================
CONTROLES — Solo envían inputs al servidor (ninguna física local)
==============================================================================
*/
window.addEventListener('keydown', e => {
  if (!juegoIniciado) return;
  const key = e.key.toLowerCase();
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();

  if (key === 'q') { enviarInput('keydown', 'skin-prev'); return; }
  if (key === 'e') { enviarInput('keydown', 'skin-next'); return; }
  if (key === 'a') { enviarInput('keydown', 'izq');      return; }
  if (key === 'd') { enviarInput('keydown', 'der');      return; }
  if (key === 'w') { enviarInput('keydown', 'arriba');   return; }
  if (key === ' ') { enviarInput('keydown', 'disparar'); return; }
});

window.addEventListener('keyup', e => {
  if (!juegoIniciado) return;
  const key = e.key.toLowerCase();
  if (key === 'a') enviarInput('keyup', 'izq');
  if (key === 'd') enviarInput('keyup', 'der');
  if (key === 'w') enviarInput('keyup', 'arriba');
});

/*
==============================================================================
MECÁNICAS VISUALES (humo de propulsión — idénticas, sin física)
==============================================================================
*/
function crearHumo(j) {
  if (j.particulas.length >= maxParticulas) return;
  const rect   = j.fuego.getBoundingClientRect();
  const centroX = rect.left + rect.width  / 2;
  const centroY = rect.top  + rect.height / 2;
  const rad    = j.angulo * (Math.PI / 180);
  const perpX  = Math.cos(rad);
  const perpY  = Math.sin(rad);
  const spread = (Math.random() - 0.5) * 2 * dispersionHumo;

  const img = document.createElement('img');
  img.src = skins[j.skinActual].humo;
  img.style.cssText = 'position:fixed;width:40px;height:40px;pointer-events:none;opacity:0.7;transform-origin:center;';

  const startX = centroX + perpX * spread;
  const startY = centroY + perpY * spread;
  img.style.left = (startX - 20) + 'px';
  img.style.top  = (startY - 20) + 'px';
  document.body.appendChild(img);

  j.particulas.push({
    el: img, inicio: performance.now(),
    vida: 600 + Math.random() * 400,
    escala: 0.4 + Math.random() * 0.8,
    dx: (Math.random() - 0.5) * 1.5,
    dy: (Math.random() - 0.5) * 1.5,
    cx: startX, cy: startY,
  });

  reproducirPropulsion();
}

function actualizarHumo(j, ahora) {
  j.particulas = j.particulas.filter(p => {
    const t = (ahora - p.inicio) / p.vida;
    if (t >= 1) { p.el.remove(); return false; }
    p.cx += p.dx;
    p.cy += p.dy;
    const s  = p.escala * (1 + t * 0.8);
    const op = 0.7 * (1 - t);
    p.el.style.left      = p.cx + 'px';
    p.el.style.top       = p.cy + 'px';
    p.el.style.opacity   = op;
    p.el.style.transform = `scale(${s}) rotate(${t * 180}deg)`;
    return true;
  });
}

/*
==============================================================================
JOYSTICK MÓVIL VINTAGE — envía inputs al servidor
==============================================================================
*/
(function iniciarJoystick() {
  const controls = document.getElementById('mobile-controls');
  const zone     = document.getElementById('joystick-zone');
  const base     = document.getElementById('joystick-base');
  const knob     = document.getElementById('joystick-knob');
  const btnFire  = document.getElementById('btn-fire');
  const btnSkinP = document.getElementById('btn-skin-prev');
  const btnSkinN = document.getElementById('btn-skin-next');

  const MAX_DIST = 38;
  const UMBRAL   = 0.30;

  let touchActivo = null;
  let baseCenter  = { x: 0, y: 0 };
  let estadoPrev  = { izq: false, der: false, arriba: false };

  function resetKnob() {
    knob.style.left      = '50%';
    knob.style.top       = '50%';
    knob.style.transform = 'translate(-50%, -50%)';
  }
  resetKnob();

  function getCenterOfBase() {
    const r = base.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function moverKnob(tx, ty) {
    const dx   = tx - baseCenter.x;
    const dy   = ty - baseCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ang  = Math.atan2(dy, dx);
    const cDist = Math.min(dist, MAX_DIST);
    const kx   = Math.cos(ang) * cDist;
    const ky   = Math.sin(ang) * cDist;

    knob.style.left      = `calc(50% + ${kx}px)`;
    knob.style.top       = `calc(50% + ${ky}px)`;
    knob.style.transform = 'translate(-50%, -50%)';

    const ref = Math.max(dist, MAX_DIST);
    const nx  = dist > 0 ? dx / ref : 0;
    const ny  = dist > 0 ? dy / ref : 0;

    aplicarEstadoTactil({
      izq:    nx < -UMBRAL,
      der:    nx >  UMBRAL,
      arriba: ny < -UMBRAL,
    });
  }

  function liberarKnob() {
    touchActivo = null;
    resetKnob();
    aplicarEstadoTactil({ izq: false, der: false, arriba: false });
  }

  function aplicarEstadoTactil(nuevo) {
    if (!juegoIniciado) return;
    ['izq', 'der', 'arriba'].forEach(tecla => {
      if (nuevo[tecla] === estadoPrev[tecla]) return;
      enviarInput(nuevo[tecla] ? 'keydown' : 'keyup', tecla);
    });
    estadoPrev = { ...nuevo };
  }

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    if (touchActivo !== null) return;
    const t = e.changedTouches[0];
    touchActivo = t.identifier;
    baseCenter  = getCenterOfBase();
    moverKnob(t.clientX, t.clientY);
  }, { passive: false });

  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touchActivo) { moverKnob(t.clientX, t.clientY); break; }
    }
  }, { passive: false });

  zone.addEventListener('touchend', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchActivo) { liberarKnob(); break; }
    }
  });
  zone.addEventListener('touchcancel', liberarKnob);

  btnFire.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!juegoIniciado) return;
    enviarInput('keydown', 'disparar');
  }, { passive: false });

  btnSkinP.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!juegoIniciado) return;
    enviarInput('keydown', 'skin-prev');
  }, { passive: false });

  btnSkinN.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!juegoIniciado) return;
    enviarInput('keydown', 'skin-next');
  }, { passive: false });

  window.addEventListener('touchstart', function mostrarControles() {
    controls.style.display = 'flex';
    window.removeEventListener('touchstart', mostrarControles);
  }, { once: true, passive: true });
})();