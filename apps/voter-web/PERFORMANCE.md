# Medición inicial frontend

Medición de build local del 2026-10-07; no constituye un budget normativo:

| Recurso                       |        Tamaño aproximado |
| ----------------------------- | -----------------------: |
| App shell JS                  |    21 KiB / 7.3 KiB gzip |
| CSS                           |   4.1 KiB / 1.7 KiB gzip |
| Crypto dinámico de credencial | 2.83 MiB / 1.37 MiB gzip |
| Proof Worker                  |                 3.11 MiB |
| Circuit WASM                  |                 2.11 MiB |
| Proving zkey                  |                 3.48 MiB |

El crypto de credencial se carga bajo demanda; el Worker y los artefactos sólo se usan al generar
proof. Deben medirse duración y peak memory en dispositivos modestos con pruebas de navegador en la
etapa 15 antes de fijar límites.
