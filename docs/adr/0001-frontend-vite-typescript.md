# ADR 0001: Vite y TypeScript para las superficies web

- Estado: aceptado
- Fecha: 2026-10-07

## Contexto

El sistema necesita dos aplicaciones independientes: una administrativa con cookies/CSRF y otra
para generar pruebas ZK y votar sin credenciales administrativas. Deben soportar TypeScript
estricto, Web Crypto, Web Workers, WASM, `snarkjs`, CSP restrictiva, pruebas reproducibles y
contenedores separados.

## Decisión

Se usan Vite 8, TypeScript y DOM nativo. No se incorpora framework de componentes, store global,
Service Worker, telemetría ni scripts de terceros. Vitest sigue siendo el runner. Cada aplicación
tiene su propio entrypoint, configuración, cliente HTTP, Dockerfile y origen.

`voter-web` ejecuta `snarkjs` en un Worker dedicado. Los artefactos devnet se copian durante el
build y se sirven bajo una ruta versionada; el Worker verifica SHA-256 antes de usarlos. La CSP
permite `worker-src 'self' blob:` y `script-src 'self' 'wasm-unsafe-eval'`, concesiones necesarias
para Worker/WASM que no habilitan scripts inline ni `unsafe-eval` general.

## Consecuencias

- Las superficies no comparten cookies, storage ni estado de sesión.
- El bundle no necesita runtime de terceros ni una librería de estado.
- La UI usa renderizado de texto y APIs DOM; no acepta HTML electoral.
- No hay persistencia automática del secreto ni cola offline.
- El soporte mínimo requiere Web Crypto, Web Workers, WASM y JavaScript ES2023.
- Un framework futuro requeriría otro ADR y no puede cambiar el protocolo.
