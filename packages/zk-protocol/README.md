# Protocolo ZK V1

Implementación compartida de `anonymous-single-choice-v1`. El circuito prueba
conocimiento de un secreto electoral, pertenencia a un snapshot Poseidon,
derivación correcta del nullifier y una selección `SINGLE_CHOICE` válida.

## Protocolo congelado

- Groth16 sobre BN254 (`bn128` en snarkjs).
- Circom `2.2.3`, snarkjs `0.7.6`, circomlib `2.0.5` y circomlibjs `0.1.7`.
- Árbol binario Poseidon de depth 20 y capacidad máxima `2^20`.
- Commitment: `Poseidon(DOMAIN_IDENTITY_COMMITMENT_V1, voterSecret)`.
- Nodo: `Poseidon(DOMAIN_MERKLE_NODE_V1, left, right)`.
- Nullifier: `Poseidon(DOMAIN_NULLIFIER_V1, voterSecret, electionContext)`.
- Leaves ordenadas por su field element numérico canónico; duplicados y el
  `ZERO_LEAF_V1` reservado se rechazan.

Los domain tags y `ZERO_LEAF_V1` son `SHA-256(etiqueta UTF-8) mod r`. Las
etiquetas, los valores resultantes y el primo escalar están en
`src/constants.ts`. Este cálculo sirve para auditar las constantes; no se
repite para decidir dominios en runtime.

`voterSecret` es un field element decimal canónico, distinto de cero, obtenido
por rejection sampling de 32 bytes CSPRNG. Nunca se deriva de passwords, UUIDs,
documentos o PII.

## Señales

Orden público, parte del protocolo:

```text
0 merkleRoot
1 nullifier
2 electionContext
3 voteChoice
4 optionCount
```

Las señales privadas son `voterSecret`, `merklePathElements[20]` y
`merklePathIndices[20]`. El commitment, índice de leaf y path no son públicos.
Cada path index está constrained a `0/1`; choice y option count están
constrained a uint32, `optionCount >= 2` y `voteChoice < optionCount`.

V1 oculta la identidad elegible, no la selección: `voteChoice` es público y el
backend conoce el voto anónimo en claro. Tampoco oculta IP, timing ni metadata
de red.

## Election context

`deriveElectionContextV1` codifica, en orden fijo, domain tag, versiones,
election ID, configuration version, esquemas, depth y mapping canónico de
opciones. Strings NFC se codifican UTF-8 con prefijo de longitud big-endian;
enteros tienen ancho fijo. El resultado es SHA-256 reducido al campo. No usa
`JSON.stringify()` como codificación criptográfica.

La API persiste el context y `optionId -> index` dentro del snapshot de cada
`ElectionConfigurationVersion` al pasar a `READY`.

## Comandos

```bash
pnpm zk:compile
pnpm zk:inspect
pnpm zk:setup
pnpm zk:verify-artifacts
pnpm zk:test
pnpm zk:benchmark
```

La compilación usa Circom oficial dentro de una imagen Docker fijada por digest
y verifica el SHA-256 del binario. `zk:setup` no reemplaza un zkey V1 existente.
Los artefactos versionados son exclusivamente **DEVNET / NOT FOR PRODUCTION**.

El manifest machine-readable está en `manifests/`; los vectores compartidos en
`test-vectors/`; R1CS, WASM, zkey, verification key, Powers of Tau, transcript,
constraints y medición están en `artifacts/anonymous-single-choice-v1/`.

## Verificación backend

La API depende del port `VoteProofVerifier`. El adapter snarkjs limita y valida
el payload antes del pairing, exige root/context/option count esperados y carga
la verification key por la pareja protocol/circuit únicamente del registry
trusted local, comprobando su digest. Nunca acepta WASM, zkey o verification key
del cliente.

El nullifier aún no se persiste. La unicidad y aceptación transaccional son
responsabilidad de la etapa 11; un proof válido por sí solo no autoriza un voto.

## Boundary frontend

El cliente de votación custodiará localmente `voterSecret`, leaf index y Merkle
path. Debe descargar manifest, WASM y zkey por versión, comprobar sus digests y
generar witness/proof en un Web Worker cuando se implemente esa interfaz. Ni
telemetría ni logs pueden incluir secret, witness o path. El backend no ofrece
un flujo productivo de proving y nunca debe recibir `voterSecret`.

## Producción

Los artefactos actuales provienen de un setup de una sola parte y no se pueden
promover. Consulte [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) antes de crear una
nueva versión productiva.

## Riesgo de dependencia conocido

`pnpm audit --prod` conserva un advisory **low** sin versión parcheada para
`elliptic`, transitivo de `circomlibjs -> ethers`. Este paquete usa de
circomlibjs únicamente el builder Poseidon y no las rutas ECDSA afectadas. Los
advisories altos transitivos de `underscore` y `ws` están fijados mediante
overrides a versiones parcheadas. El riesgo low debe reevaluarse cuando iden3
publique una versión de circomlibjs que elimine o actualice ethers; no se oculta
ni se interpreta como autorización productiva.
