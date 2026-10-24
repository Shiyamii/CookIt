import { APP_NAME } from '@cookit/shared';
import { ChefHat } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Outlet } from 'react-router';
import { AlarmBanner } from '@/features/alarm/views/AlarmBanner';
import { UserMenu } from '@/features/auth/views/UserMenu';
import { MainNav } from '@/features/recipes/views/MainNav';
import { OfflineBanner } from '@/features/pwa/views/OfflineBanner';
import { LanguageMenu } from '@/features/preferences/views/LanguageMenu';
import { ThemeMenu } from '@/features/preferences/views/ThemeMenu';

// The demo build only (left out of the normal build).
const DemoBanner =
  import.meta.env.VITE_DEMO === '1'
    ? lazy(async () => ({
        default: (await import('@/features/demo/views/DemoBanner')).DemoBanner,
      }))
    : undefined;

export function AppLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      {DemoBanner && (
        <Suspense fallback={null}>
          <DemoBanner />
        </Suspense>
      )}
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
      <AlarmBanner />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm">
        <Link
          to="/about"
          className="text-muted-foreground underline decoration-primary decoration-2 underline-offset-2 hover:text-foreground"
        >
          {t('about.link')}
        </Link>
      </footer>
    </div>
  );
}
