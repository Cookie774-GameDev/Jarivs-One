import { createContext, useContext, type PropsWithChildren } from 'react';
import type { PluginManagementCapability } from './runtime';

const PluginManagementContext = createContext<PluginManagementCapability | undefined>(undefined);

export function PluginManagementCapabilityProvider({
  value,
  children,
}: PropsWithChildren<{ value: PluginManagementCapability | undefined }>) {
  return (
    <PluginManagementContext.Provider value={value}>{children}</PluginManagementContext.Provider>
  );
}

export function usePluginManagementCapability(): PluginManagementCapability | undefined {
  return useContext(PluginManagementContext);
}
