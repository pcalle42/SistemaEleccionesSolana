# 02 — Bootstrap del Repositorio

## 1. Propósito

Este documento define la estructura base del repositorio del proyecto **Votaciones**.

Su objetivo es dejar preparado un monorepo coherente, reproducible y suficientemente estricto para que las etapas posteriores puedan implementarse sin redefinir:

- organización de carpetas;
- package management;
- configuración TypeScript;
- linting;
- formatting;
- testing;
- convenciones de nombres;
- scripts raíz;
- manejo de variables de entorno;
- límites entre aplicaciones y paquetes.

Este documento debe leerse junto con:

- `00-consolidado-arquitectura.md`
- `01-plan-maestro-construccion.md`

---

# 2. Decisión de repositorio

Se utilizará un **monorepo**.

Razones:

- backend, frontends, circuitos ZK, tooling y documentación forman parte del mismo sistema;
- facilita versionado coordinado;
- simplifica CI;
- permite compartir tipos y utilidades de forma controlada;
- facilita reproducibilidad local/devnet;
- permite a Codex trabajar sobre una única fuente de verdad.

No se utilizarán múltiples repositorios en esta fase.

---

# 3. Package manager

Se utilizará **pnpm**.

Razones:

- buen soporte de workspaces;
- instalación eficiente;
- resolución estricta de dependencias;
- adecuado para monorepos Node.js/TypeScript.

Debe existir:

```text
pnpm-lock.yaml
```

El lockfile debe versionarse.

No se deben mezclar npm, yarn o bun como package managers del repositorio.

---

# 4. Runtime

El runtime principal será **Node.js LTS**.

La versión concreta debe fijarse en el repositorio mediante al menos uno de estos mecanismos:

- `.nvmrc`
- `.node-version`
- `engines` en `package.json`

Preferencia:

utilizar `.nvmrc` y `engines`.

Ejemplo:

```json
{
  "engines": {
    "node": ">=22 <23",
    "pnpm": ">=10 <11"
  }
}
```

La versión exacta podrá ajustarse si al momento de implementación la compatibilidad de NestJS, Circom tooling u otras dependencias lo exige.

Codex no debe cambiar la major version de Node sin actualizar este documento o registrar explícitamente la justificación.

---

# 5. TypeScript

Todo el código Node.js y frontend que lo permita deberá escribirse en TypeScript.

Se utilizará configuración TypeScript compartida.

Debe existir un paquete o carpeta de configuración central, por ejemplo:

```text
packages/config-typescript/
```

o una carpeta raíz:

```text
tooling/typescript/
```

Preferencia:

```text
packages/config-typescript/
```

Debe definir configuraciones para:

- base;
- Node.js;
- NestJS;
- frontend;
- tests.

---

# 6. Estructura raíz

La estructura inicial recomendada es:

```text
.
├── apps/
│   ├── api/
│   ├── admin-web/
│   └── voter-web/
├── packages/
│   ├── config-eslint/
│   ├── config-typescript/
│   ├── shared-types/
│   ├── shared-validation/
│   ├── shared-crypto/
│   └── shared-testing/
├── zk/
│   ├── circuits/
│   ├── scripts/
│   ├── artifacts/
│   └── tests/
├── infra/
│   ├── docker/
│   ├── postgres/
│   ├── valkey/
│   └── devnet/
├── docs/
│   ├── architecture/
│   ├── build/
│   ├── security/
│   ├── operations/
│   └── adr/
├── scripts/
├── .github/
│   └── workflows/
├── .editorconfig
├── .gitignore
├── .nvmrc
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
├── README.md
└── LICENSE
```

Esta estructura puede ampliarse en etapas posteriores, pero no debe reestructurarse de forma incompatible sin una decisión arquitectónica explícita.

---

# 7. Apps

## 7.1 `apps/api`

Backend principal NestJS.

Responsabilidades futuras:

- API;
- autenticación administrativa;
- dominio electoral;
- persistencia;
- integración Valkey;
- integración ZK;
- auditoría;
- conteo;
- resultados;
- operaciones administrativas.

No debe contener lógica visual ni código específico de frontend.

---

## 7.2 `apps/admin-web`

Frontend administrativo.

Responsabilidades:

- login administrativo;
- gestión de elecciones;
- configuración;
- candidatos/opciones;
- elegibilidad;
- apertura;
- cierre;
- conteo;
- resultados;
- auditoría permitida.

No debe contener reglas electorales críticas que solo existan en frontend.

---

## 7.3 `apps/voter-web`

Frontend del votante.

Responsabilidades:

- interacción del votante;
- preparación del flujo de voto;
- selección electoral;
- integración con los componentes ZK definidos;
- envío del voto;
- confirmación;
- manejo de errores.

No debe recibir privilegios administrativos.

---

# 8. Packages compartidos

Los paquetes compartidos deben existir únicamente cuando haya reutilización real.

No crear un paquete genérico "utils" donde se mezcle código sin dominio.

---

## 8.1 `packages/config-eslint`

Configuración ESLint compartida.

Debe permitir reglas diferenciadas para:

- Node;
- NestJS;
- frontend;
- tests.

---

## 8.2 `packages/config-typescript`

Configuraciones TypeScript comunes.

Debe minimizar duplicación de `tsconfig`.

---

## 8.3 `packages/shared-types`

Tipos compartidos estrictamente necesarios entre aplicaciones.

Ejemplos válidos:

- contratos API públicos;
- enums públicos;
- DTOs serializables si se decide compartirlos;
- identificadores nominales cuando no filtren dominio interno.

No debe convertirse en una copia completa del modelo interno del backend.

---

## 8.4 `packages/shared-validation`

Schemas o validadores reutilizables cuando realmente exista necesidad de compartir validaciones.

Debe evitarse duplicar reglas críticas entre cliente y servidor como única fuente de seguridad.

El backend siempre debe validar de forma independiente.

---

## 8.5 `packages/shared-crypto`

Código criptográfico compartido que no pertenezca exclusivamente al backend ni a los circuitos.

Puede incluir:

- hashing;
- encoding;
- domain separation helpers;
- serialización;
- tipos criptográficos públicos;
- utilidades para nullifiers o commitments si el protocolo lo requiere.

No debe incluir secretos.

---

## 8.6 `packages/shared-testing`

Fixtures, builders y helpers de testing reutilizables.

No debe contener lógica productiva.

---

# 9. Directorio ZK

El directorio `zk/` será independiente de `apps/`.

Razón:

los circuitos Circom y sus artefactos tienen lifecycle propio y no deben ocultarse dentro del backend.

Estructura inicial:

```text
zk/
├── circuits/
├── scripts/
├── artifacts/
├── tests/
├── package.json
└── README.md
```

La estructura final se detallará en `10-zk-circom-snarkjs.md`.

---

# 10. Artefactos ZK

La carpeta:

```text
zk/artifacts/
```

debe diferenciar entre:

- artefactos regenerables;
- artefactos que deban versionarse;
- artefactos sensibles;
- artefactos demasiado grandes para Git.

La política concreta se definirá en la etapa ZK.

Por defecto:

no versionar secretos ni claves privadas.

---

# 11. Infraestructura

La carpeta:

```text
infra/
```

contendrá únicamente infraestructura y configuración de entorno.

No debe almacenar lógica de aplicación.

Estructura prevista:

```text
infra/
├── docker/
├── postgres/
├── valkey/
└── devnet/
```

---

# 12. Documentación

La documentación arquitectónica y operativa debe vivir dentro del repositorio.

Estructura recomendada:

```text
docs/
├── architecture/
├── build/
├── security/
├── operations/
└── adr/
```

Los documentos numerados de construcción pueden ubicarse en:

```text
docs/build/
```

Por ejemplo:

```text
docs/build/00-consolidado-arquitectura.md
docs/build/01-plan-maestro-construccion.md
docs/build/02-bootstrap-repositorio.md
```

Si inicialmente se guardan en la raíz, deberá existir una decisión consistente y posteriormente pueden moverse todos juntos.

No dispersar estos documentos.

---

# 13. Architecture Decision Records

Las decisiones arquitectónicas nuevas que surjan durante implementación deben registrarse como ADR.

Formato recomendado:

```text
docs/adr/0001-nombre-decision.md
```

Cada ADR debe incluir:

- contexto;
- decisión;
- alternativas;
- consecuencias;
- estado.

Estados sugeridos:

- proposed;
- accepted;
- superseded;
- rejected.

---

# 14. Scripts

El directorio raíz:

```text
scripts/
```

contendrá scripts de automatización del repositorio.

Ejemplos:

- inicialización;
- verificaciones;
- cleanup;
- generación devnet;
- utilidades CI.

Los scripts deben ser:

- reproducibles;
- idempotentes cuando tenga sentido;
- documentados;
- seguros ante errores.

No ocultar procedimientos críticos únicamente en scripts sin documentación.

---

# 15. Package raíz

Debe existir un `package.json` raíz con:

```json
{
  "private": true
}
```

El package raíz no debe convertirse en aplicación.

Su función es:

- coordinar workspaces;
- centralizar scripts;
- definir engines;
- centralizar herramientas de desarrollo.

---

# 16. Workspace

Debe existir:

```text
pnpm-workspace.yaml
```

Con alcance al menos:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "zk"
```

Puede añadirse tooling adicional si existe un package real.

---

# 17. Scripts raíz obligatorios

El `package.json` raíz debe exponer una interfaz consistente.

Como mínimo:

```text
pnpm install
pnpm lint
pnpm format
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm dev
pnpm clean
```

No todos los scripts necesitan ejecutar funcionalidad real desde el primer commit, pero no deben existir scripts falsos que siempre devuelvan éxito.

Si una categoría todavía no existe, el script puede omitirse temporalmente hasta que tenga implementación real.

---

# 18. Convención de scripts por workspace

Cada workspace debe usar nombres compatibles:

```text
dev
build
lint
typecheck
test
test:unit
test:integration
```

Cuando aplique.

Esto permitirá ejecución recursiva con pnpm.

---

# 19. Task orchestration

En la primera etapa no es obligatorio introducir Turborepo, Nx u otro orchestrator.

Preferencia inicial:

usar las capacidades nativas de pnpm.

Razón:

evitar otra pieza de infraestructura hasta demostrar necesidad.

Si posteriormente el tiempo de builds o la complejidad del monorepo justifican un orchestrator, debe aprobarse mediante ADR.

---

# 20. ESLint

Se utilizará ESLint.

Debe configurarse para TypeScript.

Reglas mínimas esperadas:

- no variables sin usar;
- no promises ignoradas;
- manejo estricto de async;
- evitar `any` salvo justificación;
- imports consistentes;
- detección de código inseguro común;
- reglas específicas para tests cuando corresponda.

No desactivar reglas globalmente para resolver errores puntuales.

---

# 21. Formatter

Se utilizará Prettier o un formatter compatible ampliamente mantenido.

Preferencia:

**Prettier**.

Debe existir:

```text
.prettierrc
```

o configuración equivalente.

La configuración debe ser mínima.

No dedicar reglas estilísticas excesivas que no aporten valor.

---

# 22. EditorConfig

Debe existir `.editorconfig`.

Configuración mínima:

- UTF-8;
- LF;
- newline final;
- espacios;
- tamaño de indentación coherente;
- eliminación de trailing whitespace cuando aplique.

---

# 23. Gitignore

`.gitignore` debe cubrir como mínimo:

- `node_modules`;
- builds;
- coverage;
- caches;
- logs;
- `.env`;
- `.env.*` sensibles;
- claves;
- artifacts ZK sensibles;
- archivos temporales;
- IDE-specific files innecesarios.

Debe revisarse antes de introducir ZK para evitar commits accidentales de claves privadas.

---

# 24. Variables de entorno

No commitear `.env` reales.

Debe existir:

```text
.env.example
```

o ejemplos por aplicación.

Ejemplo:

```text
apps/api/.env.example
apps/admin-web/.env.example
apps/voter-web/.env.example
```

La configuración compartida de infraestructura puede utilizar:

```text
infra/devnet/.env.example
```

Todos los ejemplos deben contener valores ficticios seguros.

---

# 25. Validación de configuración

Las variables de entorno consumidas por servicios deben validarse al iniciar.

No utilizar:

```ts
process.env.SOME_VALUE
```

de forma dispersa por todo el código.

Debe existir una capa central de configuración.

En NestJS se detallará en la etapa 06.

---

# 26. Secretos

Nunca incluir valores reales en:

- `.env.example`;
- README;
- tests;
- Dockerfiles;
- compose;
- fixtures;
- screenshots;
- documentación.

Los secretos devnet deben generarse o configurarse explícitamente.

Si se incluyen credenciales conocidas de desarrollo, deben estar claramente etiquetadas como no productivas y aisladas del uso real.

---

# 27. Naming

Convenciones:

## Directorios

`kebab-case`

Ejemplo:

```text
shared-validation
admin-web
```

## Archivos TypeScript

`kebab-case.ts`

Ejemplo:

```text
election-status.ts
create-election.dto.ts
```

## Clases

`PascalCase`

## Funciones y variables

`camelCase`

## Constantes

`UPPER_SNAKE_CASE` solo para constantes realmente globales/inmutables.

---

# 28. Imports

Se deben evitar imports relativos profundamente anidados como:

```text
../../../../something
```

Se pueden utilizar aliases bien definidos.

Los aliases no deben ocultar dependencias entre capas.

Ejemplo:

```text
@votaciones/shared-types
```

para paquetes reales.

Dentro de una app se pueden usar aliases limitados si mejoran claridad.

---

# 29. Límites de dependencias

Reglas obligatorias:

- `admin-web` no importa código interno de `api`;
- `voter-web` no importa código interno de `api`;
- `api` no importa código de frontends;
- paquetes compartidos no importan aplicaciones;
- `shared-testing` no debe ser dependencia runtime;
- código ZK no debe importar NestJS;
- infraestructura no debe importar lógica de dominio.

---

# 30. Shared code

Antes de mover código a `packages/`, debe existir al menos una razón real de reutilización o separación arquitectónica.

No crear abstracciones compartidas anticipadamente.

Regla:

**duplicación pequeña y temporal es preferible a una abstracción incorrecta que acople dominios.**

---

# 31. Testing base

La herramienta exacta de tests puede variar por app, pero debe existir una estrategia coherente.

Para backend Node/NestJS se priorizará una herramienta compatible con NestJS y TypeScript.

Si NestJS mantiene Jest como opción estándar y estable, se puede utilizar Jest.

Si al momento de implementación Vitest ofrece mejor compatibilidad sin introducir complejidad, podrá evaluarse.

La decisión exacta deberá quedar fijada en la etapa 06.

Para circuitos ZK se definirá tooling específico en etapa 10.

---

# 32. Coverage

Coverage no debe utilizarse como única medida de calidad.

Puede configurarse desde el inicio, pero los thresholds obligatorios deben introducirse de forma gradual.

Las propiedades críticas deben probarse aunque el porcentaje global sea alto.

---

# 33. Build

Cada app/package compilable debe tener un comando `build`.

El build no debe depender de:

- servicios externos inesperados;
- secretos reales;
- infraestructura productiva;
- acceso a internet fuera de instalación de dependencias.

---

# 34. Clean

Debe existir una forma documentada de eliminar artefactos generados:

- dist;
- coverage;
- caches;
- builds;
- outputs temporales.

No debe eliminar:

- migraciones;
- fuentes;
- artefactos ZK que deban preservarse;
- configuración.

---

# 35. README raíz

El README inicial debe incluir únicamente información estable.

Debe explicar:

- propósito del proyecto;
- estado;
- requisitos;
- estructura;
- instalación;
- comandos básicos;
- cómo leer la documentación;
- advertencia de que no es producción hasta completar los gates.

No debe duplicar los documentos técnicos completos.

---

# 36. README por componente

Cada componente relevante deberá disponer eventualmente de README propio.

Ejemplos:

```text
apps/api/README.md
apps/admin-web/README.md
apps/voter-web/README.md
zk/README.md
infra/README.md
```

Deben explicar cómo ejecutar y probar ese componente.

---

# 37. Licencia

Debe existir un archivo `LICENSE`.

La licencia concreta debe ser elegida por el propietario del proyecto.

Codex no debe seleccionar una licencia jurídica por su cuenta si no se ha definido.

Hasta definirla, puede existir documentación indicando:

```text
License: pending project owner decision.
```

pero no debe inventar una licencia.

---

# 38. Seguridad de dependencias

No instalar paquetes sin uso.

Cada nueva dependencia runtime debe poder justificarse.

Evitar:

- paquetes abandonados;
- paquetes con historial de incidentes graves no resueltos;
- wrappers triviales de APIs nativas;
- dependencias que introduzcan grandes árboles por funciones simples.

---

# 39. Actualizaciones automáticas

Dependabot, Renovate u otra herramienta podrá añadirse más adelante.

No es requisito de bootstrap.

Si se incorpora, debe configurarse para evitar merges automáticos inseguros en dependencias sensibles.

---

# 40. Commits

Convención recomendada:

**Conventional Commits**.

Ejemplos:

```text
feat(api): add election module
fix(zk): reject invalid election binding
docs(build): add repository bootstrap
test(api): cover duplicate vote race
```

No es necesario bloquear trabajo local por hooks complejos inicialmente.

---

# 41. Git hooks

Husky, Lefthook u otra herramienta no es obligatoria en bootstrap.

Preferencia inicial:

validaciones explícitas vía scripts y CI.

Si se añaden hooks, no deben:

- modificar código de forma inesperada;
- impedir operaciones esenciales por servicios externos;
- ser la única línea de defensa.

---

# 42. CI

Puede crearse una configuración mínima si el repositorio ya usa GitHub.

La plataforma CI definitiva se definirá después.

El bootstrap debe garantizar que todos los checks se puedan ejecutar localmente con los mismos comandos que utilizará CI.

Principio:

**CI no debe contener lógica de validación que no pueda ejecutarse localmente.**

---

# 43. Dockerfiles

Los Dockerfiles de aplicaciones no son parte obligatoria de esta etapa salvo un scaffold mínimo.

Su definición completa corresponde a:

`03-infraestructura-local-devnet.md`

No crear imágenes productivas prematuramente.

---

# 44. Seguridad de scripts

Scripts shell deben comenzar con comportamiento estricto cuando corresponda.

Ejemplo:

```bash
set -euo pipefail
```

No ejecutar operaciones destructivas sin confirmación o una bandera explícita.

Ejemplo:

```text
pnpm devnet:reset --force
```

para operaciones destructivas.

---

# 45. Line endings

El repositorio debe usar LF.

Puede añadirse `.gitattributes`.

Ejemplo:

```text
* text=auto eol=lf
```

Archivos binarios deben declararse cuando sea necesario.

---

# 46. Encoding

UTF-8.

Documentación puede escribirse en español.

Código fuente debe utilizar nombres técnicos consistentes y evitar caracteres especiales en identificadores.

---

# 47. Idioma

Decisión recomendada:

- documentación principal: español;
- nombres de código: inglés;
- API técnica: inglés;
- comentarios de código: preferentemente inglés cuando sean necesarios.

Razón:

mantener compatibilidad con ecosistema técnico sin sacrificar documentación del proyecto.

No mezclar idiomas arbitrariamente en nombres de dominio.

---

# 48. Comentarios

No comentar lo obvio.

Los comentarios deben explicar:

- por qué;
- restricciones;
- riesgos;
- decisiones no evidentes.

No utilizar comentarios como sustituto de nombres claros.

---

# 49. Manejo de errores

Cada app definirá su estrategia específica posteriormente.

En bootstrap debe establecerse que:

- no se ignoran promises;
- no se usan `catch {}` vacíos;
- los errores inesperados deben propagarse o registrarse adecuadamente;
- no se silencian fallos de scripts.

---

# 50. Strict TypeScript

TypeScript debe operar en modo estricto.

Configuración base debe incluir:

```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Se recomienda evaluar además:

```text
noUncheckedIndexedAccess
exactOptionalPropertyTypes
noImplicitOverride
useUnknownInCatchVariables
```

Las reglas demasiado disruptivas pueden habilitarse progresivamente, pero `strict` no debe desactivarse.

---

# 51. `any`

El uso de `any` debe ser excepcional.

Preferir:

- `unknown`;
- generics;
- tipos concretos;
- narrowing.

Si una librería externa obliga a usar `any`, aislarlo en un boundary.

---

# 52. Validación automática inicial

Al completar bootstrap deben funcionar al menos:

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Si todavía no existen tests productivos, debe existir al menos una prueba mínima real del setup.

No utilizar un script que simplemente imprima "ok".

---

# 53. Smoke test del monorepo

Debe existir al menos una prueba o pequeña pieza compilable por workspace que demuestre:

- resolución de packages;
- TypeScript compartido;
- lint;
- test;
- build.

Estas piezas pueden eliminarse al comenzar implementación real si dejan de aportar valor.

---

# 54. Dependencias prohibidas implícitamente

Codex no debe añadir durante bootstrap sin autorización:

- Redis;
- Keycloak;
- Kafka;
- RabbitMQ;
- Elasticsearch;
- MongoDB;
- Kubernetes;
- Terraform;
- Nx;
- Turborepo;
- Prisma;
- TypeORM;
- Drizzle;
- Next.js;
- React;
- Vue;
- Angular;

salvo que ese componente ya haya sido definido explícitamente en un documento posterior.

Algunos de estos pueden terminar siendo seleccionados más adelante.

El objetivo de esta restricción es evitar que el bootstrap decida tecnologías todavía no formalizadas.

---

# 55. Decisiones todavía abiertas

Este documento deliberadamente NO define todavía:

- ORM o query builder;
- framework frontend;
- bundler frontend;
- librería de estado;
- sistema UI;
- herramienta exacta de tests backend;
- mecanismo exacto de sesiones;
- estrategia de migraciones;
- proveedor CI definitivo.

Estas decisiones deben cerrarse en sus documentos específicos.

---

# 56. Orden de implementación de esta etapa

Codex debe ejecutar:

1. crear archivos raíz;
2. configurar pnpm workspace;
3. crear estructura de carpetas;
4. crear packages de configuración;
5. configurar TypeScript;
6. configurar ESLint;
7. configurar formatter;
8. configurar gitignore/editorconfig/gitattributes;
9. crear scaffolds mínimos de apps/packages;
10. definir scripts raíz;
11. configurar tests mínimos;
12. crear README;
13. ejecutar instalación;
14. ejecutar lint;
15. ejecutar typecheck;
16. ejecutar tests;
17. ejecutar build si ya aplica;
18. documentar resultado.

---

# 57. Archivos mínimos esperados

Al terminar esta etapa debe existir al menos:

```text
.editorconfig
.gitattributes
.gitignore
.nvmrc
.prettierrc
README.md
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json

apps/api/package.json
apps/admin-web/package.json
apps/voter-web/package.json

packages/config-eslint/package.json
packages/config-typescript/package.json
packages/shared-types/package.json
packages/shared-validation/package.json
packages/shared-crypto/package.json
packages/shared-testing/package.json

zk/package.json
zk/README.md

infra/README.md
docs/README.md
```

La lista exacta puede aumentar según la implementación.

---

# 58. Criterios de aceptación

La etapa se aprueba cuando:

- el repositorio es un monorepo pnpm válido;
- Node version está fijada;
- TypeScript estricto funciona;
- ESLint funciona;
- formatter funciona;
- workspaces se resuelven;
- no existen dependencias circulares obvias;
- ninguna app importa internals de otra app;
- variables de entorno sensibles están ignoradas;
- no existen secretos en el repositorio;
- los scripts raíz principales funcionan;
- una instalación limpia puede reproducir el resultado;
- README documenta cómo empezar.

---

# 59. Definition of Done específica

```text
[ ] pnpm install pasa
[ ] pnpm lint pasa
[ ] pnpm format:check pasa
[ ] pnpm typecheck pasa
[ ] pnpm test pasa
[ ] pnpm build pasa si existen targets compilables
[ ] lockfile versionado
[ ] Node fijado
[ ] estructura raíz creada
[ ] paquetes compartidos no contienen lógica inventada
[ ] .env reales ignorados
[ ] no existen secretos
[ ] documentación inicial presente
[ ] reglas de dependencias respetadas
```

---

# 60. Instrucción final para Codex

No desarrollar todavía funcionalidad electoral.

Esta etapa construye únicamente la **fundación técnica del repositorio**.

Al terminar, Codex debe entregar:

- árbol del repositorio;
- dependencias instaladas;
- scripts disponibles;
- comandos ejecutados;
- resultado de validaciones;
- cualquier desviación respecto a este documento.

El siguiente documento rector será:

`03-infraestructura-local-devnet.md`
