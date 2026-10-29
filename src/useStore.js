import { createContext, useContext } from "react";

export const DataContext = createContext(null);
export const UiContext = createContext(null);

export function useStore() {
  return useContext(DataContext);
}

export function useUi() {
  return useContext(UiContext);
}
