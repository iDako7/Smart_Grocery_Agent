import { useState, useEffect } from "react";

interface ToastProps {
  message: string;
  duration?: number;
  testId?: string;
}

export function Toast({ message, duration = 2000, testId }: ToastProps) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!show) return null;

  return (
    <div
      data-testid={testId ?? "toast"}
      className="mx-3.5 mt-1 mb-0.5 px-3 py-1.5 bg-jade text-cream rounded-xl text-[11px] font-semibold text-center"
    >
      {message}
    </div>
  );
}
