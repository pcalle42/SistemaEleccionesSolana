# Artefactos ZK V1

`anonymous-single-choice-v1/` contiene los artefactos de **DEVNET / NOT FOR
PRODUCTION**. Sus hashes están fijados en el manifest y se verifican con
`pnpm zk:verify-artifacts`.

El `.zkey` fue producido en una ceremonia de una sola parte. snarkjs mezcla su
CSPRNG con etiquetas públicas; esto no constituye una ceremonia independiente
ni proporciona seguridad de trusted setup para producción. El Powers of Tau
final de devnet se versiona para permitir verificar R1CS↔zkey; su hash queda en
el transcript. Los estados intermedios permanecen solo en cache local.
