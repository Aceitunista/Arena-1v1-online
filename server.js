/*
==============================================================================
ARENA 1v1 — Servidor Autoritativo con Lógica de Juego Server-Side
==============================================================================
*/

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 5000,
  pingTimeout:  10000,
});

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES DEL JUEGO (fuente de verdad — el cliente las espeja para la escala)
// ══════════════════════════════════════════════════════════════════════════════
const ARENA_W            = 1280;
const ARENA_H            = 720;
const RADIO              = 30;
const FUERZA_ACELERACION = 0.6;
const FRICCION           = 0.98;
const VEL_ROTACION       = 5;
const VEL_DISPARO        = 12;
const COOLDOWN_DISPARO   = 200;   // ms
const MAX_HP             = 3;
const INVULNERABILIDAD   = 500;   // ms
const ITEM_RADIO         = 22;
const ITEM_INTERVALO     = 8000;  // ms entre spawns
const ITEM_DURACION      = 12000; // ms hasta autodestruirse
const ITEM_MARGEN        = 80;
const TICK_RATE          = 60;    // frames por segundo del loop del servidor
const NUM_SKINS          = 3;

// ══════════════════════════════════════════════════════════════════════════════
// ESTADO GLOBAL DE MATCHMAKING
// ══════════════════════════════════════════════════════════════════════════════
let cola = [];
const salas = new Map(); // roomId → SalaObj

function salaDelSocket(socketId) {
  for (const [roomId, sala] of salas) {
    if (sala.p1Id === socketId || sala.p2Id === socketId)
      return { roomId, sala };
  }
  return null;
}

function quitarDeCola(socketId) {
  cola = cola.filter(s => s.id !== socketId);
}

// ══════════════════════════════════════════════════════════════════════════════
// FACTORY DE ESTADO
// ══════════════════════════════════════════════════════════════════════════════
function crearEstadoJugador(x, y, angulo, skinActual) {
  return {
    x, y, angulo,
    vx: 0, vy: 0,
    hp: MAX_HP,
    skinActual,
    teclasActivas: { izq: false, der: false, arriba: false },
    ultimoDisparo:    0,
    invulnerable:     false,
    invulnerableHasta: 0,
  };
}

function crearSala(p1Id, p2Id) {
  return {
    p1Id,
    p2Id,
    gameLoop:      null,
    itemIntervalo: null,
    itemTimer:     null,
    estado: {
      jugadores: {
        p1: crearEstadoJugador(ARENA_W * 0.25, ARENA_H / 2,  90, 0),
        p2: crearEstadoJugador(ARENA_W * 0.75, ARENA_H / 2, 270, 1),
      },
      proyectiles:  [],  // { id, ownerRol, x, y, dx, dy, skinActual }
      proximoId:    0,
      item:         null, // { x, y } | null
      juegoTerminado: false,
    },
  };
}

// ── Serialización compacta de jugador para el cliente ─────────────────────────
function serialJugador(j) {
  return {
    x: j.x, y: j.y, angulo: j.angulo, hp: j.hp,
    acelera:    j.teclasActivas.arriba,
    skinActual: j.skinActual,
    invulnerable: j.invulnerable,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// LOOP DEL JUEGO (se ejecuta UNA vez por sala)
// ══════════════════════════════════════════════════════════════════════════════
function iniciarJuego(roomId) {
  const sala = salas.get(roomId);
  const est  = sala.estado;

  // ── Spawn de ítems ──────────────────────────────────────────────────────────
  function spawnItem() {
    if (est.juegoTerminado) return;
    // Limpiar ítem anterior si existe
    if (sala.itemTimer) { clearTimeout(sala.itemTimer); sala.itemTimer = null; }
    est.item = {
      x: ITEM_MARGEN + Math.random() * (ARENA_W - ITEM_MARGEN * 2),
      y: ITEM_MARGEN + Math.random() * (ARENA_H - ITEM_MARGEN * 2),
    };
    sala.itemTimer = setTimeout(() => {
      if (est.item) est.item = null; // expira silenciosamente; el cliente lo detecta
    }, ITEM_DURACION);
  }

  spawnItem();
  sala.itemIntervalo = setInterval(spawnItem, ITEM_INTERVALO);

  // ── Tick del juego ──────────────────────────────────────────────────────────
  sala.gameLoop = setInterval(() => {
    if (est.juegoTerminado) { clearInterval(sala.gameLoop); return; }

    const now    = Date.now();
    const eventos = [];

    // 1. FÍSICA ──────────────────────────────────────────────────────────────
    for (const rol of ['p1', 'p2']) {
      const j = est.jugadores[rol];
      const t = j.teclasActivas;

      if (t.izq) j.angulo -= VEL_ROTACION;
      if (t.der) j.angulo += VEL_ROTACION;
      if (t.arriba) {
        const rad = j.angulo * (Math.PI / 180);
        j.vx += Math.sin(rad) * FUERZA_ACELERACION;
        j.vy -= Math.cos(rad) * FUERZA_ACELERACION;
      }

      j.vx *= FRICCION;
      j.vy *= FRICCION;
      j.x  += j.vx;
      j.y  += j.vy;

      // Wraparound
      if (j.x < 0)       j.x = ARENA_W;
      if (j.x > ARENA_W) j.x = 0;
      if (j.y < 0)       j.y = ARENA_H;
      if (j.y > ARENA_H) j.y = 0;

      // Expirar invulnerabilidad
      if (j.invulnerable && now >= j.invulnerableHasta) j.invulnerable = false;
    }

    // 2. MOVER PROYECTILES Y ELIMINAR FUERA DE ARENA ─────────────────────────
    est.proyectiles = est.proyectiles.filter(p => {
      p.x += p.dx;
      p.y += p.dy;
      return p.x >= 0 && p.x <= ARENA_W && p.y >= 0 && p.y <= ARENA_H;
    });

    // 3. COLISIONES PROYECTIL → NAVE ─────────────────────────────────────────
    for (const rolAtacante of ['p1', 'p2']) {
      const rolDefensor = rolAtacante === 'p1' ? 'p2' : 'p1';
      const defensor    = est.jugadores[rolDefensor];
      if (defensor.invulnerable) continue;

      est.proyectiles = est.proyectiles.filter(p => {
        if (p.ownerRol !== rolAtacante) return true; // solo golpea al rival
        const dx   = p.x - defensor.x;
        const dy   = p.y - defensor.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < RADIO * 1.8) {
          defensor.hp             = Math.max(0, defensor.hp - 1);
          defensor.invulnerable   = true;
          defensor.invulnerableHasta = now + INVULNERABILIDAD;
          eventos.push({ tipo: 'evento_danio', playerId: rolDefensor });
          return false; // elimina el proyectil
        }
        return true;
      });
    }

    // 4. PICKUP DE ÍTEM ───────────────────────────────────────────────────────
    if (est.item) {
      for (const rol of ['p1', 'p2']) {
        const j  = est.jugadores[rol];
        const dx = j.x - est.item.x;
        const dy = j.y - est.item.y;
        if (Math.sqrt(dx * dx + dy * dy) < RADIO + ITEM_RADIO) {
          if (j.hp < MAX_HP) {
            j.hp = Math.min(MAX_HP, j.hp + 1);
            eventos.push({ tipo: 'evento_pickup', playerId: rol });
          }
          clearTimeout(sala.itemTimer);
          sala.itemTimer = null;
          est.item = null;
          break;
        }
      }
    }

    // 5. CONDICIÓN DE VICTORIA ────────────────────────────────────────────────
    for (const rol of ['p1', 'p2']) {
      if (est.jugadores[rol].hp <= 0) {
        const ganador = rol === 'p1' ? 'p2' : 'p1';
        est.juegoTerminado = true;
        clearInterval(sala.gameLoop);
        clearInterval(sala.itemIntervalo);
        clearTimeout(sala.itemTimer);
        io.to(roomId).emit('game_over', { ganador });
        console.log(`[GAME OVER] ${roomId}  ganador=${ganador}`);
        return;
      }
    }

    // 6. EMITIR EVENTOS (daño, pickup) ────────────────────────────────────────
    for (const ev of eventos) io.to(roomId).emit('game_event', ev);

    // 7. BROADCAST ESTADO ─────────────────────────────────────────────────────
    io.to(roomId).emit('sync_estado', {
      p1: serialJugador(est.jugadores.p1),
      p2: serialJugador(est.jugadores.p2),
      proyectiles: est.proyectiles.map(p => ({
        id:         p.id,
        x:          p.x,
        y:          p.y,
        angulo:     Math.atan2(p.dx, -p.dy) * (180 / Math.PI),
        ownerRol:   p.ownerRol,
        skinActual: p.skinActual,
      })),
      item: est.item, // { x, y } | null
    });

  }, 1000 / TICK_RATE);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONEXIONES Y MATCHMAKING
// ══════════════════════════════════════════════════════════════════════════════
io.on('connection', socket => {
  console.log(`[+] ${socket.id}  (total: ${io.engine.clientsCount})`);

  // ── Matchmaking ──────────────────────────────────────────────────────────
  socket.on('buscar_partida', () => {
    quitarDeCola(socket.id);

    if (cola.length > 0) {
      const p1     = cola.shift();
      const roomId = `arena_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const sala   = crearSala(p1.id, socket.id);

      salas.set(roomId, sala);
      p1.join(roomId);
      socket.join(roomId);

      p1.emit('partida_encontrada',     { rol: 'p1', roomId });
      socket.emit('partida_encontrada', { rol: 'p2', roomId });

      iniciarJuego(roomId);
      console.log(`[SALA] ${roomId}  p1=${p1.id}  p2=${socket.id}`);
    } else {
      cola.push(socket);
      socket.emit('esperando');
      console.log(`[COLA] ${socket.id}  (esperando rival, cola=${cola.length})`);
    }
  });

  socket.on('cancelar_busqueda', () => {
    quitarDeCola(socket.id);
    console.log(`[CANCELAR] ${socket.id}`);
  });

  // ── Inputs del cliente ────────────────────────────────────────────────────
  // El cliente envía: { roomId, tipo: 'keydown'|'keyup', tecla }
  socket.on('input', ({ roomId, tipo, tecla }) => {
    const sala = salas.get(roomId);
    if (!sala || sala.estado.juegoTerminado) return;

    const rol = sala.p1Id === socket.id ? 'p1' : 'p2';
    const j   = sala.estado.jugadores[rol];
    const now = Date.now();

    if (tipo === 'keydown') {
      if (tecla === 'izq')    j.teclasActivas.izq    = true;
      if (tecla === 'der')    j.teclasActivas.der    = true;
      if (tecla === 'arriba') j.teclasActivas.arriba = true;

      // Disparo con cooldown server-side
      if (tecla === 'disparar' && now - j.ultimoDisparo >= COOLDOWN_DISPARO) {
        j.ultimoDisparo = now;
        const rad = j.angulo * (Math.PI / 180);
        sala.estado.proyectiles.push({
          id:         sala.estado.proximoId++,
          ownerRol:   rol,
          x:          j.x + Math.sin(rad) * RADIO,
          y:          j.y - Math.cos(rad) * RADIO,
          dx:         Math.sin(rad) * VEL_DISPARO,
          dy:        -Math.cos(rad) * VEL_DISPARO,
          skinActual: j.skinActual,
        });
        io.to(roomId).emit('game_event', { tipo: 'evento_disparo', playerId: rol });
      }

      // Cambio de skin
      if (tecla === 'skin-prev') {
        j.skinActual = (j.skinActual - 1 + NUM_SKINS) % NUM_SKINS;
        io.to(roomId).emit('game_event', { tipo: 'skin_change', rol, skinActual: j.skinActual });
      }
      if (tecla === 'skin-next') {
        j.skinActual = (j.skinActual + 1) % NUM_SKINS;
        io.to(roomId).emit('game_event', { tipo: 'skin_change', rol, skinActual: j.skinActual });
      }
    }

    if (tipo === 'keyup') {
      if (tecla === 'izq')    j.teclasActivas.izq    = false;
      if (tecla === 'der')    j.teclasActivas.der    = false;
      if (tecla === 'arriba') j.teclasActivas.arriba = false;
    }
  });

  // ── Desconexión ───────────────────────────────────────────────────────────
  socket.on('disconnect', reason => {
    quitarDeCola(socket.id);

    const found = salaDelSocket(socket.id);
    if (found) {
      const { roomId, sala } = found;
      clearInterval(sala.gameLoop);
      clearInterval(sala.itemIntervalo);
      clearTimeout(sala.itemTimer);
      socket.to(roomId).emit('oponente_desconectado');
      salas.delete(roomId);
      console.log(`[SALA CERRADA] ${roomId} — ${reason}`);
    }

    console.log(`[-] ${socket.id}  (${reason})`);
  });
});

// ── Healthcheck ────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('Arena 1v1 server OK'));

// ── Arranque ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`\n🚀  Arena 1v1 (server-side game logic) en http://localhost:${PORT}\n`)
);