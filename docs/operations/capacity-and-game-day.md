# Capacidad y game day

Antes de producción se registra un baseline sintético con: hardware, release,
protocol/circuit, electores, turnout supuesto, rate pico, CPU/RAM de proof,
throughput/latencia DB, tamaño de packages, crecimiento, backup/restore y errores.
`pnpm test:performance` es el baseline técnico inicial, no un SLO productivo.
El baseline local vigente (`arm64`, Node 22) midió 5.843 constraints, proof
741,33 ms, verification 15,1 ms, pico RSS 351.076.352 bytes, WASM 2.210.634
bytes y zkey 3.649.198 bytes. La fuente reproducible es
`packages/zk-protocol/artifacts/anonymous-single-choice-v1/performance.json`.

La carga debe demostrar bounded concurrency/backpressure sin OOM, bypass de proof
ni pérdida de votos committed. Los parámetros concretos se completan cuando se
conozcan censo, plataforma y requisitos.

El game day de staging practica API restart, pérdida Valkey, DB restore,
artefacto ausente, clock alert y rollback compatible. Usa solo datos sintéticos,
preserva evidencia y registra tiempos; no extiende ventanas automáticamente.
La última ejecución controlada está en [game-day-2026-10-13.md](game-day-2026-10-13.md).
