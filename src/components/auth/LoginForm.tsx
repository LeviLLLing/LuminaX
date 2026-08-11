"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submittedUsername = String(formData.get("username") || "").trim();
    const submittedPassword = String(formData.get("password") || "");
    if (!submittedUsername || !submittedPassword) {
      setError("请输入用户名和密码。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: submittedUsername,
          password: submittedPassword,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setError(payload.error || "登录失败，请稍后重试。");
        return;
      }
      window.location.replace(nextPath);
    } catch {
      setError("登录服务暂时不可用。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-[#f3f4f6] lg:grid-cols-[minmax(280px,0.75fr)_minmax(440px,1.25fr)]">
      <section className="flex min-h-44 flex-col justify-between border-b-4 border-[#FFE600] bg-[#18181b] p-6 text-white lg:min-h-screen lg:border-b-0 lg:border-r-4">
        <div className="text-xl font-semibold text-[#FFE600]">LuminaX</div>
        <div className="max-w-md pb-2 lg:pb-12">
          <h1 className="text-2xl font-semibold sm:text-3xl">灵犀经营智能引擎</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            门店经营指标、报表与归因分析工作台
          </p>
        </div>
        <div className="hidden text-xs text-zinc-500 lg:block">LuminaX POC</div>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <form
          onSubmit={submit}
          className="w-full max-w-sm overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
        >
          <div className="border-b border-zinc-200 px-6 py-5">
            <h2 className="text-lg font-semibold text-zinc-950">登录 LuminaX</h2>
            <p className="mt-1 text-sm text-zinc-500">使用已授权的系统账号</p>
          </div>

          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="login-username">用户名</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="login-username"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="pl-9"
                  placeholder="请输入用户名"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">密码</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="px-9"
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  title={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-1 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                  <span className="sr-only">
                    {showPassword ? "隐藏密码" : "显示密码"}
                  </span>
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#18181b] text-white hover:bg-zinc-800"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              登录
            </Button>
          </div>
        </form>
      </section>
    </main>
  );
}
