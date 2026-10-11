import { request } from './api.ts'
export function fetchDictionary(dictType, user = false) { return request<any>((user ? '/userDictType' : '/sysDictType') + '/getByDictType', 'GET', { dictType }) }
