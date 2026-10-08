import './styles.css';
import { Buffer } from 'buffer';
import { VoterApp } from './app/voter-app.js';

const browserGlobal = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
browserGlobal.Buffer ??= Buffer;

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
const configuredApi: unknown = import.meta.env['VITE_API_BASE_URL'];
const configuredArtifacts: unknown = import.meta.env['VITE_ARTIFACT_BASE_URL'];
const api = (
  typeof configuredApi === 'string' ? configuredApi : 'http://localhost:3000/api/v1'
).replace(/\/$/u, '');
const artifacts = (
  typeof configuredArtifacts === 'string'
    ? configuredArtifacts
    : '/artifacts/anonymous-single-choice-v1'
).replace(/\/$/u, '');
new VoterApp(root, api, artifacts).start();
