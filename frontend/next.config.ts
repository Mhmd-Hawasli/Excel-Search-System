import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL ?? "http://localhost:5000";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  // The frontend never accesses Postgres, Prisma or Excel directly. All
  // `/api/*` requests are proxied by Next to the ASP.NET backend.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
