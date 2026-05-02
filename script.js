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
function reproducirSonido() {
  new Audio('explosion.wav').play().catch(() => {});
}
function reproducirDisparo() {
  new Audio('missile_launcher.wav').play().catch(() => {});
}
function reproducirRecolect() {
  new Audio('coin_recolect_s.wav').play().catch(() => {});
}
function reproducirMusica() {
  new Audio('musica.wav').play().catch(() => {});
};

/*
==============================================================================
SKINS Y CONFIGURACIÓN GLOBAL
==============================================================================
*/

const skins = [
  { nombre: 'Atom', nave: 'atom.png', fuego: 'destello.png', humo: 'destello.png', disparo: 'destello.png' },
  { nombre: 'Prototype', nave: 'prototype.png', fuego: 'destello_verde.png', humo: 'destello_verde.png', disparo: 'destello_verde.png' },
  { nombre: 'Toxic Worm', nave: 'toxic_worm.png', fuego: 'destello_rosa.png', humo: 'destello_rosa.png', disparo: 'destello_rosa.png' },
];

const radio = 30;
const fuerzaAceleracion = 0.6;
const friccion = 0.98;
const velocidadRotacion = 5;
const velocidadDisparo = 12;
const cooldownDisparo = 200;
const intervaloHumo = 80;
const maxParticulas = 20;
const dispersionHumo = 25;
const MAX_HP = 3;
const INVULNERABILIDAD = 500;

/* 
==============================================================================
FACTORY DE JUGADOR
============================================================================== 
*/

function crearJugador({ id, startX, startY, startAngle, skinIndex, containerId, controlesMap }) {
  const container = document.getElementById(containerId);
  return {
    id, x: startX, y: startY, angulo: startAngle, vx: 0, vy: 0, hp: MAX_HP, skinActual: skinIndex,
    container, fuego: container.querySelector('.fuego'), coheteImg: container.querySelector('.cohete'),
    controlesMap, teclasActivas: {}, ultimoDisparo: 0, ultimoHumo: 0, particulas: [], proyectiles: [], invulnerable: false,
  };
}

const jugadores = [
  crearJugador({
    id: 1, startX: window.innerWidth * 0.25, startY: window.innerHeight / 2, startAngle: 90, skinIndex: 0,
    containerId: 'nave-p1', controlesMap: { arriba: 'w', izq: 'a', der: 'd', disparar: ' ' },
  }),
  crearJugador({
    id: 2, startX: window.innerWidth * 0.75, startY: window.innerHeight / 2, startAngle: 270, skinIndex: 1,
    containerId: 'nave-p2', controlesMap: { arriba: 'w', izq: 'a', der: 'd', disparar: ' ' },
  }),
];

jugadores.forEach(j => aplicarSkin(j, j.skinActual));

function aplicarSkin(jugador, indice) {
  const skin = skins[indice];
  jugador.coheteImg.src = skin.nave;
  jugador.fuego.src = skin.fuego;
  jugador.skinActual = indice;
  mostrarNombreSkin(jugador, skin.nombre);
}

function cambiarSkin(jugador, delta) {
  const nuevo = (jugador.skinActual + delta + skins.length) % skins.length;
  aplicarSkin(jugador, nuevo);
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
LÓGICA DE RED — Socket.io + Matchmaking Automático
==============================================================================
*/

// 🔧 Cambiá esta URL por la de tu servidor una vez deployado en Railway
const SERVER_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : 'https://arena-1v1-server.fly.dev'; // ← reemplazá esto después del deploy

const socket = io(SERVER_URL, { autoConnect: true });

let miSala        = null;   // ID de la sala asignada por el servidor
let miRol         = null;   // 'p1' (host-lógica) o 'p2' (cliente-visual)
let juegoIniciado = false;
let loopJuego;

// Helper: enviar datos al oponente a través del servidor
function enviar(data) {
  if (miSala) socket.emit('game_data', { roomId: miSala, data });
}

// ── Conexión con el servidor ───────────────────────────────────────────────
socket.on('connect', () => {
  document.getElementById('status-text').innerText = '';
});

socket.on('connect_error', () => {
  document.getElementById('status-text').innerText = '⚠ No se pudo conectar al servidor.';
});

// ── Botones del menú ───────────────────────────────────────────────────────
document.getElementById('btn-buscar').addEventListener('click', () => {
  document.getElementById('status-text').innerText = 'Conectando...';
  document.getElementById('btn-buscar').style.display  = 'none';
  document.getElementById('btn-cancelar').style.display = 'inline-block';
  socket.emit('buscar_partida');
});

document.getElementById('btn-cancelar').addEventListener('click', () => {
  socket.emit('cancelar_busqueda');
  document.getElementById('status-text').innerText = '';
  document.getElementById('btn-buscar').style.display   = 'inline-block';
  document.getElementById('btn-cancelar').style.display = 'none';
});

// ── Eventos del servidor ───────────────────────────────────────────────────
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
  clearInterval(loopJuego);
  clearInterval(intervaloItem);
  eliminarItem();
  document.getElementById('win-text').textContent = '¡Rival desconectado!';
  document.getElementById('win-screen').classList.add('visible');
});

// ── Inicio de partida ──────────────────────────────────────────────────────
function iniciarPartidaOnline() {
  document.getElementById('mp-menu').style.display = 'none';
  juegoIniciado = true;

  if (miRol === 'p1') iniciarSpawnItems();

  // Recibir datos del oponente
  socket.on('game_data', data => {

    // ── P1 (HOST) recibe inputs del cliente ──
    if (miRol === 'p1') {
      const p2 = jugadores[1];
      if (data.tipo === 'keydown') {
        if (data.tecla === 'skin-prev') cambiarSkin(p2, -1);
        if (data.tecla === 'skin-next') cambiarSkin(p2, +1);
        if (data.tecla === 'izq')      p2.teclasActivas.izq    = true;
        if (data.tecla === 'der')      p2.teclasActivas.der    = true;
        if (data.tecla === 'arriba')   p2.teclasActivas.arriba = true;
        if (data.tecla === 'disparar') disparar(p2, performance.now());
      }
      if (data.tipo === 'keyup') {
        if (data.tecla === 'izq')    p2.teclasActivas.izq    = false;
        if (data.tecla === 'der')    p2.teclasActivas.der    = false;
        if (data.tecla === 'arriba') p2.teclasActivas.arriba = false;
      }
    }

    // ── P2 (CLIENTE) recibe estado del mundo desde el host ──
    if (miRol === 'p2') {
      if (data.tipo === 'sync_estado') {
        jugadores[0].x      = data.p1.x;
        jugadores[0].y      = data.p1.y;
        jugadores[0].angulo = data.p1.angulo;
        jugadores[0].hp     = data.p1.hp;
        jugadores[1].x      = data.p2.x;
        jugadores[1].y      = data.p2.y;
        jugadores[1].angulo = data.p2.angulo;
        jugadores[1].hp     = data.p2.hp;
        jugadores[0]._acelera = data.p1.acelera;
        jugadores[1]._acelera = data.p2.acelera;
        actualizarHUD();
      }
      if (data.tipo === 'evento_disparo') {
        const tirador = jugadores.find(j => j.id === data.playerId);
        disparar(tirador, performance.now(), true);
      }
      if (data.tipo === 'evento_danio') {
        recibirDanio(jugadores.find(j => j.id === data.playerId), true);
      }
      if (data.tipo === 'evento_spawn_item') {
        spawnItem(data.x, data.y);
      }
      if (data.tipo === 'evento_pickup') {
        const j = jugadores.find(j => j.id === data.playerId);
        if (j && j.hp < MAX_HP) {
          j.hp = Math.min(MAX_HP, j.hp + 1);
          actualizarHUD();
          j.container.style.filter = 'brightness(2) saturate(2) hue-rotate(100deg)';
          setTimeout(() => (j.container.style.filter = ''), 300);
        }
        eliminarItem();
      }
    }
  });

  loopJuego = setInterval(actualizar, 1000 / 60);
}
/*
==============================================================================
CONTROLES (INPUT SYNCING)
==============================================================================
*/

window.addEventListener('keydown', e => {
  if (!juegoIniciado) return;
  const key = e.key.toLowerCase();

  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) e.preventDefault();

  const miJugador = jugadores[miRol === 'p1' ? 0 : 1];
  const cm = miJugador.controlesMap;
  let enviarTecla = null;

  // Filtrar teclas según el rol
  if (miRol === 'p1' && key === 'q') enviarTecla = 'skin-prev';
  if (miRol === 'p1' && key === 'e') enviarTecla = 'skin-next';
  if (miRol === 'p2' && key === 'q') enviarTecla = 'skin-prev';
  if (miRol === 'p2' && key === 'e') enviarTecla = 'skin-next';

  if (key === cm.izq)     { miJugador.teclasActivas.izq = true; enviarTecla = 'izq'; }
  if (key === cm.der)     { miJugador.teclasActivas.der = true; enviarTecla = 'der'; }
  if (key === cm.arriba)  { miJugador.teclasActivas.arriba = true; enviarTecla = 'arriba'; }
  if (key === cm.disparar) { disparar(miJugador, performance.now()); enviarTecla = 'disparar'; }

  // Enviar comando por internet
  if (enviarTecla) {
    if (enviarTecla === 'skin-prev') cambiarSkin(miJugador, -1);
    if (enviarTecla === 'skin-next') cambiarSkin(miJugador, +1);
    enviar({ tipo: 'keydown', tecla: enviarTecla });
  }
});

window.addEventListener('keyup', e => {
  if (!juegoIniciado) return;
  const key = e.key.toLowerCase();
  const miJugador = jugadores[miRol === 'p1' ? 0 : 1];
  const cm = miJugador.controlesMap;

  let enviarTecla = null;
  if (key === cm.izq)    { miJugador.teclasActivas.izq = false; enviarTecla = 'izq'; }
  if (key === cm.der)    { miJugador.teclasActivas.der = false; enviarTecla = 'der'; }
  if (key === cm.arriba) { miJugador.teclasActivas.arriba = false; enviarTecla = 'arriba'; }

  if (enviarTecla) {
    enviar({ tipo: 'keyup', tecla: enviarTecla });
  }
});

/*
==============================================================================
MECÁNICAS Y LOOP (HUMO, DISPAROS, COLISIONES)
==============================================================================
*/

// (Las funciones crearHumo, actualizarHumo, disparar, actualizarProyectiles, 
// verificarColisiones, recibirDanio y actualizarHUD se mantienen idénticas)

function crearHumo(j) {
  if (j.particulas.length >= maxParticulas) return;
  const rect = j.fuego.getBoundingClientRect();
  const centroX = rect.left + rect.width / 2, centroY = rect.top + rect.height / 2;
  const rad = j.angulo * (Math.PI / 180);
  const perpX = Math.cos(rad), perpY = Math.sin(rad);
  const spread = (Math.random() - 0.5) * 2 * dispersionHumo;

  const img = document.createElement('img');
  img.src = skins[j.skinActual].humo;
  img.style.cssText = `position: fixed; width: 40px; height: 40px; pointer-events: none; opacity: 0.7; transform-origin: center;`;

  const startX = centroX + perpX * spread, startY = centroY + perpY * spread;
  img.style.left = startX - 20 + 'px'; img.style.top = startY - 20 + 'px';
  document.body.appendChild(img);

  j.particulas.push({ el: img, inicio: performance.now(), vida: 600 + Math.random() * 400, escala: 0.4 + Math.random() * 0.8, dx: (Math.random() - 0.5) * 1.5, dy: (Math.random() - 0.5) * 1.5, cx: startX, cy: startY });

  reproducirPropulsion();
}

function actualizarHumo(j, ahora) {
  j.particulas = j.particulas.filter(p => {
    const t = (ahora - p.inicio) / p.vida;
    if (t >= 1) { p.el.remove(); return false; }
    p.cx += p.dx; p.cy += p.dy;
    const s = p.escala * (1 + t * 0.8);
    const op = 0.7 * (1 - t);
    p.el.style.left = p.cx + 'px'; p.el.style.top = p.cy + 'px'; p.el.style.opacity = op;
    p.el.style.transform = `scale(${s}) rotate(${t * 180}deg)`;
    return true;
  });
}

function disparar(j, ahora, forzado = false) {
  if (juegoTerminado) return;
  // Solo aplicamos cooldown si no es una orden forzada por el Host
  if (!forzado && ahora - j.ultimoDisparo < cooldownDisparo) return;
  j.ultimoDisparo = ahora;

  // Si soy el Host, le aviso al Cliente que genere la bala visual
  if (miRol === 'p1') {
    enviar({ tipo: 'evento_disparo', playerId: j.id });
  }

  const rect = j.container.getBoundingClientRect();
  const centroX = rect.left + rect.width / 2, centroY = rect.top + rect.height / 2;
  const radianes = j.angulo * (Math.PI / 180);
  const startX = centroX + Math.sin(radianes) * radio, startY = centroY - Math.cos(radianes) * radio;

  const img = document.createElement('img');
  img.src = skins[j.skinActual].disparo;
  img.style.cssText = `position: fixed; width: 80px; height: 80px; pointer-events: none; transform-origin: center; transform: translate(-50%, -50%) rotate(${j.angulo}deg); z-index: 999;`;
  img.style.left = startX + 'px'; img.style.top = startY + 'px';
  document.body.appendChild(img);

  j.proyectiles.push({ el: img, x: startX, y: startY, dx: Math.sin(radianes) * velocidadDisparo, dy: -Math.cos(radianes) * velocidadDisparo });

  reproducirDisparo();
}

function actualizarProyectiles(j) {
  j.proyectiles = j.proyectiles.filter(p => {
    p.x += p.dx; p.y += p.dy;
    p.el.style.left = p.x + 'px'; p.el.style.top = p.y + 'px';
    if (p.x < 0 || p.x > window.innerWidth || p.y < 0 || p.y > window.innerHeight) { p.el.remove(); return false; }
    return true;
  });
}

function verificarColisiones() {
  jugadores.forEach((atacante, idx) => {
    const defensor = jugadores[1 - idx];
    if (defensor.invulnerable) return;

    atacante.proyectiles = atacante.proyectiles.filter(p => {
      const dx = p.x - defensor.x, dy = p.y - defensor.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < radio * 1.8) {
        p.el.remove();
        recibirDanio(defensor);
        return false;
      }
      return true;
    });
  });
}

function recibirDanio(j, forzado = false) {
  j.hp = Math.max(0, j.hp - 1);
  actualizarHUD();
  reproducirSonido();
  j.container.style.filter = 'brightness(4) saturate(0)';
  setTimeout(() => (j.container.style.filter = ''), 200);
  j.invulnerable = true;
  setTimeout(() => (j.invulnerable = false), INVULNERABILIDAD);

  // El Host avisa al Cliente
  if (miRol === 'p1' && !forzado) {
    enviar({ tipo: 'evento_danio', playerId: j.id });
  }

  if (j.hp <= 0 && miRol === 'p1') terminarJuego(j); // Solo el Host decide cuándo termina
}

function actualizarHUD() {
  jugadores.forEach(j => {
    const el = document.getElementById(`hearts-p${j.id}`);
    const llenos = '❤️'.repeat(j.hp), vacios = '🖤'.repeat(MAX_HP - j.hp);
    el.textContent = llenos + vacios;
  });
}

let juegoTerminado = false;

/*
==============================================================================
SISTEMA DE ÍTEMS DE VIDA
==============================================================================
*/

const ITEM_RADIO        = 22;   // Radio de colisión del ítem
const ITEM_INTERVALO    = 8000; // Cada cuántos ms aparece uno nuevo (8 seg)
const ITEM_DURACION     = 12000;// Desaparece solo tras 12 seg si nadie lo toma
const ITEM_MARGEN       = 80;   // Margen desde los bordes de la pantalla

let itemActivo = null;  // { el, x, y, timerId }
let intervaloItem = null;

function spawnItem(x, y) {
  // Si ya hay uno, eliminarlo primero
  eliminarItem();

  const el = document.createElement('img');
  el.id = 'health-item';
  el.classList.add('health-item');
  el.src = 'healt.png';
  el.style.left = (x - ITEM_RADIO) + 'px';
  el.style.top  = (y - ITEM_RADIO) + 'px';
  document.body.appendChild(el);

  // Autodestrucción por tiempo
  const timerId = setTimeout(() => eliminarItem(), ITEM_DURACION);
  itemActivo = { el, x, y, timerId };
}

function eliminarItem() {
  if (!itemActivo) return;
  clearTimeout(itemActivo.timerId);
  itemActivo.el.classList.add('health-item--recogido');
  // Esperar la animación de salida antes de remover del DOM
  setTimeout(() => {
    if (itemActivo) {
      itemActivo.el.remove();
      itemActivo = null;
    }
  }, 350);
  // Limpiar referencia inmediatamente para evitar doble-pickup
  itemActivo = null;
}

function verificarPickups() {
  if (!itemActivo) return;
  jugadores.forEach(j => {
    const dx = j.x - itemActivo.x;
    const dy = j.y - itemActivo.y;
    if (Math.sqrt(dx * dx + dy * dy) < radio + ITEM_RADIO) {
      // Solo curamos si tiene menos del máximo
      if (j.hp < MAX_HP) {
        j.hp = Math.min(MAX_HP, j.hp + 1);
        actualizarHUD();
        reproducirRecolect();
        // Efecto visual de curación
        j.container.style.filter = 'brightness(2) saturate(2) hue-rotate(100deg)';
        setTimeout(() => (j.container.style.filter = ''), 300);
      }
      // Avisamos al cliente y eliminamos el ítem
      if (miRol === 'p1') {
        enviar({ tipo: 'evento_pickup', playerId: j.id });
      }
      eliminarItem();
    }
  });
}

// Inicia el spawn periódico — solo lo llama el Host
function iniciarSpawnItems() {
  function doSpawn() {
    if (juegoTerminado) return;
    const x = ITEM_MARGEN + Math.random() * (window.innerWidth  - ITEM_MARGEN * 2);
    const y = ITEM_MARGEN + Math.random() * (window.innerHeight - ITEM_MARGEN * 2);
    spawnItem(x, y);
    // Sincronizar posición con el cliente
    enviar({ tipo: 'evento_spawn_item', x, y });
  }
  doSpawn(); // Primero al instante al iniciar
  intervaloItem = setInterval(doSpawn, ITEM_INTERVALO);
}

function terminarJuego(perdedor) {
  juegoTerminado = true;
  clearInterval(loopJuego);    // Detenemos el loop del juego
  clearInterval(intervaloItem); // Detenemos el spawn de ítems
  eliminarItem();               // Limpiamos cualquier ítem visible
  const ganador = jugadores.find(j => j.id !== perdedor.id);
  const winScreen = document.getElementById('win-screen');
  document.getElementById('win-text').textContent = `¡Jugador ${ganador.id} gana!`;
  winScreen.classList.add('visible');
}

document.getElementById('restart-btn').addEventListener('click', () => {
  location.reload();
});

function actualizar() {
  if (juegoTerminado) return;
  const ahora = performance.now();

  // --- 1. LÓGICA DE FÍSICAS (EXCLUSIVA DEL HOST) ---
  if (miRol === 'p1') {
    jugadores.forEach(j => {
      const t = j.teclasActivas;
      if (t.izq) j.angulo -= velocidadRotacion;
      if (t.der) j.angulo += velocidadRotacion;
      if (t.arriba) {
        const rad = j.angulo * (Math.PI / 180);
        j.vx += Math.sin(rad) * fuerzaAceleracion;
        j.vy -= Math.cos(rad) * fuerzaAceleracion;
      }
      
      j.vx *= friccion; j.vy *= friccion;
      j.x += j.vx; j.y += j.vy;

      if (j.x < 0) j.x = window.innerWidth;
      if (j.x > window.innerWidth) j.x = 0;
      if (j.y < 0) j.y = window.innerHeight;
      if (j.y > window.innerHeight) j.y = 0;
    });

    verificarColisiones();
    verificarPickups(); // Detección de recogida de ítems de vida

    // El Host envía el estado absoluto cada frame
    enviar({
      tipo: 'sync_estado',
      p1: { x: jugadores[0].x, y: jugadores[0].y, angulo: jugadores[0].angulo, hp: jugadores[0].hp, acelera: jugadores[0].teclasActivas.arriba },
      p2: { x: jugadores[1].x, y: jugadores[1].y, angulo: jugadores[1].angulo, hp: jugadores[1].hp, acelera: jugadores[1].teclasActivas.arriba }
    });
  }

  // --- 2. LÓGICA VISUAL (AMBOS LA EJECUTAN) ---
  jugadores.forEach(j => {
    // Saber si está acelerando (el Host lee sus teclas, el Cliente lee lo que mandó el Host)
    const estaAcelerando = (miRol === 'p1') ? j.teclasActivas.arriba : j._acelera;

    if (estaAcelerando) {
      j.fuego.style.opacity = '1';
      j.fuego.style.transform = `scale(${0.8 + Math.random() * 0.4})`;
      if (ahora - j.ultimoHumo > intervaloHumo) { crearHumo(j); j.ultimoHumo = ahora; }
    } else {
      j.fuego.style.opacity = '0';
    }

    // Parpadeo de invulnerabilidad y aplicar rotación/traslación
    j.container.style.opacity = j.invulnerable && Math.sin(ahora / 70) > 0 ? '0.25' : '1';
    j.container.style.transform = `translate(${j.x - radio}px, ${j.y - radio}px) rotate(${j.angulo}deg)`;

    actualizarHumo(j, ahora);
    actualizarProyectiles(j);
  });
}

/*
==============================================================================
JOYSTICK MÓVIL VINTAGE
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

  const MAX_DIST = 38;   // px máx de desplazamiento del knob
  const UMBRAL   = 0.30; // fracción normalizada para activar dirección

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
    const dx    = tx - baseCenter.x;
    const dy    = ty - baseCenter.y;
    const dist  = Math.sqrt(dx * dx + dy * dy);
    const ang   = Math.atan2(dy, dx);
    const cDist = Math.min(dist, MAX_DIST);
    const kx    = Math.cos(ang) * cDist;
    const ky    = Math.sin(ang) * cDist;

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
    const miJugador = jugadores[miRol === 'p1' ? 0 : 1];
    ['izq', 'der', 'arriba'].forEach(tecla => {
      if (nuevo[tecla] === estadoPrev[tecla]) return;
      miJugador.teclasActivas[tecla] = nuevo[tecla];
      enviar({ tipo: nuevo[tecla] ? 'keydown' : 'keyup', tecla });
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
    const miJugador = jugadores[miRol === 'p1' ? 0 : 1];
    disparar(miJugador, performance.now());
    enviar({ tipo: 'keydown', tecla: 'disparar' });
  }, { passive: false });

  btnSkinP.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!juegoIniciado) return;
    const miJugador = jugadores[miRol === 'p1' ? 0 : 1];
    cambiarSkin(miJugador, -1);
    enviar({ tipo: 'keydown', tecla: 'skin-prev' });
  }, { passive: false });

  btnSkinN.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!juegoIniciado) return;
    const miJugador = jugadores[miRol === 'p1' ? 0 : 1];
    cambiarSkin(miJugador, +1);
    enviar({ tipo: 'keydown', tecla: 'skin-next' });
  }, { passive: false });

  window.addEventListener('touchstart', function mostrarControles() {
    controls.style.display = 'flex';
    window.removeEventListener('touchstart', mostrarControles);
  }, { once: true, passive: true });

})();
