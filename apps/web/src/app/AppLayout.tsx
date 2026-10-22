import { APP_NAME } from '@cookit/shared';
import { ChefHat } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import { UserMenu } from '@/features/auth/views/UserMenu';
import { MainNav } from '@/features/recipes/views/MainNav';
import { OfflineBanner } from '@/features/pwa/views/OfflineBanner';
import { LanguageMenu } from '@/features/preferences/views/LanguageMenu';
import { ThemeMenu } from '@/features/preferences/views/ThemeMenu';

export function AppLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <ChefHat className="size-6 text-primary" aria-hidden />
            {APP_NAME}
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <LanguageMenu />
            <ThemeMenu />
            <UserMenu />
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl px-3 pb-2">
          <MainNav />
        </div>
        <OfflineBanner />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
}
