import type { BodyProfile, BodyProfileRequest } from './model';
import { request } from '../../services/api.ts';

export function getBodyProfile() {
  return request<BodyProfile>('/body-profile');
}

export function saveBodyProfile(data: BodyProfileRequest) {
  return request<BodyProfile>('/body-profile', 'PUT', data);
}
