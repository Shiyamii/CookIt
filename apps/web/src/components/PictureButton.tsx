import { ImagePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** A button opening the file picker (pictures only). */
export function PictureButton({
  label,
  disabled,
  multiple,
  onFile,
  onFiles,
}: {
  label: string;
  disabled?: boolean;
  multiple?: boolean;
  onFile?: (file: File | undefined) => void;
  onFiles?: (files: File[]) => void;
}) {
  return (
    <Button asChild variant="outline" aria-disabled={disabled}>
      <label className={disabled ? 'pointer-events-none opacity-50' : 'cursor-pointer'}>
        <ImagePlus /> {label}
        <input
          type="file"
          accept="image/*"
          multiple={multiple}
          className="sr-only"
          disabled={disabled}
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            onFile?.(files[0]);
            onFiles?.(files);
            // The same file can be chosen again.
            event.target.value = '';
          }}
        />
      </label>
    </Button>
  );
}
