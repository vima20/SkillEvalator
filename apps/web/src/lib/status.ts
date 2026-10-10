export function statusBadgeClass(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "completed" || s === "ok" || s === "pass" || s === "passed") {
    return "badge badge-ok";
  }
  if (s === "running" || s === "queued" || s === "grading" || s === "producing") {
    return "badge badge-run";
  }
  if (s === "failed" || s === "error" || s === "fail") {
    return "badge badge-fail";
  }
  return "badge badge-wait";
}
