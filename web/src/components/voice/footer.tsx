"use client";

export function Footer() {
  return (
    <footer className="bg-background px-4 py-2 sm:py-3">
      <div className="mx-auto md:w-1/2">
        <div className="text-muted-foreground flex items-center justify-between text-[10px] sm:text-xs">
          <p>© 2025 HeyAtlas</p>
          <div className="flex gap-3 sm:gap-4">
            <a href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <a href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
