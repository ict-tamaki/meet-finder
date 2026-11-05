"use client";

import { useState } from "react";
import Image from "next/image";

// メンバーのアイコン。画像が無い／読み込み失敗時は名前の頭文字の丸で代用
export function Avatar({
  src,
  name,
  size = 28,
}: {
  src?: string;
  name: string;
  size?: number; // 直径(px)
}) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };

  if (src && !failed) {
    return (
      <Image
        src={src}
        alt={name}
        width={size}
        height={size}
        style={style}
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium"
    >
      {name.slice(0, 1)}
    </span>
  );
}
