export function useFormat() {
  const money = (value: string | number) => ` ${Number(value).toFixed(2)} LAK`;

  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  // Human countdown like "1h 23m 4s" or "ended".
  const countdown = (iso: string, nowMs: number) => {
    const diff = new Date(iso).getTime() - nowMs;
    if (diff <= 0) return "ended";
    const s = Math.floor(diff / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h ? `${h}h` : "", m || h ? `${m}m` : "", `${sec}s`].filter(Boolean).join(" ");
  };

  return { money, dateTime, countdown };
}
