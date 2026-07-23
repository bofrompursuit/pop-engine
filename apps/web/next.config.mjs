/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared rules engine ships as TypeScript source from the workspace.
  transpilePackages: ["@pop-engine/engine"],
};

export default nextConfig;
