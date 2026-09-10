import type { ReactNode } from "react";
import {
  AlertCircle,
  Ban,
  Inbox,
  LoaderCircle,
  type LucideIcon,
} from "lucide-react";

export type ProductStateKind = "loading" | "empty" | "denied" | "error";

export interface ProductStateProps {
  kind: ProductStateKind;
  title: string;
  description: string;
  action?: ReactNode;
}

const statePresentation: Record<
  ProductStateKind,
  { icon: LucideIcon; iconClassName: string }
> = {
  loading: {
    icon: LoaderCircle,
    iconClassName: "animate-spin text-[var(--luminax-data)]",
  },
  empty: {
    icon: Inbox,
    iconClassName: "text-[var(--luminax-data)]",
  },
  denied: {
    icon: Ban,
    iconClassName: "text-[var(--luminax-risk)]",
  },
  error: {
    icon: AlertCircle,
    iconClassName: "text-[var(--luminax-risk)]",
  },
};

export function ProductState({
  kind,
  title,
  description,
  action,
}: ProductStateProps) {
  const presentation = statePresentation[kind];
  const Icon = presentation.icon;
  const urgent = kind === "denied" || kind === "error";

  return (
    <section
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      data-product-state={kind}
      className="flex min-h-48 w-full flex-col items-center justify-center px-6 py-8 text-center"
    >
      <Icon
        aria-hidden="true"
        className={`size-6 ${presentation.iconClassName}`}
      />
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </section>
  );
}
