"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";

// 「カレンダーから探す」ボタン。押すとブラウザ標準のカレンダーが開き、選んだ日の予定へ切り替える
// hrefBase は日付以外の条件（検索・会議室の表示など）を含む URL。日付 (?d=) だけを足して遷移する
export function MemberDayPicker({
  value,
  min,
  max,
  hrefBase,
}: {
  value: string; // 表示中の日付 YYYY-MM-DD
  min: string;
  max: string;
  hrefBase: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const open = () => {
    const el = ref.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      // showPicker が使えないブラウザは、入力欄を直接操作してもらう
      el.focus();
      el.click();
    }
  };

  const onChange = (v: string) => {
    if (!v) return; // 日付をクリアした場合は何もしない
    const sep = hrefBase.includes("?") ? "&" : "?";
    router.push(`${hrefBase}${sep}d=${v}`);
  };

  return (
    <div className="relative">
      <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={open}>
        <CalendarDays className="h-4 w-4" />
        カレンダーから探す
      </Button>
      {/* ボタンの真下にカレンダーを出すため、ボタンに重ねて透明にしておく */}
      <input
        ref={ref}
        type="date"
        value={value}
        min={min}
        max={max}
        tabIndex={-1}
        aria-label="日付を選ぶ"
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute inset-0 opacity-0"
      />
    </div>
  );
}
