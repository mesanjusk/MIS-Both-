import PropTypes from "prop-types";

const statusStyles = {
  completed: {
    dot: "bg-emerald-500",
    ring: "ring-emerald-100 bg-emerald-50 text-emerald-700",
    text: "text-emerald-700",
  },
  pending: {
    dot: "bg-amber-500",
    ring: "ring-amber-100 bg-amber-50 text-amber-700",
    text: "text-amber-700",
  },
  delayed: {
    dot: "bg-rose-500",
    ring: "ring-rose-100 bg-rose-50 text-rose-700",
    text: "text-rose-700",
  },
};

export default function DashboardCard({ title, value, icon: Icon, status = "completed", caption }) {
  const style = statusStyles[status] || statusStyles.completed;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {caption ? <p className={`mt-2 text-xs font-medium ${style.text}`}>{caption}</p> : null}
        </div>
        <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ring-4 ${style.ring}`}>
          {Icon ? <Icon className="h-5 w-5" /> : null}
        </div>
      </div>

      <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
        <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
        <span className="capitalize">{status}</span>
      </div>
    </article>
  );
}

DashboardCard.propTypes = {
  title: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  icon: PropTypes.elementType,
  status: PropTypes.oneOf(["completed", "pending", "delayed"]),
  caption: PropTypes.string,
};
