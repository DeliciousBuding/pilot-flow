export type Result<T, E = Error> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export interface Pagination {
  readonly pageToken?: string;
  readonly hasMore: boolean;
}

export type Timestamp = string;
