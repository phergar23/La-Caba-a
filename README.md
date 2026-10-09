# La Cabaña

Juego de terror en primera persona hecho con Three.js, en el navegador y sin instalar nada.

Eres el nuevo guarda forestal del bosque de Robledal. Vives en una cabaña de dos plantas, con búnker, en mitad del bosque. **De día** haces encargos para turistas y vecinos y compras material en el pueblo. **De noche** algo intenta entrar en la cabaña, y basta un solo golpe suyo para matarte.

Hay dos modos:

- **Modo historia**: juegas solo contra la criatura. Al empezar eliges papel: el **guardabosques** (la historia de Tomás, el guarda anterior), la **investigadora**, el **cazador** o el **alcalde**. Ver [Papeles](#papeles).
- **Multijugador**: de 2 a 5 personas. Siempre hay un guardabosques y un monstruo; con más gente entran la investigadora, el cazador y el alcalde. Ver [Multijugador](#multijugador).

## Cómo jugar

Abre `cabana/index.html` en Chrome, Edge o Firefox de un ordenador. Funciona con doble clic, sin servidor y sin internet: todo, incluidos Three.js y las fuentes, está en la carpeta. (Las vistas previas de las apps y de los móviles no ejecutan el juego: si se queda en «Cargando el bosque...», ábrelo en el navegador.)

Si prefieres servirlo:

```bash
npx http-server cabana
```

Recomendado: auriculares. El sonido es posicional, así que oirás por dónde anda.

## Controles

| Tecla | Acción |
| --- | --- |
| WASD / ↑↓ | Moverse |
| Shift | Correr (gasta aliento) |
| Ratón | Mirar. Haz clic en la pantalla para capturar el ratón (se avisa cuando no está capturado); Esc lo suelta. Si el navegador no deja capturarlo, gira llevando el puntero a los bordes de la pantalla |
| ← → | Girar sin ratón |
| E | Interactuar: abrir/cerrar, hablar, comprar, leer, recoger, subir o bajar por las trampillas, arrancar el generador, montar cámaras |
| Q | Acción secundaria: pestillos y cerrojos, repostar el generador, montar detectores, cerrar la trampilla del búnker |
| T | Clavar un tablón (atrancar puertas, tapiar ventanas) |
| F | Linterna |
| 1 / 2 / 3 | Linterna sola / revólver / escopeta (también con la rueda) |
| 4 | Rifle de caza (cazador; clic derecho para la mira) |
| B / C | Cazador: poner un cepo / montar un escondite con ramas |
| Q | Investigadora: entrevistar al vecino con el que hablas |
| V | Medidor de campo (investigadora) |
| Clic izquierdo / derecho | Disparar / apuntar. La investigadora, con las manos libres, saca una **foto con flash** / hace **zoom** |
| 1 / 2 / 3 (en el pleno) | Contestar a los vecinos (alcalde) |
| R | Recargar |
| H | Usar botiquín |
| G | Lanzar una bengala (cuando las consigas) |
| Esc | Pausa (calidad, sensibilidad, volumen, campo de visión) |

Si juegas de **monstruo** en multijugador: **clic** zarpazo, **mantén E** forzar, **E** usar, **Q** rugido, **V** olfato y **R** voces.

En el monitor de cámaras: **← →** cambia de cámara y **E** sale.

En el mapa del alcalde: **clic** en una farola para encenderla o apagarla, clic en una cámara para verla, **Tab** cambia entre el pueblo y todo el bosque, y **E** o **Esc** lo cierra.

En un iPad (con teclado y ratón conectados) aparece arriba a la derecha un botón **II** para la pausa, y tocar la pantalla con el dedo suelta el ratón.

## El día: 4 encargos diarios

La brújula de arriba marca la cabaña (⌂), el pueblo (✚) y los encargos (! para quien los da, ? para lo que hay que buscar).

Cada día hay **4 encargos**, elegidos entre 13 tipos:

| Encargo | Qué hay que hacer |
| --- | --- |
| Turista perdido | Te sigue; llévalo al pueblo |
| Objeto perdido | Busca el objeto que brilla cerca del turista y devuélveselo |
| Turista herido | Necesita un botiquín |
| Niño perdido | Encuentra al hijo (se le oye llorar) y llévalo con su padre o madre |
| Perro perdido | Encuentra al perro (ladra), llámalo y llévalo con su dueño |
| Setas de Remedios | La curandera necesita 5 setas rojas de un claro del bosque |
| Paquete de Anselmo | Lleva un paquete de la armería a los campistas del norte |
| Fototrampeo | El alcalde quiere las tarjetas de dos cámaras escondidas en el bosque |
| Fotógrafo | Guía a un fotógrafo hasta el pozo, la tumba, el campamento o las figuras de palos |
| Leña | Ramón, el tabernero, necesita 4 haces de leña que dejaron junto al camino |
| Postes del sendero | Julián te pide enderezar 3 postes que algo ha tirado |
| Cepos de un furtivo | Desmonta 3 cepos escondidos en el bosque. Si pisas uno, te hace daño |
| Hoguera abandonada | Sigue el humo y apágala antes de las 16:00 |

Si anochece con encargos a medias, se pierden.

## La historia de Tomás

Además de los encargos, cada día se desbloquea un paso de la historia (aparece con ★ en la lista y en la brújula):

1. **Día 1**: lee la nota de Tomás y pregunta por él en la taberna.
2. **Día 2**: busca su diario junto al pozo viejo.
3. **Día 3**: sigue las marcas de garras en los árboles hasta la guarida del monstruo... y no lo despiertes.
4. **Día 4**: lleva la linterna de Tomás al padre Elías. Te dará **bengalas** (G): su luz roja hace retroceder al monstruo al instante. Desde entonces, Julián también las vende.
5. **Día 5**: quema la guarida con un bidón de gasolina. Esa noche vendrá furioso; si la aguantas, verás el final de la historia.

Mientras tanto, el monstruo también da señales de día: un regalo macabro en el porche, huellas enormes alrededor de la cabaña, la voz de Tomás llamándote desde el bosque y apariciones entre los árboles cada vez más frecuentes. La tercera noche, alguien que dice ser Tomás llamará a tu puerta.

## El pueblo

Los locales abren de 7:00 a 19:45. A esa hora te echan a la calle y cierran las puertas.

- **Armería de Anselmo**: armas, munición, tablones, cristales, pilas, botiquines y pestillos reforzados.
- **Ferretería de Julián**: cámaras de seguridad, detectores de movimiento y gasolina para el generador.
- **Taberna El Ciervo Blanco**: café (correr cansa la mitad hasta la noche), estofado (cura del todo) y rumores con pistas.
- **Casa de Remedios**: botiquines más baratos y el encargo de las setas.
- **Ayuntamiento**: el alcalde y su encargo.
- **Iglesia**: el padre Elías tiene cosas que contar.

## La cabaña

- **Planta baja**: dos puertas con pestillo, cuatro ventanas, la chimenea, la radio, el interruptor de la luz y la **trampilla del búnker**.
- **Primera planta**: la cama (dormir hasta las 18:00), el **generador** y la escalera de mano a la trampilla del tejado.
- **Tejado**: mirador con el **foco**, que apunta hacia donde miras.
- **Búnker**: se baja por la trampilla del suelo, que tiene cerrojo por abajo. Tiene el **panel de seguridad** con las cámaras.

### Generador

Está en la primera planta. **E** lo arranca tirando del cable (a veces hay que tirar varias veces) y **Q** lo reposta con un bidón. Alimenta las luces de la cabaña, el porche y el búnker, las cámaras, los detectores y el foco. Todo gasta gasolina: con un uso normal se va casi la mitad del depósito en una noche, pero con el foco encendido no llega al amanecer. Apágalo de día.

### Cámaras y detectores

Hay 5 soportes alrededor de la cabaña (fachada, trasera, oeste, este y tejado). En cada uno caben una cámara (**E**) y un detector (**Q**). Las cámaras se ven desde el búnker con visión nocturna. Los detectores hacen sonar una alarma y muestran un aviso en pantalla cuando algo se acerca.

## La noche (20:00 a 06:00)

- **Un solo golpe del monstruo te mata.**
- Elige una entrada: dos puertas, cuatro ventanas y, desde la segunda noche, la trampilla del tejado (trepa por la pared). Si te escondes en el búnker, revienta la trampilla del suelo.
- **Puertas**: fuerza el pestillo en silencio. Cuando lo consigue suena un **clic metálico**; tienes unos segundos para volver a echarlo.
- **Ventanas**: arranca los tablones uno a uno, rompe el cristal y se cuela.
- **La luz le molesta**: la linterna o el foco lo espantan si le das un rato; una bengala, al instante. Un disparo le hace huir.
- **No se rinde**: aunque le dejes malherido, se esconde un rato en el bosque, se recupera y vuelve. Ataca hasta que amanece.
- **Sucesos nocturnos**:
  - Vecinos que **llaman a la puerta** pidiendo refugio. Si es uno de verdad y le abres, te da un regalo y propina por la mañana. A veces no es un vecino: si abres, entra él. Los de verdad llevan farol; míralos por la ventana o por las cámaras antes de abrir.
  - Además: averías del generador, apagones, pasos en el tejado, la radio que se enciende sola o voces que te llaman desde el bosque.
- Cada noche es más rápido y más resistente. Sobrevive a **5 noches** para ganar (y sigue si quieres).

La partida se guarda sola cada amanecer (en el almacenamiento local del navegador).

## Papeles

Cada papel tiene su propio objetivo y **su propia casa**, donde pasa la noche (de noche el monstruo sale a cazar). Para ganar, además de cumplir su objetivo, hay que seguir vivo al final: 5 noches en el modo historia y 3 en multijugador. Todos pueden comprar en el pueblo, linterna, bengalas y tablones; **armas, solo el guardabosques y el cazador** (a la investigadora y al alcalde, Anselmo no les vende ni armas ni munición).

Los vecinos y los tenderos **te hablan distinto según tu papel**: a la investigadora la tratan como «la de la revista», al cazador le preguntan por la caza (y le miran el rifle con recelo) y al alcalde le reclaman farolas y explicaciones.

### Las casas

Cada casa se defiende de una forma distinta:

| Casa | Papel | Cómo se defiende |
| --- | --- | --- |
| **Cabaña** | Guardabosques | Dos puertas con pestillo, cuatro ventanas, trampilla al tejado y búnker. Generador, foco, cámaras y detectores. |
| **Caravana** (junto al camino) | Investigadora | Puerta y una ventana que se pueden atrancar. Alrededor hay **tres trampas de flash**: si el monstruo pasa cerca, el fogonazo lo ciega y lo hace retroceder... y le saca una foto nítida para el expediente. Cada trampa salta una vez; hay que volver a armarla (E). |
| **Fortín** (en mitad del bosque, al este) | Cazador | Casa de troncos de **dos plantas** sobre un zócalo de piedra. Abajo, banco de trabajo, barriles y estufa; una escalera sube a la planta de arriba, más ancha que la de abajo, con **troneras** en las cuatro caras para disparar. Arriba está el **arsenal**: armero con rifles y ballesta, cepos colgados, mesa con cajas de munición y el mapa de caza, catre y trofeo de ciervo. La puerta está reforzada con flejes de hierro (cuesta más forzarla). Alrededor hay seis **cencerros**: si algo grande cruza el claro de noche suenan y te dicen por qué lado viene. |
| **Ayuntamiento** | Alcalde | **Dos plantas**, muros de piedra y una **puerta maciza** que cuesta más del doble de forzar. Arriba está el despacho: un **mapa interactivo del pueblo** desde el que enciende y apaga las **farolas** (como mucho 3 a la vez; una farola encendida espanta al monstruo, pero a veces la revienta) y ve dónde lo han visto por última vez; un **monitor con 9 cámaras de seguridad** repartidas por el bosque (avisan cuando pasa por delante); y la cuerda de la **campana de alarma**, que lo espanta (3 toques por noche) pero el pueblo entero la oye: cada toque sube los rumores. Al amanecer arreglan las farolas rotas. |

Cada casa tiene una cama (litera, catre o sofá) para dormir hasta la tarde. En el modo historia, si no eres el guardabosques, la cabaña está cerrada con llave.

**Guardabosques.** Vive en la cabaña. De día hace los encargos de turistas y vecinos (y en el modo historia descubre qué le pasó a Tomás). Su objetivo es aguantar las noches.

**Investigadora.** Vive en una caravana junto al camino (◆ en la brújula). Quiere demostrar que el monstruo existe y tiene que reunir un expediente:
- **Huellas**: cada día aparecen 3 rastros en el bosque (? en la brújula). E para fotografiarlas.
- **Foto nítida**: de noche, a menos de 9 m del monstruo (18 m con el zoom). Más lejos sale movida.
- **Su voz**: su cámara graba sola cuando el monstruo habla, gruñe o chilla cerca (20 m).
- **Sangre**: donde le hieran (con balas o con un cepo) queda una mancha. E para tomar una muestra.

La investigadora **lo ve todo a través de su cámara**, que está grabando siempre (REC, contador, batería y, de noche, **visión nocturna** en verde que deja ver algo más lejos). Con las manos libres, el **clic saca una foto con flash**: el fogonazo **espanta al monstruo** si está a menos de 14 m y lo mira (en multijugador lo ciega, le quema un poco y lo frena unos segundos). El flash tarda **7 s** en recargarse (barra FLASH del visor). Con el **clic derecho hace zoom** (×3): el encuadre es más estrecho, pero la foto sale nítida hasta a 18 m.

**Medidor de campo (V).** Enciende el medidor electromagnético: cinco luces (verde → rojo) y un pitido que se acelera cuanto más cerca está algo raro. Cada día hay **3 anomalías escondidas** en el bosque que no salen en la brújula: hay que buscarlas al calor del pitido. Cuando el medidor está al rojo aparece un brillo: E para registrarla (un reloj parado a las 3:33, la placa de Tomás doblada, un círculo de hierba quemada...). La revista paga **15 $ por anomalía** y, al llegar a 5, saca un **número especial** (40 $ más). De noche el medidor también reacciona **a él**: si las luces parpadean, lo tienes cerca.

**Entrevistas (Q).** Al hablar con un vecino del pueblo puedes entrevistarle (uno al día cada uno). Cada vecino tiene su carácter, que se nota en cómo te recibe (asustado, charlatán, desconfiado, tranquilo): hay que elegir **cómo empezar** (con calma, al grano o invitando a una ronda por 5 $) y **cómo convencerle** (prometer el anonimato, enseñarle las pruebas que ya tienes o preguntarle por Tomás). Si aciertas las dos, te da su **testimonio**, que va al expediente. Si fallas, se cierra en banda hasta mañana.

**Espiar con la cámara (multijugador).** Con el zoom puesto (clic derecho), si encuadras a otro jugador la cámara te dice quién es, a cuántos metros está, qué arma lleva y cuánto dinero tiene. Si le has pillado en algo raro (el cazador disparando a otro jugador, el alcalde borrando huellas o arrancando un pasquín), aparece en rojo: la foto es una **exclusiva** que la revista paga a 35 $ (se envía desde la radio). Si no, la foto le **sigue la pista** dos minutos (◉ en la brújula).

Las pruebas se envían desde la radio de la caravana (la revista paga 10 $ por cada una). Gana si envía el expediente completo: en el modo historia 5 huellas, 2 fotos, 2 grabaciones, 1 muestra y 2 testimonios; en multijugador 3 huellas, 1 foto, 1 grabación, 1 muestra y 1 testimonio.

**Cazador.** Vive en el fortín, en mitad del bosque (◆). Empieza con un **rifle de caza** (4; cinco balas por cargador, munición en el armero y en la armería de Anselmo) con **mira telescópica** (clic derecho). Su objetivo es **cazar al monstruo**: gana con 350 puntos de caza (220 en multijugador). Cada punto de daño que le haga al monstruo es un punto, y cada cepo que salta da 40.
- **Campo de tiro**: al este del fortín hay un banco y seis dianas que se levantan de una en una. E en el banco empieza una ronda (las balas de prácticas no gastan munición). Si aciertas 4 de 6, tu **puntería** sube un punto (una vez al día, hasta 5): el rifle tiembla menos y hace más daño.
- **Cepos (B)**: se colocan en el bosque, tapados con hojas. Si el monstruo pisa uno, se queda **clavado unos segundos** (en multijugador no puede moverse), recibe daño y te llega un aviso con su posición. E para rearmarlo, Q para recogerlo. Llevas 4 como mucho y puedes tener 6 puestos; la caja del arsenal trae 4 cada mañana.
- **Escondites (C)**: con un haz de ramas montas un escondite donde estés (hasta 3). Dentro, el monstruo **no te ve ni te huele** salvo que esté encima: da vueltas buscándote. Desde dentro disparas con más precisión.
- **Marca de sangre**: cuando le hieres, durante 45 s ves dónde está (✚ en la brújula).
- **Arsenal**: en la planta de arriba del fortín, el armero da 10 balas una vez al día, y hay cepos y ramas para reponer.
- **Disparar a otros jugadores**: en multijugador el rifle (y cualquier arma del cazador) **hiere a los demás humanos** (60 % del daño). Pero cuidado: si la investigadora te pilla con su cámara, es una exclusiva.

Los disparos se oyen en todo el bosque: en multijugador el monstruo sabe dónde suenan (✕ en la brújula).

**Alcalde.** Vive en el ayuntamiento (Don Severino no está: el alcalde eres tú). Su objetivo es que el pueblo no se entere de nada: los **rumores** empiezan en 20 y no pueden llegar a 100. Cada día tiene que borrar las huellas del bosque, arrancar 2 pasquines de las fachadas del pueblo, calmar a 3 vecinos (marcados con !) y celebrar el **pleno** del ayuntamiento. Lo que quede sin hacer al anochecer sube los rumores. En multijugador también suben cuando la investigadora manda pruebas a la revista y cuando el monstruo atrapa a alguien. Cobra 25 $ al día.

**El pleno.** Se abre en el atril de la planta baja (E) entre las 9:00 y las 16:30, y dura **hora y media del reloj del juego**. Los vecinos se sientan en el salón y, uno a uno, se levantan, alzan la mano y preguntan. Es un **concurso**: hay que contestar lo correcto con el ratón o con 1, 2 y 3 antes de que se acabe la barra. Hay preguntas **sobre el pueblo** (horarios, quién vende qué, cuántas farolas y cámaras hay...), donde lo correcto es lo que es verdad, y **preguntas delicadas** (arañazos en una contraventana, los pasquines, la periodista...), donde lo correcto es lo que tranquiliza sin destapar nada: ni mentiras que se ven a la legua ni decir que hay un monstruo. Cada acierto baja 3 los rumores; cada fallo los sube 4 y quedarse callado, 2. Quien contesta rápido recibe más preguntas. Si al final aciertas 3 o más y al menos tres de cada cuatro, **ovación** (−5); si fallas mucho, **abucheos** (+5). Irse a medias (Esc dos veces) sube 6.

**El mapa del despacho** es un plano antiguo del pueblo sobre pergamino: tejados, el bosque dibujado a tinta, rosa de los vientos y escala. Al pasar el ratón por una farola o una cámara se ve qué es y qué hace el clic; de noche el plano se oscurece y las farolas encendidas brillan.

## Multijugador

En el menú, **Multijugador** → **Crear sala** o **Meter código**.

1. Quien crea la sala elige cuántos vais a jugar (**2, 3, 4 o 5**) y le sale un código de 5 letras y números.
2. Los demás pulsan **Meter código** y lo escriben.
3. En la sala de espera cada uno elige su papel. Siempre tiene que haber un **guardabosques** y un **monstruo**; los demás eligen entre **investigadora**, **cazador** y **alcalde** (cada papel, una sola persona). Quien no elija recibe un papel libre.
4. Cuando estáis todos, quien creó la sala pulsa **Empezar la partida**.

**El guardabosques** juega como en el modo historia (encargos, pueblo, tiendas, generador, cámaras, pestillos...), pero sin la historia de Tomás ni visitas nocturnas: quien llama a la puerta es siempre el monstruo. La ferretería de Julián vende **bengalas** desde el primer día. **Gana si aguanta 3 noches.**

**Los demás humanos** juegan su papel (ver [Papeles](#papeles)) y de noche se refugian cada uno en su casa (ver [Las casas](#las-casas)): lo que pasa en cada casa (puertas, tablones, trampas, la hoguera, la campana) y en la cabaña lo ven todos. Cada uno ve a los demás con su nombre encima y en la brújula (●). **Ganan si siguen vivos al amanecer de la noche 3 y han cumplido su objetivo.** Si a alguien lo atrapan, sigue viendo la partida por los ojos de otro humano (clic para cambiar).

**El monstruo** pasa el día en su guarida, una cueva enorme bajo el bosque, y a las 20:00 sale a cazar. **Gana si atrapa al menos a la mitad de los humanos** (con un solo humano, atraparlo a él; un zarpazo basta). Si los atrapa a todos, la partida acaba en ese momento. Su brújula marca la cabaña (⌂) y las demás casas (◆); puede forzar sus puertas y ventanas igual que las de la cabaña, pero las trampas de flash lo ciegan, la hoguera lo quema y la campana del ayuntamiento le hace daño. Las farolas que enciende el alcalde también le queman: puede reventarlas (E junto al poste). El flash de la cámara de la investigadora lo deja ciego y lento unos segundos.

Al final, cada uno ve una tabla con el resultado de todos: pueden ganar varios a la vez, uno solo o ninguno.

### La guarida del monstruo

Seis actividades, cada una sube un nivel de una mejora (máximo 3) y solo se puede hacer **una vez al día**. La brújula marca las que quedan.

| Actividad | Qué hay que hacer | Mejora |
| --- | --- | --- |
| Altar de huesos | Recoge 6 huesos tirados por la cueva y ofréceselos | **Resistencia**: +50 de vida |
| Piedra de afilar | Golpea (E o clic) cuando la aguja pase por la zona roja: 6 aciertos antes de 3 fallos | **Garras**: fuerza pestillos, tablones y trampillas más deprisa. Con nivel 1 puede trepar al tejado |
| Estanque negro | Atrapa 8 fuegos fatuos que aparecen por la cueva antes de que se acabe el tiempo | **Velocidad**: corre más y se cansa menos |
| Tótem del rugido | Mantén E y no pierdas de vista el ojo rojo que gira alrededor del tótem | **Rugido (Q)**: apaga la linterna del guarda y las luces de la cabaña unos segundos |
| Nido de raíces | Caza 5 ratas a zarpazos antes de que se escondan | **Olfato (V)**: ves dónde está el guarda a través de las paredes |
| Muro de las voces | Las bocas susurran en orden; tócalas (E) en el mismo orden, tres rondas | **Voces (R)**: llama a la puerta con voz humana para engañarle |

### La noche del monstruo

- Sale por uno de los **tres túneles** de la pared sur: junto a su guarida del bosque, por el pozo viejo o junto al campamento abandonado. También puede volver por ellos.
- Ve en la oscuridad. La brújula marca la cabaña (⌂).
- **Clic**: zarpazo. **Mantén E**: forzar pestillos, embestir puertas atrancadas, arrancar tablones, reventar la trampilla del búnker. **E**: abrir lo que no esté cerrado, romper cristales, colarse por ventanas, trepar al tejado por la pared este, dejarse caer por la trampilla del tejado, arrancar los cables del generador.
- **La luz le quema**: la linterna y el foco le van quitando vida, y una bengala mucho más. Las balas también. Si se queda sin vida, vuelve a rastras a la guarida y tarda 25 segundos en poder salir.
- Al amanecer vuelve solo a la cueva.

### Cómo se conectan

- **Desde el enlace de claude.ai**: los dos abren el mismo enlace con su cuenta. La otra persona tiene que tener acceso a la página (compártela con ella desde el botón de compartir). El juego prueba a la vez la sala de claude.ai y la conexión por internet: en algunas vistas (por ejemplo, en el móvil) la sala de claude.ai no está disponible y se usa solo internet. Abajo, en la pantalla de Multijugador, se ve cómo está cada conexión.
- **Desde la carpeta descargada o GitHub Pages**: todos los aparatos necesitan internet. La conexión es directa entre navegadores (WebRTC, con la librería PeerJS y su servidor público para encontrarse). Algunas redes muy cerradas (de empresa, por ejemplo) pueden bloquearla.
- **En el mismo ordenador**: funciona entre varias pestañas o ventanas del mismo navegador, sin internet (sirviendo la carpeta con `npx http-server cabana`).

El guardabosques manda sobre la hora del día, la cabaña y el generador (si se va, pasa al siguiente humano); el monstruo, sobre su cuerpo y sus mejoras. Si se va un humano, la partida sigue sin él; si se va el monstruo (o todos los humanos), la partida termina. Por internet (PeerJS) todos se conectan con quien creó la sala, que reenvía lo de cada uno a los demás: esa persona tiene que seguir con la página abierta. Las partidas multijugador no se guardan.

## Estructura

```
cabana/
├── index.html        Página, HUD, menús y monitor de cámaras
├── css/style.css     Estilo de la interfaz y efectos de pantalla
├── fonts/            Fuentes Special Elite e IM Fell English SC (ver fonts/LICENSE.txt)
├── lib/three.min.js  Three.js r158 (MIT)
├── lib/peerjs.min.js PeerJS 1.5.4 (MIT), para el multijugador desde la carpeta
└── js/
    ├── config.js     Ajustes: tiempos, precios, tiendas, recompensas, generador, dificultad
    ├── util.js       Utilidades matemáticas y de rayos
    ├── audio.js      Sonido 100% procedural con WebAudio
    ├── textures.js   Texturas generadas por código (look pixelado)
    ├── world.js      Bosque, camino, colisiones y suelos
    ├── characters.js Modelos de personas, perro, la criatura y objetos de encargo
    ├── cabin.js      Cabaña: puertas, ventanas, trampillas, búnker, luces, navegación
    ├── village.js    Pueblo y locales con interior
    ├── player.js     Movimiento, linterna, salud, aliento
    ├── weapons.js    Armas, rifle con mira, cámara de fotos y modelo en primera persona
    ├── power.js      Generador, foco, cámaras y detectores
    ├── intruder.js   IA de la criatura (asedio, búnker, imitaciones, anti-atascos)
    ├── missions.js   Los 13 tipos de encargo (4 al día)
    ├── events.js     Sucesos nocturnos (vecinos que llaman, averías, ruidos)
    ├── story.js      Historia de Tomás: diario, guarida, sucesos diarios y final
    ├── notes.js      Notas y mensajes de radio
    ├── homes.js      Casas de los papeles: caravana, fortín del cazador y ayuntamiento
    ├── townmap.js    Mapa del alcalde: plano antiguo del pueblo (farolas, cámaras, avistamientos)
    ├── roles.js      Papeles: investigadora, cazador y alcalde (objetivos, pruebas, espionaje, rumores)
    ├── hunter.js     Cazador: campo de tiro, puntería, cepos, escondites y puntos de caza
    ├── interview.js  Entrevistas de la investigadora a los vecinos
    ├── pleno.js      Pleno del alcalde: concurso de preguntas de los vecinos
    ├── dialogue.js   Lo que dicen los vecinos y los tenderos según tu papel
    ├── hud.js        Interfaz
    ├── net.js        Conexión del multijugador (sala de claude.ai, PeerJS o pestañas)
    ├── cavern.js     Guarida del monstruo y sus seis actividades
    ├── mp.js         Multijugador (2 a 5): sala de espera, sincronización, resultados y poderes del monstruo
    └── game.js       Bucle principal, ciclo día/noche, tiendas, monitor, guardado
```

Casi todo el equilibrio se ajusta en `js/config.js`.
