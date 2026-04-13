// Shared confirm-reset dialog (issue #44).
//
// Parent-controlled AlertDialog used by screens that need to confirm
// abandoning an in-progress session before navigating home. The dialog
// itself has no one-shot logic — the parent decides when to open it
// by passing `open` and reacting to `onOpenChange`.

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ConfirmResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function ConfirmResetDialog({
  open,
  onOpenChange,
  onConfirm,
}: ConfirmResetDialogProps) {
  function handleConfirm() {
    onConfirm();
    onOpenChange(false);
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[300px] sm:max-w-[320px]">
        <AlertDialogHeader>
          <AlertDialogTitle>Start a new conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            Your current progress will be lost. You can also resume the session
            from the sidebar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Start over
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
