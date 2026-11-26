/** Whether a story is listed on the site. Browser-safe. */
export interface StoryPlacement {
  slug: string;
  listed: boolean;
  version: number;
  updatedAt: string | null;
}
