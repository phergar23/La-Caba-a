'use strict';

// Versión visible en el menú y la pausa (para saber qué copia del juego tienes abierta)
const GAME_VERSION = '1.11';

// Ajustes generales del juego. Casi todo el balance se toca desde aquí.
const CFG = {
  SEED: 20261031,

  // Escala de píxel (render a baja resolución para el look retro)
  QUALITY: [
    { name: 'Retro', scale: 3 },
    { name: 'Media', scale: 2 },
    { name: 'Alta', scale: 1 },
  ],

  TIME: {
    DAY_START: 6 * 60,        // 06:00
    DUSK_WARN: 18 * 60 + 30,  // aviso de que anochece
    SHOP_CLOSE: 19 * 60 + 30, // cierran las tiendas y suena la campana
    KICK_OUT: 19 * 60 + 45,   // echan a la gente de los locales del pueblo
    OPEN: 7 * 60,             // abren los locales
    NIGHT_START: 20 * 60,     // 20:00
    NIGHT_END: 30 * 60,       // 06:00 del día siguiente
    DAY_REAL: 510,            // segundos reales que dura el día (06:00 → 20:00)
    NIGHT_REAL: 270,          // segundos reales que dura la noche (20:00 → 06:00)
    SLEEP_TO: 18 * 60,        // dormir de día lleva hasta esta hora
  },

  PLAYER: {
    eye: 1.62,
    radius: 0.3,
    walk: 3.3,
    sprint: 6.0,
    step: 0.5,
    gravity: 20,
    maxHealth: 100,
    staminaDrain: 22,
    staminaRegen: 14,
    batteryDrain: 0.36,  // % por segundo con la linterna encendida
    reach: 2.6,          // distancia para interactuar
  },

  START: {
    money: 40, planks: 2, batteries: 1, medkits: 0, glass: 0, ammo38: 0, shells: 0,
    fuel: 0, cameras: 0, detectors: 0, flares: 0, ammo308: 0,
  },

  NIGHTS_TO_WIN: 5,
  MISSIONS_PER_DAY: 4,

  REWARDS: {
    lost: 30, item: 22, injured: 40, child: 45, dog: 35, photo: 35,
    mushrooms: 35, delivery: 30, trailcam: 40, firewood: 30, signs: 35,
    traps: 40, campfire: 30,
  },

  WEAPONS: {
    revolver: { name: 'Revólver .38', mag: 6, damage: 34, rate: 0.42, reload: 2.0, ammo: 'ammo38', pellets: 1, spread: 0.006, range: 70 },
    shotgun: { name: 'Escopeta', mag: 2, damage: 14, rate: 0.8, reload: 1.7, ammo: 'shells', pellets: 8, spread: 0.055, range: 35 },
    rifle: { name: 'Rifle de caza', mag: 5, damage: 48, rate: 1.15, reload: 2.6, ammo: 'ammo308', pellets: 1, spread: 0.004, range: 140 },
  },

  // Catálogo de artículos (cada tienda vende una parte)
  ITEMS: {
    revolver: { name: 'Revólver .38', price: 60, desc: 'Seis balas. Sencillo y fiable.', kind: 'weapon' },
    ammo38: { name: 'Balas .38 (x12)', price: 12, desc: 'Munición para el revólver.', kind: 'stack', qty: 12 },
    shotgun: { name: 'Escopeta de dos cañones', price: 150, desc: 'Devastadora a corta distancia.', kind: 'weapon' },
    shells: { name: 'Cartuchos (x6)', price: 18, desc: 'Munición para la escopeta.', kind: 'stack', qty: 6 },
    rifle: { name: 'Rifle de caza', price: 140, desc: 'Largo alcance y mira telescópica (clic derecho).', kind: 'weapon' },
    ammo308: { name: 'Balas de rifle (x10)', price: 16, desc: 'Munición para el rifle de caza.', kind: 'stack', qty: 10 },
    planks: { name: 'Tablones con clavos (x2)', price: 10, desc: 'Tapia ventanas o atranca puertas.', kind: 'stack', qty: 2 },
    glass: { name: 'Cristal de ventana', price: 12, desc: 'Repara una ventana rota.', kind: 'stack', qty: 1 },
    batteries: { name: 'Pilas', price: 6, desc: 'Carga completa para la linterna.', kind: 'stack', qty: 1 },
    medkits: { name: 'Botiquín', price: 20, desc: 'Cura heridas. También sirve para turistas heridos.', kind: 'stack', qty: 1 },
    lock: { name: 'Pestillos reforzados', price: 45, desc: 'Mejora todos los pestillos: cuesta más forzarlos.', kind: 'upgrade', max: 3 },
    fuel: { name: 'Bidón de gasolina', price: 12, desc: 'Para el generador (+40% de depósito).', kind: 'stack', qty: 1 },
    cameras: { name: 'Cámara de seguridad', price: 35, desc: 'Se monta en los soportes de la cabaña. Se ve desde el búnker.', kind: 'stack', qty: 1 },
    detectors: { name: 'Detector de movimiento', price: 20, desc: 'Avisa con una alarma cuando algo se acerca.', kind: 'stack', qty: 1 },
    coffee: { name: 'Café de puchero', price: 4, desc: 'Correr cansa la mitad hasta que anochezca.', kind: 'consume' },
    stew: { name: 'Estofado de la casa', price: 9, desc: 'Recupera toda la salud.', kind: 'consume' },
    flares: { name: 'Bengala de magnesio', price: 15, desc: 'Lánzala con G: su luz roja lo hace retroceder al momento.', kind: 'stack', qty: 1, requires: 'flares' },
  },

  VENDORS: {
    anselmo: {
      title: 'ARMERÍA · ULTRAMARINOS ANSELMO',
      items: ['revolver', 'ammo38', 'shotgun', 'shells', 'rifle', 'ammo308', 'planks', 'glass', 'batteries', 'medkits', 'lock'],
      lines: [
        'Hmm. Otra vez tú. ¿Qué te pongo?',
        'Las noches son largas allí arriba, ¿eh?',
        'Tomás también compraba mucha munición. Al final no le sirvió de mucho.',
        'Tablones, pilas, balas. Lo que se lleva siempre la gente de tu cabaña.',
        'No me cuentes lo que oyes por la noche. Prefiero no saberlo.',
      ],
    },
    julian: {
      title: 'FERRETERÍA JULIÁN',
      items: ['cameras', 'detectors', 'fuel', 'flares', 'planks', 'batteries', 'glass'],
      lines: [
        'Cámaras con visión nocturna. Las montas en los soportes que dejó Tomás.',
        'Ese generador traga gasolina como un demonio. No lo dejes encendido de día.',
        'Los detectores pitan en el búnker y en tu reloj. Así no te pilla dormido.',
        'Tomás me compró cinco cámaras. Decía que quería ver qué le arañaba la puerta.',
      ],
    },
    remedios: {
      title: 'CASA DE REMEDIOS',
      items: [{ id: 'medkits', price: 15 }],
      lines: [
        'Vendas, alcohol y hierbas. Lo mismo que en la ciudad, pero más barato.',
        'Siéntate, hijo, que traes mala cara.',
        'A Tomás le curé las manos muchas veces. Las tenía llenas de astillas de tanto clavar tablones.',
      ],
    },
    taberna: {
      title: 'TABERNA EL CIERVO BLANCO',
      items: ['coffee', 'stew'],
      lines: [
        '¿Qué va a ser? El café está recién hecho.',
        'Aquí nadie habla de lo que pasa de noche. Bebe y calla.',
        'Esa cabeza de ciervo de la pared la cazó mi abuelo. Dicen que no era un ciervo.',
      ],
    },
  },

  // Generador eléctrico (consumo en % por segundo real)
  POWER: {
    startFuel: 60,
    fuelPerCan: 40,
    idle: 0.03,
    lights: 0.06,
    flood: 0.32,
    camera: 0.025,
    detector: 0.012,
    monitor: 0.05,
    detectorRange: 8,
  },

  // Intruso: valores base (se escalan con cada noche)
  INTRUDER: {
    hp: 100,
    hpPerNight: 35,
    walk: 1.7,
    run: 4.3,
    pickTime: 13,     // segundos para abrir un pestillo (nivel 1)
    hatchPickTime: 16,
    bunkerTime: 34,   // segundos para reventar la trampilla del búnker
    boardHp: 100,
    bashDamage: 13,
    bashEvery: 1.6,
    ripTime: 9,       // arrancar un tablón de ventana
    smashTime: 1.3,
    climbInTime: 2.4,
    attackWindup: 0.55,
    lightToFlee: 2.4, // segundos de linterna directa para que huya (noche 1)
  },

  WORLD: {
    minX: -95, maxX: 215, minZ: -105, maxZ: 105,
    village: { x: 150, z: -6, r: 30 },
    cabinClear: 17,
  },

  // Multijugador: de 2 a 5 personas (guardabosques, monstruo y, si hay más, investigadora, cazador y alcalde)
  MP: {
    NIGHTS: 3,            // noches que tienen que aguantar los humanos
    SEND_HZ: 12,          // paquetes por segundo durante la partida
    // Servidor de PeerJS para jugar desde la carpeta descargada. null = el servidor público de PeerJS.
    // Para usar uno propio: { host: 'mi-servidor.com', port: 443, path: '/', secure: true }
    PEER_SERVER: null,
    TIMEOUT: 25,          // segundos sin noticias de alguien = se ha ido
    MONSTER: {
      eye: 2.0, radius: 0.36, height: 2.1, walk: 3.0, sprint: 5.4, step: 0.5, gravity: 20,
      maxHealth: 100, staminaDrain: 14, staminaRegen: 16, batteryDrain: 0, reach: 2.5,
    },
    HP_PER_LEVEL: 50,     // vida extra por nivel de resistencia
    ATTACK_RANGE: 2.3,
    ATTACK_COOLDOWN: 1.1,
    LIGHT_DPS: 5,         // daño por segundo de la linterna
    FLOOD_DPS: 11,        // ... del foco del tejado
    FLARE_DPS: 30,        // ... de una bengala cercana
    FLARE_RADIUS: 12,
    REGEN: 3,             // vida por segundo cuando lleva un rato sin daño
    DOWN_TIME: 25,        // segundos que pasa en la guarida tras caer derribado
    WORK_PER_LEVEL: 0.45, // cada nivel de garras fuerza un 45% más rápido
    ROAR_CD: [0, 75, 60, 45],
    SCENT_CD: 40,
    VOICE_CD: [0, 30, 22, 15],
  },
};
