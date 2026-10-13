# Fallo del verifier ZK

## Síntomas

Fallos sistemáticos o saturación de proof verification.

## Impacto

SEV1; votos no verificados no pueden aceptarse.

## Alertas

Rechazos `invalid_proof`, latency, inflight, timeout y artifact health.

## Checks seguros

Verificar release, circuit/protocol y artefactos por digest.

## Contención y recuperación

Fail closed; recuperar capacidad o artefacto aprobado.

## Verificación

Suite ZK negativa/positiva y elección sintética completa.

## Escalamiento

Equipo criptográfico, seguridad e incident commander.

## Acciones prohibidas

No omitir verification ni sustituir trusted setup.

## Evidencia a preservar

Digests, versión, rates agregados y errores sanitizados.
