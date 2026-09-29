import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center text-center">
      <div>
        <p className="num text-6xl font-semibold tracking-tight">404</p>
        <p className="mt-3 text-muted">That page or ticker doesn&apos;t exist.</p>
        <Link href="/" className="btn mt-6">
          Back to markets
        </Link>
      </div>
    </div>
  );
}
