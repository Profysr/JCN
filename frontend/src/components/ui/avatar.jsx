import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "bg-indigo-500 text-white",
  "bg-violet-500 text-white",
  "bg-blue-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-500 text-white",
  "bg-rose-500 text-white",
  "bg-cyan-500 text-white",
  "bg-pink-500 text-white",
  "bg-sky-500 text-white",
  "bg-teal-500 text-white",
];

function getAvatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const sizeMap = {
  xs:  { outer: "w-5 h-5",   text: "text-[9px]" },
  sm:  { outer: "w-6 h-6",   text: "text-[10px]" },
  md:  { outer: "w-8 h-8",   text: "text-xs" },
  lg:  { outer: "w-10 h-10", text: "text-sm" },
  xl:  { outer: "w-12 h-12", text: "text-base" },
  "2xl": { outer: "w-14 h-14", text: "text-2xl" },
};

export function Avatar({ name, src, size = "md", className, ring = false }) {
  const { outer, text } = sizeMap[size] || sizeMap.md;
  const color = getAvatarColor(name);
  const initial = name?.[0]?.toUpperCase() || "?";

  const base = cn(
    "rounded-full flex-shrink-0 select-none flex items-center justify-center font-semibold",
    outer,
    ring && "ring-2 ring-background",
    className
  );

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        title={name}
        className={cn(base, "object-cover")}
      />
    );
  }

  return (
    <div className={cn(base, color)} title={name}>
      <span className={text}>{initial}</span>
    </div>
  );
}

// export function AvatarGroup({ users = [], max = 3, size = "sm", className }) {
//   const visible = users.slice(0, max);
//   const overflow = users.length - max;

//   return (
//     <div className={cn("flex -space-x-1.5", className)}>
//       {visible.map((user, i) => (
//         <Avatar
//           key={user.id || i}
//           name={user.display_name || user.full_name || user.email}
//           src={user.avatar}
//           size={size}
//           ring
//         />
//       ))}
//       {overflow > 0 && (
//         <div
//           className={cn(
//             "rounded-full flex items-center justify-center font-semibold",
//             "bg-muted text-muted-foreground ring-2 ring-background",
//             sizeMap[size]?.outer || sizeMap.sm.outer,
//             "text-[9px]"
//           )}
//           title={`${overflow} more`}
//         >
//           +{overflow}
//         </div>
//       )}
//     </div>
//   );
// }
