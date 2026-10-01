# Verificación ZK

`VoteProofVerifier` separa la application layer de snarkjs. El adapter V1:

- admite solo `anonymous-single-choice-v1`;
- limita el payload a 64 KiB y valida shape/encodings antes del pairing;
- mapea las señales públicas sin índices mágicos fuera del paquete compartido;
- compara root, election context y option count esperados antes de verificar;
- selecciona la verification key por protocol/circuit desde el registry local y comprueba su
  SHA-256;
- devuelve códigos de dominio estables sin mensajes internos de snarkjs.

El módulo de votación obtiene root/context congelados desde PostgreSQL, invoca
este port fuera de su transacción corta y consume el nullifier mediante un
`INSERT` único. Nunca acepta verification keys, zkeys, WASM o circuitos enviados
por el cliente. Consulte [`../voting/README.md`](../voting/README.md).
