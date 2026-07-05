import { cn } from '@/lib/utils';

/** Public URL for the official Hive custom model mark (app/public). */
export const HIVE_MODEL_ICON_SRC = '/hive-model-icon.png';

export interface HiveModelIconProps {
  className?: string;
  /** Pixel width/height — defaults to 24 (+50% from original 16). */
  size?: number;
  alt?: string;
}

/** Official Hive model icon — Japanese-style hex hive mark. */
export function HiveModelIcon({
  className,
  size = 24,
  alt = 'Hive model',
}: HiveModelIconProps) {
  return (
    <img
      src={HIVE_MODEL_ICON_SRC}
      alt={alt}
      width={size}
      height={size}
      className={cn('shrink-0 object-contain bg-transparent', className)}
      draggable={false}
    />
  );
}

/** Settings rail / Lucide-compatible wrapper. */
export function HiveModelTabIcon({ className }: { className?: string }) {
  return <HiveModelIcon className={className} size={24} alt="" aria-hidden />;
}
