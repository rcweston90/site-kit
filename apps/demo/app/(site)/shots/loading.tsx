// /shots is force-dynamic and reads the shots table, so navigation to it
// otherwise leaves the *previous* page on screen with no feedback for the
// length of that round trip. This gives the router something to swap in
// immediately, in the shape of the collage that follows, clearing the phone
// header and preserving the full-bleed desktop underlay.
export default function Loading() {
  return (
    <div className="w-full min-h-screen sm:-mt-major">
      <div className="sr-only" role="status" aria-live="polite">
        Loading shots
      </div>
      <div
        aria-hidden
        className="columns-2 md:columns-3 gap-minor [column-fill:_balance]"
      >
        {[3 / 2, 1, 2 / 3, 3 / 2, 2 / 3, 1, 3 / 2, 2 / 3, 1].map((ratio, i) => (
          <div
            key={i}
            className="mb-minor w-full rounded-sm bg-background-secondary animate-pulse"
            style={{ aspectRatio: String(ratio) }}
          />
        ))}
      </div>
    </div>
  );
}
