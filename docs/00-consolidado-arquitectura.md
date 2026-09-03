# 00 — Consolidado de Arquitectura

## 1. Propósito

Este documento consolida las decisiones arquitectónicas del proyecto **Votaciones** y actúa como fuente principal de verdad para la construcción del sistema.

Su objetivo es evitar que herramientas de implementación como Codex tengan que improvisar decisiones estructurales, de seguridad, infraestructura, criptografía o separación de responsabilidades.

Toda etapa posterior del proyecto debe respetar este documento. Si una implementación requiere apartarse de una decisión aquí definida, primero debe actualizarse explícitamente este consolidado y documentarse la razón.

---

## 2. Principios rectores

La arquitectura debe priorizar:

- seguridad desde el diseño;
- privacidad del votante;
- separación entre identidad y voto;
- resistencia al voto duplicado;
- integridad del proceso electoral;
- auditabilidad;
- verificabilidad;
- reproducibilidad de entornos;
- modularidad;
- mínimo privilegio;
- reducción de dependencias innecesarias;
- uso de componentes complejos solo donde aporten valor real;
- documentación exhaustiva dentro del repositorio.

No se deben introducir piezas de infraestructura, seguridad o plataforma únicamente por tendencia tecnológica. Cada componente debe justificar claramente su existencia.

---

## 3. Alcance de esta fase

La primera fase del proyecto cubre un sistema electoral completo ejecutable en **local** y **devnet**, reproducible mediante Docker.

Debe ser posible:

1. levantar toda la plataforma desde cero;
2. inicializar la infraestructura;
3. acceder al panel administrativo;
4. configurar una elección;
5. registrar o habilitar votantes;
6. configurar opciones o candidatos;
7. abrir una elección;
8. permitir la emisión de votos;
9. validar elegibilidad;
10. impedir votos duplicados;
11. utilizar pruebas de conocimiento cero donde corresponda;
12. registrar el voto sin romper las propiedades de privacidad definidas;
13. cerrar la elección;
14. realizar el conteo;
15. publicar resultados;
16. auditar el proceso;
17. validar integridad y consistencia;
18. repetir todo el flujo en una instalación limpia siguiendo únicamente la documentación.

---

## 4. Elementos explícitamente diferidos

Los siguientes componentes o decisiones no deben bloquear local/devnet y quedan preparados para una etapa posterior:

- certificados TLS reales;
- despliegue productivo definitivo;
- gestión productiva avanzada de secretos;
- integración obligatoria con Keycloak;
- integración obligatoria con un proveedor OIDC externo;
- infraestructura de alta disponibilidad;
- componentes adicionales cuya necesidad operativa aún no esté demostrada.

La arquitectura debe permitir incorporarlos posteriormente sin exigir una reconstrucción completa del dominio.

---

## 5. Organización documental

Todo el proyecto debe estar ampliamente documentado mediante archivos Markdown dentro del repositorio.

La documentación debe incluir al menos:

- decisiones arquitectónicas;
- etapas de construcción;
- configuración;
- infraestructura;
- modelos de dominio;
- API;
- seguridad;
- circuitos ZK;
- procedimientos de desarrollo;
- pruebas;
- operaciones;
- recuperación;
- despliegue;
- troubleshooting;
- criterios de aceptación.

Cada etapa importante tendrá un archivo `.md` específico orientado a ejecución por Codex.

Los documentos de implementación deben definir de forma suficientemente precisa:

- objetivo;
- contexto;
- alcance;
- fuera de alcance;
- dependencias;
- estructura de archivos;
- componentes;
- interfaces;
- invariantes;
- requisitos de seguridad;
- pruebas;
- criterios de aceptación;
- definición de terminado.

Codex no debe decidir de forma autónoma cambios arquitectónicos importantes.

---

## 6. Estrategia de repositorio

El sistema debe estructurarse de forma modular y con límites claros entre:

- backend;
- interfaces de usuario;
- criptografía/ZK;
- infraestructura;
- documentación;
- tooling;
- pruebas.

La estructura exacta del repositorio se definirá en el documento correspondiente de bootstrap.

Como criterio general, cada dominio debe tener responsabilidades claras y evitar dependencias circulares.

---

## 7. Entornos

Los entornos iniciales son:

### 7.1 Local

Entorno para desarrollo individual.

Debe poder levantarse mediante Docker con dependencias reproducibles.

### 7.2 Devnet

Entorno completo de integración destinado a validar el ciclo electoral de extremo a extremo.

Debe ser reproducible mediante Docker.

Debe permitir:

- datos de prueba;
- elecciones de demostración;
- usuarios de prueba;
- votantes de prueba;
- ejecución de circuitos;
- emisión de votos;
- conteo;
- auditoría;
- pruebas E2E.

### 7.3 Producción

Producción queda documentada desde el punto de vista arquitectónico, pero no debe condicionar innecesariamente la construcción inicial.

Se prepararán interfaces y abstracciones para facilitar la evolución hacia producción.

---

## 8. Contenedores y ejecución

Para local y devnet, toda dependencia operativa relevante debe poder ejecutarse mediante Docker.

El objetivo es evitar dependencias manuales del host y garantizar reproducibilidad.

Los servicios deben disponer, cuando aplique, de:

- health checks;
- readiness;
- configuración mediante entorno;
- persistencia correctamente definida;
- networking explícito;
- límites y políticas razonables;
- inicialización reproducible.

---

## 9. Backend

El backend principal se implementará con **NestJS**.

NestJS será responsable de:

- API;
- lógica de aplicación;
- autenticación administrativa inicial;
- autorización;
- gestión electoral;
- coordinación del flujo de votación;
- acceso a persistencia;
- integración con Valkey;
- integración con componentes ZK;
- auditoría;
- validaciones;
- operaciones administrativas.

La arquitectura debe ser modular y orientada a dominios.

No debe crearse un único módulo monolítico con responsabilidades mezcladas.

---

## 10. Autenticación administrativa

En la primera versión se implementará autenticación administrativa directamente en NestJS.

La decisión se basa en:

- existencia inicial de un único administrador;
- reducción de complejidad;
- evitar introducir Keycloak prematuramente;
- mantener control explícito sobre el flujo de autenticación.

Sin embargo, la autenticación debe quedar abstraída mediante una interfaz o capa de proveedor de identidad.

Esto debe permitir migrar posteriormente a:

- Keycloak;
- OIDC;
- otro proveedor de identidad compatible;

sin modificar el núcleo del dominio electoral.

La lógica del dominio no debe depender directamente del mecanismo concreto de autenticación.

---

## 11. Administración

El sistema inicial contempla un único administrador.

Las capacidades administrativas incluirán, según avance la implementación:

- autenticación;
- gestión de elecciones;
- gestión de opciones/candidatos;
- gestión de votantes o elegibilidad;
- apertura de elecciones;
- cierre de elecciones;
- consulta de estado;
- inicio o ejecución controlada del conteo;
- publicación de resultados;
- acceso a auditoría permitida.

Toda operación administrativa sensible debe quedar auditada.

---

## 12. Persistencia principal

La base de datos principal será **PostgreSQL**.

PostgreSQL almacenará los datos estructurados de la aplicación que correspondan al dominio y a la operación del sistema.

La estructura de persistencia debe diseñarse evitando mezclar innecesariamente:

- identidad del votante;
- evidencia de elegibilidad;
- voto emitido;
- auditoría;
- resultados.

La separación lógica y física dependerá de los requisitos de privacidad definidos en etapas posteriores.

Las migraciones deben formar parte del repositorio.

No se permitirán cambios manuales de esquema como procedimiento normal.

---

## 13. Cache, coordinación y datos efímeros

Se utilizará **Valkey** en lugar de Redis.

Valkey podrá utilizarse únicamente donde aporte valor, por ejemplo:

- cache;
- rate limiting;
- coordinación;
- locks distribuidos si fueran estrictamente necesarios;
- almacenamiento efímero;
- colas o mecanismos temporales cuando la arquitectura específica lo justifique.

No debe convertirse en almacenamiento primario de información electoral crítica.

Los datos imprescindibles para reconstruir el estado electoral deben persistirse en un sistema adecuado.

---

## 14. Dominio electoral

El dominio electoral debe modelarse explícitamente.

Como mínimo debe contemplar:

- elección;
- configuración;
- candidatos u opciones;
- elegibilidad;
- votante;
- estado de elección;
- emisión de voto;
- evidencia criptográfica;
- cierre;
- conteo;
- resultados;
- auditoría.

Los estados deben estar claramente definidos.

Ejemplo conceptual:

- borrador;
- configurada;
- preparada;
- abierta;
- cerrada;
- en conteo;
- finalizada;
- publicada.

La lista definitiva se formalizará en el documento del dominio.

Las transiciones deben ser explícitas y validadas.

No deben permitirse saltos de estado arbitrarios.

---

## 15. Invariantes electorales

Las siguientes propiedades se consideran críticas:

- una elección cerrada no debe aceptar votos;
- una elección no abierta no debe aceptar votos;
- una persona no autorizada no debe poder votar;
- un votante no debe poder emitir más votos de los permitidos;
- un voto aceptado no debe poder modificarse silenciosamente;
- el conteo debe corresponder al conjunto válido de votos;
- las operaciones administrativas deben quedar auditadas;
- el resultado publicado debe corresponder al resultado final calculado;
- los mecanismos de auditoría no deben revelar información que permita reconstruir indebidamente la relación votante-voto;
- los fallos parciales no deben dejar el proceso electoral en un estado ambiguo o imposible de auditar.

---

## 16. Identidad y elegibilidad

La arquitectura debe diferenciar claramente:

- quién es una persona;
- si está autorizada para votar;
- si ya ejerció el derecho correspondiente;
- cuál fue su voto.

El sistema debe minimizar cualquier vínculo que permita correlacionar directamente identidad y selección electoral.

La información utilizada para prevenir voto duplicado no debe convertirse automáticamente en un mecanismo de rastreo del contenido del voto.

La implementación concreta se formalizará junto con el protocolo ZK y el modelo electoral.

---

## 17. Zero-Knowledge

La solución ZK utilizará:

- **Circom**
- **snarkjs**

Los circuitos deben vivir como una parte explícita y versionada del repositorio.

No deben tratarse como scripts auxiliares sin control arquitectónico.

El subsistema ZK deberá documentar:

- circuitos;
- inputs públicos;
- inputs privados;
- outputs;
- restricciones;
- witnesses;
- generación de pruebas;
- verificación;
- configuración;
- artefactos generados;
- trusted setup cuando corresponda;
- claves;
- versionado;
- compatibilidad;
- pruebas;
- amenazas conocidas.

---

## 18. Integración ZK con el backend

El backend no debe confiar únicamente en datos declarados por el cliente.

Cuando una operación requiera evidencia criptográfica, el backend deberá verificarla.

La integración debe diferenciar explícitamente:

- generación de witness;
- generación de proof;
- verificación de proof;
- persistencia de evidencia;
- inputs públicos;
- datos privados.

Se evitará enviar información privada al backend cuando pueda verificarse una afirmación mediante una prueba criptográfica adecuada.

---

## 19. Emisión del voto

El flujo de voto debe diseñarse como una operación sensible y transaccional.

Debe considerar como mínimo:

- estado de la elección;
- elegibilidad;
- validez de la prueba;
- prevención de replay;
- prevención de voto duplicado;
- atomicidad;
- idempotencia donde aplique;
- manejo de concurrencia;
- persistencia;
- evidencia;
- auditoría segura.

El sistema no debe confirmar un voto antes de que las condiciones necesarias para considerarlo aceptado hayan quedado correctamente persistidas.

---

## 20. Prevención de voto duplicado

La prevención de voto duplicado es una propiedad central.

La implementación concreta puede combinar:

- identificadores criptográficos;
- nullifiers;
- pruebas ZK;
- restricciones transaccionales;
- unicidad en persistencia;

según el protocolo finalmente documentado.

No se aceptará como única protección una comprobación de aplicación susceptible a condiciones de carrera.

Las restricciones críticas deberán reforzarse en la capa de persistencia cuando sea técnicamente posible.

---

## 21. Protección contra replay

Las operaciones sensibles deben estar diseñadas contra reuso malicioso de mensajes, proofs, tokens o artefactos.

Cuando corresponda se incluirán elementos como:

- election ID;
- domain separation;
- nonce;
- nullifier;
- expiración;
- identificadores únicos;
- challenge;
- contexto firmado o comprometido criptográficamente.

La definición exacta dependerá del flujo final.

---

## 22. Registro del voto

El almacenamiento de votos debe preservar:

- integridad;
- consistencia;
- posibilidad de conteo;
- auditabilidad;
- privacidad.

Debe evitarse persistir metadatos innecesarios que permitan correlaciones.

Cualquier dato como:

- IP;
- user-agent;
- timestamps de alta precisión;
- identificadores de sesión;
- identificadores administrativos;

debe revisarse desde la perspectiva de privacidad antes de asociarlo a un voto.

---

## 23. Conteo

El conteo debe ser determinista, reproducible y auditable.

Debe quedar explícitamente definido:

- cuándo puede iniciarse;
- qué conjunto de votos incluye;
- cómo se descartan votos inválidos si existieran;
- cómo se generan resultados;
- qué evidencias se conservan;
- cómo se detectan inconsistencias;
- cómo se evita una modificación silenciosa.

El resultado final debe derivarse del conjunto electoral aceptado mediante un procedimiento verificable.

---

## 24. Resultados

La publicación de resultados debe estar separada de su cálculo.

Debe existir un concepto claro de:

- resultado calculado;
- resultado validado;
- resultado final;
- resultado publicado.

Una publicación no debe poder modificar el valor calculado.

Cualquier cambio administrativo relacionado con publicación debe quedar auditado.

---

## 25. Auditoría

La auditoría es un subsistema independiente de los logs técnicos.

Debe registrar eventos de seguridad y administración relevantes.

Ejemplos:

- login administrativo;
- fallos de autenticación relevantes;
- creación de elección;
- cambios de configuración;
- apertura;
- cierre;
- inicio de conteo;
- finalización;
- publicación;
- cambios de permisos cuando existan;
- operaciones de recuperación.

La auditoría debe evitar incluir secretos o información que comprometa privacidad electoral.

Los registros deben ser resistentes a modificaciones silenciosas en la medida que permita la fase correspondiente.

---

## 26. Logging

Los logs técnicos deben ser estructurados.

No deben contener:

- contraseñas;
- tokens;
- claves privadas;
- secretos;
- witnesses privados;
- inputs privados de ZK;
- información que revele la selección electoral;
- datos personales innecesarios.

La estrategia de logging debe considerar explícitamente el riesgo de correlación de eventos.

---

## 27. API

La API debe diseñarse con:

- DTOs explícitos;
- validación estricta;
- límites claros;
- manejo consistente de errores;
- autorización;
- versionado cuando resulte necesario;
- contratos documentados.

No se debe confiar en tipos TypeScript como mecanismo de validación runtime.

Todo input externo debe validarse.

---

## 28. Frontend administrativo

Debe existir una interfaz administrativa separada conceptualmente del flujo del votante.

Debe permitir administrar el ciclo de vida de las elecciones sin exponer funciones internas innecesarias.

Las acciones peligrosas deben requerir UX explícita y reducir errores operativos.

---

## 29. Frontend del votante

La interfaz del votante debe optimizar:

- simplicidad;
- claridad;
- accesibilidad;
- manejo seguro de errores;
- confirmación adecuada;
- mínima exposición de detalles internos.

El frontend no debe presentar como aceptado un voto que el backend no haya confirmado correctamente.

---

## 30. Seguridad de secretos

Los secretos nunca deben almacenarse directamente en el repositorio.

Local y devnet podrán utilizar mecanismos de desarrollo explícitamente documentados.

Producción utilizará posteriormente una estrategia adecuada de gestión de secretos.

Debe existir separación entre:

- configuración pública;
- configuración sensible;
- claves criptográficas;
- credenciales;
- artefactos ZK.

---

## 31. Claves y artefactos criptográficos

Toda clave o artefacto criptográfico debe clasificarse según su sensibilidad.

Debe documentarse:

- origen;
- propósito;
- entorno;
- regeneración;
- almacenamiento;
- distribución;
- rotación cuando aplique;
- recuperación;
- impacto en caso de exposición.

Las claves privadas nunca deben incluirse accidentalmente en imágenes Docker ni commits.

---

## 32. TLS

TLS será obligatorio en producción.

Para local/devnet no se exigirá inicialmente disponer de certificados reales.

La arquitectura debe quedar preparada para operar detrás de TLS sin que esto implique modificar el dominio de aplicación.

No se deben crear certificados ficticios como dependencia arquitectónica obligatoria salvo que una etapa posterior lo requiera para pruebas concretas.

---

## 33. Rate limiting

Se aplicará rate limiting únicamente donde aporte valor.

No debe introducirse de forma indiscriminada.

Casos candidatos:

- login;
- endpoints públicos sensibles;
- generación o validación costosa de pruebas;
- operaciones susceptibles de abuso.

Valkey puede utilizarse para soportarlo cuando corresponda.

---

## 34. Validación

Todo dato externo debe considerarse no confiable.

La validación debe existir en los límites del sistema.

Debe contemplar:

- tipos;
- formatos;
- rangos;
- tamaño;
- enumeraciones;
- identificadores;
- relaciones;
- estado electoral;
- invariantes de dominio.

---

## 35. Autorización

Autenticación y autorización deben tratarse como conceptos separados.

Una sesión administrativa válida no implica permiso automático para cualquier operación futura si posteriormente se amplía el modelo de roles.

La arquitectura debe permitir evolucionar hacia RBAC/ABAC sin acoplarlo al dominio.

---

## 36. Mínimo privilegio

Cada servicio debe disponer únicamente de los permisos que requiere.

Esto aplica a:

- base de datos;
- filesystem;
- contenedores;
- redes;
- secretos;
- servicios internos;
- claves.

La separación se irá endureciendo progresivamente hacia producción.

---

## 37. Transacciones

Las operaciones que modifiquen propiedades electorales críticas deben utilizar transacciones de base de datos cuando corresponda.

Ejemplos:

- aceptación de voto + registro de nullifier;
- cierre de elección;
- finalización de conteo;
- publicación de resultado.

Debe evitarse que fallos parciales generen estados imposibles de reconciliar.

---

## 38. Concurrencia

La arquitectura debe asumir concurrencia real.

No se deben diseñar invariantes críticas bajo la suposición de que dos solicitudes nunca ocurrirán simultáneamente.

La protección debe combinar cuando corresponda:

- transacciones;
- constraints;
- isolation;
- locks;
- idempotencia;
- identificadores únicos.

---

## 39. Idempotencia

Las operaciones que puedan ser repetidas debido a reintentos de red deben analizarse para determinar si requieren idempotencia.

Especial atención a:

- emisión de voto;
- publicación;
- operaciones administrativas críticas;
- procesos asíncronos.

---

## 40. Errores

Los errores públicos no deben revelar:

- stack traces;
- queries;
- secretos;
- estructura interna sensible;
- información criptográfica privada.

Internamente debe existir suficiente contexto para diagnosticar fallos sin comprometer datos sensibles.

---

## 41. Health y readiness

Los servicios relevantes deben exponer mecanismos para comprobar:

- proceso vivo;
- capacidad de atender solicitudes;
- conectividad a dependencias críticas.

Los health checks no deben ejecutar operaciones costosas o sensibles.

---

## 42. Observabilidad

La observabilidad inicial incluirá al menos:

- logging estructurado;
- health;
- readiness;
- errores;
- métricas cuando aporten valor.

No se introducirán plataformas complejas de observabilidad hasta justificar su necesidad.

---

## 43. Backups

PostgreSQL debe disponer de una estrategia documentada de backup y restauración antes de considerar producción.

Devnet debe incluir al menos un procedimiento reproducible de:

- backup;
- restauración;
- validación.

La existencia de un backup no se considerará suficiente si nunca se prueba su restauración.

---

## 44. Testing

La estrategia de pruebas debe incluir:

- unit tests;
- integration tests;
- E2E;
- pruebas de persistencia;
- pruebas de seguridad;
- pruebas de circuitos;
- pruebas de propiedades criptográficas;
- pruebas de concurrencia para invariantes críticas;
- pruebas adversariales.

---

## 45. Pruebas ZK

Los circuitos deben tener casos positivos y negativos.

Debe verificarse que:

- una prueba válida pasa;
- una prueba alterada falla;
- inputs públicos incorrectos fallan;
- witnesses inválidos fallan;
- nullifiers se calculan correctamente;
- contextos electorales no puedan intercambiarse de forma indebida;
- no puedan reutilizarse proofs fuera de su dominio permitido.

---

## 46. Pruebas electorales

Los escenarios E2E deben incluir al menos:

- elección normal;
- votante autorizado;
- votante no autorizado;
- voto duplicado;
- proof inválida;
- elección cerrada;
- elección no abierta;
- cierre con concurrencia;
- múltiples votos simultáneos;
- conteo;
- publicación;
- recuperación tras reinicio.

---

## 47. Pruebas adversariales

Se deben documentar y probar ataques relevantes como:

- replay;
- manipulación de requests;
- race conditions;
- bypass de estado;
- voto duplicado;
- proof reutilizada;
- manipulación de nullifier;
- intentos de correlación;
- abuso administrativo;
- modificación de resultados;
- filtrado de secretos.

---

## 48. Threat modeling

Antes de considerar el sistema listo para producción se realizará threat modeling formal.

Debe cubrir como mínimo:

- activos;
- actores;
- fronteras de confianza;
- superficies de ataque;
- amenazas;
- controles;
- riesgo residual.

El threat model debe mantenerse como documentación versionada.

---

## 49. Dependencias

Toda dependencia nueva debe evaluarse por:

- necesidad;
- mantenimiento;
- seguridad;
- tamaño;
- licencia;
- madurez;
- impacto operativo.

Se evitará introducir dependencias que dupliquen capacidades ya existentes sin una ventaja clara.

---

## 50. Versionado

El código, circuitos y artefactos relevantes deben ser versionables.

Debe poder determinarse qué versión de:

- backend;
- frontend;
- circuitos;
- esquema de base de datos;
- configuración;

participó en una ejecución electoral.

---

## 51. Datos de prueba

Devnet debe disponer de fixtures o mecanismos reproducibles para crear:

- administrador;
- elecciones;
- candidatos/opciones;
- votantes;
- estados;
- escenarios de pruebas.

Los datos de prueba jamás deben confundirse con credenciales productivas.

---

## 52. CI

La integración continua se definirá posteriormente en su etapa correspondiente.

Como mínimo deberá poder ejecutar:

- lint;
- type checking;
- tests;
- integration tests;
- circuit tests;
- validaciones de seguridad automatizables;
- builds.

No se diseñará el flujo alrededor de una plataforma CI específica hasta definirla explícitamente.

---

## 53. Producción futura

La evolución a producción deberá cubrir:

- TLS real;
- DNS;
- gestión real de secretos;
- hardening;
- backups;
- restauración;
- monitoreo;
- alertas;
- capacidad;
- recuperación;
- despliegue;
- rollback;
- actualización de circuitos;
- seguridad operacional.

Estos puntos no deben impedir la construcción completa del sistema en local/devnet.

---

## 54. Regla de no improvisación

Los documentos de construcción deben ser suficientemente detallados para que Codex ejecute tareas dentro de límites definidos.

Codex puede:

- implementar;
- refactorizar dentro de los límites;
- añadir pruebas;
- corregir defectos;
- documentar detalles técnicos;
- proponer mejoras.

Codex no debe cambiar sin instrucción explícita:

- stack principal;
- base de datos;
- estrategia ZK;
- protocolo electoral;
- modelo de seguridad;
- proveedor de cache;
- límites de los dominios;
- mecanismo de autenticación principal;
- arquitectura general.

Si detecta una incompatibilidad debe documentarla y proponer el cambio, no aplicarlo silenciosamente.

---

## 55. Stack consolidado actual

### Backend

- Node.js
- TypeScript
- NestJS

### Persistencia

- PostgreSQL

### Cache / coordinación

- Valkey

### Zero-Knowledge

- Circom
- snarkjs

### Contenedores

- Docker

### Identidad administrativa inicial

- autenticación implementada directamente en NestJS;
- un administrador inicial;
- proveedor de identidad abstraído;
- migración futura posible a Keycloak/OIDC.

---

## 56. Orden macro de construcción

El proyecto se construirá siguiendo este orden general:

1. consolidado arquitectónico;
2. plan maestro de construcción;
3. bootstrap del repositorio;
4. infraestructura local/devnet;
5. persistencia;
6. backend base;
7. autenticación administrativa;
8. dominio electoral;
9. elegibilidad;
10. subsistema ZK;
11. protocolo de emisión de voto;
12. integridad y verificabilidad;
13. conteo;
14. resultados;
15. frontend administrativo;
16. frontend votante;
17. testing integral;
18. hardening;
19. devnet completo;
20. observabilidad y operaciones;
21. preparación de producción;
22. validación integral.

El plan maestro detallará dependencias y permitirá ejecutar en paralelo los elementos que no tengan dependencia directa.

---

## 57. Definición de terminado del proyecto base

La plataforma inicial se considera construida cuando una instalación limpia pueda, siguiendo únicamente los documentos del repositorio:

1. instalar dependencias;
2. levantar Docker;
3. inicializar PostgreSQL;
4. inicializar Valkey;
5. ejecutar migraciones;
6. preparar los artefactos ZK necesarios;
7. crear o cargar datos devnet;
8. iniciar backend;
9. iniciar frontends;
10. autenticar al administrador;
11. crear una elección;
12. configurar votantes y opciones;
13. abrirla;
14. emitir votos válidos;
15. rechazar votos inválidos;
16. rechazar duplicados;
17. cerrar la elección;
18. contar;
19. publicar resultados;
20. consultar evidencias permitidas;
21. revisar auditoría;
22. ejecutar la suite completa de pruebas con éxito.

---

## 58. Documentos siguientes

Después de este consolidado deberán construirse documentos separados para cada etapa.

La secuencia recomendada comienza por:

- `01-plan-maestro-construccion.md`
- `02-bootstrap-repositorio.md`
- `03-infraestructura-local-devnet.md`
- `04-postgresql-modelo-persistencia.md`
- `05-valkey-cache-coordinacion.md`
- `06-backend-nestjs-base.md`
- `07-autenticacion-administrativa.md`
- `08-dominio-electoral.md`
- `09-identidad-elegibilidad.md`
- `10-zk-circom-snarkjs.md`
- `11-protocolo-emision-voto.md`
- `12-integridad-verificabilidad.md`
- `13-conteo-resultados.md`
- `14-frontend-admin.md`
- `15-frontend-votante.md`
- `16-testing.md`
- `17-seguridad-hardening.md`
- `18-devnet-e2e.md`
- `19-observabilidad-operaciones.md`
- `20-produccion.md`
- `21-validacion-final.md`

La numeración podrá ajustarse si el plan maestro determina una separación más conveniente, pero deberá mantenerse una secuencia inequívoca y bien etiquetada.

---

## 59. Regla final

La prioridad del proyecto no es únicamente “hacer que funcione”.

El sistema debe quedar:

- entendible;
- reproducible;
- comprobable;
- auditable;
- seguro;
- mantenible;
- verificable;
- correctamente documentado.

Cualquier solución que simplifique implementación a costa de comprometer una propiedad electoral crítica debe rechazarse.
