import * as React from 'react';
import { useUIStore } from '@/stores/ui';
import { CHATGPT_NATIVE_APP } from './nativeApps';
import { openNativeAppPanel } from './nativeAppPanels';

export function ChatGptAdeRedirect() {
  React.useEffect(() => {
    openNativeAppPanel(CHATGPT_NATIVE_APP);
    useUIStore.getState().setRoute('workbench');
  }, []);
  return null;
}

export default ChatGptAdeRedirect;
