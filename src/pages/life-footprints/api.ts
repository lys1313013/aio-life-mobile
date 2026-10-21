import type { Footprint, FootprintRequest, LocationResult, MapConfig } from './model.ts';
import { request } from '../../services/api.ts';

export function getFootprints() { return request<Footprint[]>('/life-footprints'); }
export function getFootprintMapConfig() { return request<MapConfig>('/life-footprints/map/config'); }
export function createFootprint(data: FootprintRequest) { return request<Footprint>('/life-footprints', 'POST', data); }
export function updateFootprint(id: string, data: FootprintRequest) { return request<Footprint>('/life-footprints/' + id, 'PUT', data); }
export function deleteFootprint(id: string) { return request<void>('/life-footprints/' + id, 'DELETE'); }
export function searchFootprintLocations(keyword: string) { return request<LocationResult[]>('/life-footprints/map/search?keyword=' + encodeURIComponent(keyword)); }
export function geocodeFootprintAddress(address: string) { return request<LocationResult>('/life-footprints/map/geocode?address=' + encodeURIComponent(address)); }
export function reverseFootprintLocation(longitude: number, latitude: number) { return request<LocationResult>('/life-footprints/map/reverse?longitude=' + longitude + '&latitude=' + latitude); }
