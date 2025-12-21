interface RoleBadgeProps {
  role: "mentor" | "mentee";
  className?: string;
}

export function RoleBadge({ role, className = "" }: RoleBadgeProps) {
  return (
    <span
      className={`px-2 py-1 rounded text-xs font-semibold ${
        role === "mentor"
          ? "bg-yellow-500 text-yellow-900"
          : "bg-green-500 text-green-900"
      } ${className}`}
    >
      {role === "mentor" ? "Mentor" : "Mentee"}
    </span>
  );
}
