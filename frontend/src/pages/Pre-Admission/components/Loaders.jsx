import React from "react";

export function PageLoader({ message = "Please wait..." }) {
  return (
    <div className="h-screen w-full flex flex-col items-center justify-center bg-gray-50 gap-5">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-20 h-20 rounded-full border-4 border-[#376e35]/20 border-t-[#376e35] animate-spin" />
      </div>

      <p className="mt-8 text-sm font-medium text-gray-500 tracking-wide">{message}</p>
    </div>
  );
}

export function ButtonSpinner({ className = "" }) {
  return (
    <svg
      className={`animate-spin h-4 w-4 inline-block mr-2 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8z"
      />
    </svg>
  );
}
