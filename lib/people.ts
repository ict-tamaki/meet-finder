export type Person = {
  name: string;
  email: string;
  image?: string; // public/avatars/ 配下のアイコン画像（無ければ頭文字で代用）
  aliases?: string[]; // 検索用の別名（表示名とは別。例: 「博也」で検索 → 上山(博)）
}

// テスト
export const PEOPLE: Person[] = [
  { name: "社長", email: "uji@ictinc.co.jp", image: "/avatars/syacho.jpg"},
  { name: "長尾", email: "nagao@ictinc.co.jp", image: "/avatars/nagaosan.png"},
  { name: "上山(博)", email: "ueyama@ictinc.co.jp", image: "/avatars/hironarisan.jpg", aliases: ["博也"]},
  { name: "松本", email: "y.matsumoto@ictinc.co.jp", image: "/avatars/matsumotosan.png"},
  { name: "酒澤", email: "sakazawa@ictinc.co.jp", image: "/avatars/sakazawasan.jpg"},
  { name: "内田", email: "uchida@ictinc.co.jp", image: "/avatars/uchidasan.jpg"},
  { name: "滝本", email: "r.takimoto@ictinc.co.jp", image: "/avatars/takimotosan.png"},
  { name: "玉木", email: "s.tamaki@ictinc.co.jp", image: "/avatars/tamaki.png"},
  { name: "船田", email: "m.funada@ictinc.co.jp", image: "/avatars/funada.jpg"},
  { name: "中野", email: "y.nakano@ictinc.co.jp", image: "/avatars/nakanosan.png"},
  { name: "上山(陽)", email: "y.ueyama@ictinc.co.jp", image: "/avatars/youkosan.png", aliases: ["陽子"]},
  { name: "小林", email: "s.kobayashi@ictinc.co.jp", image: "/avatars/kobayashisan.jpg"},
]

// 会議室 リソースカレンダー
export const ROOM = {
  name: "会議室",
  calendarId: process.env.ROOM_RESOURCE_ID ?? "",
}

// メンバーと会議室をまとめて、取得対象のリストにする
export function buildTargets(): { name: string; calendarId: string }[] {
  return [
    ...PEOPLE.map((p) => ({ name: p.name, calendarId: p.email })),
    { name: ROOM.name, calendarId: ROOM.calendarId },
  ];
}

// AIが返した呼び名を、既知メンバーに突き合わせる（簡易マッチ）
export function resolveParticipants(names: string[]): {
  matched: Person[];
  unmatched: string[];
} {
  const matched: Person[] = [];
  const unmatched: string[] = [];
  for (const n of names) {
    const hit = PEOPLE.find(
      (p) =>
        [p.name, ...(p.aliases ?? [])].some((k) => k.includes(n) || n.includes(k)) ||
        p.email.startsWith(n),
    );
    if (hit) matched.push(hit);
    else unmatched.push(n);
  }
  return { matched, unmatched };
}