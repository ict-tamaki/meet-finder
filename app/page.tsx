import { auth, signIn, signOut } from "@/auth";
import { listEventsForTargets } from "@/lib/google";
import { buildTargets, ROOM, PEOPLE, resolveParticipants, type Person } from "@/lib/people";
import {
  buildWeekSummary,
  businessDaysPage,
  businessDay,
  buildMemberDayHeatmaps,
  findAvailabilityByDay,
  sharedBusyIntervals,
  roomBusyIntervals,
  type DayAvailability,
  type MemberSlotState,
} from "@/lib/availability";
import { parseMeetingRequest } from "@/lib/ai";
import type { MeetingRequest } from "@/lib/schemas";
import { ParticipantPicker } from "./participant-picker";
import { CandidateList, type FallbackPartial } from "./candidate-list";
import { Avatar } from "./avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  ExternalLink,
  LogOut,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";

// カード見出し。アイコンを色付きの丸に入れて、カードごとに色で見分けられるようにする
function SectionTitle({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: string; // アイコン丸の色クラス
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center gap-2 text-base font-semibold">
      <span className={["flex h-7 w-7 items-center justify-center rounded-full", tone].join(" ")}>
        <Icon className="h-4 w-4" />
      </span>
      {children}
    </p>
  );
}

// 週サマリーのページ送り上限（0..MAX_WO ＝ 今日から平日 (MAX_WO+1)*5 日先まで）
const MAX_WO = 3;
// メンバー予定の日送り上限（今日起点の平日オフセット）
const MEMBER_MAX_MD = (MAX_WO + 1) * 5 - 1;

// ナビ用URL（q / p / dur / wo / md を保持。未指定の項目は付けない）
function hrefWith(p: {
  q?: string;
  p?: string;
  dur?: string;
  wo?: number;
  md?: number;
}): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q);
  if (p.p) sp.set("p", p.p);
  if (p.dur) sp.set("dur", p.dur);
  if (p.wo && p.wo > 0) sp.set("wo", String(p.wo));
  if (p.md != null && p.md > 0) sp.set("md", String(p.md));
  const s = sp.toString();
  return s ? `/?${s}` : "/";
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const e = new Date(end).toLocaleTimeString("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${s}〜${e}`;
}

// チップ検索の既定の探索期間: 翌営業日〜その14日後（JST）
function defaultSearchRange(): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" });
  const todayYmd = fmt.format(new Date());
  const first = businessDay(0); // 今日が平日なら今日、休日なら次の平日
  const from = first.ymd === todayYmd ? businessDay(1).ymd : first.ymd;
  const to = fmt.format(new Date(new Date(`${from}T00:00:00+09:00`).getTime() + 14 * 86400000));
  return { from, to };
}

// ヒートマップは 9:00–18:00 を30分×18セル。コアタイム 11:00–16:00 は背景を水色にする
const CELLS_PER_DAY = 18;
const CORE_START = 4; // 11:00（9:00 + 30分×4）
const CORE_END = 14; // 16:00（排他的）

// 空きセルの色（コアタイム内は水色 / それ以外は灰）
function freeCellColor(i: number): string {
  return i >= CORE_START && i < CORE_END ? "bg-brand/20" : "bg-kachi/10";
}

// メンバーヒートマップ1セルの色（勝色=予定あり / 空き）
function memberCellColor(s: MemberSlotState, i: number): string {
  return s === "busy" ? "bg-kachi" : freeCellColor(i);
}

// 時刻の目盛り（9〜18時）。コアタイム 11–16 は背景の帯で示す
function TimeAxis() {
  const left = (CORE_START / CELLS_PER_DAY) * 100;
  const width = ((CORE_END - CORE_START) / CELLS_PER_DAY) * 100;
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0" />
      <div className="relative flex-1">
        <div
          className="absolute inset-y-0 rounded bg-brand/20"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
        <div className="relative flex justify-between text-xs text-muted-foreground">
          {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18].map((h) => (
            <span key={h}>{h}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; wo?: string; md?: string; p?: string; dur?: string }>;
}) {
  // auth.ts の async session(...) によって UI側で...
  // const session = await auth();
  // session.accessToken // ← これが使える
  // session.error       // ← これが使える
  const session = await auth();

  if (!session) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6">
        <h1 className="flex items-center gap-2 text-3xl font-semibold">
          <CalendarCheck className="h-7 w-7 text-primary" />
          みんなの日程調整くん
        </h1>
        <p className="text-sm text-muted-foreground">
          みんなの空き時間と会議室をまとめて確認して、ワンタップで予約
        </p>
        <form action={async () => { "use server"; await signIn("google"); }}>
          <Button type="submit" size="lg">Googleでログイン</Button>
        </form>
      </main>
    );
  }
  // auth.tsにて / token.errorおよび、session.errorの箱はあるが、エラーが起きるまではundefined
  // エラー時に、catchの中で、token.errorにRefreshTokenErrorが入り、session.errorに引き継がれる
  if (session.error === "RefreshTokenError" || !session.accessToken) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">
          セッションの有効期限が切れました。再ログインしてください。
        </p>
        <form action={async () => { "use server"; await signIn("google"); }}>
          <Button type="submit">再ログイン</Button>
        </form>
      </main>
    );
  }

  // 入力された一文をパース（?q= で渡ってくる）。?wo=週送り / ?md=メンバー予定の日送り
  // ?p=選択メール(カンマ区切り) / ?dur=所要時間(分) はチップ選択の状態
  const { q, wo: woRaw, md: mdRaw, p: pRaw, dur: durRaw } = await searchParams;
  const wo = Math.min(MAX_WO, Math.max(0, Number.parseInt(woRaw ?? "0", 10) || 0));
  // md 未指定なら表示窓の先頭日（wo*5）＝5営業日ナビと連動。指定があればその日
  const md = Math.min(
    MEMBER_MAX_MD,
    Math.max(0, mdRaw != null ? Number.parseInt(mdRaw, 10) || 0 : wo * 5),
  );
  let parsed:
    | { request: MeetingRequest; matched: Person[]; unmatched: string[] }
    | null = null;
  if (q) {
    const request = await parseMeetingRequest(q);
    const { matched, unmatched } = resolveParticipants(request.participants);
    parsed = { request, matched, unmatched };
  }

  // チップの選択状態。自然文を解析したときは解析結果（＋自分）を反映、無ければ URL の ?p= / ?dur=
  const selfEmail = session.user?.email;
  const knownEmails = new Set(PEOPLE.map((p) => p.email));
  let selectedEmails: string[];
  let selectedDuration: number;
  if (parsed) {
    selectedEmails = parsed.matched.map((p) => p.email);
    if (selfEmail && !selectedEmails.includes(selfEmail)) selectedEmails.push(selfEmail);
    selectedEmails = selectedEmails.filter((e) => knownEmails.has(e));
    selectedDuration = parsed.request.durationMinutes;
  } else {
    selectedEmails = (pRaw ?? "").split(",").filter((e) => knownEmails.has(e));
    const d = Number.parseInt(durRaw ?? "", 10);
    selectedDuration = [30, 60, 90, 120].includes(d) ? d : 60;
  }

  // 候補を計算する条件: 自然文を解析して参加者が見つかった／チップ検索（?p=）で1人以上選んだ
  const searched = parsed ? parsed.matched.length > 0 : pRaw != null && selectedEmails.length > 0;

  // 検索対象＝チップの選択（自然文のときは解析結果＋自分）。自分が名簿に無い場合も自然文では含める
  const calcPeople: Person[] = selectedEmails
    .map((e) => PEOPLE.find((p) => p.email === e))
    .filter((p): p is Person => p !== undefined);
  if (parsed && selfEmail && !knownEmails.has(selfEmail)) {
    calcPeople.push({ name: "自分", email: selfEmail });
  }

  // 候補を計算（選択した人＋会議室の予定を取得 → 埋まり区間 → 日ごとの全員空き時間帯／一部不可。AIは使わない）
  let candidateDays: DayAvailability[] | null = null; // 全員空きのある日だけ
  let fallbackPartial: FallbackPartial[] = []; // 全員空きの日が1日も無いときの次善案
  let unreadable: string[] = []; // 予定を取得できなかった人（権限なし等）
  let searchInfo = "";
  if (searched) {
    const range = parsed ? parsed.request.dateRange : defaultSearchRange();
    const targets = [
      ...calcPeople.map((p) => ({ name: p.name, calendarId: p.email })),
      { name: ROOM.name, calendarId: ROOM.calendarId },
    ];
    // 具体的なaccessTokenの中身(ya29.xxx...のような文字列)はここでチェックされている
    const events = await listEventsForTargets(
      session.accessToken,
      targets,
      `${range.from}T00:00:00+09:00`,
      `${range.to}T23:59:59+09:00`,
    );
    const peopleTargets = events.filter((e) => e.calendarId !== ROOM.calendarId);
    const roomTarget = events.find((e) => e.calendarId === ROOM.calendarId);
    unreadable = peopleTargets.filter((t) => t.error).map((t) => t.name);

    const allDays = findAvailabilityByDay(
      peopleTargets.map((t) => ({ name: t.name, busy: sharedBusyIntervals(t.events) })),
      roomBusyIntervals(roomTarget?.events ?? []),
      selectedDuration,
      range,
    );
    candidateDays = allDays.filter((d) => d.windows.length > 0);
    if (candidateDays.length === 0) {
      // 全員空きが1日も無い → 期間全体から、不可者が少ない順に次善案を6件
      fallbackPartial = allDays
        .flatMap((d) => d.partial)
        .sort((a, b) => a.unavailable.length - b.unavailable.length || a.start.localeCompare(b.start))
        .slice(0, 6)
        .map((s) => ({ ...s, label: fmtRange(s.start, s.end) }));
    }
    // 参加者はチップで見えているので、所要時間と探した期間だけ出す
    searchInfo = `${selectedDuration}分 ／ ${range.from.slice(5).replace("-", "/")}〜${range.to.slice(5).replace("-", "/")}`;
  }

  // 予約に渡す情報（参加者のメール。会議室は候補ごとに付け外しするのでここには含めない）
  const peopleAttendees = searched ? calcPeople.map((p) => p.email) : [];
  const bookingSummary = searched ? `会議：${calcPeople.map((p) => p.name).join("、")}` : "";

  // 表示する平日5日（今日起点・wo ページ目）＋ メンバー一覧の表示日（md 番目の平日）
  const days = businessDaysPage(wo);
  const memberDay = businessDay(md);
  const now = new Date();
  const firstYmd = days[0]?.ymd ?? memberDay.ymd;
  const lastYmd = days[days.length - 1]?.ymd ?? firstYmd;
  const windowStartMs = new Date(`${firstYmd}T00:00:00+09:00`).getTime();
  const windowEndMs = new Date(`${lastYmd}T23:59:59+09:00`).getTime();
  const memberDayStartMs = new Date(`${memberDay.ymd}T00:00:00+09:00`).getTime();
  const memberDayEndMs = new Date(`${memberDay.ymd}T23:59:59+09:00`).getTime();
  // サマリー窓・メンバー表示日・直近2週間、すべてを1回の取得でまかなう
  const fetchMinMs = Math.min(windowStartMs, memberDayStartMs, now.getTime());
  const fetchMaxMs = Math.max(
    windowEndMs,
    memberDayEndMs,
    now.getTime() + 14 * 24 * 60 * 60 * 1000,
  );
  const results = await listEventsForTargets(
    session.accessToken,
    buildTargets(),
    new Date(fetchMinMs).toISOString(),
    new Date(fetchMaxMs).toISOString(),
  );

  const summary = buildWeekSummary(results, ROOM.calendarId, days);
  // メンバー一覧ヒートマップ（memberDay の1日分）
  const memberHeatmaps = buildMemberDayHeatmaps(
    results.filter((r) => r.calendarId !== ROOM.calendarId),
    memberDay.ymd,
  );

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1760px] flex-col px-6 py-3">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarCheck className="h-6 w-6 text-primary" />
          みんなの日程調整くん
        </h1>
        <div className="flex items-center gap-3">
          <a
            href="https://calendar.google.com/calendar/"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Googleカレンダー
          </a>
          <form action={async () => { "use server"; await signOut(); }}>
            <Button type="submit" className="cursor-pointer" variant="outline" size="sm">
              <LogOut className="h-3.5 w-3.5" />
              ログアウト
            </Button>
          </form>
        </div>
      </div>

      {/* 参加者チップ＋所要時間（選択状態が変わったら key で初期化し直す） */}
      <ParticipantPicker
        key={`${selectedEmails.join(",")}|${selectedDuration}`}
        people={PEOPLE.map(({ name, email, image }) => ({ name, email, image }))}
        initialSelected={selectedEmails}
        initialDuration={selectedDuration}
      />

      {/* 自然文の入力欄(SearchForm)は画面から外した。?q= を直接指定した場合の解析結果だけ表示する */}
      {parsed && (
        <Card className="mb-4 py-3">
          <CardContent>
            「{q}」を解析しました。{" "}
            参加者:{" "}
            <span className="font-medium">
              {parsed.matched.map((m) => m.name).join("・") || "なし"}
            </span>
            {parsed.unmatched.length > 0 && (
              <span className="text-destructive">
                （未解決: {parsed.unmatched.join("・")}）
              </span>
            )}
            {" ／ "}
            {parsed.request.durationMinutes}分 ／ {parsed.request.dateRange.from}〜
            {parsed.request.dateRange.to}
          </CardContent>
        </Card>
      )}

      {/* 空き候補。検索前も枠を確保して、検索でレイアウトが動かないようにする */}
      <Card className="mb-4 gap-2 border-t-4 border-t-gold py-3">
        <CardContent className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SectionTitle icon={CalendarClock} tone="bg-kachi text-white">
              空き候補
            </SectionTitle>
            {searchInfo && (
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                {searchInfo}
              </span>
            )}
            {/* 検索前の案内は見出しと同じ行に出して、枠の高さを抑える */}
            {candidateDays === null && (
              <p className="text-xs text-muted-foreground">
                参加者と所要時間を選んで「候補を探す」を押してください
              </p>
            )}
          </div>
          {unreadable.length > 0 && (
            <p className="flex items-center gap-1 text-xs text-gold-deep">
              <TriangleAlert className="h-3.5 w-3.5" />
              予定を取得できなかった人: {unreadable.join("・")}（空きとして扱っています）
            </p>
          )}
          {candidateDays !== null && (
            <CandidateList
              key={`${peopleAttendees.join(",")}|${searchInfo}`}
              days={candidateDays}
              fallbackPartial={fallbackPartial}
              peopleAttendees={peopleAttendees}
              roomCalendarId={ROOM.calendarId}
              defaultSummary={bookingSummary}
              totalPeople={calcPeople.length}
            />
          )}
        </CardContent>
      </Card>

      {/* メンバーの予定 ／ 会議室の空き状況（それぞれ独立したカード。狭い画面では縦積み） */}
      <div className="grid flex-1 gap-4 lg:grid-cols-2">
        {/* メンバーの予定（1日分・9:00–18:00 のヒートマップ帯） */}
        <Card className="gap-2 py-3">
          <CardContent className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <SectionTitle icon={CalendarDays} tone="bg-kachi text-white">
                  メンバーの予定
                </SectionTitle>
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-sm font-medium text-kachi">
                  {memberDay.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {md > 0 ? (
                  <Link href={hrefWith({ q, p: pRaw, dur: durRaw, wo, md: md - 1 })}>
                    <Button type="button" variant="outline" size="sm">
                      <ChevronLeft className="h-4 w-4" />
                      前日
                    </Button>
                  </Link>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    <ChevronLeft className="h-4 w-4" />
                    前日
                  </Button>
                )}
                {md < MEMBER_MAX_MD ? (
                  <Link href={hrefWith({ q, p: pRaw, dur: durRaw, wo, md: md + 1 })}>
                    <Button type="button" variant="outline" size="sm">
                      翌日
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    翌日
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <TimeAxis />

            {/* メンバー行（左=アイコン＋名前 / 右=ヒートマップ帯） */}
            {/* 行は画面の残り高さに合わせて伸縮する（最小 40px / 最大 48px。セルが縦長にならない範囲） */}
            <div className="flex flex-1 flex-col">
              {memberHeatmaps.map((m) => {
                const person = PEOPLE.find((p) => p.name === m.name);
                const isSelected = person !== undefined && selectedEmails.includes(person.email);
                return (
                <div
                  key={m.name}
                  className={[
                    "flex max-h-12 min-h-10 flex-1 items-stretch gap-3 border-b px-1 py-1 last:border-b-0",
                    isSelected ? "rounded bg-paper" : "",
                  ].join(" ")}
                >
                  <div className="flex w-36 shrink-0 items-center gap-2">
                    <Avatar src={person?.image} name={m.name} size={32} />
                    <span className={["truncate text-base", isSelected ? "font-semibold" : ""].join(" ")}>
                      {m.name}
                    </span>
                  </div>
                  {m.error ? (
                    <div className="flex flex-1 items-center rounded bg-muted px-2 text-xs text-muted-foreground">
                      予定を取得できません
                    </div>
                  ) : (
                    <div className="flex flex-1 gap-px overflow-hidden rounded">
                      {m.cells.map((s, i) => (
                        <div
                          key={i}
                          title={`${m.name} ${9 + Math.floor(i / 2)}:${i % 2 === 0 ? "00" : "30"} ${
                            s === "busy" ? "予定あり" : "空き"
                          }`}
                          className={["flex-1", memberCellColor(s, i)].join(" ")}
                        />
                      ))}
                    </div>
                  )}
                </div>
                );
              })}
            </div>

            {/* 凡例 */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-sm bg-kachi" /> 予定あり
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-sm bg-kachi/10" /> 空き
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-sm bg-brand/20" /> コアタイム(11–16時)の空き
              </span>
              {selectedEmails.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-4 w-4 rounded-sm bg-paper ring-1 ring-border" />{" "}
                  選択中の参加者
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 会議室の空き状況（5営業日・1日1行の帯。メンバーの選択とは無関係に常に表示） */}
        <Card className="gap-2 py-3">
          <CardContent className="flex flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <SectionTitle icon={DoorOpen} tone="bg-kachi text-white">
                  会議室の空き状況
                </SectionTitle>
                <span className="rounded-full bg-paper px-2.5 py-0.5 text-sm font-medium text-kachi">
                  {summary.days[0]?.label}〜{summary.days[summary.days.length - 1]?.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {wo > 0 ? (
                  <Link href={hrefWith({ q, p: pRaw, dur: durRaw, wo: wo - 1 })}>
                    <Button type="button" variant="outline" size="sm">
                      <ChevronLeft className="h-4 w-4" />
                      前の5営業日
                    </Button>
                  </Link>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    <ChevronLeft className="h-4 w-4" />
                    前の5営業日
                  </Button>
                )}
                {wo < MAX_WO ? (
                  <Link href={hrefWith({ q, p: pRaw, dur: durRaw, wo: wo + 1 })}>
                    <Button type="button" variant="outline" size="sm">
                      次の5営業日
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <Button type="button" variant="outline" size="sm" disabled>
                    次の5営業日
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <TimeAxis />

            {/* 行は画面の残り高さに合わせて伸縮する（最小 40px / 最大 64px） */}
            <div className="flex flex-1 flex-col">
              {summary.days.map((d) => (
                <div
                  key={d.label}
                  className="flex max-h-16 min-h-10 flex-1 items-stretch gap-3 border-b py-1 last:border-b-0"
                >
                  <span className="w-36 shrink-0 self-center text-base font-medium">{d.label}</span>
                  <div className="flex flex-1 gap-px overflow-hidden rounded">
                    {d.cells.map((c, i) => (
                      <div
                        key={i}
                        title={`${d.label} ${summary.timeLabels[i] ?? ""} / 会議室 ${
                          c.roomBusy ? (c.roomVisitor ? "予約済み（来客）" : "予約済み") : "空き"
                        }`}
                        className={[
                          "flex flex-1 items-center justify-center",
                          c.roomBusy ? "bg-kachi" : freeCellColor(i),
                        ].join(" ")}
                      >
                        {c.roomVisitor && (
                          <UserRound className="h-4 w-4 text-gold" aria-label="来客" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* 凡例 */}
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-sm bg-kachi/10" /> 空き
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-sm bg-kachi" /> 予約済み
              </span>
              <span className="flex items-center gap-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-kachi">
                  <UserRound className="h-3 w-3 text-gold" />
                </span>{" "}
                来客あり
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-4 w-4 rounded-sm bg-brand/20" /> コアタイム(11–16時)の空き
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
