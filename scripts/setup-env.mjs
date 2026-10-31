// Creates .env from .env.example with generated secrets. An existing .env is left untouched.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = new URL('../.env', import.meta.url);
const example = new URL('../.env.example', import.meta.url);

if (existsSync(target)) {
  console.log('.env already exists, leaving it unchanged.');
  process.exit(0);
}

copyFileSync(example, target);

const secrets = {
  AUTH_JWT_SECRET: randomBytes(48).toString('base64url'),
  AUTH_CSRF_SECRET: randomBytes(48).toString('base64url'),
  AUTH_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  METRICS_TOKEN: randomBytes(32).toString('base64url'),
};

let content = readFileSync(target, 'utf8');
for (const [name, value] of Object.entries(secrets)) {
  content = content.replace(new RegExp(`^${name}=$`, 'm'), `${name}=${value}`);
}
writeFileSync(target, content);
console.log('.env created with generated secrets.');
