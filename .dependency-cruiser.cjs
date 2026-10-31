/** Module boundary rules from docs/architecture/domain-boundaries.md. */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies block module extraction.',
      from: { pathNot: 'src/generated' },
      to: { circular: true, viaOnly: { dependencyTypesNot: ['type-only'] } },
    },
    {
      name: 'module-public-api-only',
      severity: 'error',
      comment: 'A module may only import another module through its index.ts.',
      from: { path: '^apps/api/src/modules/([^/]+)/' },
      to: {
        path: '^apps/api/src/modules/([^/]+)/.+',
        pathNot: ['^apps/api/src/modules/$1/', '^apps/api/src/modules/[^/]+/index\\.(ts|js)$'],
      },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment: 'Domain code must not depend on frameworks or persistence.',
      from: { path: '^apps/api/src/modules/[^/]+/domain/' },
      to: {
        path: [
          '/(infrastructure|presentation|application)/',
          'src/generated',
          'node_modules/@nestjs',
          'node_modules/@prisma',
        ],
      },
    },
    {
      name: 'system-database-is-restricted',
      severity: 'error',
      comment: 'SystemDatabase bypasses RLS. New callers need a reviewed entry here.',
      from: {
        pathNot: [
          '^apps/api/src/infrastructure/',
          '^apps/api/src/app\\.module',
          '^apps/api/src/worker',
          '^apps/api/src/modules/administration/',
          '^apps/api/test/',
        ],
      },
      to: { path: 'infrastructure/database/system-database' },
    },
    {
      name: 'packages-never-import-apps',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'clients-never-import-server-code',
      severity: 'error',
      comment: 'Web and mobile must never reach database packages or API internals.',
      from: { path: '^apps/(web|mobile|admin|parent-portal|teacher-portal)/' },
      to: {
        path: ['node_modules/@prisma', 'node_modules/pg/', '^apps/api/'],
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(dist|\\.next|coverage|src/generated)' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.depcruise.json' },
  },
};
