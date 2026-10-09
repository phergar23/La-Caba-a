'use strict';

// Pleno municipal del alcalde: hora y media (del reloj del juego) de preguntas de los vecinos,
// sentados en el salón de la planta baja del ayuntamiento. Es un concurso: hay que contestar lo
// correcto. En las preguntas de datos, lo que es verdad en Robledal; en las delicadas, lo que
// tranquiliza sin destapar nada (ni mentiras que se ven a la legua ni ataques de pánico).
// Acertar baja los rumores; fallar o quedarse callado los sube.

// t: pregunta · a: respuestas, la primera es la buena · r: reacción del público a cada una
const PLENO_QUESTIONS = [
  // ---------- Datos del pueblo ----------
  { kind: 'dato', q: '¿A qué hora cierra Anselmo la armería?', a: ['A las siete y media de la tarde.', 'A las diez de la noche.', 'No cierra nunca.'] },
  { kind: 'dato', q: '¿A qué hora abren los locales del pueblo?', a: ['A las siete de la mañana.', 'A las diez.', 'A mediodía.'] },
  { kind: 'dato', q: '¿Cuántas farolas tiene Robledal?', a: ['Ocho.', 'Tres.', 'Doce.'] },
  { kind: 'dato', q: '¿Cuántas farolas puede encender el ayuntamiento a la vez?', a: ['Tres: la central no da para más.', 'Todas, cuando quiera.', 'Ninguna: se encienden solas.'] },
  { kind: 'dato', q: '¿Cuántas cámaras ha puesto el ayuntamiento en el bosque?', a: ['Nueve.', 'Dos.', 'Ninguna: eso es un bulo.'] },
  { kind: 'dato', q: '¿Cómo se llama el tabernero del Ciervo Blanco?', a: ['Ramón.', 'Julián.', 'Anselmo.'] },
  { kind: 'dato', q: '¿Quién vende las bengalas en el pueblo?', a: ['Julián, en la ferretería.', 'Anselmo, en la armería.', 'Remedios.'] },
  { kind: 'dato', q: '¿Dónde sale más barato un botiquín?', a: ['En casa de Remedios.', 'En la armería de Anselmo.', 'En la taberna.'] },
  { kind: 'dato', q: '¿Cómo se llamaba el guarda forestal de antes?', a: ['Tomás.', 'Severino.', 'Elías.'] },
  { kind: 'dato', q: '¿A qué hora hay que estar en casa, con la puerta cerrada?', a: ['Antes de las ocho de la tarde.', 'A medianoche.', 'Da igual la hora.'] },
  { kind: 'dato', q: '¿Dónde vive el cazador?', a: ['En un fortín en mitad del bosque.', 'Encima de la taberna.', 'En la caravana del camino.'] },
  { kind: 'dato', q: '¿Cómo se llama el cura de la parroquia?', a: ['El padre Elías.', 'El padre Tomás.', 'El padre Ramón.'] },
  { kind: 'dato', q: '¿Dónde está la caravana de la forastera?', a: ['Junto al camino, entre la cabaña del guarda y el pueblo.', 'En la plaza, delante de la iglesia.', 'Al lado del pozo viejo.'] },

  // ---------- Preguntas delicadas ----------
  {
    kind: 'calma', who: ['vecina'], q: 'Anoche algo arañó mi contraventana. ¿Qué va a hacer el ayuntamiento?',
    a: ['Esta noche dejo encendida la farola de su calle y mando revisar las contraventanas.', 'Sería el viento, señora. Váyase a dormir.', 'Atranque la puerta: hay un monstruo.'],
    r: ['Bueno... con luz, por lo menos, se duerme mejor.', '¿El viento? ¡El viento no tiene uñas!', '¡¿Un monstruo?! ¡Lo ha dicho el alcalde!'],
  },
  {
    kind: 'calma', q: '¿Es verdad que hay un monstruo en el bosque?',
    a: ['Hay lobos, y grandes. Por eso pedimos que nadie salga de noche.', 'Sí, y nos va a comer a todos.', '¿Monstruo? Usted ha bebido demasiado.'],
    r: ['Lobos... Bueno, tiene sentido.', '¡Lo sabía! ¡El alcalde lo sabía!', '¡Encima nos insulta!'],
  },
  {
    kind: 'calma', q: '¿Quién pone esos pasquines de «¡EXISTE!» por las fachadas?',
    a: ['Algún forastero con ganas de vender periódicos. Ya los estamos quitando.', 'Los pongo yo, para que estén atentos.', '¿Qué pasquines? Yo no he visto ninguno.'],
    r: ['Los de fuera, siempre igual.', '¿Usted? ¿El alcalde? ¿Pero entonces existe?', '¡Si hay uno en la puerta de la taberna!'],
  },
  {
    kind: 'calma', q: 'Han desaparecido excursionistas. ¿Por qué no viene la Guardia Civil?',
    a: ['Ya están avisados. Mientras tanto, el guarda forestal patrulla el bosque.', 'Porque aquí no ha desaparecido nadie.', 'Porque la Guardia Civil también tiene miedo.'],
    r: ['Menos mal que el guarda está en ello.', '¡Y los carteles de SE BUSCA qué son!', '¡Ay, Dios mío!'],
  },
  {
    kind: 'calma', who: ['cura'], q: 'Alcalde, ¿no sería mejor decirle a la gente la verdad?',
    a: ['La verdad es que de noche hay peligro, padre. Y eso es lo que les estoy diciendo.', 'La verdad no le importa a nadie.', 'Usted a sus misas, padre.'],
    r: ['Amén. Eso es verdad.', 'Qué tristeza oír eso en un pleno.', '¡Qué falta de respeto!'],
  },
  {
    kind: 'calma', who: ['julian'], q: 'Las farolas que monté todavía no me las ha pagado nadie. ¿Quién las paga?',
    a: ['El ayuntamiento, a final de mes, como siempre.', 'Usted, por buen vecino.', 'Nadie: las vamos a quitar.'],
    r: ['Bueno, a final de mes. Lo apunto.', '¡Vaya cara!', '¿Quitarlas? ¿Con lo que hay suelto por ahí?'],
  },
  {
    kind: 'calma', q: 'Mi hijo quiere acampar en el bosque este fin de semana. ¿Le dejo?',
    a: ['Mejor que no: hasta que pase la temporada de lobos, nada de acampar.', 'Claro, el bosque es muy seguro.', 'Si quiere volver entero, no.'],
    r: ['Sensato. Se quedará en casa.', '¿Seguro? Yo no lo tengo tan claro...', '¡¿Entero?! ¿Cómo que entero?'],
  },
  {
    kind: 'calma', who: ['tabernero'], q: '¿Puedo abrir la taberna hasta tarde el sábado?',
    a: ['Hasta las siete y media, como todos. Las fiestas, en verano.', 'Hasta la hora que quiera.', 'Mejor ciérrela para siempre.'],
    r: ['Vale, vale. En verano lo celebramos.', '¿Y que la gente vuelva a casa de noche? Usted verá...', '¡¿Para siempre?! ¡Pero si es lo único que hay!'],
  },
  {
    kind: 'calma', q: 'A Anselmo le piden escopetas a todas horas. ¿Las debe vender?',
    a: ['Solo al guarda forestal, que es quien patrulla.', 'A todo el que pague.', 'Que las regale: es una emergencia.'],
    r: ['Mejor. Una escopeta en cada casa es un peligro.', '¿Y si se dispara alguien en un susto?', '¿Emergencia? ¿Qué emergencia?'],
  },
  {
    kind: 'calma', who: ['remedios'], q: 'Me han traído a un excursionista con arañazos muy raros. ¿Qué le digo?',
    a: ['Que se cayó entre zarzas. Usted cúrele y que descanse.', 'Que ha tenido suerte de seguir vivo.', 'Que se calle o le multo.'],
    r: ['Zarzas. Sí, eso le diré.', '¡¿Suerte?! ¿Pues qué le arañó?', '¿Multar a un herido? ¡Qué vergüenza!'],
  },
  {
    kind: 'calma', q: 'Mi perro no deja de aullar mirando al bosque. ¿Qué le pasa?',
    a: ['Huele a los lobos. Métalo en casa por la noche.', 'Presiente la muerte.', 'Los perros aúllan porque sí.'],
    r: ['Lo meteré en la cocina.', '¡No diga eso, alcalde!', 'Pues el mío no aullaba antes...'],
  },
];

// Preguntas que solo salen si pasa algo concreto
const PLENO_CONTEXT = {
  posters: {
    kind: 'calma', q: 'Esta mañana había un pasquín en mi calle que decía «¡EXISTE!». ¿Qué es lo que existe?',
    a: ['La imaginación de algún gracioso. Ya lo hemos arrancado.', 'Lo que todos sabemos.', 'Yo no sé nada de ningún pasquín.'],
    r: ['Menudo gracioso...', '¡¿Lo que todos sabemos?!', '¡Pues yo lo vi con mis ojos!'],
  },
  lamp: {
    kind: 'calma', q: 'Anoche reventaron una farola. ¿Quién fue?',
    a: ['Unos gamberros de fuera. Ya está arreglada.', 'Algo que no quería luz.', 'Se rompió sola, de vieja.'],
    r: ['Gamberros... Hay que vigilar más.', '¡¿Algo?! ¿Qué algo?', '¿Sola? Si la pusieron el mes pasado...'],
  },
  press: {
    kind: 'calma', q: 'Esa periodista de la caravana dice que tiene fotos del monstruo. ¿Qué dice usted?',
    a: ['Fotos movidas de un oso en la niebla. Las revistas venden lo que sea.', 'Que las publique, a ver qué pasa.', 'Le vamos a confiscar la cámara.'],
    r: ['Un oso, claro. Esas revistas...', '¿Y si son de verdad?', '¿Confiscar? Pues algo habrá en esas fotos...'],
  },
  rumors: {
    kind: 'calma', q: 'En la taberna ya no se habla de otra cosa. ¿Qué nos está escondiendo, alcalde?',
    a: ['Nada: les he contado todo lo que sé. Lobos, frío y prudencia.', 'Lo que les conviene no saber.', 'Eso es secreto municipal.'],
    r: ['Bueno... si usted lo dice.', '¡Lo admite! ¡Esconde algo!', '¡¿Secreto?! ¡Esto es un escándalo!'],
  },
};

const PLENO_GOOD = ['Murmullos de aprobación.', 'Algunos asienten.', 'El público se relaja.', 'Alguien aplaude al fondo.'];
const PLENO_BAD_DATO = ['¡Eso no es verdad!', '¿Pero usted vive en este pueblo?', 'Pues sí que conoce bien Robledal...'];
const PLENO_PEOPLE = ['vecina', 'vecino', 'parroquiano1', 'parroquiano2', 'cura', 'julian', 'tabernero', 'remedios'];

class Pleno {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    G.scene.add(this.group);
    this.active = false;
    this.people = [];
    this.buildHall();
  }

  // Sillas del salón de plenos (planta baja del ayuntamiento), mirando a la mesa presidencial.
  // Dejan un pasillo en el centro, de la puerta a la mesa.
  buildHall() {
    const W = this.G.world;
    const wood = new THREE.MeshLambertMaterial({ map: MAT.planks.map, color: 0x9a6a40 });
    const b = (x0, x1, y0, y1, z0, z1, m) => {
      const mesh = new THREE.Mesh(boxGeo(x1 - x0, y1 - y0, z1 - z0, 1), m);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      this.group.add(mesh);
    };
    this.seats = [];
    [166.3, 167.6].forEach((x) => [-14.0, -13.0, -11.0, -10.0].forEach((z) => {
      b(x - 0.22, x + 0.22, 0.42, 0.47, z - 0.22, z + 0.22, wood);
      b(x - 0.26, x - 0.21, 0.47, 1.0, z - 0.22, z + 0.22, wood);
      [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].forEach(([dx, dz]) => b(x + dx - 0.025, x + dx + 0.025, 0, 0.42, z + dz - 0.025, z + dz + 0.025, wood));
      W.addBox(x - 0.24, x + 0.24, 0, 0.47, z - 0.24, z + 0.24, { furniture: true });
      this.seats.push(new THREE.Vector3(x + 0.02, 0, z));
    }));
    // Banderita y jarra de agua en la mesa presidencial
    b(169.5, 169.56, 0.85, 1.35, -12.9, -12.84, MAT.metal);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.18), new THREE.MeshLambertMaterial({ color: 0x8a1a1a, side: THREE.DoubleSide }));
    flag.position.set(169.53, 1.26, -12.72);
    flag.rotation.y = Math.PI / 2;
    this.group.add(flag);
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.22, 8), new THREE.MeshLambertMaterial({ color: 0xb8d0d8, transparent: true, opacity: 0.7 }));
    jar.position.set(169.6, 0.96, -11.2);
    this.group.add(jar);
  }

  get rumorsOn() { return this.G.roles.role === 'mayor'; }

  // ¿Se puede abrir hoy? (texto con el motivo si no)
  why() {
    const G = this.G;
    if (G.roles.speechDay === G.day) return 'Hoy ya has celebrado el pleno';
    if (G.phase !== 'day' || G.clock < 9 * 60) return 'Los plenos empiezan a partir de las 9:00';
    if (G.clock >= 16 * 60 + 30) return 'Ya es tarde: los plenos empiezan antes de las 16:30';
    return '';
  }

  start() {
    const G = this.G;
    const R = G.roles;
    if (this.active || this.why()) return false;
    const rnd = R.dayRng(G.day, 'pleno');
    this.active = true;
    R.speechDay = G.day;
    this.t0 = G.clock;
    this.end = G.clock + 90;
    this.score = 0;
    this.asked = 0;
    this.log = [];
    this.q = null;
    this.nextAt = G.clock + 3;
    // Público: los vecinos dejan lo que estaban haciendo y se sientan en el salón
    const ids = PLENO_PEOPLE.filter((id) => G.village.byId[id]);
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    this.people = ids.slice(0, this.seats.length).map((id, i) => {
      const n = G.village.byId[id];
      n.away = true;
      const mesh = makeHuman(n.look);
      const seat = this.seats[i];
      mesh.position.set(seat.x, -0.35, seat.z);
      mesh.rotation.y = Math.PI / 2;
      this.group.add(mesh);
      return { id, n, mesh, seat, stand: 0 };
    });
    // Preguntas: primero las de lo que ha pasado, luego una mezcla de datos y delicadas
    const ctx = [];
    if (R.posters.some((p) => !p.torn)) ctx.push(PLENO_CONTEXT.posters);
    if (G.homes.townhall.lamps.some((l) => l.brokeAt && l.brokeAt > performance.now() - 30 * 60 * 1000)) ctx.push(PLENO_CONTEXT.lamp);
    if (G.mp && G.mp.roster.some((r) => r.role === 'investigator')) ctx.push(PLENO_CONTEXT.press);
    if (R.rumors >= 55) ctx.push(PLENO_CONTEXT.rumors);
    const pool = PLENO_QUESTIONS.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const datos = pool.filter((q) => q.kind === 'dato');
    const calma = pool.filter((q) => q.kind === 'calma');
    this.queue = [];
    ctx.slice(0, 2).forEach((q) => this.queue.push(q));
    while (this.queue.length < 8) {
      const from = this.queue.length % 2 ? datos : calma;
      const q = from.shift() || datos.shift() || calma.shift();
      if (!q) break;
      this.queue.push(q);
    }
    this.rnd = rnd;
    // El alcalde, detrás del atril, mirando al público
    const P = G.player;
    P.pos.set(171.3, 0, -12);
    P.vel.set(0, 0, 0);
    P.yaw = Math.PI / 2;
    P.pitch = -0.1;
    G.state = 'pleno';
    G.exitLock();
    G.clearInput();
    document.getElementById('pleno').classList.remove('hidden');
    this.render();
    SFX.gavel(R.lecternPos);
    SFX.murmur(R.lecternPos, 0.5, 2);
    G.hud.banner('PLENO MUNICIPAL', 'Hora y media de preguntas de los vecinos. Contesta lo correcto.', 4);
    return true;
  }

  // Pregunta nueva: la hace uno del público, de pie y con la mano levantada
  ask() {
    const G = this.G;
    const q = this.queue.shift();
    if (!q) { this.nextAt = Infinity; return; }
    const cands = this.people.filter((p) => !q.who || q.who.includes(p.id));
    const asker = cands.length ? cands[Math.floor(this.rnd() * cands.length)] : this.people[0];
    // Respuestas desordenadas (la buena no siempre es la primera)
    const order = [0, 1, 2];
    for (let i = 2; i > 0; i--) { const j = Math.floor(this.rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    this.q = { q, asker, order, openAt: G.clock, closeAt: Math.min(G.clock + 17, this.end - 2), answered: -1 };
    this.asked++;
    SFX.click(null, 0.4);
    if (asker) G.hud.say(asker.n.name, q.q, 6);
    this.render();
  }

  answer(slot) {
    const G = this.G;
    const Q = this.q;
    if (!Q || Q.answered !== -1) return;
    const k = slot < 0 ? -1 : Q.order[slot];
    Q.answered = k < 0 ? 3 : k;
    const R = G.roles;
    const who = Q.asker ? Q.asker.n.name : 'Público';
    const pos = this.people.length ? this.people[0].mesh.position : null;
    if (k === 0) {
      this.score++;
      SFX.chime(null, 1.2, 0.5);
      SFX.murmur(pos, 0.4, 1.4);
      G.hud.say(who, Q.q.r ? Q.q.r[0] : U.pick(PLENO_GOOD), 4);
      if (this.rumorsOn) R.addRumors(-3, 'Respuesta convincente');
    } else if (k > 0) {
      SFX.murmur(pos, 0.7, 2.4, true);
      G.hud.say(who, Q.q.r ? Q.q.r[k] : U.pick(PLENO_BAD_DATO), 4);
      if (this.rumorsOn) R.addRumors(4, 'Respuesta desafortunada');
    } else {
      SFX.murmur(pos, 0.6, 2, true);
      G.hud.say(who, '... ¿No va a contestar, alcalde?', 4);
      if (this.rumorsOn) R.addRumors(2, 'Silencio incómodo en el pleno');
    }
    this.log.push(k === 0);
    // La siguiente, enseguida: quien conteste rápido, contesta más
    this.nextAt = Math.min(this.end - 12, G.clock + 6);
    if (this.nextAt <= G.clock) this.nextAt = Infinity;
    this.render();
  }

  finish(abandon) {
    const G = this.G;
    const R = G.roles;
    if (!this.active) return;
    this.cleanup();
    if (G.state === 'pleno') G.state = 'playing';
    G.requestLock();
    if (abandon) {
      SFX.murmur(R.lecternPos, 0.8, 2.6, true);
      if (this.rumorsOn) R.addRumors(6, 'Abandonas el pleno a medias');
      G.hud.banner('PLENO SUSPENDIDO', 'Te vas sin contestar. El pueblo saca sus conclusiones.', 4);
      return;
    }
    const n = this.log.length, ok = this.score;
    SFX.gavel(R.lecternPos);
    if (n && ok >= 3 && ok / n >= 0.75) {
      SFX.applause(R.lecternPos);
      if (this.rumorsOn) R.addRumors(-5, 'Ovación al final del pleno');
      G.hud.banner('PLENO TERMINADO', `${ok} de ${n} respuestas convincentes. El pueblo sale tranquilo.`, 5);
    } else if (n && ok / n < 0.4) {
      SFX.murmur(R.lecternPos, 0.8, 2.6, true);
      if (this.rumorsOn) R.addRumors(5, 'El pueblo sale del pleno más nervioso que entró');
      G.hud.banner('PLENO TERMINADO', `${ok} de ${n} respuestas convincentes. Abucheos a la salida.`, 5);
    } else G.hud.banner('PLENO TERMINADO', `${ok} de ${n} respuestas convincentes.`, 5);
  }

  // Quita el público y deja a cada vecino en su sitio
  cleanup() {
    this.active = false;
    this.q = null;
    this.people.forEach((p) => { p.n.away = false; this.group.remove(p.mesh); });
    this.people = [];
    const el = document.getElementById('pleno');
    if (el) el.classList.add('hidden');
  }

  reset() { if (this.active) this.cleanup(); }

  update(dt) {
    if (!this.active) return;
    const G = this.G;
    if (G.player.dead || G.phase !== 'day') { this.cleanup(); if (G.state === 'pleno') G.state = 'playing'; return; }
    // Si se ha ido del salón (por ejemplo, en multijugador al abrir la pausa), lo vuelve a poner en su sitio
    const P = G.player;
    P.pos.x = 171.3; P.pos.z = -12;
    const Q = this.q;
    if (Q && Q.answered === -1 && G.clock >= Q.closeAt) this.answer(-1);
    if ((!Q || Q.answered !== -1) && G.clock >= this.nextAt && G.clock < this.end - 8) this.ask();
    if (G.clock >= this.end) { this.finish(false); return; }
    // Público: el que pregunta se levanta y levanta la mano
    this.people.forEach((p) => {
      const asking = Q && Q.asker === p && Q.answered === -1;
      p.stand += U.clamp((asking ? 1 : 0) - p.stand, -dt * 3, dt * 3);
      p.mesh.position.y = -0.35 * (1 - p.stand);
      p.mesh.position.x = p.seat.x + p.stand * 0.25;
      animateHuman(p.mesh, dt, 0, { sit: p.stand < 0.5, wave: asking });
    });
    this.uiT = (this.uiT || 0) - dt;
    if (this.uiT <= 0) { this.uiT = 0.1; this.renderTimer(); }
  }

  // ---------- Interfaz ----------
  render() {
    const $ = (id) => document.getElementById(id);
    const Q = this.q;
    $('pleno-score').textContent = `Aciertos ${this.score}/${this.log.length}`;
    if (!Q) {
      $('pleno-who').textContent = 'El público se acomoda...';
      $('pleno-q').textContent = '';
      $('pleno-opts').innerHTML = '';
      return;
    }
    $('pleno-who').textContent = (Q.asker ? Q.asker.n.name : 'Un vecino') + (Q.q.kind === 'dato' ? ' · pregunta sobre el pueblo' : ' · pregunta delicada');
    $('pleno-q').textContent = '«' + Q.q.q + '»';
    $('pleno-opts').innerHTML = Q.order.map((k, i) => {
      let cls = '';
      if (Q.answered !== -1) cls = k === 0 ? ' ok' : k === Q.answered ? ' bad' : ' off';
      return `<button class="pleno-opt${cls}" data-slot="${i}"${Q.answered !== -1 ? ' disabled' : ''}><b>${i + 1}</b> ${Q.q.a[k]}</button>`;
    }).join('');
    this.renderTimer();
  }

  renderTimer() {
    const G = this.G;
    const Q = this.q;
    const $ = (id) => document.getElementById(id);
    const left = Math.max(0, this.end - G.clock);
    $('pleno-clock').textContent = `${U.fmtTime(G.clock)} · quedan ${Math.ceil(left)} min`;
    let k = 0;
    if (Q && Q.answered === -1) k = U.clamp((Q.closeAt - G.clock) / (Q.closeAt - Q.openAt), 0, 1);
    const bar = $('pleno-timer').firstChild;
    bar.style.width = (k * 100).toFixed(1) + '%';
    $('pleno-timer').classList.toggle('low', k > 0 && k < 0.3);
  }
}
