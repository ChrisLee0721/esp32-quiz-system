async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
    signal: AbortSignal.timeout(3000)
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`COM7 ${response.status}: ${message}`);
  }

  return body;
}

export function buildCom7Client(baseUrl) {
  return {
    getStatus() {
      return request(baseUrl, "/api/v1/gateway/status", { method: "GET" });
    },
    getNodes() {
      return request(baseUrl, "/api/v1/nodes", { method: "GET" });
    },
    publishQuestion(payload) {
      return request(baseUrl, "/api/v1/questions/publish", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },
    getNodeAnswer(nodeId) {
      return request(baseUrl, `/api/v1/nodes/${encodeURIComponent(nodeId)}/answer`, {
        method: "GET"
      });
    },
    pushJudgement(nodeId, payload) {
      return request(baseUrl, `/api/v1/nodes/${encodeURIComponent(nodeId)}/judgement`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }
  };
}
