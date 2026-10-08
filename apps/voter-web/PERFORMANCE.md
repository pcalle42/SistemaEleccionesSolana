# Medición inicial frontend

Medición de build local del 2026-10-08; no constituye un budget normativo. El comando
`pnpm test:performance` enumera cada archivo para que cambios de chunking no oculten regresiones:

| Recurso                       |        Tamaño aproximado |
| ----------------------------- | -----------------------: |
| App shell JS                  |     49 KiB / 16 KiB gzip |
| CSS                           |   4.1 KiB / 1.7 KiB gzip |
| Crypto dinámico de credencial | 2.67 MiB / 1.30 MiB gzip |
| Proof Worker y dependencias   |                 3.14 MiB |
| Circuit WASM                  |                 2.11 MiB |
| Proving zkey                  |                 3.48 MiB |

El crypto de credencial se carga bajo demanda; el Worker y los artefactos sólo se usan al generar
proof. El baseline ZK versionado registra witness, proof, verify, peak RSS y tamaños de artefactos;
son mediciones de desarrollo y no un SLO de producción.
