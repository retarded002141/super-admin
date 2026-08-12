const BASE_URL =
  import.meta.env.VITE_ENROLLMENT_API_URL ||
  (import.meta.env.MODE === "development" ? "http://localhost:5001/api" : "/api");

function buildUrl(path, params) {
  const absolute = /^https?:\/\//i.test(path);
  const base = absolute ? path : `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const url = new URL(base, window.location.origin);

  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
}

async function request(method, path, data, config = {}) {
  const response = await fetch(buildUrl(path, config.params), {
    method,
    headers: {
      ...(data !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(config.headers || {}),
    },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  const contentType = response.headers.get("content-type") || "";
  const responseData = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const error = new Error(
      responseData?.message || `Request failed with status ${response.status}`
    );
    error.response = {
      status: response.status,
      data: responseData,
    };
    throw error;
  }

  return {
    data: responseData,
    status: response.status,
  };
}

const api = {
  get(path, config = {}) {
    return request("GET", path, undefined, config);
  },
  post(path, data, config = {}) {
    return request("POST", path, data, config);
  },
  put(path, data, config = {}) {
    return request("PUT", path, data, config);
  },
  patch(path, data, config = {}) {
    return request("PATCH", path, data, config);
  },
  delete(path, config = {}) {
    return request("DELETE", path, undefined, config);
  },
};

export default api;
