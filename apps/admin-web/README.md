# Admin Web

Consola independiente para autenticación, configuración, elegibilidad, lifecycle, auditoría,
conteo y publicación. Usa cookie administrativa HttpOnly mediante `credentials: include` sólo en
`AdminApiClient`; el token CSRF permanece en memoria y acompaña cada mutación.

```bash
cp apps/admin-web/.env.example apps/admin-web/.env.local
pnpm --filter @votaciones/admin-web dev
```

La UI no contiene código ZK, no recibe `voterSecret`, no calcula totals y no presenta conteos
parciales durante `OPEN`. Las transiciones críticas muestran confirmación y se refrescan desde el
servidor ante conflicto.

El runtime Docker sirve archivos como usuario no root y aplica CSP, `nosniff`, `no-referrer`,
`frame-ancestors 'none'` y una Permissions Policy restrictiva.
