# 03 — Infraestructura Local y Devnet

## 1. Propósito

Este documento define la infraestructura reproducible para los entornos **local** y **devnet** del proyecto **Votaciones**.

Su objetivo es garantizar que cualquier desarrollador pueda levantar las dependencias operativas necesarias sin instalar servicios manualmente en el host.

Este documento debe leerse junto con:

- `00-consolidado-arquitectura.md`
- `01-plan-maestro-construccion.md`
- `02-bootstrap-repositorio.md`

---

# 2. Principio general

Para local y devnet, toda dependencia operativa relevante debe poder ejecutarse mediante Docker.

No se debe exigir la instalación manual de:

- PostgreSQL;
- Valkey;
- herramientas auxiliares de infraestructura;

fuera de Docker, salvo herramientas de desarrollo explícitamente documentadas.

---

# 3. Herramienta de orquestación local

Se utilizará **Docker Compose**.

No se introducirá Kubernetes en esta fase.

No se introducirá Terraform para local/devnet.

No se introducirá una plataforma de orquestación adicional salvo decisión arquitectónica posterior.

---

# 4. Objetivos del entorno

El entorno debe permitir:

- levantar servicios;
- detener servicios;
- reiniciar;
- inspeccionar logs;
- validar health;
- resetear datos;
- recrear desde cero;
- ejecutar migraciones;
- cargar seeds;
- ejecutar pruebas de integración;
- soportar devnet completo posteriormente.

---

# 5. Estructura recomendada

Dentro de:

```text
infra/
```

se recomienda:

```text
infra/
├── README.md
├── docker/
│   ├── compose.yml
│   ├── compose.local.yml
│   └── compose.devnet.yml
├── postgres/
│   ├── init/
│   └── README.md
├── valkey/
│   └── README.md
├── devnet/
│   ├── .env.example
│   ├── fixtures/
│   └── README.md
└── scripts/
    ├── up.sh
    ├── down.sh
    ├── reset.sh
    └── status.sh
```

La implementación puede consolidar archivos Compose si mantiene claridad.

---

# 6. Compose base

Debe existir un archivo Compose base con servicios comunes.

Ejemplo conceptual:

```text
infra/docker/compose.yml
```

Debe contener al menos:

- PostgreSQL;
- Valkey.

Las apps pueden añadirse posteriormente cuando sus Dockerfiles estén definidos.

---

# 7. Perfiles

Se deben diferenciar al menos dos modos:

## Local

Para desarrollo interactivo.

Características:

- puertos expuestos al host cuando sean útiles;
- hot reload de apps fuera o dentro de Docker según etapa;
- volúmenes persistentes;
- credenciales de desarrollo;
- logs legibles.

## Devnet

Para integración reproducible.

Características:

- configuración estable;
- datos reproducibles;
- menos dependencia del host;
- preparado para E2E;
- reset completo controlado;
- comportamiento más cercano a producción sin pretender ser producción.

---

# 8. Nombres de proyecto

Docker Compose debe utilizar un nombre de proyecto consistente.

Ejemplo:

```text
votaciones
```

o perfiles diferenciados:

```text
votaciones-local
votaciones-devnet
```

El objetivo es evitar colisiones con otros proyectos.

---

# 9. Red interna

Debe existir una red Docker explícita.

Ejemplo:

```text
votaciones-net
```

Los servicios deben comunicarse por nombre de servicio.

Ejemplos:

```text
postgres:5432
valkey:6379
```

No usar `localhost` entre contenedores.

---

# 10. Exposición de puertos

Solo exponer al host los puertos necesarios.

Inicialmente puede exponerse:

- PostgreSQL para debugging local;
- Valkey para debugging local;

pero en devnet puede optarse por no exponerlos si las pruebas no lo requieren.

La configuración debe diferenciar local y devnet.

---

# 11. PostgreSQL

Se utilizará PostgreSQL como base de datos principal.

La imagen debe fijar una versión major concreta.

No usar:

```text
postgres:latest
```

Debe utilizarse una versión explícita y soportada.

Ejemplo conceptual:

```text
postgres:17
```

La versión concreta debe validarse al momento de implementación.

---

# 12. Configuración PostgreSQL

Variables mínimas:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
```

Para local/devnet pueden utilizarse credenciales conocidas de desarrollo.

Deben estar claramente marcadas como no productivas.

Nunca reutilizar estas credenciales en producción.

---

# 13. Persistencia PostgreSQL

Debe utilizarse volumen nombrado.

Ejemplo:

```text
votaciones-postgres-data
```

El volumen debe sobrevivir a:

```text
docker compose down
```

y eliminarse únicamente mediante reset explícito.

---

# 14. Inicialización PostgreSQL

El directorio:

```text
infra/postgres/init/
```

puede utilizarse solo para inicialización estrictamente infraestructural.

No debe contener el esquema evolutivo de aplicación si este se maneja mediante migraciones.

Regla:

**las migraciones de aplicación son la fuente de verdad del esquema.**

---

# 15. Health check PostgreSQL

Debe existir health check real.

Ejemplo conceptual:

```text
pg_isready
```

Los servicios dependientes deben esperar readiness, no solo que el proceso exista.

---

# 16. Valkey

Se utilizará **Valkey**.

No Redis.

La imagen debe fijar una versión concreta.

No usar:

```text
valkey:latest
```

o equivalente flotante.

---

# 17. Persistencia Valkey

Por defecto, Valkey debe considerarse almacenamiento auxiliar y efímero.

La necesidad de persistencia debe justificarse según el uso real.

Para local/devnet puede configurarse volumen si mejora debugging, pero el sistema no debe depender de Valkey para reconstruir estado electoral crítico.

---

# 18. Configuración Valkey

La configuración debe ser mínima.

No habilitar acceso externo innecesario.

En devnet, Valkey debe preferiblemente ser accesible solo por la red interna Docker.

---

# 19. Health check Valkey

Debe existir health check.

Ejemplo conceptual:

```text
valkey-cli ping
```

Debe verificarse una respuesta equivalente a:

```text
PONG
```

---

# 20. Dependencias entre servicios

Compose debe utilizar condiciones de health cuando sea posible.

Ejemplo conceptual:

```text
api depends_on postgres healthy
api depends_on valkey healthy
```

No depender solo del orden de creación.

---

# 21. Variables de entorno

Debe existir:

```text
infra/devnet/.env.example
```

Puede existir además configuración local separada.

No commitear `.env` reales.

Los archivos de ejemplo deben contener únicamente valores seguros de desarrollo.

---

# 22. Variables base recomendadas

Ejemplo:

```text
POSTGRES_DB=votaciones
POSTGRES_USER=votaciones
POSTGRES_PASSWORD=dev-only-password

POSTGRES_HOST=postgres
POSTGRES_PORT=5432

VALKEY_HOST=valkey
VALKEY_PORT=6379
```

Los nombres finales deben alinearse con la etapa del backend.

---

# 23. Credenciales conocidas en dev

Si se utilizan credenciales fijas para desarrollo:

- deben llevar advertencia explícita;
- deben estar limitadas a local/devnet;
- no deben aparecer en imágenes productivas;
- no deben copiarse a producción.

---

# 24. Secrets Docker

No es obligatorio utilizar Docker Secrets en local/devnet.

No introducir complejidad innecesaria.

La estrategia productiva se definirá en `20-produccion.md`.

---

# 25. TLS

No se requiere TLS real para local/devnet.

No crear certificados autofirmados como requisito obligatorio salvo necesidad específica posterior.

La arquitectura debe permitir agregar TLS en producción sin modificar el dominio.

---

# 26. Datos persistentes

Debe existir una política clara sobre qué datos sobreviven.

## Persistente

- PostgreSQL local/devnet cuando no se solicita reset.

## Opcional

- Valkey.

## Regenerable

- caches;
- builds;
- artefactos temporales;
- fixtures cargables.

---

# 27. Reset

Debe existir un procedimiento destructivo explícito para limpiar local/devnet.

Ejemplo:

```text
pnpm infra:reset
```

o:

```text
./infra/scripts/reset.sh
```

Debe:

1. detener servicios;
2. eliminar volúmenes dev;
3. recrear infraestructura;
4. esperar health;
5. dejar el entorno preparado para migraciones/seeds.

---

# 28. Seguridad del reset

El reset debe proteger contra ejecución accidental en producción.

Debe verificar algún indicador de entorno.

Ejemplo:

```text
VOTACIONES_ENV=local
```

o:

```text
VOTACIONES_ENV=devnet
```

Si detecta un entorno desconocido, debe abortar.

---

# 29. Comandos raíz recomendados

El `package.json` raíz debe exponer eventualmente:

```text
pnpm infra:up
pnpm infra:down
pnpm infra:status
pnpm infra:logs
pnpm infra:reset
```

Y posteriormente:

```text
pnpm devnet:up
pnpm devnet:down
pnpm devnet:reset
pnpm devnet:seed
```

---

# 30. `infra:up`

Debe:

- validar Docker disponible;
- validar configuración mínima;
- levantar servicios;
- esperar health;
- devolver error si algún servicio crítico falla.

No debe devolver éxito mientras PostgreSQL esté indisponible.

---

# 31. `infra:down`

Debe detener los servicios sin eliminar datos por defecto.

No debe borrar volúmenes salvo bandera explícita.

---

# 32. `infra:status`

Debe mostrar al menos:

- servicio;
- estado;
- health;
- puertos relevantes.

Debe ser útil para diagnóstico rápido.

---

# 33. `infra:logs`

Debe facilitar acceso a logs.

Puede aceptar servicio opcional:

```text
pnpm infra:logs postgres
pnpm infra:logs valkey
```

---

# 34. `infra:reset`

Debe ser claramente destructivo.

Puede exigir:

```text
--force
```

o confirmación interactiva.

En CI/devnet automatizado puede existir una variante explícita no interactiva.

---

# 35. Backups devnet

La etapa de persistencia definirá los scripts finales.

Infraestructura debe dejar espacio para:

```text
infra/postgres/backups/
```

pero los backups reales no deben commitearse.

---

# 36. Restore devnet

Debe ser posible restaurar una copia de PostgreSQL en devnet.

La prueba formal se implementará en etapas posteriores.

---

# 37. Logs de contenedores

No configurar retención infinita.

Para local puede usarse configuración Docker por defecto inicialmente.

Para devnet se debe evaluar rotación.

No deben escribirse secretos deliberadamente en logs.

---

# 38. Restart policy

Para local:

puede utilizarse:

```text
unless-stopped
```

o evitar restart automático según comodidad.

Para devnet:

usar una política razonable para procesos largos.

No utilizar restart infinito para esconder crashes persistentes.

---

# 39. Recursos

Local/devnet puede definir límites razonables de memoria/CPU si ayuda a reproducibilidad.

No deben ser tan estrictos que generen fallos artificiales.

Los circuitos ZK pueden requerir recursos mayores y se tratarán específicamente en etapa 10.

---

# 40. Timezone

Los servicios deben preferir UTC internamente.

No depender de timezone local del host para lógica electoral.

Los timestamps persistidos deben normalizarse según la capa de aplicación.

---

# 41. Clock

No introducir servicios de sincronización adicionales en Docker.

Las pruebas sensibles al tiempo deben diseñarse de forma controlable.

---

# 42. Hostnames internos

Los hostnames internos deben ser nombres estables de servicio:

```text
postgres
valkey
api
admin-web
voter-web
```

No codificar IPs de contenedores.

---

# 43. DNS interno

Utilizar DNS de Docker Compose.

No agregar `/etc/hosts` manual salvo necesidad excepcional documentada.

---

# 44. Volúmenes

Los volúmenes nombrados deben tener nombres claros.

Ejemplo:

```text
postgres-data
valkey-data
```

No montar directorios arbitrarios del host para datos de PostgreSQL salvo necesidad específica.

---

# 45. Bind mounts

Los bind mounts se reservan principalmente para:

- código fuente en desarrollo;
- configuración;
- fixtures;
- scripts.

No montar secretos desde ubicaciones ambiguas.

---

# 46. Permisos

Las imágenes propias futuras deben preferir usuario no root cuando sea viable.

Las imágenes oficiales de PostgreSQL/Valkey deben utilizarse conforme a sus prácticas soportadas.

---

# 47. Imágenes

Toda imagen debe:

- tener versión fijada;
- provenir de fuente confiable;
- evitar variantes innecesarias;
- documentar actualización.

No usar imágenes desconocidas solo para simplificar configuración.

---

# 48. Pull policy

No depender de `latest`.

Las actualizaciones de imágenes deben ser explícitas.

---

# 49. Compatibilidad

El entorno debe funcionar al menos en Docker Desktop y Docker Engine moderno.

Si se detectan diferencias entre Linux/macOS/Windows, deben documentarse.

No diseñar scripts que dependan exclusivamente de GNU utilities sin indicarlo.

---

# 50. Shell scripts

Preferencia:

scripts POSIX/Bash simples.

Si la portabilidad se vuelve problemática, migrar la lógica compleja a Node.js/TypeScript dentro de `scripts/`.

No crear scripts shell enormes.

---

# 51. Imágenes de aplicación

No es necesario contenerizar las apps en esta etapa si todavía no existen.

Cuando existan, sus Dockerfiles deben vivir en un lugar coherente, preferiblemente junto a cada app o en `infra/docker/`.

La decisión debe ser uniforme.

---

# 52. Desarrollo híbrido

Se permite inicialmente:

- PostgreSQL y Valkey en Docker;
- NestJS ejecutándose en el host;
- frontends ejecutándose en el host.

Esto suele simplificar hot reload.

Devnet completo posteriormente podrá ejecutar también las apps en contenedores.

---

# 53. URLs locales

Los endpoints deben usar configuración explícita.

No codificar puertos en múltiples lugares.

Ejemplo conceptual:

```text
API_PORT=3000
ADMIN_WEB_PORT=3001
VOTER_WEB_PORT=3002
```

Las decisiones exactas pueden fijarse cuando existan las apps.

---

# 54. Collision avoidance

Los puertos locales deben elegirse y documentarse.

Si hay colisión, se debe permitir override por `.env`.

No generar automáticamente puertos aleatorios porque dificulta debugging.

---

# 55. Migraciones

Compose no debe ejecutar migraciones de forma destructiva implícita al arrancar PostgreSQL.

La estrategia preferida es un comando explícito:

```text
pnpm db:migrate
```

o un job controlado.

El backend no debe modificar silenciosamente el esquema en producción.

---

# 56. Seeds

Los seeds deben ser explícitos.

Ejemplo:

```text
pnpm db:seed
```

Los seeds devnet deben ser idempotentes o resetear el entorno de forma documentada.

---

# 57. Devnet fixtures

Debe existir una estructura para fixtures reproducibles.

Ejemplo:

```text
infra/devnet/fixtures/
```

Más adelante podrá contener:

- elecciones;
- votantes;
- candidatos;
- escenarios de pruebas.

No incluir datos personales reales.

---

# 58. PII

Devnet no debe utilizar información real de votantes.

Solo datos sintéticos.

---

# 59. Seguridad de bases expuestas

Si PostgreSQL o Valkey se exponen al host en local:

- bind preferentemente a localhost;
- no exponer a interfaces públicas;
- credenciales de desarrollo;
- advertencia documental.

---

# 60. Firewall

No se asume firewall de host como mecanismo principal de seguridad.

La configuración Docker debe minimizar exposición por diseño.

---

# 61. Devnet y producción

Devnet no debe presentarse como seguro para internet pública.

Debe estar etiquetado como entorno de desarrollo/integración.

No reutilizar devnet como producción cambiando únicamente variables.

---

# 62. Health aggregate

Más adelante puede existir un comando que valide toda la plataforma.

Ejemplo:

```text
pnpm devnet:check
```

Debe comprobar:

- PostgreSQL;
- Valkey;
- API;
- frontends;
- componentes ZK necesarios.

En esta etapa se prepara la convención.

---

# 63. Failure behavior

Si un servicio crítico no puede arrancar, el comando de bootstrap debe fallar claramente.

No ocultar:

- puertos ocupados;
- credenciales inválidas;
- volumen corrupto;
- incompatibilidad de imagen.

---

# 64. Troubleshooting

`infra/README.md` debe incluir como mínimo:

- Docker no disponible;
- puerto ocupado;
- PostgreSQL unhealthy;
- Valkey unhealthy;
- reset;
- inspección de logs;
- eliminación manual de volúmenes como último recurso.

---

# 65. Seguridad de archivos Compose

No incrustar secretos reales en YAML.

Valores de desarrollo conocidos pueden estar en `.env.example`, claramente etiquetados.

---

# 66. Validación de Compose

Debe ejecutarse:

```text
docker compose config
```

como parte de validación de infraestructura.

Debe fallar si la configuración es inválida.

---

# 67. Prueba de reconstrucción

La etapa debe probar:

1. `infra:up`;
2. health correcto;
3. `infra:down`;
4. `infra:up`;
5. persistencia PostgreSQL;
6. `infra:reset`;
7. recreación limpia;
8. health correcto.

---

# 68. Prueba PostgreSQL

Debe comprobarse al menos:

- conexión;
- creación de una tabla temporal o DB check;
- escritura;
- lectura;
- persistencia tras restart.

No usar esto como migración de aplicación.

---

# 69. Prueba Valkey

Debe comprobarse:

- `PING`;
- escritura temporal;
- lectura;
- expiración básica si se usará TTL.

No convertir este smoke test en contrato funcional todavía.

---

# 70. Versionado de infraestructura

Los archivos Compose, scripts y configuración deben versionarse.

Los volúmenes y datos runtime no.

---

# 71. Documentación de versiones

`infra/README.md` debe indicar las versiones de imágenes utilizadas.

Ejemplo:

```text
PostgreSQL: 17.x
Valkey: 8.x
```

Las versiones reales deben reflejar el Compose.

---

# 72. Actualización de imágenes

Actualizar major version requiere:

- prueba local;
- prueba devnet;
- backup/restore cuando afecte PostgreSQL;
- nota de compatibilidad;
- ADR si el impacto es importante.

---

# 73. No introducir todavía

Esta etapa no debe agregar por defecto:

- pgAdmin;
- RedisInsight;
- Grafana;
- Prometheus;
- Loki;
- Jaeger;
- Elasticsearch;
- Kafka;
- RabbitMQ;
- MinIO;
- Nginx;
- Traefik;
- Keycloak.

Podrán incorporarse en etapas posteriores si aportan valor.

---

# 74. Observabilidad mínima

En esta fase basta con:

- logs Docker;
- health checks;
- status scripts.

La observabilidad completa corresponde a etapa 19.

---

# 75. Seguridad mínima de PostgreSQL

Para local/devnet:

- usuario de aplicación separado si la etapa 04 lo define;
- evitar usar superuser desde la app;
- credenciales explícitas;
- no exponer públicamente.

La configuración final se cerrará en `04-postgresql-modelo-persistencia.md`.

---

# 76. Seguridad mínima de Valkey

Para local/devnet:

- red interna;
- exposición mínima;
- no usarlo como almacén de secretos;
- no usarlo como persistencia crítica.

La estrategia de auth específica se definirá en etapa 05.

---

# 77. Dependencias de esta etapa

Requiere:

- `00-consolidado-arquitectura.md`;
- `01-plan-maestro-construccion.md`;
- `02-bootstrap-repositorio.md`.

No requiere aún:

- modelo electoral;
- circuitos;
- frontends.

---

# 78. Orden de implementación

Codex debe:

1. crear estructura `infra/`;
2. crear Compose base;
3. fijar versiones PostgreSQL y Valkey;
4. crear red;
5. crear volúmenes;
6. configurar health checks;
7. crear `.env.example`;
8. crear scripts `up/down/status/logs/reset`;
9. integrar scripts raíz;
10. crear README;
11. validar `docker compose config`;
12. levantar infraestructura;
13. comprobar health;
14. comprobar PostgreSQL;
15. comprobar Valkey;
16. comprobar persistencia;
17. comprobar reset;
18. documentar resultados.

---

# 79. Criterios de aceptación

La etapa se aprueba cuando:

- Docker Compose valida;
- PostgreSQL arranca healthy;
- Valkey arranca healthy;
- ambos se comunican en red interna;
- datos PostgreSQL sobreviven restart normal;
- reset elimina datos solo de forma explícita;
- `.env` real no está versionado;
- configuración de ejemplo existe;
- servicios usan imágenes versionadas;
- puertos expuestos están documentados;
- comandos raíz funcionan;
- README permite reconstruir el entorno.

---

# 80. Definition of Done

```text
[ ] docker compose config pasa
[ ] PostgreSQL healthy
[ ] Valkey healthy
[ ] versiones fijadas
[ ] red interna explícita
[ ] volumen PostgreSQL persistente
[ ] .env.example creado
[ ] .env ignorado
[ ] pnpm infra:up funciona
[ ] pnpm infra:down funciona
[ ] pnpm infra:status funciona
[ ] pnpm infra:logs funciona
[ ] pnpm infra:reset funciona
[ ] reset protegido
[ ] restart conserva PostgreSQL
[ ] reset recrea entorno limpio
[ ] smoke test PostgreSQL pasa
[ ] smoke test Valkey pasa
[ ] README actualizado
[ ] no hay secretos reales
```

---

# 81. Instrucción final para Codex

No implementar todavía:

- esquema electoral;
- autenticación;
- lógica de votos;
- circuitos;
- conteo;
- frontends.

Esta etapa entrega exclusivamente la infraestructura reproducible sobre la que se construirán los demás componentes.

El siguiente documento rector será:

`04-postgresql-modelo-persistencia.md`
