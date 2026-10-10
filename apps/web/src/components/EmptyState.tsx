import Link from "next/link";

export function EmptyState({
  title,
  body,
  actionHref,
  actionLabel,
}: {
  title: string;
  body: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{body}</p>
      {actionHref && actionLabel ? (
        <Link className="btn btn-primary" href={actionHref}>
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
