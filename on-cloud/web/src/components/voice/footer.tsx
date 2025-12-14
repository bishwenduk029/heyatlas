"use client";

export function Footer() {
  return (
    <footer className="border-t bg-background px-6 py-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <p>© 2024 Nirmanus</p>
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
