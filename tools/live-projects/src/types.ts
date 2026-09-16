export type Category = 'software' | 'ecommerce' | 'web';

/** Hand-written details for a host. Anything left out is filled in from the live page. */
export interface ProjectOverride {
  order?: number;
  title?: string;
  kicker?: string;
  category?: Category;
  description?: string;
  image?: string;
  alt?: string;
  width?: number;
  height?: number;
  /** Never show this host, even when it is live */
  hidden?: boolean;
}

/** Older work with no live site; always shown after the live systems. */
export interface ArchiveProject {
  title: string;
  kicker: string;
  category: Category;
  description: string;
  image: string;
  alt: string;
  width: number;
  height: number;
}

export interface Config {
  domain: string;
  checkDelayMs: number;
  removeAfterFailures: number;
  newBadgeDays: number;
  screenshotRefreshDays: number;
  ignore: string[];
  projects: Record<string, ProjectOverride>;
  archive: ArchiveProject[];
}

/** What the tool remembers about a host between runs (state.json). */
export interface HostState {
  firstSeen: string;
  live: boolean;
  failures: number;
  lastError?: string;
  title?: string;
  description?: string;
  category?: Category;
  image?: string;
  screenshotAt?: string;
}

export interface State {
  hosts: Record<string, HostState>;
}

export type CheckResult =
  | { ok: true; title: string; description: string; category: Category }
  | { ok: false; transient: boolean; reason: string };

/** One card in the gallery. */
export interface GalleryItem {
  title: string;
  kicker: string;
  category: Category;
  description: string;
  image: string;
  alt: string;
  width: number;
  height: number;
  host?: string;
  isNew?: boolean;
}
