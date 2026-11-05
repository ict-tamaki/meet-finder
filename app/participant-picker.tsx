"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "./avatar";

export type PickerPerson = { name: string; email: string; image?: string };

// 所要時間ボタンの選択肢（分）
const DURATIONS = [30, 60, 90, 120];

// 参加者チップ＋所要時間ボタン。「候補を探す」を押したときだけ URL（?p=…&dur=…）を更新する
// （検索の実行は Server Component 側。ここは入力状態を持つだけ）
export function ParticipantPicker({
  people,
  initialSelected,
  initialDuration,
  actions,
}: {
  people: PickerPerson[];
  initialSelected: string[]; // 選択済みメール
  initialDuration: number;
  actions?: React.ReactNode; // チップ行の右端に置くもの（Googleカレンダーへのリンク・ログアウト）
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [duration, setDuration] = useState(initialDuration);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const toggle = (email: string) =>
    setSelected((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );

  const search = () => {
    const sp = new URLSearchParams({ p: selected.join(","), dur: String(duration) });
    // ソフト遷移にして、サーバー再レンダリング中は isPending を true にする
    startTransition(() => {
      router.push(`/?${sp.toString()}`);
    });
  };

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border bg-card px-4 py-3">
      {/* 1行目: 左=参加者の見出しと一括操作 / 右=所要時間と「候補を探す」 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <p className="flex items-center gap-2 text-base font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-kachi text-white">
              <Users className="h-4 w-4" />
            </span>
            参加者を選ぶ
            <span className="rounded-full bg-paper px-2.5 py-0.5 text-sm font-medium text-kachi">
              {selected.length}人選択中
            </span>
          </p>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isPending}
            onClick={() => setSelected(people.map((p) => p.email))}
          >
            全員選択
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={isPending || selected.length === 0}
            onClick={() => setSelected([])}
          >
            選択解除
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-sm font-medium">
            <Clock className="h-4 w-4 text-brand" />
            所要時間
          </span>
          {DURATIONS.map((d) => (
            <Button
              key={d}
              type="button"
              size="sm"
              variant={duration === d ? "default" : "outline"}
              aria-pressed={duration === d}
              disabled={isPending}
              onClick={() => setDuration(d)}
            >
              {d}分
            </Button>
          ))}
          <Button
            type="button"
            className="ml-2 cursor-pointer"
            disabled={isPending || selected.length === 0}
            onClick={search}
          >
            {isPending ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {isPending ? "検索中…" : "候補を探す"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {people.map((p) => {
          const on = selected.includes(p.email);
          return (
            <button
              key={p.email}
              type="button"
              aria-pressed={on}
              disabled={isPending}
              onClick={() => toggle(p.email)}
              className={[
                "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-1 text-sm transition-colors disabled:opacity-50",
                on
                  ? "border-kachi bg-kachi font-semibold text-white"
                  : "bg-background hover:bg-paper",
              ].join(" ")}
            >
              <Avatar src={p.image} name={p.name} size={28} />
              {p.name}
              {on && <Check className="h-4 w-4 text-gold" />}
            </button>
          );
        })}
        {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
