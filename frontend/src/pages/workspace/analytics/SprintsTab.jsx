import { Layers } from "lucide-react";

export default function SprintsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
      <div className="p-4 rounded-full bg-muted/60 text-muted-foreground">
        <Layers size={24} />
      </div>
      <p className="text-base font-semibold text-foreground">Sprint Analytics Coming Soon</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Velocity, burnup, and completion rate will appear here once sprint analytics are enabled.
      </p>
    </div>
  );
}
