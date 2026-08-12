function SearchInput({ value, onChange, onClear, placeholder, className = "", ...props }) {
  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-0 grid w-11 place-items-center text-slate-400">
        <i className="fa-solid fa-magnifying-glass text-sm" />
      </span>
      <input
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-10 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={onClear}
          className="absolute inset-y-0 right-1 grid w-9 place-items-center rounded-lg text-slate-400 transition hover:text-slate-700"
          aria-label="Clear search"
        >
          <i className="fa-solid fa-xmark text-sm" />
        </button>
      )}
    </div>
  );
}

export default SearchInput;
