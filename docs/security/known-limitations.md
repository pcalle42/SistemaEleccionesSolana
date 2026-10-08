# Limitaciones y riesgos residuales V1

1. Un dispositivo comprometido puede robar `voterSecret`, observar o cambiar la selección.
2. IP, timing y volumen permiten correlación; ZK no oculta metadata frente a un observador global.
3. Si `voteEncoding` es señal pública, el backend conoce la selección anónima. V1 no ofrece ballot
   secrecy criptográfico frente al servidor.
4. Compartir una credential válida queda fuera de la prevención completa.
5. Un único admin no implementa separación humana de funciones.
6. Un superuser/operador puede reescribir evidencia interna de forma coherente; no hay anchoring
   externo ni firma institucional en V1.
7. La protección DoS es acotada por instancia y no garantiza disponibilidad ante DDoS ilimitado.
8. V1 no es coercion-resistant ni protege frente a seguridad física deficiente.
9. Groth16 productivo depende de revisión independiente y ceremonia correcta; el setup devnet nunca
   es productivo.
10. Scanners y tests reducen riesgo conocido, pero no prueban ausencia de vulnerabilidades.

Estas limitaciones deben aparecer en cualquier evaluación o comunicación externa del sistema.
