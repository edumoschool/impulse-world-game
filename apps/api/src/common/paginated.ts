import type { PaginationQuery } from '@impulse/contracts';

/** Returned by a handler to have the response interceptor fill in pagination metadata. */
export class Paginated<T> {
  constructor(
    readonly items: T[],
    readonly total: number,
    readonly page: number,
    readonly pageSize: number,
  ) {}
}

export function toSkipTake({ page, pageSize }: PaginationQuery) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
