export function PoweredBy() {
  return (
    <section className="bg-background border-b border-border/50">
      <div className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-3">
          <span className="text-xs text-muted-foreground/70 uppercase tracking-wider">
            Powered by
          </span>
          <a
            href="https://cartesia.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="opacity-60 hover:opacity-100 transition-opacity"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/cartesiastartups_black.png"
              alt="Cartesia Startups"
              className="h-7 w-auto dark:invert"
            />
          </a>
        </div>
      </div>
    </section>
  );
}
