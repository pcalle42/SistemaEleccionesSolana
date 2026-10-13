# Presión de disco PostgreSQL

## Síntomas

Espacio/WAL crecen y se aproxima el límite.

## Impacto

SEV1/SEV2; riesgo de rechazo o pérdida de disponibilidad.

## Alertas

Disco, WAL, crecimiento y forecast.

## Checks seguros

Medir filesystem, WAL, tablas e índices sin queries invasivas.

## Contención y recuperación

Escalar storage según plataforma y controlar causas fuera de `OPEN`.

## Verificación

DB healthy, checkpoints/WAL normales y votos intactos.

## Escalamiento

DBA y plataforma antes de alcanzar reserva crítica.

## Acciones prohibidas

No truncar tablas electorales ni remover WAL manualmente.

## Evidencia a preservar

Series de capacidad, operaciones y cambios de storage.
