function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className={filled ? "star-icon star-icon-on" : "star-icon star-icon-off"}
      viewBox="0 0 24 24"
      width="36"
      height="36"
      aria-hidden="true"
    >
      <path
        d="M12 2.5l2.85 6.3 6.9.7-5.2 4.55 1.5 6.75L12 17.4l-6.05 3.4 1.5-6.75-5.2-4.55 6.9-.7L12 2.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StarRating({
  stars,
  grade,
  summary,
}: {
  stars: number;
  grade: string;
  summary?: string;
}) {
  const filled = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <div
      className="star-rating"
      role="img"
      aria-label={`${filled} out of 5 stars, ${grade}`}
    >
      <p className="star-label">Star rating</p>
      <div className="star-row">
        {Array.from({ length: 5 }, (_, i) => (
          <StarIcon key={i} filled={i < filled} />
        ))}
      </div>
      <p className="star-grade">
        <strong>
          {filled}/5 · {grade}
        </strong>
      </p>
      {summary ? <p className="star-summary">{summary}</p> : null}
    </div>
  );
}
