import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { SecurityPage } from '@/features/account/views/SecurityPage';
import { InvitesPage } from '@/features/admin/views/InvitesPage';
import { TagsAdminPage } from '@/features/catalog/views/TagsAdminPage';
import { UnitsAdminPage } from '@/features/catalog/views/UnitsAdminPage';
import { UsersPage } from '@/features/admin/views/UsersPage';
import { LoginPage } from '@/features/auth/views/LoginPage';
import { RegisterPage } from '@/features/auth/views/RegisterPage';
import { RequireAccess } from '@/features/auth/views/RequireAccess';
import { ResetPasswordPage } from '@/features/auth/views/ResetPasswordPage';
import { HomePage } from '@/features/system/views/HomePage';
import { AddRecipePage } from '@/features/recipes/views/AddRecipePage';
import { RecipeListPage } from '@/features/recipes/views/RecipeListPage';
import { RecipePage } from '@/features/recipes/views/RecipePage';
import { NotFoundPage } from '@/features/system/views/NotFoundPage';
import { AppLayout } from './AppLayout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// The editor (CodeMirror, drag and drop) is only downloaded when opened.
const editorPage = async () => ({
  Component: (await import('@/features/recipes/views/RecipeEditorPage')).RecipeEditorPage,
});

const wizardPage = async () => ({
  Component: (await import('@/features/recipes/views/WizardPage')).WizardPage,
});
const importPage = async () => ({
  Component: (await import('@/features/recipes/views/ImportPage')).ImportPage,
});
const importAiPage = async () => ({
  Component: (await import('@/features/recipes/views/ImportPage')).ImportAiPage,
});
const cookPage = async () => ({
  Component: (await import('@/features/cooking/views/CookPage')).CookPage,
});
const translationPage = async () => ({
  Component: (await import('@/features/recipes/views/TranslationPage')).TranslationPage,
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
        path: 'recipes',
        element: <RequireAccess level="user" />,
        children: [
          { index: true, element: <RecipeListPage kind="mine" /> },
          { path: 'new', element: <AddRecipePage /> },
          { path: 'new/editor', lazy: editorPage },
          { path: 'new/wizard', lazy: wizardPage },
          { path: 'import', lazy: importPage },
          { path: 'import/ai', lazy: importAiPage },
          { path: ':id/edit', lazy: editorPage },
          { path: ':id/translate/:lang', lazy: translationPage },
        ],
      },
      // Readable without an account when public (the server decides).
      { path: 'recipes/:id', element: <RecipePage source="id" /> },
      { path: 'gallery', element: <RecipeListPage kind="gallery" /> },
      // Unlisted recipes: `/shared#token=…`.
      { path: 'shared', element: <RecipePage source="shared" /> },
      {
        path: 'cook',
        element: <RequireAccess level="user" />,
        children: [{ index: true, lazy: cookPage }],
      },
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
          { path: 'tags', element: <TagsAdminPage /> },
          { path: 'units', element: <UnitsAdminPage /> },
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
