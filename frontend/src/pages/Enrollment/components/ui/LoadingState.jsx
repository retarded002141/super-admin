function LoadingState({ label = "Loading data..." }) {
  return (
    <div className="flex min-h-80 flex-col items-center justify-center gap-4 p-10 text-slate-500">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
        <i className="fa-solid fa-circle-notch fa-spin text-xl" />
      </span>
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

export default LoadingState;
