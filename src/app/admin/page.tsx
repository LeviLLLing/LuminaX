import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { Toaster } from "@/components/ui/sonner";
import { getPageUser } from "@/modules/auth/auth-page";

export const metadata: Metadata = {
  title: "管理后台 | LuminaX",
  description: "LuminaX 指标、权限与报表配置后台",
};

export default async function AdminPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "super_admin") redirect("/");
  return (
    <>
      <AdminShell user={user} />
      <Toaster position="top-right" richColors />
    </>
  );
}
