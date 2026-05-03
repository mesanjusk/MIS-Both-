import { useEffect, useState } from 'react';

const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

export function useMetaEmbeddedSignupSdk() {
  const [isReady, setIsReady] = useState(false);
  const [sdkError, setSdkError] = useState('');

  useEffect(() => {
    const appId = import.meta.env.VITE_META_APP_ID;

    if (!appId) {
      setSdkError('Missing VITE_META_APP_ID in environment.');
      return;
    }

    const initializeFacebookSdk = () => {
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version: 'v22.0',
      });
      setIsReady(true);
    };

    if (window.FB) {
      initializeFacebookSdk();
      return;
    }

    window.fbAsyncInit = initializeFacebookSdk;

    const existingScript = document.querySelector(`script[src="${FACEBOOK_SDK_SRC}"]`);
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = FACEBOOK_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.onerror = () => setSdkError('Failed to load Facebook SDK.');
    document.body.appendChild(script);
  }, []);

  return { isReady, sdkError };
}
