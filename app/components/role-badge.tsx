interface RoleBadgeProps {
  role: "mentor" | "mentee" | "admin" | "prof";
  className?: string;
}

const ROLE_CONFIG = {
  admin: {
    label: "Admin",
    className: "bg-red-700 text-red-100",
  },
  prof: {
    label: "Professor",
    className: "bg-indigo-800 text-indigo-100",
  },
  mentor: {
    label: "Mentor",
    className: "bg-emerald-700 text-emerald-100",
  },
  mentee: {
    label: "Mentee",
    className: "bg-slate-700 text-slate-200",
  },
} as const;

export function RoleBadge({ role, className = "" }: RoleBadgeProps) {
  const config = ROLE_CONFIG[role];

  return (
    <span
      className={`px-2 py-1 rounded text-xs font-semibold ${config.className} ${className}`}
    >
      {config.label}
    </span>
  );
}
