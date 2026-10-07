# Auditoría y verificabilidad

Este módulo separa tres responsabilidades:

1. `audit.audit_event` mantiene el registro interno append-only, encadenado por elección. Las
   escrituras pasan por funciones `SECURITY DEFINER` y participan en la transacción de dominio.
2. `result.election_manifests`, el snapshot del conjunto aceptado y el tally son evidencia electoral
   reproducible. El manifiesto se publica al entrar en `READY`; `EnterCounting` congela el conjunto
   al pasar de `CLOSED` a `COUNTING` y `ComputeTally` valida después el conteo canónico contra un
   agregado SQL independiente.
3. `election_results` y `result_publications` preservan versiones y el workflow
   `GENERATED/VERIFIED/PUBLISHING/PUBLISHED/FAILED`. El paquete se guarda bajo
   `<election>/results/vN/<digest>` y sólo se publica si el verifier vuelve a validar los bytes.

Los DTO públicos usan listas permitidas: no exportan nombres, referencias externas, credentials,
commitments de identidad, IP, user-agent, request IDs ni timestamps individuales de aceptación. El
paquete sí contiene prueba Groth16, señales públicas, nullifier, encoding de voto y receipt
commitment, porque son necesarios para reproducir la verificación y el tally.

## Límites de confianza

La cadena hash detecta alteraciones accidentales o posteriores dentro de la base, pero un operador
con control de base y aplicación puede reescribirla completa. Firmas institucionales, almacenamiento
durable externo y anclaje externo de checkpoints quedan para producción. No se usan blockchain,
transacciones on-chain ni llaves en esta etapa. El protocolo tampoco promete receipt-freeness o
resistencia a coerción.

El almacenamiento filesystem es exclusivo de local/devnet. `VERIFICATION_ARTIFACT_DIRECTORY`
configura la raíz y los directorios finales son content-addressed e inmutables para la aplicación.
