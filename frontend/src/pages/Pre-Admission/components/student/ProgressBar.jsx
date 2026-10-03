import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  ClipboardList,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  User,
  Check,
  FileText,
} from "lucide-react";

const steps = [
  { label: "Application Details", icon: FileText, path: "/application-details" },
  { label: "Applicant Profile", icon: User, path: "/profile" },
  { label: "Educational Background", icon: BookOpen, path: "/education" },
  { label: "Documents", icon: ClipboardList, path: "/documents" },
  { label: "Schedule Appointment", icon: Calendar, path: "/schedule" },
];

const ProgressBar = ({ canProceed = false, isReadOnly = false, onNavigateAway = null }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const currentStep = steps.findIndex((step) => step.path === location.pathname);
  const activeIndex = currentStep === -1 ? 0 : currentStep;
  const isLastStep = activeIndex === steps.length - 1;

  const progressWidth = (activeIndex / (steps.length - 1)) * 100;

  const requestNavigation = async (path) => {
    if (onNavigateAway) {
      await onNavigateAway(path);
    } else {
      navigate(path);
    }
  };

  const handleNext = () => {
    if (activeIndex < steps.length - 1 && canProceed) {
      requestNavigation(steps[activeIndex + 1].path);
    }
  };

  const handleBack = () => {
    if (isReadOnly) return;

    if (activeIndex > 0) {
      requestNavigation(steps[activeIndex - 1].path);
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-4 md:py-6">
      <div className="relative mb-6">
        <div className="absolute top-5 md:top-7 left-[12.5%] right-[12.5%] h-1.5 bg-gray-200 rounded-full" />

        <div
          className="absolute top-5 md:top-7 left-[12.5%] h-1.5 bg-[#2e522a] transition-all duration-500 ease-in-out rounded-full shadow-sm z-0"
          style={{ width: `calc(${progressWidth}% * 0.75)` }}
        />

        <div className="flex justify-between relative z-10">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index <= activeIndex;
            const isCompleted = index < activeIndex;
            const isCurrent = index === activeIndex;

            const isLocked = (index > activeIndex && !canProceed);

            return (
              <div
                key={index}
                className={`flex flex-col items-center flex-1 transition-all ${isLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                onClick={() => {
                  if (!isLocked) requestNavigation(step.path);
                }}
              >
                <div
                  className={`w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-sm z-20 bg-white
                    ${isActive ? "border-[#2e522a]" : "border-gray-300"}`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5 md:w-6 md:h-6 text-[#2e522a]" strokeWidth={3} />
                  ) : (
                    <Icon className={`w-5 h-5 md:w-6 md:h-6 ${isActive ? "text-[#2e522a]" : "text-gray-400"}`} />
                  )}
                </div>
                <span className={`mt-3 text-[10px] md:text-xs lg:text-sm font-bold text-center tracking-tight px-1
                    ${isActive ? "text-slate-800" : "text-gray-400 font-medium"} 
                    ${!isCurrent ? "hidden md:block" : "block"}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between bg-white p-2 md:p-4 rounded-md shadow-md border border-gray-100">
        <button
          onClick={handleBack}
          disabled={isReadOnly || activeIndex === 0}
          className={`p-2 rounded-md border transition-all active:scale-90 border-[#2e522a]/20 text-[#2e522a] hover:bg-[#2e522a]/10 ${isReadOnly || activeIndex === 0 ? "opacity-50 cursor-not-allowed bg-gray-100" : ""
            }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3">
          {React.createElement(steps[activeIndex].icon, {
            className: "w-5 h-5 md:w-6 md:h-6 text-[#2e522a]",
          })}
          <span className="font-bold text-[#2e522a] text-sm md:text-lg lg:text-xl uppercase">
            {steps[activeIndex].label}
          </span>
        </div>

        <button
          onClick={handleNext}
          disabled={isLastStep || !canProceed}
          className={`p-2 rounded-md transition-all active:scale-90 ${isLastStep || !canProceed
              ? "bg-gray-300 cursor-not-allowed opacity-50"
              : "bg-[#2e522a] hover:bg-[#1a3018]"
            }`}
        >
          <ChevronRight className="w-5 h-5 text-white" />
        </button>
      </div>
    </div>
  );
};

export default ProgressBar;
