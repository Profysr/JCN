import { Avatar } from "@/shared/components/ui/avatar";

export default function EmployeeCard({ node, onQuickView }) {
  return (
    <button
      type="button"
      onClick={() => onQuickView(node)}
      title="Quick view"
      className="w-full text-left rounded-md border border-border bg-card p-4 shadow-sm hover:shadow-card-hover hover:border-primary/30 transition-all duration-150 group/card"
    >
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
        {/* <Eye className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/50 group-hover/card:text-primary transition-colors" /> */}
      </div>
    </button>
  );
}
