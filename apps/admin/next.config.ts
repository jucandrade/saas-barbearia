import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@barbearia/ui", "@barbearia/contracts"],
  // Invitation and recovery links carry a token in the URL: keep the token from
  // leaking to other sites through the Referer header.
  headers() {
    const noReferrer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return Promise.resolve([
      { source: "/invitation/:token*", headers: noReferrer },
      { source: "/reset-password/:token*", headers: noReferrer },
    ]);
  },
};

export default config;
