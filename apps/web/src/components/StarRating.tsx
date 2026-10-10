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
    <div className="star-rating" aria-label={`${filled} out of 5 stars, ${grade}`}>
      <div className="star-row" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} className={i < filled ? "star star-on" : "star star-off"}>
            ★
          </span>
        ))}
      </div>
      <p className="star-grade">
        {filled}/5 · {grade}
      </p>
      {summary ? <p className="star-summary">{summary}</p> : null}
    </div>
  );
}
