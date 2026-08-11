"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";

interface LogoutButtonProps {
  className?: string;
  showLabel?: boolean;
}

export function LogoutButton({
  className = "",
  showLabel = false,
}: LogoutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function logout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loading}
      title="退出登录"
      className={className}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <LogOut className="size-4" />
      )}
      {showLabel && <span>退出登录</span>}
      <span className="sr-only">退出登录</span>
    </button>
  );
}

