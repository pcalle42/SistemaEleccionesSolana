# API indisponible

## Síntomas

Liveness falla o no hay respuestas.

## Impacto

SEV1 durante `OPEN`; no se aceptan votos.

## Alertas

Disponibilidad API y error rate.

## Checks seguros

Verificar release, health, recursos y logs sanitizados.

## Contención y recuperación

Retirar instancia no ready y recrear desde la misma imagen por digest.

## Verificación

Liveness, readiness, versión y request sintético no electoral.

## Escalamiento

Incident commander y plataforma; autoridad electoral decide continuidad.

## Acciones prohibidas

No cambiar protocolo, ventana ni verification para recuperar disponibilidad.

## Evidencia a preservar

Release digest, tiempos, alertas, logs y acciones.
