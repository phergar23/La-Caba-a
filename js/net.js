'use strict';

// Conexión entre los jugadores del multijugador (de 2 a 5).
// Cada paquete se manda por todos los canales que haya abiertos y el que llega repetido se descarta:
//  - Sala de claude.ai (capacidad "room" del artefacto): la página publicada.
//  - PeerJS (WebRTC): la carpeta descargada o GitHub Pages, en aparatos con internet. Todos se
//    conectan con quien creó la sala, que reenvía a cada uno lo que mandan los demás.
//  - BroadcastChannel: pestañas del mismo navegador.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 5;

function makeRoomCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

function cleanRoomCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
}

class NetLink {
  constructor(code, isHost) {
    this.code = code;
    this.isHost = isHost;
    this.id = Math.random().toString(36).slice(2, 10);
    this.seq = 0;
    this.seen = new Map();
    this.links = {};
    this.state = { local: 'off', room: 'off', peer: 'off' };
    this.conns = new Set();
    this.onPacket = null;
    this.onStatus = null;
    this.lastRecv = 0;
    this.closed = false;
  }

  // Se abren todos los caminos a la vez: basta con que los dos dispositivos compartan uno
  start() {
    this.openBroadcast();
    if (window.claude && typeof window.claude.use === 'function') this.openRoom();
    else this.setState('room', 'none');
    this.openPeer();
  }

  setState(kind, v) {
    this.state[kind] = v;
    if (this.onStatus) this.onStatus(kind, v);
  }

  // ---------- Pestañas del mismo navegador ----------
  openBroadcast() {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
      const bc = new BroadcastChannel('lacabana-' + this.code);
      bc.onmessage = (e) => this.receive(e.data, 'local');
      this.links.local = { send: (p) => bc.postMessage(p), close: () => bc.close() };
      this.setState('local', 'on');
    } catch (e) { /* sin BroadcastChannel */ }
  }

  // ---------- Sala de claude.ai ----------
  // Dos salas a la vez: la común de la página (todos los que la tienen abierta; cada paquete lleva
  // el código y se descartan los de otras partidas) y una propia para este código. En cuanto el otro
  // aparato habla por la propia, se deja de usar la común.
  async openRoom() {
    this.setState('room', 'connecting');
    let room = null;
    try { room = await window.claude.use('room'); } catch (e) { room = null; }
    if (this.closed) return;
    if (!room) { this.setState('room', 'none'); return; }
    const fail = (e) => {
      this.roomError = (e && e.code) || 'error';
      if (this.state.room !== 'error' && !(this.heard && (this.heard.room || this.heard.lobby))) this.setState('room', 'error');
    };
    const attach = (r, label, shared) => {
      let cleared = false;
      this.links[label] = {
        send: (p) => {
          if (shared && this.heard && this.heard.room) {
            if (!cleared) { cleared = true; r.presence({ g: null }).catch(() => {}); }
            return;
          }
          r.presence({ g: p }).catch(fail);
        },
        close: () => { if (shared) r.presence({ g: null }).catch(() => {}); else r.leave().catch(() => {}); },
      };
      r.onPeers((ch) => {
        let others = 0;
        ch.peers.forEach((peer) => {
          if (peer.sameTab) return;
          others++;
          if (peer.presence && peer.presence.g) this.receive(peer.presence.g, label);
        });
        // Para el diagnóstico: cuántas páginas más hay abiertas en la sala común
        if (shared && others !== this.roomOthers) {
          this.roomOthers = others;
          if (this.onStatus) this.onStatus('room', this.state.room);
        }
      }, fail);
    };
    attach(room, 'lobby', true);
    this.setState('room', 'on');
    // Estado real de la conexión con el servidor de salas de claude.ai (para el diagnóstico)
    try {
      this.roomConn = room.connected();
      room.onConnection((on) => {
        this.roomConn = on;
        if (this.onStatus) this.onStatus('room', this.state.room);
      }, fail);
    } catch (e) { /* plataforma antigua */ }
    try {
      const r = await room.join('cabana-' + this.code.toLowerCase());
      if (this.closed) { r.leave().catch(() => {}); return; }
      attach(r, 'room', false);
      this.joinState = 'ok';
    } catch (e) {
      this.joinState = (e && e.code) || 'error';
      this.roomError = this.joinState;
    }
    if (this.onStatus) this.onStatus('room', this.state.room);
  }

  // ---------- PeerJS ----------
  openPeer() {
    if (this.closed || this.peer || typeof window.Peer !== 'function') return;
    const hostId = 'lacabana-' + this.code.toLowerCase();
    try {
      // El que entra elige también su id: así no hace falta pedirle una al servidor
      this.peer = new window.Peer(this.isHost ? hostId : hostId + '-' + this.id, Object.assign({ debug: 0 }, CFG.MP.PEER_SERVER || {}));
    } catch (e) {
      this.setState('peer', 'error');
      return;
    }
    this.setState('peer', 'connecting');
    this.peer.on('open', () => {
      this.setState('peer', 'on');
      if (!this.isHost) this.connectPeer(hostId);
    });
    this.peer.on('connection', (c) => this.usePeerConn(c));
    this.peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        // La sala aún no existe (o el código está mal): se reintenta
        if (!this.closed && !this.conns.size) setTimeout(() => !this.closed && !this.conns.size && this.connectPeer(hostId), 3000);
        return;
      }
      this.setState('peer', type === 'unavailable-id' ? 'taken' : 'error');
    });
    this.peer.on('disconnected', () => {
      if (!this.closed) try { this.peer.reconnect(); } catch (e) { /* nada */ }
    });
  }

  connectPeer(id) {
    try { this.usePeerConn(this.peer.connect(id, { serialization: 'json' })); } catch (e) { /* nada */ }
  }

  // Quien crea la sala tiene una conexión con cada uno; los demás, solo con él
  usePeerConn(c) {
    c.on('open', () => {
      this.conns.add(c);
      this.links.peer = {
        send: (p) => this.conns.forEach((k) => { if (k.open) try { k.send(p); } catch (e) { /* caída */ } }),
        close: () => this.conns.forEach((k) => k.close()),
      };
      this.setState('peer', 'linked');
    });
    c.on('data', (d) => this.receive(d, 'peer', c));
    c.on('close', () => {
      this.conns.delete(c);
      if (!this.conns.size) {
        delete this.links.peer;
        if (!this.closed) this.setState('peer', 'on');
      }
    });
  }

  // ---------- Envío y recepción ----------
  send(body) {
    if (this.closed) return;
    // Los campos de control van al final: ningún dato del juego puede pisarlos
    const p = Object.assign({}, body, { c: this.code, f: this.id, n: ++this.seq, h: this.isHost ? 1 : 0 });
    for (const k in this.links) {
      try { this.links[k].send(p); } catch (e) { /* canal caído */ }
    }
  }

  receive(p, via, src) {
    if (this.closed || !p || typeof p !== 'object' || p.c !== this.code || p.f === this.id) return;
    // Por qué caminos llegan los demás (antes de descartar repetidos: el mismo paquete llega por varios)
    if (!this.heard) this.heard = {};
    if (!this.heard[via]) {
      this.heard[via] = true;
      if (this.onStatus) this.onStatus(via, this.state[via]);
    }
    const last = this.seen.get(p.f) || 0;
    if (!(p.n > last)) return;
    this.seen.set(p.f, p.n);
    this.lastRecv = performance.now();
    this.via = via;
    // PeerJS va en estrella: quien creó la sala reenvía cada paquete nuevo a los demás
    if (this.isHost && this.conns.size) {
      this.conns.forEach((k) => { if (k !== src && k.open) try { k.send(p); } catch (e) { /* caída */ } });
    }
    if (this.onPacket) this.onPacket(p);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const k in this.links) {
      try { this.links[k].close(); } catch (e) { /* nada */ }
    }
    this.links = {};
    if (this.peer) try { this.peer.destroy(); } catch (e) { /* nada */ }
  }
}
