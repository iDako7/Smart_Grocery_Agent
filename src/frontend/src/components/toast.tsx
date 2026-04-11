import { useState, useEffect } from "react";

export function Toast({ message, duration = 2000 }: { message: string; duration?: number }) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setShow(false), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  if (!show) return null;

  return (
    <div
      data-testid="saved-toast"
      className="mx-3.5 mt-1 mb-0.5 px-4 py-2.5 bg-jade text-cream rounded-xl text-[13px] font-semibold text-center"
    >
      {message}
    </div>
  );
}
