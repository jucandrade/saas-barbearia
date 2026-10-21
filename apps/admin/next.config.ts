import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@barbearia/ui", "@barbearia/contracts"],
  // Os links de convite e de recuperação trazem um token na URL: não deixa o
  // token vazar para outros sites pelo cabeçalho Referer.
  headers() {
    const semReferer = [{ key: "Referrer-Policy", value: "no-referrer" }];
    return Promise.resolve([
      { source: "/convite/:token*", headers: semReferer },
      { source: "/redefinir-senha/:token*", headers: semReferer },
    ]);
  },
};

export default config;
