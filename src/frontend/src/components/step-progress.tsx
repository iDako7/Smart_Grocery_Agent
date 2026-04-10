import { cn } from "@/lib/utils";

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  label: string;
}

export function StepProgress({ currentStep, totalSteps, label }: StepProgressProps) {
  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={currentStep}
      aria-label={`Step ${currentStep} of ${totalSteps}: ${label}`}
    >
      <div className="flex items-center gap-0 px-[22px] pt-2 pb-1">
        {Array.from({ length: totalSteps }, (_, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < currentStep;
          const isActive = stepNum === currentStep;

          return (
            <div key={stepNum} className="contents">
              <div
                data-testid={`step-dot-${stepNum}`}
                className={cn(
                  "w-2 h-2 rounded-full shrink-0",
                  isDone && "bg-jade",
                  isActive && "bg-persimmon",
                  !isDone && !isActive && "bg-cream-deep"
                )}
              />
              {stepNum < totalSteps && (
                <div
                  data-testid={`step-line-${stepNum}`}
                  className={cn(
                    "flex-1 h-0.5",
                    isDone ? "bg-jade" : "bg-cream-deep"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="px-[22px] pb-1.5 text-[10px] text-ink-3 font-medium">
        Step {currentStep} of {totalSteps} — {label}
      </div>
    </div>
  );
}
