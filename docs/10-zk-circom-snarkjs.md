# 10 — ZK con Circom + snarkjs

## Propósito
Define el protocolo ZK inicial de **Votaciones**, complementando `00`–`09`. Fija primitivas, circuitos, inputs, artefactos, versionado, trusted setup y proof verification.

El circuito V1 debe demostrar:

```text
1. conozco voterSecret
2. identityCommitment = H_commit(voterSecret)
3. identityCommitment pertenece al Merkle root congelado
4. nullifier = H_nullifier(voterSecret, electionContext)
5. voteChoice es válido para la configuración
```

sin revelar `voterSecret`, `identityCommitment`, leaf index ni Merkle path.

La unicidad persistente del nullifier se implementa en etapa 11.

## Stack y proving system
Usar versiones fijadas de:
- Circom 2.x;
- snarkjs;
- circomlib/circomlibjs.

V1 utilizará **Groth16**. Ofrece soporte maduro en el stack, proofs pequeños y verificación eficiente, a cambio de una fase 2 específica por circuito. PLONK/FFLONK pueden evaluarse en una versión futura.

No usar dependencias `latest` implícitas en builds reproducibles.

## Campo
El circuito operará sobre el campo escalar BN254 soportado por el stack Circom/snarkjs seleccionado.

Toda entrada debe tener encoding explícito como field element. No convertir UUIDs/strings mediante coerciones ad hoc.

## Poseidon
Usar **Poseidon** compatible con circomlib para commitments, Merkle tree, nullifiers y hashes internos del circuito.

Circom, backend, frontend y scripts deben producir exactamente los mismos resultados. Crear test vectors compartidos.

## Domain separation
Separar criptográficamente los usos del hash mediante constantes versionadas:

```text
DOMAIN_IDENTITY_COMMITMENT_V1
DOMAIN_NULLIFIER_V1
DOMAIN_ELECTION_CONTEXT_V1
DOMAIN_VOTE_ENCODING_V1
```

Sus valores concretos serán field elements congelados por `protocolVersion`.

No depender de strings convertidos en runtime ni asumir que distinta aridad basta como domain separation.

## voterSecret
Será un secreto de alta entropía generado con CSPRNG y convertido al campo mediante una regla canónica sin sesgo/ambigüedad.

Nunca password humano, UUID, documento o PII.

## Identity commitment
Fórmula conceptual:

```text
identityCommitment =
  Poseidon(
    DOMAIN_IDENTITY_COMMITMENT_V1,
    voterSecret
  )
```

La implementación/aridad exacta será idéntica en Circom y TypeScript.

El commitment puede ser leaf persistida, pero **no será public signal del voto**.

## Election context
El nullifier se liga a un `electionContext` estable derivado canónicamente de configuración pública congelada.

Debe comprometer al menos:

```text
protocolVersion
electionId
configurationVersion
```

y cualquier otro identificador criptográficamente relevante.

No convertir directamente un UUID a BigInt como convención implícita.

Definir:

```text
deriveElectionContextV1(manifest)
```

con campos, orden, UTF-8, length-prefixing/separadores inequívocos, hash externo y conversión al campo completamente especificados.

No depender de `JSON.stringify()` sin canonicalización.

## Nullifier
Fórmula conceptual:

```text
nullifier =
  Poseidon(
    DOMAIN_NULLIFIER_V1,
    voterSecret,
    electionContext
  )
```

Debe cumplir:
- mismo secreto + mismo contexto → mismo nullifier;
- mismo secreto + elección/configuración distinta → nullifier distinto;
- no revela commitment, secreto ni identidad administrativa.

Será public signal y etapa 11 lo persistirá con unicidad.

## Merkle tree
V1 usa árbol binario Poseidon de depth fijo por `circuitVersion`.

Leaf V1:

```text
leaf = identityCommitment
```

No añadir hash redundante sin razón criptográfica.

Nodos internos:

```text
parent = MerkleHash(left, right)
```

La construcción exacta/domain tag, si se utiliza, debe ser idéntica en todos los componentes.

Membership path:

```text
pathElements[DEPTH]
pathIndices[DEPTH]
```

`pathIndices` se restringe dentro del circuito a `0/1`.

## Tree depth
Depth es compile-time. Como baseline devnet puede iniciarse con:

```text
DEPTH = 20
```

capacidad teórica de `2^20 = 1,048,576` leaves.

Antes de producción medir constraints, proving time y memoria. Cambiar depth produce nueva circuit/version y artifacts.

## Zero values
Definir determinísticamente:

```text
zero[0] = ZERO_LEAF_V1
zero[i+1] = MerkleHash(zero[i], zero[i])
```

`ZERO_LEAF_V1` será constante versionada elegida de modo compatible con la construcción. No asumir `0` sin análisis.

Incluir todos los zero values relevantes en test vectors.

## Orden de leaves
El snapshot usa orden determinista/versionado, preferentemente por representación canónica del commitment o criterio estable equivalente.

Nunca orden accidental de inserción ni `SELECT` sin `ORDER BY`.

No permitir commitments duplicados.

## Circuito principal
Nombre:

```text
AnonymousSingleChoiceVoteV1
```

Debe:
- derivar commitment;
- verificar Merkle membership;
- derivar nullifier;
- ligar proof a electionContext;
- verificar selección válida;
- producir public signals.

No contiene lógica administrativa.

## Inputs privados
Conceptualmente:

```text
voterSecret
voteChoice
merklePathElements[DEPTH]
merklePathIndices[DEPTH]
```

No incluir PII. `identityCommitment` se calcula dentro del circuito cuando sea práctico.

## Inputs públicos
Conceptualmente:

```text
merkleRoot
nullifier
electionContext
vote encoding/public signal required by V1
```

El orden de public signals es parte del protocolo y debe existir un mapper tipado. No dispersar índices mágicos como `publicSignals[2]`.

## Privacidad de la selección
Distinguir:
- anonimato del votante;
- secreto criptográfico de la selección.

V1 garantiza elegibilidad anónima, nullifier por elección y selección válida. **No garantiza por sí solo secreto de la papeleta frente al servidor** si `voteChoice` se envía/publica en claro.

Si V1 almacena selección anónima en claro, debe documentarse que el backend conoce la selección al recibirla, aunque no deba poder ligarla a identidad.

Cifrado verificable de papeleta requerirá diseño posterior explícito; no fingir que ZK lo proporciona automáticamente.

## SINGLE_CHOICE encoding
Cada opción congelada recibe índice criptográfico canónico:

```text
0 .. optionCount - 1
```

El mapping queda fijado en `ElectionConfigurationVersion`.

No usar `displayOrder` mutable como identidad implícita.

El circuito restringe:

```text
0 <= voteChoice < optionCount
```

`optionCount` debe quedar inequívocamente ligado a la configuración/electionContext o a public input comprometido.

## Binding de configuración
`electionContext` cambia ante cualquier elemento criptográficamente relevante, incluyendo election/configuration/protocol/circuit/option mapping y los elementos que el manifest declare.

El backend verifica que `merkleRoot` y `electionContext` corresponden a la elección abierta.

Un proof de configuración A no debe ser reutilizable en B.

## Protocol manifest
Cada versión tendrá manifest machine-readable con:

```text
protocolVersion
circuitId
circuitVersion
provingSystem
curve
treeDepth
commitmentSchemeVersion
nullifierSchemeVersion
voteEncodingVersion
publicSignals
artifactDigests
```

Identificador V1 conceptual:

```text
anonymous-single-choice-v1
```

No inferir versión por filename.

## Artifacts
Por versión:

```text
.circom sources
.r1cs
.wasm
final .zkey
verification_key.json
protocol manifest
digests/checksums
```

Fuentes, scripts, manifests y test vectors se versionan. Artefactos derivados deben tener hashes verificables y política explícita de almacenamiento/distribución.

No confiar en `.zkey` de origen desconocido.

## Build ZK
Scripts conceptuales:

```text
pnpm zk:compile
pnpm zk:test
pnpm zk:setup
pnpm zk:verify-artifacts
```

No recompilar circuitos al arrancar NestJS ni regenerar zkeys dentro de `pnpm build`.

Local/devnet debe poder usar Docker con toolchain fijado.

## Inspección de constraints
Pipeline debe reportar constraints, wires, inputs y tamaños.

Usar capacidades de inspección de la versión Circom fijada. Warnings relevantes requieren análisis.

No usar witness hints/asignaciones no constrained para relaciones que deben demostrarse. Si se usa un hint, añadir constraints verificadoras.

`pathIndices` debe constrained a boolean. Todo rango relevante debe constrained dentro del circuito. Validación TypeScript no sustituye constraints.

Controlar field aliasing y representaciones externas ambiguas.

## Witness y proving
Preferencia de producción: witness/proof generado en cliente o componente controlado por votante.

El backend receptor no necesita `voterSecret`.

Devnet puede usar scripts Node.

No enviar `voterSecret` al backend para generar proof como flujo productivo normal.

## Backend verification
Definir port:

```text
VoteProofVerifier
```

La application layer depende del port. snarkjs queda encapsulado en infrastructure.

La verification key se selecciona desde registry trusted por `protocolVersion/circuitVersion`. Nunca aceptar verification key, zkey, wasm o circuit enviados por cliente.

Payload conceptual:

```json
{
  "protocolVersion": "anonymous-single-choice-v1",
  "proof": {},
  "publicSignals": []
}
```

Validar schema, tamaños, versión, número de signals y field encodings antes de trabajo criptográfico costoso.

## Verification DoS
Antes de `snarkjs.verify`:
- validar formato;
- limitar payload;
- comprobar versión soportada;
- comprobar shape de signals;
- comprobar root/context esperados cuando pueda hacerse sin verificar;
- rechazar encodings inválidos.

Rate limiting es auxiliar; nunca reemplaza nullifier + PostgreSQL.

## Trusted setup Groth16
Groth16 requiere Powers of Tau y fase 2 específica.

### Powers of Tau
Preferir contribución pública/reconocida compatible o ceremonia documentada. Registrar hash del archivo usado. No descargar artifacts productivos sin verificación.

### Fase 2
Por circuit/version:
1. compilar R1CS;
2. preparar zkey;
3. realizar contribuciones;
4. aplicar beacon final si la política lo adopta;
5. verificar zkey;
6. exportar verification key;
7. publicar hashes/transcript necesarios.

El material secreto de contribución no se conserva en repo, logs ni CI artifacts.

### Devnet
Puede utilizar setup inseguro/determinista claramente marcado:

```text
DEVNET / NOT FOR PRODUCTION
```

Nunca promover artifacts devnet a producción.

### Producción
Debe existir ceremonia/procedimiento separado, revisado y verificable. Nunca generar zkey productiva como side effect de `docker compose up`.

## Artifact verification
Scripts deben comprobar:
- R1CS ↔ zkey;
- zkey válido;
- verification key derivada;
- hashes del manifest;
- procedencia esperada.

Fijar y revisar procedencia de Circom binary, snarkjs, circomlib, Powers of Tau y zkeys.

R1CS/WASM deben ser reconstruibles desde fuentes/toolchain fijado. El zkey final se verifica por transcript/hash de ceremonia.

## Test vectors
Crear fixtures versionados con:
- `voterSecret` de test;
- commitment;
- leaves/root/path;
- electionContext;
- nullifier;
- voteChoice;
- proof válido cuando sea práctico.

Nunca reutilizar secretos de fixtures en producción.

Los mismos vectores deben coincidir entre TypeScript, frontend y Circom.

## Negative tests
Como mínimo deben fallar:
- secret incorrecto;
- path incorrecto;
- root incorrecta;
- path index no boolean;
- leaf no miembro;
- nullifier manipulado;
- electionContext distinto;
- opción fuera de rango;
- proof alterado;
- verification key incorrecta;
- signals reordenados;
- protocolVersion incorrecta.

## Semántica de doble voto
Dos proofs válidos de la misma credencial/contexto producen el mismo nullifier. El circuito no mantiene estado.

Etapa 11 hace el nullifier único de forma persistente/atómica.

Mismo secret en dos elecciones:

```text
identityCommitment: igual
nullifier: distinto
```

Un proof contra root A falla contra root B. Una nueva configurationVersion produce context distinto.

## Paquete compartido
Crear conceptualmente:

```text
packages/zk-protocol/
├── circuits/
│   ├── anonymous-single-choice-v1.circom
│   └── components/
├── manifests/
├── scripts/
├── test-vectors/
├── artifacts/
└── src/
```

Puede contener tipos públicos, manifest schema, derivaciones externas, test vectors y metadata. Nunca secretos.

## Backend
Conceptualmente:

```text
apps/api/src/modules/zk/
├── application/
├── domain/
├── infrastructure/
│   └── snarkjs/
└── zk.module.ts
```

Implementar registry:

```text
protocolVersion -> trusted verification artifacts
```

Versiones desconocidas se rechazan.

## Errors
Códigos conceptuales:

```text
UNSUPPORTED_PROTOCOL_VERSION
INVALID_PROOF_FORMAT
INVALID_PUBLIC_SIGNALS
PROOF_VERIFICATION_FAILED
PROOF_ROOT_MISMATCH
PROOF_ELECTION_CONTEXT_MISMATCH
PROOF_NULLIFIER_INVALID
PROOF_VOTE_ENCODING_INVALID
ZK_VERIFIER_UNAVAILABLE
```

No devolver internals de snarkjs.

## Logging
Nunca registrar:
- voterSecret;
- witness;
- Merkle path ligado al votante;
- randomness secreta;
- toxic waste.

Proof/public signals tampoco se loguean completos por defecto. Preferir hashes, IDs y versiones.

## Frontend boundary
El cliente de votación necesitará credential secret local, snapshot/path data, WASM, zkey y protocol manifest.

Artifacts se distribuyen por versión/digest.

Medir en dispositivos objetivo:
- memoria;
- witness time;
- proving time;
- download size;
- zkey/WASM size.

Proving debería poder ejecutarse en Web Worker. Telemetry nunca envía witness/secret/path.

## Security review
Antes de producción revisar específicamente:
- constraints;
- domain separation;
- encodings;
- public/private signals;
- setup;
- artifact provenance;
- consistencia entre implementaciones.

Para elecciones de alta relevancia, considerar auditoría criptográfica independiente.

La seguridad no depende de ocultar el circuito. Sources, verification key, manifest y hashes deberían ser inspeccionables cuando la política de publicación lo permita.

## Version upgrades
Nunca sustituir artifacts manteniendo el mismo `protocolVersion`.

Cambios criptográficamente relevantes producen nueva versión. Elecciones abiertas siguen usando la versión congelada.

Conservar verification artifacts históricos mientras sean necesarios para auditoría/verificación.

## CI
Pipeline ZK:

```text
compile
inspect
circuit/component tests
test vectors
negative tests
verify manifests/artifacts
```

Trusted setup productivo no corre en CI normal.

## E2E criptográfico
Devnet:
1. crear secret fixture;
2. registrar commitment;
3. freeze snapshot;
4. derivar electionContext;
5. generar Merkle path;
6. generar witness/proof;
7. verificar localmente;
8. enviar a API;
9. API verifica;
10. etapa 11 consume nullifier.

## Performance
Registrar por circuit version:
- constraints;
- witness generation;
- proof generation;
- proof size;
- verification time;
- WASM size;
- zkey size;
- peak memory.

No fijar SLA universal hasta medir hardware/dispositivos reales.

## Protocolo V1 resumido
```text
Proving system: Groth16
Circuit: AnonymousSingleChoiceVoteV1
Hash: Poseidon
Merkle: binary fixed-depth
Commitment: Poseidon(domain_commit, voterSecret)
Nullifier: Poseidon(domain_nullifier, voterSecret, electionContext)
Eligibility: Merkle membership
Voting method: SINGLE_CHOICE
Context: election/config/protocol-bound
Double-vote prevention: public nullifier + DB uniqueness (etapa 11)
```

## Orden para Codex
1. Crear `packages/zk-protocol`.
2. Fijar Circom/snarkjs/circomlib.
3. Manifest schema.
4. Field encodings/domain constants.
5. Poseidon helpers TS.
6. Commitment V1.
7. ElectionContext V1.
8. Nullifier V1.
9. Merkle builder V1.
10. Fijar depth devnet/zero values.
11. Crear `AnonymousSingleChoiceVoteV1`.
12. Constrain membership/nullifier/choice/context.
13. Compilar/inspect.
14. Test vectors.
15. Negative tests.
16. Devnet Groth16 setup.
17. Exportar verification key.
18. Manifests/digests.
19. `VoteProofVerifier`.
20. Adapter snarkjs.
21. Artifact registry.
22. Integrar snapshot etapa 09.
23. E2E criptográfico.
24. Medir performance.
25. Documentar setup productivo.
26. Ejecutar lint/typecheck/test/build/zk:test.

## Criterios de aceptación
- protocol/circuit version explícitos;
- toolchain fijado;
- Poseidon consistente TS/Circom;
- commitment con test vectors;
- electionContext canónico/versionado;
- nullifier domain-separated;
- mismo secret/context → mismo nullifier;
- elección distinta → nullifier distinto;
- Merkle reproducible;
- snapshot genera proof;
- circuito comprueba membership/nullifier/selección;
- root/context validados como public signals;
- secret/commitment/path no revelados;
- Groth16 devnet funciona;
- artifacts tienen digests;
- backend usa verification key trusted;
- proofs manipulados/replays cross-election fallan;
- performance medida;
- procedimiento de setup productivo documentado.

## Definition of Done
```text
[ ] packages/zk-protocol
[ ] Circom/snarkjs/circomlib fijados
[ ] Groth16
[ ] protocolVersion/circuitVersion
[ ] manifest schema
[ ] Poseidon helpers
[ ] domain constants
[ ] voterSecret field encoding
[ ] identityCommitment V1
[ ] electionContext V1
[ ] nullifier V1
[ ] binary Merkle tree
[ ] fixed depth
[ ] zero values versionados
[ ] deterministic leaf order
[ ] AnonymousSingleChoiceVoteV1
[ ] membership constraints
[ ] boolean path constraints
[ ] nullifier constraints
[ ] choice range constraints
[ ] public signals mapper
[ ] test vectors + negative tests
[ ] devnet setup
[ ] final devnet zkey
[ ] verification_key.json
[ ] artifact digests
[ ] VoteProofVerifier
[ ] snarkjs adapter
[ ] artifact registry
[ ] E2E crypto
[ ] performance measurements
[ ] production setup procedure
[ ] README/protocol docs
[ ] lint/typecheck/test/build/zk:test
```

## Prohibiciones
Codex no debe:
- inventar criptografía;
- mezclar hashes sin versionado;
- derivar secreto de PII/password;
- enviar voterSecret al backend como flujo productivo;
- hacer commitment público en el voto;
- guardar Merkle path/leaf index en voto;
- aceptar verification artifacts del cliente;
- cambiar zkey manteniendo protocolVersion;
- generar setup productivo automáticamente;
- promover artifacts devnet;
- ignorar warnings de constraints;
- usar hints sin constraints;
- confiar solo en validación TypeScript para rangos;
- usar JSON.stringify sin canonicalización criptográfica;
- afirmar que ZK oculta una selección enviada en claro;
- afirmar que ZK elimina IP/timing;
- loguear witness/secrets/toxic waste.

## Decisiones para etapa 11
La siguiente etapa fijará:
- schema de votos;
- proof/digest persistido;
- public signals persistidos;
- constraint único de nullifier;
- aceptación transaccional;
- carreras de doble voto;
- status/time/root/context;
- idempotencia;
- receipt;
- respuesta;
- auditoría sin identidad;
- tratamiento de selección anónima V1.

## Instrucción final
Un proof válido no es autorización suficiente.

Debe cumplirse:

```text
proof válido
+ root/context correctos
+ elección abierta y dentro de ventana
+ nullifier no consumido
+ persistencia atómica
= voto aceptado
```

El siguiente documento rector será:

`11-protocolo-voto-nullifier-atomicidad.md`
