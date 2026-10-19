import { useEffect, useState } from 'react';
import apiClient from '../apiClient';

// Never rely on the login/localStorage permission snapshot for sending rights.
export function useWhatsappSendPermission() {
  const [canSendWhatsapp, setCanSendWhatsapp] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await apiClient.get('/api/users/my-whatsapp-send-permission');
        if (active) setCanSendWhatsapp(response?.data?.canSendWhatsapp === true);
      } catch {
        if (active) setCanSendWhatsapp(false);
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    const interval = window.setInterval(refresh, 30000);
    return () => {
      active = false;
      window.removeEventListener('focus', refresh);
      window.clearInterval(interval);
    };
  }, []);

  return canSendWhatsapp;
}
