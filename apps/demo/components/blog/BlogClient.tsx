'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { PageLayout } from './PageLayout';
import { formatBlogDate } from './format-date';
import { searchBlogFeed, type BlogArchiveItem } from './search';
import styles from './BlogClient.module.css';

function FeedRow({ item }: { item: BlogArchiveItem }) {
  return (
    <li className={styles.item}>
      <Link className={styles.row} href={`/blog/${encodeURIComponent(item.slug)}`}>
        <time className={styles.date} dateTime={item.date}>
          {formatBlogDate(item.date)}
        </time>
        <span className={styles.title}>{item.title}</span>
        {item.readingTime && <span className={styles.detail}>{item.readingTime}</span>}
      </Link>
    </li>
  );
}

/** Posts: the masthead, a search over titles, summaries and tags, and one row per published post, newest first. */
export function BlogClient({ feedItems }: { feedItems: BlogArchiveItem[] }) {
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const results = searchBlogFeed(feedItems, query);
  const resultLabel = `${results.length} ${results.length === 1 ? 'result' : 'results'}`;

  function clearSearch() {
    setQuery('');
    input.current?.focus();
  }

  return (
    <PageLayout width="wide">
      <div className={styles.archive}>
        <header className={styles.masthead}>
          <h1 className="font-mono text-3xl md:text-4xl lg:text-5xl font-bold leading-12 lg:leading-18 uppercase tracking-tight">Posts</h1>
        </header>
        <div className={`surface-well ${styles.search}`} role="search" aria-label="Posts">
          <Search size={18} className={styles.marker} aria-hidden="true" />
          <label className="sr-only" htmlFor="blog-search">Search</label>
          <input
            ref={input}
            id="blog-search"
            className={styles.input}
            type="search"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) {
                event.preventDefault();
                clearSearch();
              }
            }}
          />
          {query && (
            <button type="button" className={styles.clear} aria-label="Clear search" onClick={clearSearch}>
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className={styles.filterBar}>
          <span className={styles.count} role="status">{resultLabel}</span>
        </div>

        {results.length ? (
          <ul className={styles.results} aria-label="Post results">
            {results.map((item) => <FeedRow key={item.slug} item={item} />)}
          </ul>
        ) : (
          <p className={styles.empty}>
            {feedItems.length ? 'No matches. Try another search.' : 'Nothing published yet.'}
          </p>
        )}
      </div>
    </PageLayout>
  );
}
