# Procedimiento de trusted setup productivo

Los archivos marcados `DEVNET / NOT FOR PRODUCTION` están excluidos de este
procedimiento y nunca deben renombrarse o copiarse como artefactos productivos.

## Precondiciones

1. Congelar una nueva `protocolVersion` y `circuitVersion`; no reutilizar V1 si
   cambia source, depth, constantes, inputs, encoding o toolchain.
2. Revisar constraints, encodings, aliasing, señales públicas/privadas y test
   vectors mediante revisión criptográfica independiente.
3. Reconstruir R1CS/WASM en dos entornos limpios con el contenedor fijado y
   comparar hashes.
4. Seleccionar un Powers of Tau público reconocido compatible con BN254 y el
   número de constraints. Obtenerlo por canales independientes y comprobar el
   hash publicado antes de usarlo.
5. Publicar reglas, participantes, software, hashes iniciales y canal de
   incidentes antes de la ceremonia Phase 2.

## Phase 2

1. Ejecutar `groth16 setup` sobre el R1CS y Powers of Tau verificados.
2. Cada participante recibe el zkey anterior, verifica el transcript, aporta
   entropía en una máquina controlada y elimina todo material temporal.
3. Publicar para cada contribución nombre/pseudónimo, challenge/response hash,
   timestamp, comando y versión exacta de snarkjs.
4. Verificar toda la cadena de contribuciones. Si la política aprobada lo
   requiere, aplicar un beacon público final con fuente y parámetros fijados.
5. Ejecutar `snarkjs zkey verify` contra el R1CS y Powers of Tau originales.
6. Exportar la verification key desde el zkey final y comprobar nuevamente que
   coincide.

## Publicación

Publicar sources, manifest, R1CS, WASM, verification key, zkey final, hashes y
transcript completo. Firmar el manifest mediante el proceso de release del
proyecto y distribuir artefactos desde ubicaciones con digest inmutable.

Antes de habilitar una elección, dos operadores independientes deben verificar
los hashes del registry desplegado. CI normal puede reconstruir y verificar,
pero nunca crea ni contribuye automáticamente a un setup productivo. Los
secretos de contribución, witnesses y entropía no se almacenan en Git, logs,
backups ni artefactos CI.

## Revocación y conservación

Una discrepancia de hashes, contribución comprometida o cambio de circuito
obliga a detener el release y crear una versión nueva. No se reemplazan
artefactos bajo una versión existente. Las verification keys y transcripts de
elecciones históricas se conservan durante todo su período de auditoría.
