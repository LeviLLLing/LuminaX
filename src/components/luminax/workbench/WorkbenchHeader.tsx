import { Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ProductBrandBar } from "@/components/luminax/ProductBrandBar";
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
    <ProductBrandBar
      compact
      contextLabel={template.label}
      actions={
        <>
          <div className="hidden min-w-0 items-center gap-1.5 text-sm text-white/75 sm:flex">
            <UserRound className="size-4 shrink-0" aria-hidden="true" />
            <span className="max-w-32 truncate">{user.displayName}</span>
          </div>
          {context.canAccessAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/admin"
                  aria-label="进入管理后台"
                  className="grid size-9 place-items-center rounded-md text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Settings className="size-4" />
                  <span className="sr-only">进入管理后台</span>
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">管理后台</TooltipContent>
            </Tooltip>
          )}

          <LogoutButton className="grid size-9 place-items-center rounded-md text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50" />
        </>
      }
    />
  );
}
