const toneClasses = {
  slate: "bg-slate-100 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  red: "bg-rose-50 text-rose-700",
  green: "bg-emerald-50 text-emerald-700",
};

function StatCard({ label, value, caption, icon, tone = "slate", featured = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-40 w-full flex-col justify-between rounded-2xl border p-5 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        featured
          ? "border-emerald-900 bg-[#1f5a3c] text-white shadow-md shadow-emerald-950/10"
          : "border-slate-200 bg-white text-slate-900 shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
            featured ? "bg-white/12 text-emerald-50" : toneClasses[tone]
          }`}
        >
          {label}
        </span>
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl transition-transform group-hover:scale-105 ${
            featured ? "bg-white/10 text-white" : toneClasses[tone]
          }`}
        >
          <i className={`${icon} text-sm`} />
        </span>
      </div>
      <div className="mt-5">
        <p className={`text-3xl font-extrabold tracking-tight ${featured ? "text-white" : "text-slate-900"}`}>{value}</p>
        <p className={`mt-1 text-sm ${featured ? "text-emerald-100/80" : "text-slate-500"}`}>{caption}</p>
      </div>
    </button>
  );
}

export default StatCard;
