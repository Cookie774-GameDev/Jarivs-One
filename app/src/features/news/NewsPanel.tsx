/**
 * NewsPanel — floating mini-panel (unrelated to Pixel Pets).
 *
 * Right-docked card with:
 *   - Section tabs: Today (default) · Last week · More
 *   - Kind chips: All · Models · News · YouTube
 *   - Cards: image, title, summary, source credit, open external link
 *
 * Content is 100% preloaded static catalog — no network news API.
 */
import * as React from 'react';
import {
  ExternalLink,
  Newspaper,
  Play,
  Sparkles,
  X,
  Cpu,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { openExternal } from '@/lib/tauri';
import {
  NEWS_KIND_META,
  NEWS_SECTION_META,
  type NewsItem,
  type NewsKind,
  type NewsSectionId,
} from './newsCatalog';
import {
  countNewsBySection,
  formatNewsDate,
  getNewsFeed,
} from './newsSections';

export interface NewsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional clock override for tests / demos. */
  now?: Date;
}

type KindFilter = NewsKind | 'all';

const KIND_FILTERS: ReadonlyArray<{ id: KindFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'model_drop', label: NEWS_KIND_META.model_drop.short },
  { id: 'ai_news', label: NEWS_KIND_META.ai_news.short },
  { id: 'youtube', label: NEWS_KIND_META.youtube.short },
];

const SECTIONS: readonly NewsSectionId[] = ['today', 'last_week', 'more'];

function KindIcon({ kind, className }: { kind: NewsKind; className?: string }) {
  if (kind === 'youtube') return <Play className={className} />;
  if (kind === 'model_drop') return <Cpu className={className} />;
  return <Radio className={className} />;
}

function NewsCard({ item }: { item: NewsItem }) {
  const [imgFailed, setImgFailed] = React.useState(false);

  const open = () => {
    void openExternal(item.url);
  };

  return (
    <article
      className={cn(
        'group overflow-hidden rounded-xl border border-border bg-paper',
        'shadow-soft transition-colors hover:border-accent-copper/40',
      )}
    >
      <button
        type="button"
        onClick={open}
        className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-copper/50"
        aria-label={`Open: ${item.title}`}
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
          {!imgFailed ? (
            <img
              src={item.imageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-paper-soft to-muted">
              <Newspaper className="h-8 w-8 text-muted-foreground/50" />
            </div>
          )}
          <span
            className={cn(
              'absolute left-2 top-2 inline-flex items-center gap-1 rounded-full',
              'border border-border/60 bg-panel/90 px-2 py-0.5',
              'text-metadata font-medium text-foreground backdrop-blur-sm',
            )}
          >
            <KindIcon kind={item.kind} className="h-3 w-3 text-accent-copper" />
            {NEWS_KIND_META[item.kind].label}
          </span>
          {item.kind === 'youtube' && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm">
                <Play className="h-5 w-5 fill-current" />
              </span>
            </span>
          )}
        </div>

        <div className="space-y-1.5 p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-secondary leading-snug text-foreground">
              {item.title}
            </h3>
            <ExternalLink
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden
            />
          </div>
          <p className="text-metadata leading-relaxed text-muted-foreground line-clamp-3">
            {item.summary}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-metadata text-muted-foreground">
            <span className="font-medium text-foreground/80">{item.source}</span>
            <span aria-hidden>·</span>
            <time dateTime={item.publishedAt}>{formatNewsDate(item.publishedAt)}</time>
          </div>
          <p className="text-[10px] leading-snug text-muted-foreground/80">
            Credit: {item.credit}
            {item.imageCredit ? ` · Image: ${item.imageCredit}` : null}
          </p>
        </div>
      </button>
    </article>
  );
}

export function NewsPanel({ open, onOpenChange, now }: NewsPanelProps) {
  const [section, setSection] = React.useState<NewsSectionId>('today');
  const [kind, setKind] = React.useState<KindFilter>('all');

  // Reset to Today whenever the panel opens.
  React.useEffect(() => {
    if (open) {
      setSection('today');
      setKind('all');
    }
  }, [open]);

  // Escape closes the panel.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const feedOptions = React.useMemo(() => ({ now, kind }), [now, kind]);
  const counts = React.useMemo(() => countNewsBySection({ now }), [now]);
  const items = React.useMemo(
    () => getNewsFeed(section, feedOptions),
    [section, feedOptions],
  );

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex justify-end"
      role="presentation"
    >
      {/* Soft click-catcher (does not dim the whole app heavily). */}
      <button
        type="button"
        aria-label="Close news panel"
        className="pointer-events-auto absolute inset-0 bg-black/20 backdrop-blur-[1px]"
        onClick={() => onOpenChange(false)}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-panel-title"
        className={cn(
          'pointer-events-auto relative flex h-full w-[min(420px,100vw)] flex-col',
          'border-l border-border bg-elevated shadow-2xl',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        {/* Header */}
        <header className="shrink-0 border-b border-border bg-paper-soft px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="eyebrow flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-accent-copper" />
                AI feed
              </span>
              <h2
                id="news-panel-title"
                className="font-display mt-0.5 text-title leading-tight text-foreground"
              >
                News
              </h2>
              <p className="mt-0.5 text-metadata text-muted-foreground">
                Model drops, AI headlines, and YouTube — preloaded, with credits.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Close news"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Section tabs */}
          <div
            role="tablist"
            aria-label="News time range"
            className="mt-3 flex gap-1 rounded-lg border border-border bg-paper p-0.5"
          >
            {SECTIONS.map((id) => {
              const active = section === id;
              const meta = NEWS_SECTION_META[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSection(id)}
                  className={cn(
                    'flex-1 rounded-md px-2 py-1.5 text-metadata font-medium transition-colors',
                    active
                      ? 'bg-accent-copper/15 text-accent-copper'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {meta.label}
                  <span
                    className={cn(
                      'ml-1 tabular-nums',
                      active ? 'text-accent-copper/80' : 'text-muted-foreground/70',
                    )}
                  >
                    {counts[id]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Kind chips */}
          <div className="mt-2 flex flex-wrap gap-1">
            {KIND_FILTERS.map((f) => {
              const active = kind === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setKind(f.id)}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-metadata transition-colors',
                    active
                      ? 'border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan'
                      : 'border-border bg-paper text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </header>

        {/* Feed */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <p className="mb-2 px-1 text-metadata text-muted-foreground">
            {NEWS_SECTION_META[section].description}
          </p>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-paper/50 px-4 py-12 text-center">
              <Newspaper className="h-7 w-7 text-muted-foreground/50" />
              <p className="text-secondary text-muted-foreground">
                Nothing in {NEWS_SECTION_META[section].label.toLowerCase()} yet.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSection(section === 'today' ? 'last_week' : 'more')}
              >
                Browse other sections
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.id}>
                  <NewsCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="shrink-0 border-t border-border bg-paper-soft px-4 py-2">
          <p className="text-[10px] leading-snug text-muted-foreground">
            Curated offline snapshot. Stories open in your browser. Images and copy credited to
            the original publishers (OpenAI, Meta, CNBC, Euronews, YouTube creators, etc.).
          </p>
        </footer>
      </aside>
    </div>
  );
}
