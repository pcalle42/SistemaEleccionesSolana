# Registro ZK productivo

Este directorio no contiene un `.zkey` productivo. Esa ausencia es deliberada:
el pipeline `production` debe fallar hasta que una ceremonia aprobada entregue
los artefactos, su evidencia y una entrada `productionSafe: true` en el registry.

CI puede verificar o promover artefactos aprobados, pero nunca ejecuta una
ceremonia productiva ni copia automáticamente el setup devnet. La incorporación
requiere revisión criptográfica, nueva versión de circuito cuando corresponda y
actualización explícita del registry.
