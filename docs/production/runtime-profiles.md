# Perfiles de runtime y datos

## DNS, edge y TLS

Separar `admin`, `vote`, `api` y opcionalmente `verify/results`. DNS exige MFA,
cambios auditables, TTL planificado y recuperación. Producción fuerza HTTPS y
redirección HTTP; certificados provienen de CA confiable, con renovación probada
y alerta de expiración. HSTS se activa después de estabilizar dominios y evaluar
`includeSubDomains`/preload. El edge limita body, conexiones, timeouts y rate sin
reescribir payloads criptográficos.

## Frontends

Las imágenes productivas compilan `VITE_API_BASE_URL=/api/v1`; el edge enruta esa
ruta al API. Esto conserva exactamente el mismo digest staging→producción. Los
assets hashados/artifacts versionados admiten cache inmutable; HTML usa revalidación.
No hay analytics, secretos, service worker ni voto offline. `admin-web` puede
añadir VPN/allowlist cuando la topología real lo permita.

## API

Imagen mínima, non-root, filesystem read-only, capabilities eliminadas, disco
efímero y límites de recursos definidos por el perfil. NestJS es stateless y usa
shutdown acotado: deja de aceptar tráfico, termina requests dentro de
`APP_SHUTDOWN_GRACE_MS` y las transacciones incompletas hacen rollback. Readiness
precede tráfico. No ejecuta migraciones al startup ni recibe credencial DDL.

Production guards obligatorios:

- `NODE_ENV=production`, identidad de release inmutable y OpenAPI apagado;
- origins HTTPS, proxy CIDR explícito y métricas privadas autenticadas;
- `PROTOCOL_ARTIFACT_CLASSIFICATION=production`;
- mount absoluto con `VERIFICATION_ARTIFACT_STORAGE_PROFILE=durable-immutable`;
- PostgreSQL/Valkey no-loopback y políticas de transporte explícitas;
- ausencia de credenciales devnet y `DATABASE_MIGRATION_URL` en API.

## PostgreSQL y Valkey

PostgreSQL es privado y autoritativo. Runtime conserva DML mínimo; migration job
usa identidad DDL separada; backup/replication/operator se separan si existen.
Pooling debe preservar transacciones, advisory/row locks y unicidad. HA solo se
declara tras failover/reconnect/RPO/RTO. Se observan conexiones, locks, IO, WAL,
autovacuum y lag.

Valkey es privado, autenticado y auxiliar. Su pérdida puede degradar sesiones o
rate limit, nunca voto/nullifier/state. TLS puede ser `tls-required` o una red
privada cifrada/atestada por plataforma documentada como `platform-private`.

## Artifact storage

`VerificationArtifactStore` desacopla la aplicación del backend. El adaptador
actual escribe contenido por digest en un mount; producción solo lo acepta si la
plataforma garantiza durabilidad e inmutabilidad. Manifests, VK, packages,
checkpoints y publicaciones se respaldan y verifican por digest. El plano público
no recibe artifacts internos ni credenciales.
