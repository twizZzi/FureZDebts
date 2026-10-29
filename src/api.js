import { getInitData, isTelegram } from "./telegram";

// Outside Telegram (local dev only) the worker accepts a fake user: ?dev=1001 | 1002 | 1003.
function devUser() {
  const fromUrl = new URLSearchParams(window.location.search).get("dev");
  try {
    if (fromUrl) sessionStorage.setItem("dev-user", fromUrl);
    return fromUrl || sessionStorage.getItem("dev-user") || "1001";
  } catch {
    return fromUrl || "1001";
  }
}

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Local only: ?start=inv_<code> stands in for a Telegram start_param.
function devStart() {
  return new URLSearchParams(window.location.search).get("start");
}

export async function request(method, path, body) {
  const headers = { "content-type": "application/json" };
  if (isTelegram) headers.authorization = `tma ${getInitData()}`;
  else {
    headers["x-dev-user"] = devUser();
    if (devStart()) headers["x-dev-start"] = devStart();
  }

  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Нет соединения с сервером");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error || "Что-то пошло не так", data.code);
  return data;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body ?? {}),
  patch: (path, body) => request("PATCH", path, body),
  delete: (path) => request("DELETE", path),
};
