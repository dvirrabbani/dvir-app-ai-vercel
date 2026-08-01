import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RobotAvatarProps {
  /** Sizing and shape come from the caller, so this fits any frame it is put in. */
  className?: string;
  iconClassName?: string;
  label?: string;
}

/**
 * Stand-in avatar: a robot on the brand gradient. Drawn with an icon rather than
 * a photo, so it needs no remote host, no image config, and scales to any size.
 */
export function RobotAvatar({ className, iconClassName, label = 'Robot avatar' }: RobotAvatarProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('flex items-center justify-center bg-gradient-to-br from-[#FF4D8E] via-[#8B5CF6] to-[#00C2FF]', className)}
    >
      <Bot className={cn('text-white', iconClassName)} aria-hidden />
    </div>
  );
}
