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
  const external =
    !!actionHref &&
    (actionHref.startsWith("http://") || actionHref.startsWith("https://"));

  return (
    <div className="empty-state">
      <div className="empty-state-mark" aria-hidden="true" />
      <h2>{title}</h2>
      <p>{body}</p>
      {actionHref && actionLabel ? (
        external ? (
          <a
            className="btn btn-primary"
            href={actionHref}
            target="_blank"
            rel="noreferrer"
          >
            {actionLabel}
          </a>
        ) : (
          <Link className="btn btn-primary" href={actionHref}>
            {actionLabel}
          </Link>
        )
      ) : null}
    </div>
  );
}
