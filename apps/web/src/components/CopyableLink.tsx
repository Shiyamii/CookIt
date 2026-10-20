import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** A link shown once (invite, password reset), selectable and copyable. */
export function CopyableLink({
  url,
  copied,
  onCopy,
  label,
}: {
  url: string;
  copied: boolean;
  onCopy: () => void;
  label: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <Input
        readOnly
        value={url}
        aria-label={label}
        className="h-11 font-mono text-xs"
        onFocus={(event) => event.target.select()}
      />
      <Button type="button" variant="outline" size="lg" onClick={onCopy}>
        {copied ? <Check /> : <Copy />}
        {copied ? t('common.copied') : t('common.copy')}
      </Button>
    </div>
  );
}
