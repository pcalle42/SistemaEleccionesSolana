import { parseArguments, verifiedZkRegistry } from './lib.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
const classification = arguments_['classification'] ?? 'devnet';
const result = await verifiedZkRegistry(classification);
process.stdout.write(
  `${JSON.stringify(
    {
      classification,
      protocols: result.selected.map((entry) => ({
        circuitVersion: entry.circuitVersion,
        productionSafe: entry.productionSafe,
        protocolVersion: entry.protocolVersion,
      })),
      registryVersion: result.registry.registryVersion,
    },
    null,
    2,
  )}\n`,
);
