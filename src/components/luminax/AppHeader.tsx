import type { ViewMode } from "@/modules/domain/ui-types";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { BRAND_BLACK, BRAND_YELLOW } from "@/modules/domain/constants";
import { Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";

interface AppHeaderProps {
  user: AuthenticatedUser;
  viewMode: ViewMode;
  onBackToChat: () => void;
}

export function AppHeader({ user, viewMode, onBackToChat }: AppHeaderProps) {
  return (
    <header
      className="flex min-h-14 flex-shrink-0 items-center justify-between gap-3 border-b-4 px-3 py-2 sm:px-6"
      style={{ backgroundColor: BRAND_BLACK, borderColor: BRAND_YELLOW }}
    >
      <h1
        className="truncate text-base font-bold tracking-normal sm:text-xl"
        style={{ color: BRAND_YELLOW }}
      >
        LuminaX-灵犀经营智能引擎
      </h1>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
        {user.role === "super_admin" && (
          <Link
            href="/admin"
            title="管理后台"
            className="grid size-8 place-items-center rounded text-[#FFE600] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFE600]"
          >
            <Settings className="size-4" />
            <span className="sr-only">管理后台</span>
          </Link>
        )}
        {viewMode !== "chat" && (
          <button
            onClick={onBackToChat}
            className="px-3 py-1 rounded text-xs font-medium transition-colors"
            style={{ backgroundColor: BRAND_YELLOW, color: BRAND_BLACK }}
          >
            返回对话
          </button>
        )}
        <div
          className="hidden items-center gap-1.5 text-xs sm:flex"
          style={{ color: BRAND_YELLOW }}
        >
          <UserRound className="size-3.5" />
          <span className="max-w-28 truncate opacity-80">{user.displayName}</span>
        </div>
        <LogoutButton className="grid size-8 place-items-center rounded text-[#FFE600] transition-colors hover:bg-white/10 disabled:opacity-50" />
      </div>
    </header>
  );
}
