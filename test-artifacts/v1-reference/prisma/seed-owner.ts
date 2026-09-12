import { pathToFileURL } from "node:url";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { OWNER_GLOBAL_PERMISSIONS } from "@/lib/auth/permissions";

export const OWNER_USERNAME = "mhmd";
const OWNER_INITIAL_PASSWORD = "mhmd123";

/**
 * Ensures the fully privileged system owner exists. The password is only set
 * on creation — re-running never reverts a password changed from the users
 * page — while global permissions are always restored to the full set.
 */
export async function ensureSystemOwner() {
  const owner = await prisma.user.upsert({
    where: { username: OWNER_USERNAME },
    update: { isActive: true, displayName: "مالك النظام" },
    create: {
      username: OWNER_USERNAME,
      passwordHash: await hashPassword(OWNER_INITIAL_PASSWORD),
      displayName: "مالك النظام",
      isActive: true,
    },
  });
  await prisma.userPermission.deleteMany({ where: { userId: owner.id } });
  await prisma.userPermission.createMany({
    data: OWNER_GLOBAL_PERMISSIONS.map((permission) => ({ userId: owner.id, permission })),
  });
  return owner;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  ensureSystemOwner()
    .then((owner) => console.log(`System owner ready: ${owner.username}`))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
