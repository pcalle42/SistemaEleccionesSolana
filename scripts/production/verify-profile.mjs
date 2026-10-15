import { parseArguments } from '../release/lib.mjs';
import { readAndVerifyProductionProfile } from './profile.mjs';

const arguments_ = parseArguments(process.argv.slice(2));
if (!arguments_['profile']) throw new Error('--profile is required');
const { result } = await readAndVerifyProductionProfile(arguments_['profile']);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
