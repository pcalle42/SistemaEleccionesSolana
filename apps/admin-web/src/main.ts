import './styles.css';
import { AdminApp } from './app/admin-app.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing.');
const configuredBaseUrl: unknown = import.meta.env['VITE_API_BASE_URL'];
const baseUrl =
  typeof configuredBaseUrl === 'string' ? configuredBaseUrl : 'http://localhost:3000/api/v1';
void new AdminApp(root, baseUrl.replace(/\/$/u, '')).start();
