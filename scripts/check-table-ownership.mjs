// Enforces rule 3 in docs/architecture/domain-boundaries.md: a module touches only tables it owns.
// It scans for Prisma model access such as `tx.childProfile` or `global.user` in module source.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiRoot = fileURLToPath(new URL('../apps/api/', import.meta.url));

const OWNERS = {
  identity: [
    'user',
    'userProfile',
    'userCredential',
    'userSession',
    'refreshToken',
    'passwordResetToken',
    'userMfaFactor',
    'userMfaRecoveryCode',
    'role',
    'permission',
    'rolePermission',
  ],
  tenants: ['tenant', 'tenantSettings'],
  organizations: ['organization', 'organizationMember', 'organizationInvitation', 'userRole'],
  children: ['childProfile', 'childSettings', 'childConsent'],
  guardians: ['parentProfile', 'parentChildLink'],
  audit: ['auditLog'],
  curriculum: ['subject', 'gradeLevel', 'skill', 'skillDependency'],
  content: ['contentReview'],
  questions: ['questionBank', 'question', 'questionVersion', 'questionSkill'],
};

// Infrastructure owns these tables, and no module may reach them directly.
const INFRASTRUCTURE_MODELS = ['outboxEvent', 'consumedEvent'];

const schemaDir = join(apiRoot, 'prisma', 'schema');
const allModels = readdirSync(schemaDir).flatMap((file) =>
  [...readFileSync(join(schemaDir, file), 'utf8').matchAll(/^model (\w+) \{/gm)].map(
    ([, name]) => name[0].toLowerCase() + name.slice(1),
  ),
);

const declared = new Set([...Object.values(OWNERS).flat(), ...INFRASTRUCTURE_MODELS]);
const problems = allModels
  .filter((model) => !declared.has(model))
  .map((model) => `model "${model}" has no owner declared in this script`);

const ownerOf = new Map(
  Object.entries(OWNERS).flatMap(([module, models]) => models.map((model) => [model, module])),
);
const modelPattern = new RegExp(`\\b(?:tx|client|global)\\.(${allModels.join('|')})\\b`, 'g');

function* sourceFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      yield* sourceFiles(path);
    } else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) {
      yield path;
    }
  }
}

const modulesDir = join(apiRoot, 'src', 'modules');
for (const file of sourceFiles(modulesDir)) {
  const module = relative(modulesDir, file).split(sep)[0];
  for (const [, model] of readFileSync(file, 'utf8').matchAll(modelPattern)) {
    if (ownerOf.get(model) !== module) {
      const owner = ownerOf.get(model) ?? 'infrastructure';
      problems.push(`${relative(apiRoot, file)} uses "${model}", owned by ${owner}`);
    }
  }
}

if (problems.length > 0) {
  console.error('Table ownership violations:');
  for (const problem of new Set(problems)) {
    console.error(`  ${problem}`);
  }
  process.exit(1);
}
console.log(`Table ownership OK (${allModels.length} models).`);
