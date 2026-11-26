type Env = { API: Fetcher; ASSETS: Fetcher };
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/health")
      return env.API.fetch(request);
    return env.ASSETS.fetch(request);
  },
};
