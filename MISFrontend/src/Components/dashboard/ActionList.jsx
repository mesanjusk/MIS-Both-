import PropTypes from "prop-types";

const delayBadgeClass = (delayDays) => {
  if (delayDays >= 3) return "bg-rose-100 text-rose-700";
  if (delayDays >= 1) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
};

const delayLabel = (delayDays) => {
  if (delayDays <= 0) return "On Time";
  if (delayDays === 1) return "1 Day Late";
  return `${delayDays} Days Delayed`;
};

export default function ActionList({ title, items }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-900">{title}</h3>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
            Nothing pending here.
          </p>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">Assigned to: {item.assignedTo || "Unassigned"}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${delayBadgeClass(item.delayDays)}`}>
                  {delayLabel(item.delayDays)}
                </span>
              </div>

              <p className="mt-2 text-xs text-slate-500">Due: {item.dueDateLabel}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

ActionList.propTypes = {
  title: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      title: PropTypes.string,
      assignedTo: PropTypes.string,
      dueDateLabel: PropTypes.string,
      delayDays: PropTypes.number,
    })
  ).isRequired,
};
