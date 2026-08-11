import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getPageUser } from "@/modules/auth/auth-page";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 LuminaX 经营分析工作台",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const nextPath = sanitizeNextPath(params.next);
  const user = await getPageUser();
  if (user) redirect(user.role === "super_admin" ? nextPath : "/");
  return <LoginForm nextPath={nextPath} />;
}

function sanitizeNextPath(value: string | string[] | undefined): string {
  const nextPath = Array.isArray(value) ? value[0] : value;
  return nextPath?.startsWith("/") && !nextPath.startsWith("//")
    ? nextPath
    : "/";
}

