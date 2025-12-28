"use client";

export function Footer() {
  return (
    <footer className="bg-background px-6 py-3">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <p>© 2025 HeyAtlas</p>
        <div className="flex gap-4">
          <a href="#" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-foreground transition-colors">
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
