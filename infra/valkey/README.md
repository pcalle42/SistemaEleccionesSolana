# Valkey

Valkey 8.1.10 funciona como servicio auxiliar efímero. Persistencia RDB y AOF
están deshabilitadas deliberadamente y no se monta volumen.

En local se publica únicamente sobre `127.0.0.1`. En devnet solo es accesible
desde la red interna de Compose. El cliente soporta username/password y TLS por
configuración, aunque las plantillas local/devnet no habilitan autenticación ni
TLS porque no exponen el servicio fuera de su boundary controlado.

Los únicos usos registrados, sus TTLs y políticas de fallo están documentados en
`apps/api/src/valkey/README.md`. `pnpm valkey:verify:loss` prueba mediante reinicio
real que PostgreSQL conserva la verdad y que la cache puede reconstruirse.
