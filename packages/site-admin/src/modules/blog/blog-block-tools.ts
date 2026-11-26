/** A block the workspace bar's More menu can insert into a post. */
export type BlogBlockTool = {
  key: 'image' | 'callout' | 'cta' | 'related' | 'divider';
  label: string;
  available: boolean;
};
