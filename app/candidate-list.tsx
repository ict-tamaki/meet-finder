"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, DoorOpen, TriangleAlert } from "lucide-react";
import { BookButton } from "./book-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DayAvailability, FreeWindow, PartialSlot } from "@/lib/availability";

// 候補が1件も無い日が続く場合のために、全員空きの無い期間の次善案は label 付きで受け取る
export type FallbackPartial = PartialSlot & { label: string };

const PAGE_SIZE = 3; // 一度に表示する日数
const CORE_START_MIN = 11 * 60; // コアタイム 11:00
const CORE_END_MIN = 16 * 60; // 〜16:00

// ISO（YYYY-MM-DDTHH:MM:00+09:00 形式）→ 0時からの分
function toMin(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}
function hm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
function hmOf(iso: string): string {
  return iso.slice(11, 16);
}

// 全員空きの時間帯を、コアタイムの境界(11:00/16:00)で区切って色分け表示するための区間
function segments(w: FreeWindow): { from: number; to: number; core: boolean }[] {
  const s = toMin(w.start);
  const e = toMin(w.end);
  const cuts = [s, ...[CORE_START_MIN, CORE_END_MIN].filter((c) => c > s && c < e), e];
  const out: { from: number; to: number; core: boolean }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i];
    const to = cuts[i + 1];
    if (from === undefined || to === undefined) continue;
    out.push({ from, to, core: from >= CORE_START_MIN && to <= CORE_END_MIN });
  }
  return out;
}

function RoomBadge({ available }: { available: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={available ? "bg-brand/15 text-kachi" : "bg-kachi text-white"}
    >
      <DoorOpen className={available ? "text-brand" : "text-gold"} />
      {available ? "会議室 空き" : "会議室 埋"}
    </Badge>
  );
}

// 全員空きの時間帯1つ。開始時刻をプルダウンで選んで予約する（会議室の空きは開始時刻ごとに違う）
function WindowRow({
  w,
  summary,
  peopleAttendees,
  roomCalendarId,
}: {
  w: FreeWindow;
  summary: string;
  peopleAttendees: string[];
  roomCalendarId: string;
}) {
  const [idx, setIdx] = useState(0);
  const opt = w.starts[idx] ?? w.starts[0];
  if (!opt) return null;

  // 会議室が空きなら参加者＋会議室、埋まっていれば参加者だけ（会議室なしで予約）
  const attendees = opt.roomAvailable ? [...peopleAttendees, roomCalendarId] : peopleAttendees;
  const rowSummary = opt.roomAvailable ? summary : `${summary}（会議室なし）`;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-white px-2 py-1.5 shadow-xs">
      <div className="flex flex-wrap items-center gap-1">
        <Clock className="h-4 w-4 text-brand" />
        {segments(w).map((seg) => (
          <span
            key={seg.from}
            className={[
              "rounded px-1.5 py-0.5 text-sm font-semibold",
              seg.core ? "bg-brand/20 text-kachi" : "bg-paper text-mute",
            ].join(" ")}
          >
            {hm(seg.from)}–{hm(seg.to)}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">開始</span>
        <select
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          className="h-7 rounded-md border bg-background px-1 text-sm"
        >
          {w.starts.map((o, i) => (
            <option key={o.start} value={i}>
              {hmOf(o.start)}〜{hmOf(o.end)}
              {o.roomAvailable ? "" : "（会議室埋）"}
            </option>
          ))}
        </select>
        <RoomBadge available={opt.roomAvailable} />
        <div className="ml-auto">
          {/* 開始時刻を変えたら予約ボタンの状態もリセットする */}
          <BookButton
            key={opt.start}
            start={opt.start}
            end={opt.end}
            summary={rowSummary}
            attendees={attendees}
          />
        </div>
      </div>
      {!opt.roomAvailable && (
        <p className="flex items-center gap-1 text-xs text-gold-deep">
          <TriangleAlert className="h-3.5 w-3.5" />
          会議室が空いていません（会議室なしで予約します）
        </p>
      )}
    </div>
  );
}

// 候補リスト。全員空きのある日を3日ずつ横に並べ、「次の3日」で先へ進める
// 一部の人が参加できない時間は各日の下に折りたたみで表示（次善案・予約はできない）
export function CandidateList({
  days,
  fallbackPartial,
  peopleAttendees,
  roomCalendarId,
  defaultSummary,
  totalPeople,
}: {
  days: DayAvailability[]; // 全員空きのある日だけ（呼び出し側で絞り込み済み）
  fallbackPartial: FallbackPartial[]; // days が空のときの次善案
  peopleAttendees: string[]; // 参加者（会議室は含まない）
  roomCalendarId: string;
  defaultSummary: string;
  totalPeople: number; // 検索対象の人数（「3人中2人が参加可」の分母）
}) {
  const [title, setTitle] = useState("");
  const [pageStart, setPageStart] = useState(0);
  const summary = title.trim() || defaultSummary; // 空欄なら自動の「会議：名前」

  const shown = days.slice(pageStart, pageStart + PAGE_SIZE);
  const first = shown[0];
  const last = shown[shown.length - 1];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="shrink-0 text-sm font-semibold">会議名</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="例: (会議) 社内 週次定例"
          className="h-8 w-64"
        />
        {days.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageStart === 0}
              onClick={() => setPageStart(Math.max(0, pageStart - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4" />
              前の3日
            </Button>
            <span className="text-sm font-medium">
              {first?.label}〜{last?.label}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pageStart + PAGE_SIZE >= days.length}
              onClick={() => setPageStart(pageStart + PAGE_SIZE)}
            >
              次の3日
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {days.length === 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            全員が参加できる時間は見つかりませんでした。
          </p>
          {fallbackPartial.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-medium">
                一部の人が参加できない時間
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  予約はできません
                </span>
              </h3>
              {fallbackPartial.map((c) => (
                <div
                  key={c.start}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed px-3 py-1.5"
                >
                  <span className="text-sm font-medium">{c.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {totalPeople}人中{totalPeople - c.unavailable.length}人が参加可
                  </span>
                  <span className="text-xs font-semibold text-gold-deep">
                    不可: {c.unavailable.join("・")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {shown.map((d) => (
            <section key={d.ymd} className="flex flex-col gap-2 rounded-xl border bg-paper p-2">
              <h3 className="flex items-center gap-1.5 text-base font-semibold text-kachi">
                <CalendarDays className="h-4 w-4 text-brand" />
                {d.label}
              </h3>
              {d.windows.map((w) => (
                <WindowRow
                  key={w.start}
                  w={w}
                  summary={summary}
                  peopleAttendees={peopleAttendees}
                  roomCalendarId={roomCalendarId}
                />
              ))}
              {d.partial.length > 0 && (
                <details className="text-xs">
                  <summary className="flex cursor-pointer items-center gap-1 text-gold-deep">
                    <TriangleAlert className="h-3.5 w-3.5" />
                    一部の人が参加できない時間 {d.partial.length}件（予約不可）
                  </summary>
                  <ul className="mt-1 flex flex-col gap-1">
                    {d.partial.map((p) => (
                      <li
                        key={p.start}
                        className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded border border-dashed bg-white px-2 py-1"
                      >
                        <span className="font-medium">
                          {hmOf(p.start)}〜{hmOf(p.end)}
                        </span>
                        <span className="text-muted-foreground">
                          {totalPeople}人中{totalPeople - p.unavailable.length}人が参加可
                        </span>
                        <span className="font-semibold text-gold-deep">
                          不可: {p.unavailable.join("・")}
                        </span>
                        <span className="ml-auto">
                          <RoomBadge available={p.roomAvailable} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
