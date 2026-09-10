"use client";

import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductBrandBar } from "@/components/luminax/ProductBrandBar";

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
    <main className="flex min-h-[100dvh] flex-col bg-[var(--luminax-canvas)]">
      <ProductBrandBar contextLabel="经营决策工作台" />

      <section className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <form
          onSubmit={submit}
          aria-busy={loading}
          className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        >
          <div className="border-b border-border px-6 py-5 sm:px-8">
            <h1 className="text-xl font-semibold text-foreground">登录工作台</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              使用已授权的 LuminaX 系统账号
            </p>
          </div>

          <div className="space-y-5 px-6 py-6 sm:px-8 sm:py-8">
            <div className="space-y-2">
              <Label htmlFor="login-username">用户名</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-username"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-11 pl-9"
                  placeholder="请输入用户名"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">密码</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 pl-9 pr-12"
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  title={showPassword ? "隐藏密码" : "显示密码"}
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
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
                className="rounded-md border border-[color-mix(in_srgb,var(--luminax-risk)_35%,white)] bg-[color-mix(in_srgb,var(--luminax-risk)_8%,white)] px-3 py-2 text-sm text-[var(--luminax-risk)]"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="h-11 w-full bg-[var(--luminax-ink)] text-white hover:bg-[color-mix(in_srgb,var(--luminax-ink)_88%,white)]"
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
