import { useMemo } from "react";
import { UserCircle2 } from "lucide-react";
import { Avatar } from "@/shared/components/ui/avatar";
import { cn } from "@/shared/lib/utils";
import { getPriority } from "@/shared/lib/constants";

function MiniTaskCard({ task, onClick }) {
  const { textCls, icon: PriorityIcon } = getPriority(task.priority);
  return (
    <div
      onClick={() => onClick(task.id)}
      className="bg-card border rounded px-2.5 py-2 cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all"
    >
      <div className="flex items-start gap-2">
        <PriorityIcon className={cn("w-3.5 h-3.5 flex-shrink-0 mt-[1px]", textCls)} />
        <span className="text-xs leading-relaxed line-clamp-2 flex-1 min-w-0">
          {task.title}
        </span>
      </div>
    </div>
  );
}

// Derive a stable user id + display info from a WorkspaceMember object.
// The API may embed user as a nested object or flatten fields — handle both.
function resolveMember(member) {
  const user = member.user ?? null;
  const userId = user?.id;
  const name = user?.full_name || user?.email || "Unknown";
  const avatar = user?.avatar;
  return { user, userId, name, avatar };
}

export default function SprintSwimLanes({
  tasks,
  statuses,
  members,
  onTaskClick,
}) {
  // Group sprint tasks by primary assignee's user id
  const { laneData, unassigned } = useMemo(() => {
    const byUser = {};
    const unassigned = [];

    for (const task of tasks) {
      const uid = task.assignee?.id;
      if (uid) {
        (byUser[uid] ||= []).push(task);
      } else {
        unassigned.push(task);
      }
    }

    // Build lane rows in member order
    const laneData = members.map((member) => {
      const { user, userId, name, avatar } = resolveMember(member);
      return { member, user, userId, name, avatar, tasks: byUser[userId] || [] };
    });

    return { laneData, unassigned };
  }, [tasks, members]);

  const cellTasks = (taskList, statusId) =>
    taskList
      .filter((t) => t.status_id === statusId)
      .sort((a, b) => a.order - b.order);

  const hasTasks =
    laneData.some((l) => l.tasks.length > 0) || unassigned.length > 0;

  if (!hasTasks) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        No tasks in this sprint yet.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* min-w forces horizontal scroll if columns overflow */}
      <div style={{ minWidth: `${192 + statuses.length * 212}px` }}>
        {/* ── Sticky column header ── */}
        <div className="flex sticky top-0 bg-background/95 backdrop-blur-sm border-b">
          {/* Person column */}
          <div className="w-48 flex-shrink-0 px-4 py-3 border-r">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Team member
            </span>
          </div>
          {statuses.map((status) => (
            <div
              key={status.id}
              className="w-[212px] flex-shrink-0 px-4 py-3 border-r last:border-r-0"
              style={{ borderTopColor: status.color, borderTopWidth: 2 }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: status.color }}
                />
                <span className="text-xs font-semibold truncate">
                  {status.name}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Member rows ── */}
        {laneData.map(
          ({ member, user, userId, name, avatar, tasks: memberTasks }) => {
            const doneCount = memberTasks.filter((t) =>
              statuses.find((s) => s.id === t.status_id && s.is_done),
            ).length;

            return (
              <div
                key={member.id || userId}
                className="flex border-b hover:bg-muted/20 transition-colors"
              >
                {/* Person cell */}
                <div className="w-48 flex-shrink-0 px-4 py-4 border-r flex flex-col gap-1">
                  <div className="flex items-center gap-2.5">
                    <Avatar user={user} name={name} src={avatar} size="sm" />
                    <span className="text-sm font-medium leading-tight truncate">
                      {name.split(" ")[0]}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground pl-8">
                    {memberTasks.length === 0 ? (
                      <span className="text-muted-foreground/50">No tasks</span>
                    ) : (
                      `${doneCount}/${memberTasks.length} done`
                    )}
                  </div>
                </div>

                {/* Status cells */}
                {statuses.map((status) => {
                  const cell = cellTasks(memberTasks, status.id);
                  return (
                    <div
                      key={status.id}
                      className="w-[212px] flex-shrink-0 px-2.5 py-3 border-r last:border-r-0 flex flex-col gap-1.5"
                    >
                      {cell.length > 0 ? (
                        cell.map((task) => (
                          <MiniTaskCard
                            key={task.id}
                            task={task}
                            onClick={onTaskClick}
                          />
                        ))
                      ) : (
                        <div className="h-10 border border-dashed border-border/40 rounded-lg" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          },
        )}

        {/* ── Unassigned row ── */}
        {unassigned.length > 0 && (
          <div className="flex border-b bg-muted/10">
            <div className="w-48 flex-shrink-0 px-4 py-4 border-r flex flex-col gap-1">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <UserCircle2 className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <span className="text-sm text-muted-foreground font-medium">
                  Unassigned
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground pl-8">
                {unassigned.length} task{unassigned.length !== 1 ? "s" : ""}
              </div>
            </div>
            {statuses.map((status) => {
              const cell = cellTasks(unassigned, status.id);
              return (
                <div
                  key={status.id}
                  className="w-[212px] flex-shrink-0 px-2.5 py-3 border-r last:border-r-0 flex flex-col gap-1.5"
                >
                  {cell.length > 0 ? (
                    cell.map((task) => (
                      <MiniTaskCard
                        key={task.id}
                        task={task}
                        onClick={onTaskClick}
                      />
                    ))
                  ) : (
                    <div className="h-10 border border-dashed border-border/40 rounded-lg" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
