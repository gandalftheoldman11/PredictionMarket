"use client";

export type PendingSignedRequest = {
  operationId: string;
  body: string;
};

export function isDefinitiveSignedRequestFailure(status: number): boolean {
  return status === 400 || status === 409 || status === 422;
}

export function readPendingSignedRequest(key: string): PendingSignedRequest | null {
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    if (
      typeof value === "object" &&
      value !== null &&
      "operationId" in value &&
      "body" in value &&
      typeof value.operationId === "string" &&
      typeof value.body === "string"
    ) {
      return { operationId: value.operationId, body: value.body };
    }
  } catch {
    // A corrupt browser entry is not a signed request and can be replaced.
  }
  window.sessionStorage.removeItem(key);
  return null;
}

export function retainPendingSignedRequest(
  key: string,
  request: PendingSignedRequest,
): PendingSignedRequest {
  window.sessionStorage.setItem(key, JSON.stringify(request));
  return request;
}

export function clearPendingSignedRequest(
  key: string,
  completed: PendingSignedRequest,
): void {
  const current = readPendingSignedRequest(key);
  if (
    current?.operationId === completed.operationId &&
    current.body === completed.body
  ) {
    window.sessionStorage.removeItem(key);
  }
}
