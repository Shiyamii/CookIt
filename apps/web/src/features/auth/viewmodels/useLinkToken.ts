import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { linkToken } from '../model/auth';

/**
 * The token of the link that opened the page (`#token=…`), read once; then removed from the
 * address bar so that it does not stay in the browser history.
 */
export function useLinkToken(): string {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => linkToken(location.hash));

  useEffect(() => {
    if (location.hash) void navigate({ pathname: location.pathname, hash: '' }, { replace: true });
    // Only once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return token;
}
