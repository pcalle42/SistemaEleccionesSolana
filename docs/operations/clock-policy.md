# Política temporal

PostgreSQL y backend usan UTC; el browser solo presenta. Containers heredan el
reloj sincronizado del host/plataforma. La infraestructura productiva debe
monitorizar su fuente NTP y alertar con un threshold aprobado.

`pnpm ops:clock-check -- --reference-url <https-url> --maximum-drift-ms <policy>`
permite una comprobación vendor-neutral usando el punto medio del request HTTP.
El threshold es obligatorio para no inventar política. Ante drift: alertar,
preservar timestamps/evidencia, evaluar impacto y no reescribir historia. La
ventana continúa siendo `[opensAt, closesAt)` salvo decisión electoral autorizada.
