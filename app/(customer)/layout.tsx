export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper">
      <div id="main" className="mx-auto flex min-h-dvh max-w-[440px] flex-col px-4">
        {children}
      </div>
    </div>
  );
}
