"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  content?: React.ReactNode;
  children: React.ReactNode;
  side?: "right" | "left" | "top" | "bottom";
  className?: string;
  disabled?: boolean;
}

export function Tooltip({ content, children, side = "right", className, disabled }: TooltipProps) {
  // If no content prop is provided, assume children are using the Provider/Trigger/Content pattern
  if (!content) {
    return <>{children}</>;
  }

  if (disabled) return <>{children}</>;

  const position =
    side === "right"
      ? "left-full ml-2 top-1/2 -translate-y-1/2"
      : side === "left"
        ? "right-full mr-2 top-1/2 -translate-y-1/2"
        : side === "top"
          ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
          : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <div className={cn("relative group inline-flex", className)}>
      {children}
      <div
        className={cn(
          "pointer-events-none invisible group-hover:visible absolute z-50 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg transition-opacity",
          position
        )}
        role="tooltip"
      >
        {content}
      </div>
    </div>
  );
}

// Export aliases for compatibility with shadcn/ui patterns
export const TooltipProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const TooltipTrigger = React.forwardRef<HTMLDivElement, { children: React.ReactNode; asChild?: boolean; className?: string }>(
  ({ children, asChild, className }, ref) => {
    if (asChild) {
      return <>{children}</>;
    }
    return <div ref={ref} className={className}>{children}</div>;
  }
);
TooltipTrigger.displayName = "TooltipTrigger";

export const TooltipContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn("absolute z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md", className)}>
    {children}
  </div>
);
