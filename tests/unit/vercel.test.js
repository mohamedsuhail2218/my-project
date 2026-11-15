import { describe, expect, it } from "vitest";
import { restoreApiUrl } from "../../api/index.js";

describe("Vercel API rewrite", () => {
  it("restores the original path and keeps query parameters", () => {
    const req = {
      url: "/api/index?__dtcw_path=intel/lookup&indicator=185.220.101.4",
    };

    restoreApiUrl(req);

    expect(req.url).toBe("/api/intel/lookup?indicator=185.220.101.4");
  });

  it("restores the API root and repeated query values", () => {
    const req = {
      url: "/api/index?__dtcw_path=&host=web-01&host=db-01",
    };

    restoreApiUrl(req);

    expect(req.url).toBe("/api?host=web-01&host=db-01");
  });

  it("leaves a direct request unchanged", () => {
    const req = { url: "/api/health?__dtcw_path=auth%2Flogin" };

    restoreApiUrl(req);

    expect(req.url).toBe("/api/health?__dtcw_path=auth%2Flogin");
  });

  it("ignores a marker appended by the client", () => {
    const req = { url: "/api/index?__dtcw_path=health&__dtcw_path=admin" };

    restoreApiUrl(req);

    expect(req.url).toBe("/api/health");
  });
});
