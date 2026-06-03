"use client";

import * as React from "react";
import type { ToastProps } from "@/shared/components/ui/toast";

const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 4000;

type ToastInput = Pick<ToastProps, "variant"> & {
  title?: string;
  description?: string;
};

type ToasterToast = ToastInput & {
  id: string;
  open: boolean;
};

type Action =
  | { type: "ADD"; toast: ToasterToast }
  | { type: "UPDATE"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS"; toastId?: string }
  | { type: "REMOVE"; toastId?: string };

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE", toastId });
  }, TOAST_REMOVE_DELAY);
  toastTimeouts.set(toastId, timeout);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };
    case "UPDATE":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
    case "DISMISS": {
      const { toastId } = action;
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      };
    }
    case "REMOVE":
      if (action.toastId === undefined) return { ...state, toasts: [] };
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
}

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return String(count);
}

type Listeners = Array<React.Dispatch<Action>>;
const listeners: Listeners = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((l) => l(action));
}

function toast(input: ToastInput) {
  const id = genId();

  const dismiss = () => dispatch({ type: "DISMISS", toastId: id });

  dispatch({
    type: "ADD",
    toast: { ...input, id, open: true },
  });

  return { id, dismiss };
}

toast.success = (title: string, description?: string) =>
  toast({ variant: "success", title, description });

toast.error = (title: string, description?: string) =>
  toast({ variant: "destructive", title, description });

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    const listener: React.Dispatch<Action> = (action) => {
      setState((prev) => reducer(prev, action));

      if (action.type === "ADD") {
        addToRemoveQueue(action.toast.id, dispatch);
      }
    };
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    toasts: state.toasts,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS", toastId }),
  };
}

export { useToast, toast };
