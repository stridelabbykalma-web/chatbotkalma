# Base de conocimiento del chat de reservas

<!--
Este archivo es lo ÚNICO que el bot sabe responder además de los servicios.
Reglas para rellenarlo:
- Escribe frases cortas y concretas. Lo que no esté aquí, el bot lo deriva al equipo.
- NO escribas precios, teléfonos, horarios ni la dirección: salen de settings.json y
  services.json. Si los necesitas en una respuesta, usa estos marcadores y el código
  los sustituye: {{telefono}} {{whatsapp}} {{email}} {{direccion}} {{horario}}
  {{precio:ID_SERVICIO}} {{duracion:ID_SERVICIO}}
- Los apartados marcados como PENDIENTE no se usan hasta que los completes.
-->

## Quiénes somos
- Kalma Centre Terapèutic es un centro de podología en Cassà de la Selva.
- Stride Lab es el laboratorio de análisis de la carrera de Kalma, en el mismo centro.
- La dirección es {{direccion}}.

## Cómo anular o cambiar una cita
- El chat no anula ni cambia citas.
- Para anular, usa el enlace del mensaje de confirmación o del recordatorio que envía Docfav.
- Para cambiar una cita: primero se reserva la nueva por el chat y después se anula la antigua con su enlace, así nunca te quedas sin cita.
- Si no encuentras el enlace, llama al centro: {{telefono}}.

## Horarios y festivos
PENDIENTE

## Cómo llegar y aparcamiento
PENDIENTE

## Qué traer a cada servicio
PENDIENTE

## Qué incluye cada servicio y plazo de entrega de plantillas
PENDIENTE

## Formas de pago y mutuas
PENDIENTE

## Política de anulación
PENDIENTE
