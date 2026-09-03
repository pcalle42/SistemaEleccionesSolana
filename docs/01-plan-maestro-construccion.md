# 01 — Plan Maestro de Construcción

## 1. Propósito

Este documento define el orden de construcción del proyecto **Votaciones**.

Complementa a `00-consolidado-arquitectura.md` y convierte las decisiones arquitectónicas en una secuencia controlada de implementación para Codex.

Ninguna etapa debe interpretarse como autorización para modificar las decisiones consolidadas en `00-consolidado-arquitectura.md`.

---

## 2. Reglas de ejecución para Codex

Antes de implementar una etapa, Codex debe:

1. leer `00-consolidado-arquitectura.md`;
2. leer este plan maestro;
3. leer el documento específico de la etapa;
4. inspeccionar el estado real del repositorio;
5. comprobar dependencias previas;
6. identificar incompatibilidades antes de escribir código;
7. implementar únicamente el alcance autorizado;
8. ejecutar las validaciones exigidas;
9. actualizar documentación afectada;
10. entregar un resumen de cambios, pruebas y asuntos pendientes.

Codex no debe improvisar cambios en:

- stack;
- protocolo electoral;
- arquitectura ZK;
- persistencia principal;
- Valkey;
- autenticación;
- límites de dominio;
- modelo de seguridad;
- estructura macro del sistema.

Si encuentra un bloqueo arquitectónico, debe detener esa parte, documentar el problema y proponer alternativas.

---

## 3. Gates globales

Una etapa no se considera terminada solo porque compile.

Cada etapa puede estar sujeta a cinco gates:

### G1 — Arquitectura
La implementación respeta los documentos aprobados.

### G2 — Calidad
Lint, tipos y pruebas correspondientes pasan.

### G3 — Seguridad
No introduce secretos, bypasses, validaciones débiles ni exposición de información sensible.

### G4 — Integración
La funcionalidad funciona con las dependencias reales de la etapa.

### G5 — Documentación
El repositorio explica cómo utilizar, probar y mantener lo construido.

Las etapas críticas electorales requieren los cinco gates.

---

## 4. Estrategia de construcción

Se utilizará una construcción incremental.

Cada incremento debe dejar el repositorio en un estado coherente.

No se deben crear grandes bloques de código desconectados para integrarlos al final.

La secuencia general es:

**fundación → infraestructura → dominio → criptografía → protocolo electoral → interfaces → seguridad integral → operación → producción.**

---

# FASE 0 — Especificación y control arquitectónico

## 5. Etapa 00 — Consolidado arquitectónico

Documento:

`00-consolidado-arquitectura.md`

Estado:

**COMPLETADO**

Objetivo:

Establecer las decisiones arquitectónicas principales.

No genera código.

---

## 6. Etapa 01 — Plan maestro

Documento:

`01-plan-maestro-construccion.md`

Objetivo:

Definir el orden, dependencias, gates y entregables de todo el proyecto.

No genera código de aplicación.

### Gate de salida

Debe existir una secuencia inequívoca para construir el sistema completo.

---

# FASE 1 — Fundación del repositorio

## 7. Etapa 02 — Bootstrap del repositorio

Documento requerido:

`02-bootstrap-repositorio.md`

Objetivo:

Crear la estructura base del proyecto.

Debe definir:

- organización de directorios;
- workspaces si corresponden;
- convenciones TypeScript;
- package management;
- lint;
- formatting;
- configuración compartida;
- `.gitignore`;
- `.editorconfig`;
- variables de entorno;
- estructura documental;
- scripts raíz;
- estrategia de builds;
- estrategia de tests.

### Dependencias

- etapa 00;
- etapa 01.

### Entregable

Repositorio vacío funcional, preparado para recibir servicios y aplicaciones.

### Gate

Debe ser posible clonar, instalar dependencias y ejecutar las validaciones base.

---

# FASE 2 — Infraestructura reproducible

## 8. Etapa 03 — Infraestructura local/devnet

Documento:

`03-infraestructura-local-devnet.md`

Objetivo:

Crear el entorno Docker reproducible.

Debe incluir inicialmente:

- PostgreSQL;
- Valkey;
- redes;
- volúmenes;
- health checks;
- configuración local;
- configuración devnet;
- scripts de inicialización;
- procedimientos start/stop/reset.

### Dependencias

- etapa 02.

### Gate

Un desarrollador debe poder levantar la infraestructura desde una instalación limpia mediante comandos documentados.

---

## 9. Etapa 04 — PostgreSQL y persistencia

Documento:

`04-postgresql-modelo-persistencia.md`

Objetivo:

Establecer la capa de persistencia, migraciones y fundamentos del modelo de datos.

Debe definir:

- estrategia ORM/query layer definitiva;
- conexión;
- migraciones;
- constraints;
- transacciones;
- convenciones;
- seeds;
- backups devnet;
- restore;
- separación de información sensible.

### Dependencias

- 02;
- 03;
- especificación inicial del dominio electoral.

### Nota

El esquema electoral completo puede evolucionar en la etapa 08, pero la infraestructura de persistencia debe quedar estable.

### Gate

Migraciones reproducibles desde base vacía y pruebas reales contra PostgreSQL.

---

## 10. Etapa 05 — Valkey

Documento:

`05-valkey-cache-coordinacion.md`

Objetivo:

Integrar Valkey como infraestructura auxiliar.

Debe definir exactamente para qué se permite utilizar.

No debe convertirse en una dependencia implícita de todo el backend.

### Dependencias

- 02;
- 03.

### Paralelización

Puede construirse en paralelo con parte de la etapa 04.

### Gate

Conexión, health check y mecanismos base comprobados.

---

# FASE 3 — Backend y control administrativo

## 11. Etapa 06 — Backend NestJS base

Documento:

`06-backend-nestjs-base.md`

Objetivo:

Crear el backend modular.

Debe incluir:

- bootstrap NestJS;
- configuración;
- módulos base;
- manejo de errores;
- DTO/validation;
- health/readiness;
- logging estructurado;
- acceso a PostgreSQL;
- acceso controlado a Valkey;
- estructura de tests.

### Dependencias

- 02;
- 03;
- 04;
- 05 cuando sea requerido.

### Gate

Backend ejecutable dentro del entorno local/devnet y suite base pasando.

---

## 12. Etapa 07 — Autenticación administrativa

Documento:

`07-autenticacion-administrativa.md`

Objetivo:

Implementar el administrador inicial directamente en NestJS.

Debe contemplar:

- almacenamiento seguro de credenciales;
- hashing robusto;
- sesiones/tokens según diseño específico;
- login;
- logout cuando aplique;
- protección de endpoints;
- rate limiting donde aporte valor;
- auditoría;
- abstracción `IdentityProvider` o equivalente.

Debe dejar preparada la sustitución futura por Keycloak/OIDC.

### Dependencias

- 06;
- 04;
- 05 si el mecanismo elegido lo requiere.

### Gate

No debe existir endpoint administrativo sensible accesible sin autorización.

---

# FASE 4 — Núcleo electoral

## 13. Etapa 08 — Dominio electoral

Documento:

`08-dominio-electoral.md`

Esta es una etapa crítica.

Objetivo:

Formalizar e implementar el modelo electoral.

Debe definir:

- entidades;
- value objects;
- estados;
- transiciones;
- invariantes;
- candidatos/opciones;
- configuración;
- lifecycle;
- apertura;
- cierre;
- restricciones.

### Dependencias

- 04;
- 06;
- 07 para operaciones administrativas.

### Gate especial

No avanzar al protocolo real de voto hasta que los estados e invariantes estén cubiertos por tests.

---

## 14. Etapa 09 — Identidad y elegibilidad

Documento:

`09-identidad-elegibilidad.md`

Objetivo:

Definir cómo se representa y comprueba el derecho a votar sin crear un vínculo innecesario entre identidad y contenido del voto.

Debe definir:

- votantes;
- registro/importación;
- elegibilidad;
- credenciales electorales;
- compromisos;
- identificadores;
- lifecycle;
- revocación si aplica;
- relación con ZK;
- privacidad.

### Dependencias

- 08;
- 04;
- especificación ZK conceptual.

### Gate

Debe quedar claramente separada la identidad real de la representación utilizada durante la emisión del voto.

---

# FASE 5 — Criptografía Zero-Knowledge

## 15. Etapa 10 — Circom + snarkjs

Documento:

`10-zk-circom-snarkjs.md`

Etapa crítica.

Objetivo:

Construir el subsistema ZK.

Debe definir:

- estructura de circuitos;
- protocolo;
- inputs públicos;
- inputs privados;
- commitments;
- nullifiers;
- election/domain binding;
- witnesses;
- proofs;
- verificación;
- artifacts;
- setup;
- scripts;
- versionado;
- tests.

### Dependencias

- 08;
- 09.

### Paralelización

La infraestructura técnica de Circom puede prepararse antes de finalizar 09, pero el circuito electoral definitivo no.

### Gate especial

No integrar emisión real de votos hasta que:

- pruebas válidas pasen;
- pruebas manipuladas fallen;
- inputs públicos manipulados fallen;
- reutilización entre elecciones falle;
- nullifiers estén probados;
- circuit tests sean reproducibles.

---

# FASE 6 — Protocolo de votación

## 16. Etapa 11 — Emisión de voto

Documento:

`11-protocolo-emision-voto.md`

Es una de las etapas de mayor riesgo.

Objetivo:

Integrar dominio, elegibilidad, ZK y persistencia en un protocolo de voto coherente.

Debe especificar el flujo completo antes de implementarlo.

Debe cubrir:

- precondiciones;
- election binding;
- proof verification;
- nullifier;
- replay;
- voto duplicado;
- transacciones;
- concurrencia;
- atomicidad;
- idempotencia;
- persistencia;
- respuestas;
- fallos parciales;
- privacidad.

### Dependencias obligatorias

- 08;
- 09;
- 10;
- 04;
- 06.

### Gate especial

No avanzar al conteo hasta superar pruebas adversariales del flujo de voto.

---

## 17. Etapa 12 — Integridad y verificabilidad

Documento:

`12-integridad-verificabilidad.md`

Objetivo:

Definir evidencias y mecanismos para detectar manipulación y permitir comprobaciones del proceso.

Debe diferenciar:

- auditoría administrativa;
- logs;
- evidencia electoral;
- evidencia criptográfica;
- datos públicos;
- datos privados.

### Dependencias

- 10;
- 11.

### Gate

Una alteración relevante del conjunto electoral no debe poder pasar silenciosamente como estado válido.

---

# FASE 7 — Conteo y publicación

## 18. Etapa 13 — Conteo y resultados

Documento:

`13-conteo-resultados.md`

Objetivo:

Construir el cierre, conteo, validación y publicación.

Debe definir:

- snapshot/conjunto final;
- precondiciones;
- proceso de conteo;
- reproducibilidad;
- resultados calculados;
- resultados validados;
- resultados finales;
- publicación;
- auditoría;
- recuperación de fallos.

### Dependencias

- 08;
- 11;
- 12.

### Gate especial

Un resultado publicado debe poder relacionarse inequívocamente con el conjunto final aceptado.

---

# FASE 8 — Interfaces

## 19. Etapa 14 — Frontend administrativo

Documento:

`14-frontend-admin.md`

Objetivo:

Construir la interfaz administrativa.

Debe cubrir:

- autenticación;
- dashboard;
- creación/configuración;
- candidatos/opciones;
- elegibilidad;
- lifecycle;
- apertura;
- cierre;
- conteo;
- resultados;
- auditoría permitida;
- confirmaciones de operaciones peligrosas.

### Dependencias

- 07;
- 08;
- 09;
- 13 para flujo completo.

### Paralelización

La estructura y componentes básicos pueden comenzar cuando las APIs correspondientes estén estabilizadas.

---

## 20. Etapa 15 — Frontend del votante

Documento:

`15-frontend-votante.md`

Objetivo:

Implementar el flujo de votación.

Debe incluir:

- acceso;
- obtención/preparación de elegibilidad;
- selección;
- generación de elementos ZK en el lugar definido por el protocolo;
- envío;
- confirmación;
- errores;
- accesibilidad;
- protección contra doble envío accidental.

### Dependencias

- 09;
- 10;
- 11.

### Gate

La UI jamás debe mostrar un voto como aceptado antes de la confirmación real del protocolo.

---

# FASE 9 — Validación intensiva

## 21. Etapa 16 — Testing integral

Documento:

`16-testing.md`

Objetivo:

Unificar la estrategia completa de pruebas.

Debe incorporar:

- unit;
- integration;
- E2E;
- circuit;
- persistence;
- concurrency;
- adversarial;
- regression;
- fixtures.

### Dependencias

Todas las etapas funcionales anteriores.

### Nota

Las pruebas no comienzan aquí. Cada etapa debe traer sus tests.

Esta etapa consolida cobertura y escenarios completos.

---

## 22. Etapa 17 — Seguridad y hardening

Documento:

`17-seguridad-hardening.md`

Objetivo:

Realizar revisión transversal de seguridad.

Debe incluir:

- threat model;
- trust boundaries;
- auth review;
- authorization review;
- input validation;
- secret scanning;
- dependency review;
- replay;
- concurrency;
- privilege;
- container hardening;
- headers;
- rate limiting;
- logging/privacy;
- ZK review;
- database security;
- attack scenarios.

### Dependencias

Sistema funcional de extremo a extremo.

### Gate especial

Los hallazgos críticos y altos deben resolverse o quedar formalmente bloqueando producción.

---

# FASE 10 — Devnet completo

## 23. Etapa 18 — Devnet E2E

Documento:

`18-devnet-e2e.md`

Objetivo:

Convertir el entorno devnet en una demostración reproducible del sistema completo.

Debe permitir mediante documentación:

1. levantar servicios;
2. inicializar;
3. crear datos;
4. crear elección;
5. abrir;
6. votar;
7. probar rechazos;
8. cerrar;
9. contar;
10. publicar;
11. verificar;
12. revisar auditoría;
13. destruir;
14. reconstruir.

### Dependencias

- 03 a 17.

### Gate

Una persona que no participó en el desarrollo debe poder seguir el procedimiento.

---

# FASE 11 — Operación

## 24. Etapa 19 — Observabilidad y operaciones

Documento:

`19-observabilidad-operaciones.md`

Objetivo:

Documentar y construir la operación técnica necesaria.

Debe incluir:

- logs;
- métricas seleccionadas;
- health/readiness;
- troubleshooting;
- backups;
- restores;
- procedimientos de incidente;
- mantenimiento;
- migraciones;
- recuperación.

### Dependencias

Devnet funcional.

---

# FASE 12 — Preparación de producción

## 25. Etapa 20 — Producción

Documento:

`20-produccion.md`

Objetivo:

Definir los cambios necesarios para pasar de devnet a producción.

No implica desplegar producción inmediatamente.

Debe cubrir:

- TLS;
- certificados;
- DNS;
- secretos;
- hardening;
- backups;
- HA si se decide;
- monitoreo;
- alertas;
- CI/CD;
- despliegue;
- rollback;
- acceso administrativo;
- rotación de claves;
- disaster recovery;
- actualización de circuitos.

### Dependencias

- 17;
- 18;
- 19.

### Restricción

No inventar infraestructura productiva definitiva hasta que sus requisitos estén aprobados.

---

# FASE 13 — Validación final

## 26. Etapa 21 — Validación integral

Documento:

`21-validacion-final.md`

Objetivo:

Comprobar el sistema como producto completo.

Debe ejecutarse desde una instalación limpia.

### Escenario obligatorio

- clonar;
- configurar;
- levantar;
- migrar;
- inicializar;
- generar/preparar ZK;
- autenticar administrador;
- crear elección;
- cargar elegibilidad;
- configurar candidatos;
- abrir;
- emitir múltiples votos;
- intentar voto duplicado;
- intentar proof inválida;
- intentar votar fuera de estado;
- cerrar;
- contar;
- verificar;
- publicar;
- auditar;
- backup;
- restore;
- ejecutar suite completa.

### Gate final

Ningún fallo crítico puede quedar oculto detrás de pasos manuales no documentados.

---

# 27. Grafo simplificado de dependencias

```text
00
└── 01
    └── 02
        └── 03
            ├── 04
            └── 05
                ↓
               06
                ↓
               07
                ↓
               08
                ↓
               09
                ↓
               10
                ↓
               11
                ↓
               12
                ↓
               13
              /  \
            14    15
              \  /
               16
                ↓
               17
                ↓
               18
                ↓
               19
                ↓
               20
                ↓
               21
```

El gráfico expresa dependencias principales, no todas las dependencias secundarias.

---

# 28. Trabajo paralelizable

Para reducir tiempo sin perder control, pueden ejecutarse en paralelo únicamente tareas con contratos suficientemente estables.

Ejemplos:

### Después de 03

Pueden avanzar parcialmente:

- PostgreSQL;
- Valkey;
- tooling;
- documentación operativa inicial.

### Después de estabilizar APIs de 08/09

Pueden avanzar parcialmente:

- frontend admin;
- componentes frontend votante;
- fixtures;
- tests E2E preliminares.

### Durante 10

Pueden avanzar en paralelo:

- tooling Circom;
- tests de circuitos;
- documentación del protocolo;
- integración técnica snarkjs;

pero no debe congelarse el protocolo de voto hasta validar los circuitos.

### Regla

Paralelizar implementación nunca autoriza duplicar o inventar contratos incompatibles.

---

# 29. Etapas que no deben adelantarse

No debe implementarse prematuramente:

- protocolo final de voto antes del diseño ZK;
- conteo antes de estabilizar persistencia del voto;
- publicación antes de definir resultados finales;
- producción antes del hardening;
- Keycloak antes de necesitarlo;
- TLS real como bloqueo de local/devnet;
- alta disponibilidad antes de requisitos productivos;
- observabilidad compleja antes de conocer señales útiles.

---

# 30. Gates críticos del proyecto

Se establecen los siguientes checkpoints.

## Checkpoint A — Fundación

Después de etapa 06.

Debe existir:

- repo reproducible;
- Docker;
- PostgreSQL;
- Valkey;
- backend funcional.

## Checkpoint B — Dominio

Después de etapa 09.

Debe existir:

- administración;
- modelo electoral;
- lifecycle;
- elegibilidad;
- invariantes probadas.

## Checkpoint C — Criptografía

Después de etapa 10.

Debe existir:

- circuitos reproducibles;
- proofs;
- verification;
- nullifiers;
- tests negativos.

## Checkpoint D — Voto

Después de etapa 12.

Debe existir:

- emisión completa;
- prevención de duplicado;
- protección replay;
- atomicidad;
- evidencia.

## Checkpoint E — Elección completa

Después de etapa 15.

Debe existir:

- administración;
- votante;
- voto;
- cierre;
- conteo;
- resultados;
- interfaces.

## Checkpoint F — Devnet endurecido

Después de etapa 19.

Debe existir:

- E2E;
- hardening;
- operación;
- backup/restore;
- documentación.

## Checkpoint G — Candidato a producción

Después de etapa 21.

Debe existir evidencia de que el sistema completo cumple sus criterios.

---

# 31. Definition of Done por etapa

Salvo que el documento específico indique requisitos adicionales, una etapa termina cuando:

- código implementado;
- build exitoso;
- lint exitoso;
- type checking exitoso;
- tests de la etapa exitosos;
- integration tests aplicables exitosos;
- documentación actualizada;
- configuración de ejemplo actualizada;
- no hay secretos en commits;
- errores conocidos documentados;
- criterios de aceptación satisfechos;
- no quedan TODO críticos sin registrar.

---

# 32. Política de TODOs

No utilizar TODO como sustituto de una decisión crítica.

Un TODO aceptable debe indicar:

- qué falta;
- por qué;
- etapa responsable.

Ejemplo:

```text
TODO(20-produccion): sustituir mecanismo devnet por proveedor productivo de secretos.
```

No son aceptables:

```text
TODO: security
TODO: fix later
TODO: verify vote
```

---

# 33. Política de cambios arquitectónicos

Si durante implementación aparece una necesidad de cambio:

1. detener el cambio;
2. describir problema;
3. identificar documento afectado;
4. proponer alternativas;
5. evaluar seguridad;
6. aprobar decisión;
7. actualizar documentación;
8. implementar.

El código no debe convertirse en la única fuente de una decisión arquitectónica.

---

# 34. Política de seguridad durante desarrollo

Desde la primera etapa:

- no commitear secretos;
- no registrar credenciales;
- no desactivar validaciones para avanzar;
- no utilizar bypasses temporales sin aislamiento explícito;
- no introducir endpoints debug inseguros;
- no persistir inputs ZK privados en logs;
- no asociar innecesariamente identidad con voto;
- no confiar en validaciones exclusivamente frontend.

---

# 35. Política de migraciones

Todo cambio persistente debe ser reproducible.

Las migraciones deben:

- estar versionadas;
- ejecutarse en orden;
- poder aplicarse en instalación limpia;
- evitar pérdida silenciosa de información;
- documentar operaciones destructivas.

No se considera válido decir “modificar manualmente la base”.

---

# 36. Política de pruebas

Una corrección de bug crítico debe añadir una prueba de regresión cuando sea técnicamente posible.

Las propiedades electorales críticas deben tener tests explícitos.

La ausencia de pruebas para:

- voto duplicado;
- election state;
- proof validation;
- nullifier;
- replay;
- conteo;

bloquea el gate correspondiente.

---

# 37. Política de documentación para Codex

Cada archivo de etapa debe escribirse como especificación de construcción.

Debe evitar instrucciones ambiguas como:

> implementar seguridad adecuada.

Debe utilizar instrucciones verificables como:

> todos los DTO provenientes de HTTP deben validarse en runtime y las propiedades no declaradas deben rechazarse según la configuración definida en esta etapa.

El objetivo es convertir requisitos abstractos en comportamiento comprobable.

---

# 38. Formato de entrega esperado de Codex

Al terminar cada etapa Codex deberá informar:

## Implementado

Lista de cambios realizados.

## Archivos principales

Archivos creados o modificados.

## Decisiones

Decisiones menores tomadas dentro del margen permitido.

## Pruebas ejecutadas

Comandos y resultado.

## Seguridad

Controles incorporados y riesgos relevantes.

## Pendientes

Elementos deliberadamente diferidos.

## Gate

Estado de criterios de aceptación.

---

# 39. Secuencia de documentos

Los documentos de construcción previstos son:

1. `00-consolidado-arquitectura.md`
2. `01-plan-maestro-construccion.md`
3. `02-bootstrap-repositorio.md`
4. `03-infraestructura-local-devnet.md`
5. `04-postgresql-modelo-persistencia.md`
6. `05-valkey-cache-coordinacion.md`
7. `06-backend-nestjs-base.md`
8. `07-autenticacion-administrativa.md`
9. `08-dominio-electoral.md`
10. `09-identidad-elegibilidad.md`
11. `10-zk-circom-snarkjs.md`
12. `11-protocolo-emision-voto.md`
13. `12-integridad-verificabilidad.md`
14. `13-conteo-resultados.md`
15. `14-frontend-admin.md`
16. `15-frontend-votante.md`
17. `16-testing.md`
18. `17-seguridad-hardening.md`
19. `18-devnet-e2e.md`
20. `19-observabilidad-operaciones.md`
21. `20-produccion.md`
22. `21-validacion-final.md`

---

# 40. Próximo paso

Una vez aprobado este plan, el siguiente documento a construir es:

**`02-bootstrap-repositorio.md`**

Ese documento debe bajar a decisiones concretas sobre estructura del repositorio, tooling, package manager, TypeScript, convenciones, scripts, configuración y límites iniciales entre aplicaciones y paquetes.

No debe iniciarse código del proyecto hasta que las decisiones necesarias de esa etapa estén documentadas.
