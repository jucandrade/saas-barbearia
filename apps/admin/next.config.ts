import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@barbearia/ui", "@barbearia/contracts"],
};

export default config;
