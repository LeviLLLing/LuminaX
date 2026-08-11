"use client";

import { RefObject, useEffect } from "react";

export function useAutoScroll<TElement extends HTMLElement, TDependency>(
  ref: RefObject<TElement | null>,
  dependency: TDependency
) {
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [dependency, ref]);
}
