import { Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AuthenticatedUser } from "@/modules/auth/auth-types";
import { getWorkbenchCopy } from "@/modules/workbench/workbench-presentation";
import type { WorkbenchContext } from "@/modules/workbench/workbench-types";

interface WorkbenchHeaderProps {
  user: AuthenticatedUser;
  context: WorkbenchContext;
}

export function WorkbenchHeader({ user, context }: WorkbenchHeaderProps) {
  const template = getWorkbenchCopy(context.templateId);

  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b-[3px] border-[#FFE600] bg-white px-3 py-2 text-black sm:px-4">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="shrink-0 text-base font-bold sm:text-lg">LuminaX</h1>
        <span className="min-w-0 truncate border-l border-[#dedfe2] pl-2 text-xs font-medium text-[#4b4e55] sm:text-sm">
          {template.label}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <div className="hidden min-w-0 items-center gap-1.5 text-sm text-[#303238] sm:flex">
          <UserRound className="size-4 shrink-0" aria-hidden="true" />
          <span className="max-w-32 truncate">{user.displayName}</span>
        </div>

        {context.canAccessAdmin && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/admin"
                aria-label="Settings"
                className="grid size-9 place-items-center rounded-md text-black transition-colors hover:bg-[#f5f6f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
              >
                <Settings className="size-4" />
                <span className="sr-only">Settings</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">Settings</TooltipContent>
          </Tooltip>
        )}

        <LogoutButton className="grid size-9 place-items-center rounded-md text-black transition-colors hover:bg-[#f5f6f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-50" />
      </div>
    </header>
  );
}
