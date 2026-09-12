import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Large Excel workbook uploads travel through server actions.
      bodySizeLimit: "50mb",
    },
  },
  serverExternalPackages: ["exceljs", "@prisma/client", "pg"],
};

export default nextConfig;
