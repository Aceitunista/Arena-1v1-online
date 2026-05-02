/*
==============================================================================
ARENA 1v1 — Servidor Socket.io con Matchmaking Automático
==============================================================================
Deploy en Railway:
  1. Subí este proyecto a un repo de GitHub
  2. railway.app → New Project → Deploy from GitHub
  3. Listo — Railway detecta Node.js y usa "npm start" automáticamente
==============================================================================
*/

const express  = require('express');
const http     = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 5000,
  pingTimeout:  10000,
});

// ── Estado global ──────────────────────────────────────────────────────────
let cola  = [];              // sockets esperando rival
const salas = new Map();     // roomId → { p1Id, p2Id }

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

// ── Conexiones ─────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log(`[+] ${socket.id}  (total: ${io.engine.clientsCount})`);

  // ─ Matchmaking ─
  socket.on('buscar_partida', () => {
    quitarDeCola(socket.id);   // evitar duplicados

    if (cola.length > 0) {
      const p1     = cola.shift();
      const roomId = `arena_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

      salas.set(roomId, { p1Id: p1.id, p2Id: socket.id });
      p1.join(roomId);
      socket.join(roomId);

      p1.emit('partida_encontrada',     { rol: 'p1', roomId });
      socket.emit('partida_encontrada', { rol: 'p2', roomId });

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

  // ─ Relay de datos del juego ─
  // El servidor NO interpreta el contenido, solo retransmite al otro jugador
  socket.on('game_data', ({ roomId, data }) => {
    socket.to(roomId).emit('game_data', data);
  });

  // ─ Desconexión ─
  socket.on('disconnect', reason => {
    quitarDeCola(socket.id);

    const found = salaDelSocket(socket.id);
    if (found) {
      socket.to(found.roomId).emit('oponente_desconectado');
      salas.delete(found.roomId);
      console.log(`[SALA CERRADA] ${found.roomId} — ${reason}`);
    }

    console.log(`[-] ${socket.id}  (${reason})`);
  });
});

// ── Healthcheck (Railway lo usa para saber si el server está vivo) ─────────
app.get('/', (_req, res) => res.send('Arena 1v1 server OK'));

// ── Arranque ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`\n🚀  Arena 1v1 corriendo en http://localhost:${PORT}\n`)
);
