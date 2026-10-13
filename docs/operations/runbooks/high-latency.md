# Latencia alta

## Síntomas

HTTP, proof o transacción DB exceden baseline.

## Impacto

SEV2/SEV3; riesgo de saturación antes de cierre.

## Alertas

Percentiles, inflight, pool, CPU/RAM y locks.

## Checks seguros

Separar proof, DB, red y queue sin inspeccionar votos.

## Contención y recuperación

Aplicar capacidad/backpressure aprobados y preservar correctness.

## Verificación

Carga sintética dentro de baseline sin errores ni pérdida.

## Escalamiento

Operación, DB y criptografía según cuello de botella.

## Acciones prohibidas

No desactivar proof ni aumentar concurrencia sin límite.

## Evidencia a preservar

Perfil, release, rate, saturación y cambios.
