import { requireAdmin } from "@/lib/auth/guards";
export const dynamic = "force-dynamic";
export default async function ReviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return children;
}
