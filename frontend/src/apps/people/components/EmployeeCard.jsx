import { Eye } from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";

export default function EmployeeCard({ node, onQuickView }) {
  return (
    <div className="w-full text-left rounded-md border border-border bg-card p-4 shadow-sm hover:shadow-card-hover hover:border-primary/30 transition-all duration-150 group/card">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar user={node} name={node.name || node.email} size="lg" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {node.name || node.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {node.job_title ?? "—"}
            </p>
          </div>
        </div>
        <button
          onClick={() => onQuickView(node)}
          className="flex-shrink-0 flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          title="Quick view"
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
