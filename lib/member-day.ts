// メンバーの予定で表示する「日付」まわりの部品（JST・YYYY-MM-DD 文字列で扱う）

// 選べる範囲は 今日〜今日+この日数（約3か月）
export const MEMBER_DAY_MAX_AHEAD = 92;

const DAY_MS = 86400000;
const ymdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });

export function todayYmd(): string {
  return ymdFmt.format(new Date());
}

// ymd を n 日ずらす（JST は夏時間が無いので 24h 加算で正しい）
export function addDaysYmd(ymd: string, n: number): string {
  return ymdFmt.format(new Date(new Date(`${ymd}T00:00:00+09:00`).getTime() + n * DAY_MS));
}

export function isWeekendYmd(ymd: string): boolean {
  const w = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(
    new Date(`${ymd}T00:00:00+09:00`),
  );
  return w === "Sat" || w === "Sun";
}

// 例: 11/6(金)
export function dayLabelOf(ymd: string): string {
  return new Date(`${ymd}T00:00:00+09:00`).toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

// 選べる範囲 { min: 今日, max: 今日+92日 }
export function memberDayRange(): { min: string; max: string } {
  const min = todayYmd();
  return { min, max: addDaysYmd(min, MEMBER_DAY_MAX_AHEAD) };
}

// ?d= の値を検証して範囲内の日付にする。未指定・不正な値は fallback、範囲外は端に寄せる
export function resolveMemberDay(raw: string | undefined, fallback: string): string {
  const { min, max } = memberDayRange();
  let ymd = fallback;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    // 2月30日などの存在しない日付は、往復して一致するかで弾く
    const t = new Date(`${raw}T00:00:00+09:00`).getTime();
    if (!Number.isNaN(t) && ymdFmt.format(new Date(t)) === raw) ymd = raw;
  }
  return ymd < min ? min : ymd > max ? max : ymd;
}

// 前日(-1)／翌日(+1)。土日は飛ばして平日だけ移動する
export function shiftBusinessDay(ymd: string, dir: 1 | -1): string {
  let d = addDaysYmd(ymd, dir);
  for (let i = 0; i < 7 && isWeekendYmd(d); i++) d = addDaysYmd(d, dir);
  return d;
}
