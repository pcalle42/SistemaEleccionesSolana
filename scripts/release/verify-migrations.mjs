import { migrationSet } from './lib.mjs';

const result = await migrationSet();
process.stdout.write(
  `${JSON.stringify(
    { count: result.count, latest: result.latest, setDigest: result.setDigest },
    null,
    2,
  )}\n`,
);
