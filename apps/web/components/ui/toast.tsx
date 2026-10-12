"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { cn } from "cn"
import { CircleAlertIcon, CircleCheckIcon, XIcon } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

/**
 * Below `lg`: the top of the screen under the mobile header (`--toast-top`, raised by pages with their own sticky header),
 * 16px gutters, newest first. From `lg`: the bottom-right corner, newest at the bottom.
 */
function ToastViewport({ className, ...props }: ToastPrimitive.Viewport.Props) {
  return (
    <ToastPrimitive.Viewport
      data-slot="toast-viewport"
      className={cn(
        "fixed inset-x-4 top-(--toast-top) z-100 flex flex-col gap-2 outline-none lg:inset-x-auto lg:top-auto lg:right-6 lg:bottom-6 lg:w-96 lg:flex-col-reverse",
        className
      )}
      {...props}
    />
  )
}

/**
 * Slides down into place below `lg` and up from `lg`.
 * Base UI marks toasts as dialogs. Success toasts are exposed as `status` (polite) and error toasts as
 * `alert`; error toasts also get the primitive's urgent announcement (priority "high").
 */
function Toast({
  className,
  toast,
  ...props
}: ToastPrimitive.Root.Props) {
  return (
    <ToastPrimitive.Root
      data-slot="toast"
      toast={toast}
      role={toast.type === "error" ? "alert" : "status"}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-floating ring-1 ring-foreground/10 transition-[opacity,translate] duration-200 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 data-ending-style:-translate-y-2 data-ending-style:opacity-0 data-limited:hidden data-starting-style:-translate-y-2 data-starting-style:opacity-0 lg:data-ending-style:translate-y-2 lg:data-starting-style:translate-y-2 motion-reduce:transition-none",
        className
      )}
      {...props}
    />
  )
}

function ToastTitle({ className, ...props }: ToastPrimitive.Title.Props) {
  return (
    <ToastPrimitive.Title
      data-slot="toast-title"
      className={cn("min-w-0 flex-1 font-medium wrap-break-word", className)}
      {...props}
    />
  )
}

/** Base UI hides the close button from assistive tech until the stack is expanded; this one is always exposed. */
function ToastClose({ className, ...props }: ToastPrimitive.Close.Props) {
  return (
    <ToastPrimitive.Close
      data-slot="toast-close"
      aria-hidden={false}
      aria-label="Dismiss"
      className={cn(
        buttonVariants({ variant: "ghost", size: "icon" }),
        "-my-1 -mr-1 size-11 shrink-0 text-muted-foreground sm:size-8",
        className
      )}
      {...props}
    >
      <XIcon aria-hidden="true" />
    </ToastPrimitive.Close>
  )
}

/** One app-wide region; render once inside `ToastProvider`. */
function Toaster() {
  const { toasts } = ToastPrimitive.useToastManager()

  return (
    <ToastPrimitive.Portal>
      <ToastViewport>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast}>
            {toast.type === "error" ? (
              <CircleAlertIcon aria-hidden="true" className="size-5 shrink-0 text-destructive" />
            ) : (
              <CircleCheckIcon aria-hidden="true" className="size-5 shrink-0 text-success" />
            )}
            <ToastTitle />
            <ToastClose />
          </Toast>
        ))}
      </ToastViewport>
    </ToastPrimitive.Portal>
  )
}

export { ToastProvider, Toaster }
