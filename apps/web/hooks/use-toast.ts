"use client";

import { toast } from "sonner";

export type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
};

/** Toast hook — uses sonner under the hood. */
export function useToast() {
  return {
    toast: (props: ToastProps) => {
      const { title, description, variant } = props;
      if (variant === "destructive") {
        toast.error(title, { description });
      } else if (variant === "success") {
        toast.success(title, { description });
      } else {
        toast(title, { description });
      }
    },
  };
}

export { toast };
