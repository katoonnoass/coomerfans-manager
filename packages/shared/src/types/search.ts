import type { ServiceType } from './model';

export interface SearchParams {
  q: string;
  service?: ServiceType;
  page?: number;
  pageSize?: number;
}

export interface SearchResult {
  models: SearchModelHit[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SearchModelHit {
  id: string;
  externalId: string;
  name: string;
  slug: string;
  service: string;
  thumbnailUrl: string | null;
  postCount: number;
  rank: number;
}
