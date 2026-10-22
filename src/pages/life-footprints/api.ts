import type { Footprint, FootprintRequest, LocationResult, MapConfig } from './model.ts';
import { request } from '../../services/api.ts';
import type { Region } from './regions.ts';

export function getFootprints() { return request<Footprint[]>('/life-footprints'); }
export function getFootprintMapConfig() { return request<MapConfig>('/life-footprints/map/config'); }
export function createFootprint(data: FootprintRequest) { return request<Footprint>('/life-footprints', 'POST', data); }
export function updateFootprint(id: string, data: FootprintRequest) { return request<Footprint>('/life-footprints/' + id, 'PUT', data); }
export function deleteFootprint(id: string) { return request<void>('/life-footprints/' + id, 'DELETE'); }
export function searchFootprintLocations(keyword: string, region = '') { return request<LocationResult[]>('/life-footprints/map/search?keyword=' + encodeURIComponent(keyword) + (region ? '&region=' + encodeURIComponent(region) : '')); }
export function geocodeFootprintAddress(address: string) { return request<LocationResult>('/life-footprints/map/geocode?address=' + encodeURIComponent(address)); }
export function reverseFootprintLocation(longitude: number, latitude: number) { return request<LocationResult>('/life-footprints/map/reverse?longitude=' + longitude + '&latitude=' + latitude); }
export function getFootprintRegions(parentCode?: string) { return request<Region[]>('/system/regions' + (parentCode ? '?parentCode=' + encodeURIComponent(parentCode) : '')); }
export function getFootprintRegionPath(code: string) { return request<Region[]>('/system/regions/' + encodeURIComponent(code) + '/path'); }
