import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Avatar } from "@/shared/components/ui/avatar";

export function OnlineUsersIndicator({ users = [] }) {
  if (!users.length) return null;

  return (
    <TooltipPrimitive.Root delayDuration={200}>
      <TooltipPrimitive.Trigger asChild>
        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[11px] font-medium cursor-default select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {users.length} online
        </span>
      </TooltipPrimitive.Trigger>

      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-[400] bg-popover border border-border rounded-md shadow-md p-2 min-w-[160px]"
        >
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 px-1">
            Online now
          </p>
          <div className="flex flex-col gap-0.5">
            {users.map((p) => (
              <div
                key={p.user.id}
                className="flex items-center gap-2 px-1 py-1 rounded hover:bg-accent"
              >
                <div className="relative flex-shrink-0">
                  <Avatar
                    user={p.user}
                    name={p.user.full_name || p.user.email}
                    src={p.user.avatar}
                    size="xs"
                  />
                  <span className="absolute bottom-0 right-0 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-background" />
                </div>
                <span className="text-xs text-foreground truncate">
                  {p.user.full_name || p.user.email}
                </span>
              </div>
            ))}
          </div>
          <TooltipPrimitive.Arrow
            className="fill-popover"
            width={8}
            height={4}
          />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
