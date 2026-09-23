# Docker Compose

- `compose.yml`: servicios, red, volumen, health checks y política común.
- `compose.local.yml`: puertos publicados exclusivamente en loopback.
- `compose.devnet.yml`: PostgreSQL de integración publicado solo en loopback;
  Valkey permanece interno.

Todos los comandos deben ejecutarse mediante los scripts de `infra/scripts/`
para mantener nombre de proyecto, archivo de entorno y validaciones consistentes.
