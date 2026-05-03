import React, { useMemo } from "react";

const colors = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
];

const pickColor = (value = "") => {
  const normalized = value.toString();
  let hash = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export default function Avatar({ label }) {
  const initials = useMemo(() => {
    if (!label) return "U";
    const parts = label.split(" ").filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }, [label]);

  const colorClass = useMemo(() => pickColor(label), [label]);

  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-semibold ${colorClass}`}
      aria-label={`Avatar for ${label || "user"}`}
    >
      {initials}
    </div>
  );
}
