# Clock drift

## Síntomas

El reloj supera el threshold aprobado.

## Impacto

SEV1/SEV2 cerca de `opensAt`/`closesAt`.

## Alertas

NTP/platform clock y `ops:clock-check`.

## Checks seguros

Comparar varias fuentes autorizadas y latencia de medición.

## Contención y recuperación

Preservar evidencia, estabilizar host y evaluar impacto electoral.

## Verificación

Drift dentro de política y ventanas coherentes.

## Escalamiento

Plataforma, incident commander y autoridad electoral.

## Acciones prohibidas

No reescribir timestamps ni extender ventana automáticamente.

## Evidencia a preservar

Fuentes, drift, round-trip, timestamps y decisiones.
