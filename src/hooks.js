import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { registerLayer, registerMainButton } from "./telegram";

// Depth of the sheet a component renders in (0 = tab screen).
export const DepthContext = createContext(0);

export function useDepth() {
  return useContext(DepthContext);
}

// Registers a back-navigable layer. Layout effect so it lands before any
// main button registered by the sheet's children in the same commit.
export function useLayer(depth, onBack) {
  const handleRef = useRef(null);

  useLayoutEffect(() => {
    const handle = registerLayer(depth, () => {});
    handleRef.current = handle;
    return () => handle.remove();
  }, [depth]);

  useLayoutEffect(() => {
    handleRef.current?.update(onBack);
  });
}

// Telegram MainButton (or a sticky in-page button outside Telegram).
export function useMainButton({ text, onClick, enabled = true, visible = true }) {
  const depth = useDepth();
  const handleRef = useRef(null);
  const props = { text, onClick, enabled, visible };
  const propsRef = useRef(props);

  useEffect(() => {
    propsRef.current = props;
    handleRef.current?.update(props);
  });

  useEffect(() => {
    const handle = registerMainButton(depth, propsRef.current);
    handleRef.current = handle;
    return () => {
      handle.remove();
      handleRef.current = null;
    };
  }, [depth]);
}

export function useDebounced(value, delayMs) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
