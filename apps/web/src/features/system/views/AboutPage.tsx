import { CookingPot, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DockerIcon, GitHubIcon } from '@/components/BrandIcons';
import { useAboutViewModel } from '../viewmodels/useAboutViewModel';

/** About CookIt: what it is for, and where its code and its image are. */
export function AboutPage() {
  const { t } = useTranslation();
  const vm = useAboutViewModel();

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="grid justify-items-center gap-3 text-center">
        <span className="grid size-20 place-items-center rounded-3xl bg-primary text-primary-foreground">
          <CookingPot className="size-11" aria-hidden />
        </span>
        <h1 className="text-3xl font-semibold">{t('about.title')}</h1>
        <p className="text-lg">{t('about.tagline')}</p>
        {vm.version && (
          <p className="text-sm text-muted-foreground">
            {t('about.version', { version: vm.version })}
          </p>
        )}
      </header>

      <section className="grid gap-3 leading-relaxed" aria-label={t('about.what')}>
        <p>{t('about.intro')}</p>
        <p>{t('about.cooking')}</p>
        <p>{t('about.yours')}</p>
      </section>

      <section aria-labelledby="about-links" className="grid gap-3">
        <h2 id="about-links" className="text-lg font-semibold">
          {t('about.links')}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ProjectLink
            href={vm.links.github}
            icon={<GitHubIcon className="size-8" />}
            title={t('about.github')}
            text={t('about.githubText')}
          />
          <ProjectLink
            href={vm.links.docker}
            icon={<DockerIcon className="size-8" />}
            title={t('about.docker')}
            text={t('about.dockerText')}
          />
        </div>
      </section>

      <p className="text-center text-sm text-muted-foreground">{t('about.license')}</p>
    </div>
  );
}

function ProjectLink({
  href,
  icon,
  title,
  text,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-center gap-4 rounded-lg border bg-card p-4 transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {icon}
      <span className="grid min-w-0 flex-1">
        <span className="flex items-center gap-1.5 font-semibold">
          {title} <ExternalLink className="size-3.5 text-muted-foreground" aria-hidden />
        </span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </span>
    </a>
  );
}
