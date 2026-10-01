# Votación anónima V1

El módulo `voting` expone `POST /api/v1/elections/:electionId/votes`. No requiere sesión y su
request contiene únicamente `protocolVersion`, `proof` y las cinco `publicSignals` ordenadas por
el manifest. No acepta identidad, credential, commitment, índice/ path Merkle, secreto ni artifacts
de verificación.

## Garantía de aceptación

El flujo realiza validaciones baratas, carga la configuración congelada y verifica Groth16 fuera de
la transacción. Después abre una transacción corta, bloquea la fila de la elección con `FOR UPDATE`,
obtiene `clock_timestamp()` de PostgreSQL y vuelve a comprobar:

- estado `OPEN` y ventana `[opensAt, closesAt)`;
- configuration, protocol y circuit version;
- Merkle root, election context y cantidad de opciones;
- encoding de selección válido.

El voto y su evidencia se insertan en el mismo commit. La restricción
`UNIQUE(election_id, protocol_version, nullifier)` es la autoridad contra doble voto; Valkey nunca
decide aceptación. Los cambios de estado usan la misma fila electoral, por lo que voto contra
cierre/cancelación tienen un orden observable.

## Retry y receipt

`submissionFingerprint` se deriva de campos lógicos canónicos, no de los bytes aleatorios del
proof. Un retry con el mismo nullifier y voto devuelve el receipt persistido y conserva
`acceptedAt`; otro encoding devuelve `NULLIFIER_ALREADY_USED` sin revelar la selección anterior.
El receipt usa framing binario con longitud y SHA-256. Es un comprobante reproducible, no una firma
ni una prueba autónoma de inclusión pública.

`accepted_votes` no tiene FK hacia padrón, credential, snapshot member ni administrador. El rol
runtime solo posee `SELECT`/`INSERT`; no existen endpoints de modificación o borrado. Proof y señales
se conservan como evidencia opaca con digests canónicos en `vote_proof_evidence`.

## Defensa operacional

- límite HTTP específico de 64 KiB y DTO estricto;
- proof shape y campos BN254 validados antes del pairing;
- rate limit de red efímero en Valkey usando solo un digest;
- semaphore local para limitar verificaciones concurrentes;
- body, proof y señales públicas redactados en logs.

Valkey degradado no cambia la semántica electoral: el semaphore permanece activo y PostgreSQL/ZK
siguen siendo autoridad. Configure `VOTE_RATE_LIMIT_WINDOW_SECONDS`, `VOTE_RATE_LIMIT_MAXIMUM` y
`VOTE_MAXIMUM_CONCURRENT_PROOFS` según la capacidad medida del despliegue.

## Pruebas

```bash
pnpm --filter @votaciones/api test:unit
pnpm --filter @votaciones/api test:integration
pnpm --filter @votaciones/api test:e2e
```

Las pruebas cubren proofs reales, retry con proof regenerado, rollback de evidencia, carreras de
nullifier, ambos órdenes de voto contra close/cancel, límite exacto de cierre y recuperación tras un
commit cuya respuesta conceptual se perdió.
