function QuickActionCard({ icon, title, description, onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex min-h-36 flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 transition group-hover:bg-emerald-700 group-hover:text-white">
        <i className={`${icon} text-lg`} />
      </span>
      <span className="mt-5">
        <span className="block text-sm font-bold text-slate-900">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
    </button>
  );
}

export default QuickActionCard;
