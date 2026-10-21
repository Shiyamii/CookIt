import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { SecurityPage } from '@/features/account/views/SecurityPage';
import { InvitesPage } from '@/features/admin/views/InvitesPage';
import { UsersPage } from '@/features/admin/views/UsersPage';
import { LoginPage } from '@/features/auth/views/LoginPage';
import { RegisterPage } from '@/features/auth/views/RegisterPage';
import { RequireAccess } from '@/features/auth/views/RequireAccess';
import { ResetPasswordPage } from '@/features/auth/views/ResetPasswordPage';
import { HomePage } from '@/features/system/views/HomePage';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import { AppLayout } from './AppLayout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <LoginPage /> },
      // Invite and first-admin links share the sign-up page (the token says which one it is).
      { path: 'invite', element: <RegisterPage /> },
      { path: 'setup', element: <RegisterPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      {
        path: 'account',
        element: <RequireAccess level="user" />,
        children: [{ path: 'security', element: <SecurityPage /> }],
      },
      {
        path: 'admin',
        element: <RequireAccess level="admin" />,
        children: [
          { path: 'invites', element: <InvitesPage /> },
          { path: 'users', element: <UsersPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
