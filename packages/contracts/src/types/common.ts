import type { AuthErrorResponse } from "./auth.js";

export type ApiErrorEnvelope = Omit<AuthErrorResponse, "code"> & { code: string };

export type EntityId = string;

export type ISODateString = string;

export type PaginationParams = {
  page?: number;
  limit?: number;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedResult<T> = {
  data: T[];
  meta: PaginationMeta;
};

export type SortDirection = "asc" | "desc";
