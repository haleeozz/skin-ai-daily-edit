import release from '../data/catalog-release.json';
import type { Product } from './domain';

// Generated from exact manufacturer variants by data-research/release_catalog.py.
// Technical label checks only: no independent clinical or allergy-safety approval.
export const catalog = release.products as Product[];
export const catalogueInfo = { version: release.version, productCount: catalog.length, sourceRecords: release.sourceRecords };
