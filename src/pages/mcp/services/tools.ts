import { request } from '../../../services/domains/session-guard.ts'
export const fetchTools = () => request<any[]>('/mcp/tools')
export const callTool = (name:string,args:Record<string,any>) => request<any>('/mcp/tools/call','POST',{name,arguments:args})
