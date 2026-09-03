# PostgreSQL

PostgreSQL 17.11 es la persistencia principal de local/devnet. El volumen se
monta en `/var/lib/postgresql/data`, ubicación soportada por la imagen oficial
para PostgreSQL 17.

`init/` queda reservado para inicialización estrictamente infraestructural. Los
esquemas de aplicación se crearán únicamente mediante migraciones en la etapa 04.

`backups/` no debe contener dumps versionados. La estrategia de backup y restore
se definirá y probará en la etapa 04.
