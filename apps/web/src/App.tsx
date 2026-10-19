import { APP_NAME } from '@cookit/shared';
import { useEffect, useState } from 'react';

type ApiStatus = 'loading' | 'ok' | 'error';

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('loading');

  useEffect(() => {
    fetch('/api/v1/meta')
      .then((res) => setApiStatus(res.ok ? 'ok' : 'error'))
      .catch(() => setApiStatus('error'));
  }, []);

  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>API: {apiStatus}</p>
    </main>
  );
}
