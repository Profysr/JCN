import { useEffect, useRef, useState } from "react";
import { BarChart2, Activity, AlertTriangle, CheckCheck } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { useWorkspaceSummary } from "@/shared/hooks/useAnalyticsV2";

function useCountUp(target, duration = 900) {
  const [count, setCount] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (target === undefined || target === null) return;
    const startTime = performance.now();

    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress); // easeOutExpo
      setCount(Math.round(ease * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    }

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return count;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
  }),
};

const shimmer = {
  animate: { x: ["−100%", "100%"] },
  transition: { duration: 1.5, repeat: Infinity, ease: "linear" },
};

function ShimmerBlock({ className }) {
  return (
    <div className={cn("relative overflow-hidden rounded bg-muted", className)}>
      <motion.div
        animate={shimmer.animate}
        transition={shimmer.transition}
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}

function StatCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-start gap-3">
      <ShimmerBlock className="w-10 h-10 flex-shrink-0" />
      <div className="min-w-0 flex flex-col gap-2 pt-0.5">
        <ShimmerBlock className="h-7 w-14" />
        <ShimmerBlock className="h-3 w-20" />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color = "bg-primary/10 text-primary",
  icon: Icon,
  loading,
  index,
}) {
  const displayed = useCountUp(loading ? undefined : value);

  if (loading) return <StatCardSkeleton />;

  return (
    <motion.div
      custom={index}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      className="bg-card border border-border rounded-md flex-1 min-w-[20rem] h-24 p-4 shadow-sm flex items-start gap-3 cursor-default transition-shadow duration-200 hover:shadow-md"
    >
      {Icon && (
        <motion.div
          whileHover={{ scale: 1.1 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            color,
          )}
        >
          <Icon className="w-5 h-5" />
        </motion.div>
      )}
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums">{displayed ?? "—"}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </motion.div>
  );
}

export default function KpiSection({ workspaceId, filterParams }) {
  const { data, isLoading } = useWorkspaceSummary(workspaceId, { params: filterParams });

  const cards = [
    {
      label: "Total Tasks",
      value: data?.total,
      icon: BarChart2,
      color:
        "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
    },
    {
      label: "Open Tasks",
      value: data?.open,
      icon: Activity,
      color:
        "bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-300",
    },
    {
      label: "Overdue",
      value: data?.overdue,
      icon: AlertTriangle,
      color: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300",
    },
    {
      label: "Done",
      value: data?.done,
      icon: CheckCheck,
      color: "bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-300",
    },
  ];

  return (
    <div className="flex flex-wrap gap-4 w-full">
      {cards.map((card, i) => (
        <StatCard key={card.label} {...card} loading={isLoading} index={i} />
      ))}
    </div>
  );
}
