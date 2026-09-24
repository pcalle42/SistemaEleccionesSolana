# 05 — Valkey: Cache, Coordinación y Estado Efímero

## 1. Propósito

Este documento define el uso permitido de **Valkey** en **Votaciones** y complementa los documentos `00` a `04`.

Valkey será un componente auxiliar y reconstruible. **Nunca será la fuente de verdad del estado electoral.**

## 2. Usos permitidos

Valkey podrá utilizarse para:

- cache reconstruible;
- rate limiting;
- challenges y nonces temporales;
- coordinación efímera;
- deduplicación temporal no autoritativa;
- estado temporal cuya pérdida sea tolerable.

No se utilizará como almacenamiento primario de elecciones, elegibilidad persistente, votos aceptados, nullifiers consumidos, resultados ni auditoría.

## 3. Regla de pérdida total

El sistema debe asumir que Valkey puede reiniciarse, vaciarse o quedar indisponible.

Tras una pérdida completa, PostgreSQL debe seguir representando correctamente el estado electoral. La pérdida de Valkey puede degradar rendimiento o protecciones auxiliares, pero no puede permitir voto duplicado, alterar resultados, reabrir elecciones ni perder votos aceptados.

## 4. Cliente

Se utilizará inicialmente **ioredis**, sujeto a compatibilidad con la versión fijada de Valkey.

No instalar múltiples clientes. Un cambio de cliente requiere justificación/ADR.

La conexión debe centralizarse bajo `apps/api/src/valkey/`; ningún módulo debe crear conexiones por request ni dispersar llamadas directas sin un boundary definido.

## 5. Configuración

La configuración será validada al iniciar y podrá incluir:

```text
VALKEY_HOST
VALKEY_PORT
VALKEY_USERNAME
VALKEY_PASSWORD
VALKEY_DB
VALKEY_CONNECT_TIMEOUT_MS
```

o `VALKEY_URL`.

URLs con credenciales nunca se imprimirán completas en logs.

## 6. Health y degradación

Debe existir health check mediante `PING`.

La disponibilidad de Valkey no implica necesariamente que toda la API deba quedar offline si falla. Cada consumidor debe definir su política de fallo.

- cache: normalmente fallback a PostgreSQL;
- protección temporal de seguridad: degradación explícita y segura;
- coordinación que no pueda garantizarse: abortar la operación correspondiente.

No habrá un `fail-open` o `fail-closed` global.

## 7. Namespaces

Todas las keys tendrán namespace centralizado.

Formato recomendado:

```text
votaciones:<env>:<domain>:<purpose>:<identifier>
```

Ejemplos:

```text
votaciones:devnet:auth:login-rate:<subject>
votaciones:devnet:cache:election-public:<election-id>
votaciones:devnet:challenge:<challenge-id>
```

Local, test, devnet y producción nunca deben compartir accidentalmente namespace.

La construcción de keys se realizará mediante factories/helpers, no concatenaciones arbitrarias distribuidas por el código.

## 8. Datos prohibidos en keys

No incluir directamente:

- passwords;
- tokens secretos;
- private keys;
- witnesses;
- selección electoral;
- proofs completas;
- PII innecesaria;
- credenciales electorales privadas.

Cuando sea necesario identificar un sujeto sensible, se utilizará una representación derivada apropiada según el threat model.

## 9. TTL

Todo estado temporal que deba expirar tendrá TTL explícito y centralizado.

Ejemplos de constantes semánticas:

```text
LOGIN_RATE_LIMIT_WINDOW
TEMP_CHALLENGE_TTL
PUBLIC_ELECTION_CACHE_TTL
```

No dispersar números mágicos de expiración.

## 10. Cache

Solo se cachearán datos reconstruibles desde una fuente autoritativa.

La estrategia preferida será cache-aside:

1. consultar cache;
2. ante miss, consultar PostgreSQL;
3. almacenar con TTL;
4. devolver.

No se utilizará write-behind para estado electoral crítico.

Toda cache tendrá invalidación por TTL, invalidación explícita o versionado.

## 11. Estado de elecciones

El estado de una elección puede cachearse como optimización, pero **un voto no puede aceptarse únicamente porque una key indique que la elección está abierta**.

Las operaciones críticas usarán las garantías persistentes/transaccionales definidas en PostgreSQL y en el protocolo de voto.

## 12. Elegibilidad, votos y nullifiers

Valkey no será la fuente persistente de elegibilidad.

Queda prohibido almacenar votos primariamente en Valkey.

Valkey tampoco será la defensa definitiva de unicidad de nullifiers. Esa propiedad debe quedar reforzada en PostgreSQL.

No implementar voto duplicado únicamente mediante:

```text
SETNX voted:<subject>
```

La prevención real deriva del protocolo, nullifier y constraints/transacciones persistentes.

## 13. Locks distribuidos

Los locks Valkey no son la primera opción.

Antes deben evaluarse:

- unique constraints;
- transacciones PostgreSQL;
- atomic updates;
- row locks;
- advisory locks PostgreSQL;
- idempotencia.

Un lock Valkey solo podrá usarse para coordinación operacional auxiliar cuando esté justificado.

Si existe, requiere:

- TTL;
- ownership token;
- liberación segura;
- manejo de expiración;
- tests de fallo.

Nunca será la única garantía para doble voto, cierre electoral, publicación de resultados o consumo de nullifier.

## 14. Rate limiting

Valkey es apropiado para rate limiting distribuido.

Casos previstos:

- login administrativo;
- endpoints públicos susceptibles de abuso;
- operaciones computacionalmente costosas;
- endpoints de voto solo después de analizar disponibilidad y privacidad.

Rate limiting no es autenticación ni autorización.

El endpoint de voto no debe depender de una key manipulable por el cliente para limitar abuso.

IP puede ser una señal, pero no identidad electoral. Deben considerarse NAT, redes compartidas, proxies, IPv6 y privacidad.

## 15. Challenges y single-use

Valkey puede almacenar challenges/nonces temporales si el protocolo lo requiere.

Deben tener:

- alta entropía;
- TTL;
- binding al contexto;
- single-use cuando aplique;
- consumo atómico;
- ausencia de secretos innecesarios.

No implementar `GET` seguido de `DEL` si dos requests concurrentes pueden consumir el mismo valor. Usar primitivas atómicas o un script pequeño y versionado.

## 16. Lua

Lua se utilizará solo si una operación realmente requiere atomicidad multi-comando.

Los scripts serán pequeños, versionados y testeados. No contendrán lógica electoral compleja.

## 17. Pub/Sub y Streams

Valkey Pub/Sub no se utilizará para entrega confiable de eventos críticos.

Puede usarse posteriormente para notificaciones efímeras donde perder mensajes sea aceptable.

Valkey Streams no se introducirá en esta etapa. Adoptarlo como broker requerirá una decisión explícita.

## 18. Sesiones

Si `07-autenticacion-administrativa.md` decide utilizar sesiones server-side, Valkey podrá evaluarse como store.

En ese caso:

- TTL obligatorio;
- rotación;
- revocación;
- mínimo PII;
- nunca passwords.

Esta etapa no toma todavía esa decisión.

## 19. Idempotencia

Valkey puede apoyar idempotencia temporal, pero la corrección persistente de una operación electoral no dependerá exclusivamente de él.

Para voto, nullifiers y constraints persistentes seguirán siendo la defensa final.

## 20. Serialización

Los valores usarán formatos explícitos y simples.

Preferir strings/JSON controlado. No serializar objetos runtime arbitrarios.

Datos estructurados no triviales deberán contemplar versión de formato cuando sea necesario.

## 21. Tamaño y artefactos

No almacenar en Valkey:

- archivos;
- backups;
- artefactos Circom;
- dumps PostgreSQL;
- proofs masivas sin justificación;
- witnesses privados.

No introducir compresión antes de demostrar necesidad.

## 22. Eviction y persistencia

La aplicación debe tolerar eviction de caches.

AOF/RDB no convierten Valkey en fuente de verdad electoral.

Si un estado temporal de seguridad no puede desaparecer sin romper corrección, debe revisarse si Valkey es el almacenamiento correcto.

## 23. DB numéricos

No utilizar DB indexes como aislamiento principal. Los namespaces explícitos son obligatorios.

## 24. Comandos peligrosos

Runtime no debe depender de:

```text
FLUSHALL
FLUSHDB
CONFIG
KEYS *
```

`FLUSHALL`/`FLUSHDB` solo podrán aparecer en tooling de reset local/devnet estrictamente protegido.

Para iteración excepcional, preferir `SCAN`.

## 25. Atomicidad

Usar primitivas atómicas nativas cuando corresponda, por ejemplo `SET NX`, incrementos y expiraciones.

No implementar read-modify-write inseguro si existe una primitiva atómica adecuada.

## 26. Timeouts, retries y reconexión

Las operaciones tendrán timeouts razonables.

Retries serán limitados y con backoff. No reintentar infinitamente.

Operaciones no idempotentes requieren análisis antes de retry.

La reconexión automática no debe inundar logs.

La offline queue del cliente debe evaluarse cuidadosamente; operaciones sensibles no deben acumularse indefinidamente para ejecutarse mucho después.

## 27. Logging

No registrar valores completos de keys sensibles.

Se puede registrar:

- namespace;
- operación;
- latencia;
- resultado agregado.

No registrar tokens, challenges, PII, credenciales o valores cacheados sensibles.

## 28. Seguridad de red

Devnet mantendrá Valkey en la red Docker interna.

Si local lo expone al host para debugging, la exposición será limitada y documentada.

Nunca se expondrá directamente a internet ni a frontends.

## 29. Autenticación y TLS

La API soportará username/password por configuración sin hardcode.

TLS no es obligatorio en local/devnet. Producción definirá red, autenticación y TLS según topología.

## 30. Tests

Debe existir integración contra Valkey real, no únicamente mocks.

Como mínimo:

- conexión/PING;
- set/get;
- TTL;
- expiración;
- operación atómica relevante;
- aislamiento de namespaces.

También debe probarse pérdida total:

1. PostgreSQL contiene estado persistente;
2. Valkey contiene cache;
3. Valkey se vacía/reinicia;
4. PostgreSQL sigue representando la verdad;
5. cache se reconstruye.

Y debe probarse indisponibilidad para verificar la política fail-open/fail-closed de cada consumidor.

## 31. Cache poisoning

Los datos de cache no deben saltarse validaciones críticas únicamente por provenir de Valkey.

## 32. Cache stampede

No introducir mecanismos anti-stampede complejos antes de medir necesidad.

Si aparece carga real, podrán evaluarse TTL jitter, single-flight o stale-while-revalidate sin comprometer consistencia.

## 33. Cierre electoral

Las mutaciones de estado deben invalidar caches relevantes.

Una cache obsoleta nunca debe ser suficiente para aceptar un voto después del cierre.

## 34. Resultados

Valkey puede cachear resultados públicos ya publicados.

La fuente de verdad seguirá siendo PostgreSQL/evidencia final.

## 35. Datos criptográficos

Por defecto está prohibido almacenar en Valkey:

- private inputs;
- proving secrets;
- private keys;
- witnesses completos.

Challenges públicos temporales sí son admisibles con TTL, binding y consumo seguro.

## 36. Versionado de keys

Cuando cambie incompatiblemente un formato, utilizar versionado de namespace, por ejemplo:

```text
votaciones:devnet:v2:...
```

No depender de limpiar toda la instancia para desplegar.

## 37. Registro obligatorio de namespaces

Debe mantenerse una tabla documental por cada uso:

| Namespace | Propósito | Fuente de verdad | TTL | Política ante fallo |
|---|---|---|---|---|
| `auth:login-rate` | rate limiting | N/A | Sí | definida en auth |
| `cache:election-public` | cache lectura | PostgreSQL | Sí | fallback DB |

Cada nuevo namespace debe registrarse antes de considerarse estable.

## 38. Usos autorizados inicialmente

En esta fase solo se autorizan:

1. health/conectividad;
2. infraestructura para rate limiting;
3. cache explícita y reconstruible;
4. challenges temporales requeridos por etapas posteriores;
5. coordinación auxiliar explícitamente aprobada.

No crear otros usos silenciosamente.

## 39. Orden para Codex

1. Instalar `ioredis`.
2. Crear módulo Valkey.
3. Crear configuración validada.
4. Crear conexión central.
5. Crear health check.
6. Crear key factory y namespaces.
7. Crear constantes/configuración de TTL.
8. Crear integration tests reales.
9. Probar expiración.
10. Probar pérdida/reinicio.
11. Probar indisponibilidad.
12. Documentar tabla de namespaces.
13. Integrar observabilidad mínima.

No implementar todavía sesiones definitivas ni rate limiting electoral definitivo.

## 40. Estructura conceptual

```text
apps/api/src/valkey/
├── valkey.module.ts
├── valkey.service.ts
├── valkey.config.ts
├── valkey.constants.ts
├── valkey.health.ts
├── key-factory.ts
└── README.md
```

La etapa 06 puede ajustar nombres para alinearlos con la estructura NestJS.

## 41. Criterios de aceptación

La etapa se aprueba cuando:

- Valkey conecta;
- existe una conexión controlada;
- configuración está validada;
- health funciona;
- namespaces están centralizados;
- entornos están aislados;
- estado temporal tiene TTL donde corresponde;
- tests usan Valkey real;
- reiniciar/vaciar Valkey no corrompe la verdad PostgreSQL;
- no existe prevención de voto duplicado basada solo en Valkey;
- no existen votos primarios en Valkey;
- no se registran secretos;
- todos los usos autorizados están documentados.

## 42. Definition of Done

```text
[ ] ioredis instalado
[ ] conexión central configurada
[ ] configuración validada
[ ] PING health funciona
[ ] namespaces definidos
[ ] key factory central
[ ] aislamiento por entorno
[ ] TTLs centralizados
[ ] integration set/get pasa
[ ] integration TTL pasa
[ ] expiración pasa
[ ] pérdida/reinicio probado
[ ] indisponibilidad probada
[ ] comportamiento ante fallo documentado
[ ] no hay FLUSHALL en runtime
[ ] no hay KEYS * en runtime
[ ] no hay votos primarios en Valkey
[ ] nullifier uniqueness no depende solo de Valkey
[ ] secretos no aparecen en logs
[ ] tabla de namespaces documentada
```

## 43. Prohibiciones

Codex no debe:

- instalar Redis como servicio paralelo;
- convertir Valkey en base principal;
- almacenar votos solo en Valkey;
- usar `SETNX` como única defensa de doble voto;
- usar locks Valkey como única garantía electoral;
- ejecutar `FLUSHALL` desde runtime;
- usar `KEYS *` en runtime;
- almacenar passwords, private keys o witnesses privados;
- crear keys sin namespace;
- crear estado temporal sin TTL cuando deba expirar;
- exponer Valkey a frontends.

## 44. Decisiones diferidas

Quedan para etapas posteriores:

- algoritmo exacto de rate limiting;
- sesiones administrativas;
- challenges concretos;
- idempotency temporal;
- coordinación de workers;
- TLS/auth productivos;
- sizing/HA;
- eviction productiva.

## 45. Instrucción final

Valkey debe permanecer como optimización y herramienta auxiliar, nunca como componente que cambie la verdad electoral.

Ante cualquier duda entre guardar un dato crítico únicamente en Valkey o persistirlo correctamente en PostgreSQL, Codex debe detenerse y revisar el diseño.

El siguiente documento rector será:

`06-backend-nestjs-base.md`
