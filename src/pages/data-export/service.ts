import { apiUrl, request } from "../../services/api.ts";
import { readResponse } from "../../services/contract.ts";
import { session } from "../../services/session.ts";

export interface ExportJob {
  id: string;
  status: string;
  phase: string;
  errorCode: string | null;
  rowCount: number;
  fileName: string | null;
  artifactStatus: string;
  createTime: string;
  expiresAt: string | null;
}
export interface ExportCatalog {
  artifactHours: number;
  version: string;
  verificationMethod: string;
  exclusions: string[];
  datasets: {
    key: string;
    title: string;
    state: string;
    lockedMenu: string | null;
  }[];
}
export interface ExportQuota {
  remaining: number;
  limit: number;
  month: string;
}
const path = "/me/data-exports";
export function catalog() {
  return request<ExportCatalog>(path + "/catalog");
}
export function quota() {
  return request<ExportQuota>(path + "/quota");
}
export function history(page: number) {
  return request<{ items: ExportJob[]; total: number }>(
    path + "?page=" + page + "&pageSize=20",
  );
}
export function authorize(
  password: string,
  keys: string[],
  jobId: string | null = null,
) {
  return request<{ grant: string }>(path + "/authorizations", "POST", {
    purpose: jobId ? "DOWNLOAD" : "CREATE",
    password,
    ...(jobId ? { jobId } : { datasetKeys: keys }),
  });
}
/** 创建不自动重试；同一幂等键可恢复响应丢失的申请。 */
export function create(
  keys: string[],
  version: string,
  key: string,
  grant: string,
): Promise<ExportJob> {
  const token = session.token;
  return new Promise((resolve, reject) => {
    uni.request({
      url: apiUrl(path),
      method: "POST",
      data: { datasetKeys: keys, catalogVersion: version },
      header: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        "X-Export-Grant": grant,
      },
      success(response) {
        try {
          if (session.token !== token)
            throw new Error("登录状态已变化，请重试");
          resolve(readResponse(response.statusCode, response.data));
        } catch (error) {
          reject(error);
        }
      },
      fail: () =>
        reject(
          new Error("申请结果暂未确认，请刷新任务或重试，同一申请不会重复计次"),
        ),
    });
  });
}
export function cancel(id: string) {
  return request(path + "/" + encodeURIComponent(id) + "/cancel", "POST");
}
export function remove(id: string) {
  return request(path + "/" + encodeURIComponent(id) + "/artifact", "DELETE");
}

export async function download(job: ExportJob, grant: string) {
  const token = session.token;
  const url = apiUrl(path + "/" + encodeURIComponent(job.id) + "/download");
  const header = { Authorization: "Bearer " + token, "X-Export-Grant": grant };
  // #ifdef WEB
  const response = await fetch(url, { headers: header, cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";
  if (
    !response.ok ||
    ![
      "application/zip",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ].some((type) => contentType.startsWith(type))
  ) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "下载失败，请重新验证后重试");
  }
  const blob = await response.blob();
  if (session.token !== token) throw new Error("登录状态已变化，已取消下载");
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = job.fileName || "aio-life-data.xlsx";
  link.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  return;
  // #endif
  // #ifndef WEB
  if (job.fileName?.endsWith(".zip"))
    throw new Error("分卷文件请在 Web 个人中心下载同一任务，无需重新生成");
  await new Promise<void>((resolve, reject) => {
    uni.downloadFile({
      url,
      header,
      success(response) {
        if (session.token !== token) {
          reject(new Error("登录状态已变化，已取消下载"));
          return;
        }
        if (response.statusCode !== 200) {
          reject(new Error("下载失败，请重新验证后重试"));
          return;
        }
        uni.openDocument({
          filePath: response.tempFilePath,
          fileType: "xlsx",
          showMenu: true,
          success: () => resolve(),
          fail: () => reject(new Error("无法打开文件，请在 Web 下载同一任务")),
        });
      },
      fail: () => reject(new Error("下载失败，请重试")),
    });
  });
  // #endif
}
