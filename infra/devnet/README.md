# Devnet

Entorno reproducible de integración, aislado del modo local mediante nombre de
proyecto, red y volumen propios. PostgreSQL se publica exclusivamente sobre
loopback (`127.0.0.1:55432` por defecto) para migraciones, pruebas y backup;
Valkey no se publica al host.

`fixtures/` recibirá únicamente datos sintéticos cuando se definan seeds. No se
permiten datos reales de votantes.
