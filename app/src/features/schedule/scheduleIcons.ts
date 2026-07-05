import type { LucideIcon } from 'lucide-react';
import {
  Briefcase,
  CalendarDays,
  CheckSquare,
  Clock,
  Coffee,
  Dumbbell,
  MapPin,
  Mic,
  Phone,
  Plane,
  Users,
  Video,
} from 'lucide-react';

export interface ScheduleVisual {
  icon: LucideIcon;
  accentClass: string;
  label: string;
}

const EVENT_RULES: { test: RegExp; visual: ScheduleVisual }[] = [
  { test: /\b(call|phone|dial)\b/i, visual: { icon: Phone, accentClass: 'text-accent-cyan', label: 'Call' } },
  { test: /\b(zoom|meet|teams|video|standup|sync)\b/i, visual: { icon: Video, accentClass: 'text-accent-cyan', label: 'Meeting' } },
  { test: /\b(lunch|coffee|breakfast|dinner|brunch)\b/i, visual: { icon: Coffee, accentClass: 'text-accent-copper', label: 'Meal' } },
  { test: /\b(flight|travel|airport|trip)\b/i, visual: { icon: Plane, accentClass: 'text-accent-cyan', label: 'Travel' } },
  { test: /\b(gym|workout|run|exercise)\b/i, visual: { icon: Dumbbell, accentClass: 'text-accent-copper', label: 'Fitness' } },
  { test: /\b(interview|1:1|one on one|review)\b/i, visual: { icon: Users, accentClass: 'text-accent-cyan', label: 'People' } },
  { test: /\b(podcast|record|voice)\b/i, visual: { icon: Mic, accentClass: 'text-accent-copper', label: 'Audio' } },
  { test: /\b(work|project|deploy|build|ship|code)\b/i, visual: { icon: Briefcase, accentClass: 'text-accent-copper', label: 'Work' } },
];

export function visualForEventTitle(title: string): ScheduleVisual {
  const hit = EVENT_RULES.find((rule) => rule.test.test(title));
  return hit?.visual ?? { icon: CalendarDays, accentClass: 'text-accent-cyan', label: 'Event' };
}

export function visualForTask(): ScheduleVisual {
  return { icon: CheckSquare, accentClass: 'text-accent-copper', label: 'Task' };
}

export function visualForTimedBlock(): ScheduleVisual {
  return { icon: Clock, accentClass: 'text-muted-foreground', label: 'Timed' };
}

export { MapPin };
