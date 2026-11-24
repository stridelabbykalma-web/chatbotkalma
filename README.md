# Chatbot de reservas · Kalma Centre Terapèutic y Stride Lab

Chat web con IA en `https://TU-DOMINIO/reservas/`. Reserva citas en Docfav, responde dudas con la información que da el centro y deriva al equipo lo demás. El enlace se manda desde la respuesta automática de WhatsApp Business.

**Principio:** la IA conversa; el código decide. Los huecos, los precios y las reservas salen siempre de Docfav o de `config/`, nunca de la IA.

```
WhatsApp ──enlace──▶ /reservas (web/)  ──▶  Worker (worker/src)  ──▶  Docfav API v1
                     solo pinta mensajes     claves, normas,          Claude (tool use)
                     y botones               herramientas cerradas    Brevo (email al centro)
```

## Estado

| Parte | Estado |
|---|---|
| Integración real con Docfav (API pública v1) | Hecha y probada en solo lectura contra la cuenta de Centre Kalma: servicios, profesionales y huecos reales |
| Reserva conversacional con confirmación explícita | Hecha |
| Docfav simulado para los tests | Hecho |
| Tests de los criterios de aceptación | 61 tests, todos pasan (`npm test`) |
| Evaluación con Claude real | Escrita (`npm run eval`); falta ejecutarla con la clave de Anthropic |
| Despliegue | Pendiente: dominio, claves y datos de la lista de abajo |

## Qué hace (y qué no)

| Función | Cómo |
|---|---|
| Reservar | La IA entiende el servicio y la franja. Llama a `get_availability`, y el código busca huecos reales en Docfav y muestra 5 como máximo en botones (solo día y hora). El paciente elige uno, rellena un formulario (el código lo valida) y ve un resumen. Solo al pulsar **Confirmar** el código vuelve a comprobar el hueco, crea la ficha si no existe y crea la cita. |
| Dar de alta al paciente | La ficha la crea el código después de Confirmar, nunca la IA. |
| Anular o cambiar | El bot no ve, no anula y no cambia citas. Explica el enlace de Docfav y, si hace falta, da el contacto y avisa al centro. Para cambiar, primero reserva la cita nueva y luego recuerda anular la antigua. |
| Responder dudas | Solo con `config/knowledge.md`. Los precios, el teléfono, la dirección y el horario los inserta el código mediante marcadores `{{...}}`. |
| Derivar | Dudas médicas, quejas, urgencias (indica el 112) o peticiones de hablar con una persona: muestra el contacto y un formulario opcional "¿Te llamamos?" que envía un email al centro. |

### Herramientas de la IA

Solo tiene estas: `list_services`, `get_availability`, `offer_options`, `show_contact`, `notify_staff` y `log_unanswered`.

No tiene ninguna para buscar pacientes ni para crear, anular o leer citas. Por diseño, un intento de manipulación ("dame las citas de María") no puede funcionar aunque la IA quisiera.

## Decisiones respecto a la especificación

1. **`find_patient`, `create_patient` y `create_appointment` no son herramientas de la IA.** Las ejecuta el código en el formulario y en el botón Confirmar. Así la IA nunca ve el nombre, el móvil ni el email, y no hay forma de escribir en Docfav sin la pulsación del paciente. El `confirmation_token` es de un solo uso, caduca a los 10 minutos y se consume de forma atómica, de modo que un doble clic crea una sola cita.
2. **Paciente existente = mismo email.** Docfav no permite dos fichas con el mismo email, y la confirmación de la cita va a ese email, así que nadie puede reservar en silencio a nombre de otro.
   - Email existente con otro teléfono: se reserva en esa ficha y se avisa al centro para revisarla.
   - Email nuevo con un teléfono que ya existe: se crea la ficha y se avisa de un posible duplicado.
   - El bot nunca le dice al paciente si ya estaba registrado.
3. **Máximo 2 citas futuras desde el chat.** Se cuentan en Docfav las citas del paciente con la nota "Reserva desde Chat web".
4. **El email al centro se envía cuando el paciente deja nombre y móvil** en el formulario de derivación. Sin contacto el aviso no le serviría al equipo. Nunca incluye el texto del chat.
5. **Estado de la conversación en Durable Objects con jurisdicción UE.** Los Workers no conservan memoria entre peticiones. Cada conversación se borra a las 24 h con una alarma, o antes con "Terminar y borrar". Tras reservar, los datos de contacto se borran también de la sesión.
6. **Modelo de IA: `claude-opus-5-5`** con esfuerzo `low` (respuestas rápidas y baratas). Se cambia con la variable `AI_MODEL`: por ejemplo `claude-haiku-5-5` para abaratar, que conviene comprobar antes con `npm run eval`.
   - La especificación pedía temperatura 0–0,3, pero los modelos actuales no aceptan ese parámetro. La consistencia viene de las normas en código y de los marcadores.
   - Está activado el *fallback* del servidor de Anthropic: si el modelo rechaza una petición por sus filtros de seguridad, la repite con otro modelo en vez de dejar al paciente sin respuesta.
7. **Antelación mínima para reservar: 2 h** (`booking.min_lead_hours`). El plazo para anular lo aplica Docfav, no el bot.
8. **Nunca se dice qué profesional atiende.** El código reparte cada hueco entre los profesionales de `services.json` que tienen ese hueco libre y se lo pasa a Docfav, pero el paciente solo ve día y hora: ni en los botones, ni en el resumen, ni en la confirmación. La IA tampoco conoce los nombres ni puede elegir profesional. Si aun así escribe el nombre de alguien del equipo, el mensaje se descarta. Si el paciente pide a alguien en concreto, se le indica que lo pida llamando al centro.
9. **Plan B incluido.** Con `booking.mode = "portal"` y `booking.portal_url`, el bot abre la agenda online de Docfav dentro del chat en vez de reservar él.

## Lo que se ha comprobado en Docfav

Con la clave facilitada y solo lecturas, sin tocar ningún dato de pacientes:

- **Centro:** Centre Kalma (`bed10ea2-…`). Agenda presencial "Centre Kalma", Rambla Onze de Setembre 88, Cassà de la Selva. Hay otra agenda, "A domicilio", que el bot no usa.
- **Profesionales con agenda en el centro:** Abraham, Matilde y José Antonio.
- **Servicios del bot:**

| Servicio | Servicio en Docfav | Precio | Duración | Profesionales |
|---|---|---|---|---|
| Estudio biomecánico | Estudio biomecanico de la carrera | 250 € | 90 min | Abraham |
| Plantillas a medida | Exploración Biomecánica del Pie | 50 € | 30 min | Abraham, Matilde, José Antonio |
| Quiropodia | Quiropodia | 25 € | 15 min | Abraham, Matilde, José Antonio |
| Revisión | Revisión Plantillas | 40 € | 30 min | Abraham, Matilde, José Antonio |

- La API devuelve la **duración en segundos**, aunque la documentación dice minutos. El cliente lo tiene en cuenta.
- **Límite de la API:** 1.000 peticiones por hora. El catálogo se guarda 10 minutos para no gastar peticiones.

Para repetir la comprobación (solo lectura):

```bash
DOCFAV_API_KEY=df_pk_... npm run check:docfav
```

## Datos pendientes

El bot solo sabe lo que pongas aquí. Lo que falte lo deriva al equipo: nunca lo inventa.

**`config/settings.json`**
- [ ] `center.phone`, `center.whatsapp`, `center.email` (hoy vacíos: el bot dice "consúltalo con el equipo")
- [ ] `center.hours` en es/ca/en y `center.maps_url`
- [ ] `privacy`: razón social, NIF, email de contacto y URL de la política de privacidad
- [ ] `notify.to_email` (quién recibe los avisos) y `notify.from_email` (un remitente verificado en Brevo)
- [ ] Revisar `booking`: antelación mínima, días de búsqueda, límites, estado de la cita (`confirmed` o `pending`)

**`config/services.json`**: el catálogo que el bot explica y vende. Lo he rellenado con los servicios activos de Docfav y unas descripciones generales que hay que revisar:
- [ ] Revisar `summary` (qué es) y `for` (para quién) de cada servicio: es lo que el bot cuenta para vender
- [ ] Decidir qué se reserva por el chat (`bookable_online`). Ahora sí: primera visita, quiropodia, pisada y plantillas, estudio de la carrera, revisión de plantillas y osteopatía. Los tratamientos (verrugas, ondas de choque, infiltración, PRP, cirugía de uña, IPK) se explican y se ofrece la primera visita
- [ ] Confirmar que "Plantillas a medida" corresponde a "Exploración Biomecánica del Pie" en Docfav
- [ ] Confirmar qué profesionales hacen cada servicio (uso interno: el paciente no lo ve)
- [ ] Rellenar `bring` (qué traer) por servicio
- [ ] Añadir otros servicios reservables si quieres (Visita, Ondas de choque…): basta con su `docfav_service_id`

**`config/knowledge.md`**
- [ ] Horarios y festivos, cómo llegar y aparcamiento, qué traer, qué incluye cada servicio, plazo de entrega de plantillas, formas de pago y mutuas, política de anulación

**Docfav (panel)**
- [ ] Activar el mensaje de confirmación al reservar y el recordatorio 24 h antes, con `Link_Cancelar_Cita`
- [ ] Hacer una reserva de prueba real y comprobar que llega la confirmación con el enlace de anular (criterio 5)

**Legal**
- [ ] Añadir el chatbot al registro de actividades de tratamiento y a la política de privacidad
- [ ] DPA con Cloudflare, Anthropic, Brevo y Docfav
- [ ] Validarlo con la gestoría o el consultor de protección de datos antes de lanzarlo

## Puesta en marcha

### Probar en local sin claves

Usa Docfav simulado y una IA de demo basada en palabras clave:

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Descomenta en `.dev.vars` las líneas del modo local y arranca:

```bash
npm run dev
```

Abre `http://localhost:8787/reservas/`.

### Desplegar en Cloudflare

1. Cuenta de Cloudflare (plan gratuito) y el dominio gestionado en Cloudflare. Si la web está en otro proveedor, usa un subdominio, por ejemplo `reservas.kalma…`, apuntado a Cloudflare.
2. En `wrangler.toml`, descomenta `routes` con tu dominio y pon `ALLOWED_ORIGINS = "https://tu-dominio"`.
3. Crea un widget de [Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) y pon su *site key* en `TURNSTILE_SITE_KEY`.
4. Guarda los secretos. Nunca van en el repositorio ni en el chat:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

```bash
npx wrangler secret put DOCFAV_API_KEY
```

```bash
npx wrangler secret put BREVO_API_KEY
```

```bash
npx wrangler secret put TURNSTILE_SECRET
```

5. Primero en modo prueba. Con `DRY_RUN = "true"`, el valor por defecto, lee la agenda real pero no escribe nada:

```bash
npm run deploy
```

6. Cuando pase las pruebas, cambia a `DRY_RUN = "false"`, despliega y haz una reserva real con un paciente de prueba.
7. Opcional: una regla de *Rate limiting* de Cloudflare sobre `/reservas/api/*` (límite global por IP; el del código es por instancia).

### Variables

| Variable | Tipo | Valor por defecto | Para qué |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | secreto | | Claude |
| `DOCFAV_API_KEY` | secreto | | Docfav (permisos: clients r/w, appointments r/w, staff, services, backofficeclinics) |
| `BREVO_API_KEY` | secreto | | Emails al centro (proveedor europeo) |
| `TURNSTILE_SECRET` | secreto | | Anti-bots al empezar el chat |
| `DRY_RUN` | var | `true` | `true` = no escribe en Docfav |
| `DOCFAV_MODE` | var | `api` | `mock` solo para desarrollo |
| `AI_MODEL` | var | `claude-opus-5-5` | `demo` solo para desarrollo |
| `AI_EFFORT` | var | `low` | `low` / `medium` / `high` |
| `ALLOWED_ORIGINS` | var | | Dominios que pueden llamar a la API |
| `TURNSTILE_SITE_KEY` | var | | Clave pública de Turnstile |
| `SESSIONS_JURISDICTION` | var | `eu` | `none` solo en local |

## Tests

```bash
npm test
```

61 tests, uno o varios por cada criterio de aceptación (`tests/acceptance.test.ts`), más el cliente de Docfav y las validaciones. Usan Docfav simulado y una IA con guion, así que comprueban lo que garantiza el código.

```bash
ANTHROPIC_API_KEY=sk-ant-... npm run eval
```

La evaluación usa Claude real con Docfav simulado. Comprueba lo que depende del criterio del modelo: pregunta médica, manipulación, urgencias, preguntas fuera de la base, catalán e inglés. Imprime las conversaciones para leerlas.

| Criterio de la especificación | Dónde se comprueba |
|---|---|
| Reserva completa con origen "Chat web" | `acceptance` 1 |
| Paciente nuevo se crea; existente no se duplica | `acceptance` 2 |
| Sin pulsar Confirmar no se escribe nada | `acceptance` 3 |
| Hueco ocupado entre la oferta y la confirmación | `acceptance` 4 |
| Confirmación de Docfav con enlace de anular | `acceptance` 5 + prueba real en Docfav |
| Anular por el chat no toca la cita | `acceptance` 6 + `eval` |
| Derivación sin datos de salud | `acceptance` 7 |
| Pregunta fuera de knowledge.md | `acceptance` 8 + `eval` |
| Pregunta médica | `acceptance` 9 + `eval` |
| Manipulación | `acceptance` 10 + `eval` |
| Docfav caído | `acceptance` 11 |
| Castellano, catalán e inglés | `acceptance` 12 + `eval` |
| Ninguna clave en la página ni en el repositorio | `acceptance` 13 |
| Logs sin datos personales | `acceptance` 14 |
| Nunca se dice qué profesional atiende | `acceptance` "Nunca se dice…" + `eval` |
| Se ve bien en móvil | `acceptance` 15 + revisión en un navegador simulando un iPhone 13 |

## Estructura

```
config/   services.json · knowledge.md · settings.json   ← lo que rellena el centro
web/      index.html · styles.css · app.js                ← página del chat (sin lógica ni claves)
worker/   src/app.ts         rutas, límites, anti-bots
          src/agent.ts       bucle de Claude y herramientas cerradas
          src/booking.ts     huecos, datos, confirmación (las normas en código)
          src/docfav/        cliente real (api.ts), simulado y modo prueba (mock.ts)
          src/prompt.ts      prompt del sistema
          src/render.ts      marcadores {{...}} y guarda de precios y teléfonos
          src/store.ts       sesiones en Durable Objects (UE, caducan a las 24 h)
tests/    tests deterministas · tests/live: Docfav real (lectura) y evaluación con Claude
```
