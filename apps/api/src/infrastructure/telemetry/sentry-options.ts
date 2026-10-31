/**
 * Sentry 11 collects users, cookies, headers, query strings and bodies unless told otherwise, which
 * would send children's credentials and identifiers to a third party. Everything is switched off,
 * so a report holds only the error, its stack and the release.
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
} as const satisfies {
  userInfo: false;
  cookies: false;
  httpHeaders: false;
  httpBodies: never[];
  urlQueryParams: false;
  graphQL: { document: false; variables: false };
  genAI: { inputs: false; outputs: false };
};
