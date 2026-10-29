export function fullName(user) {
  return [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Без имени";
}

export function handle(user) {
  return user?.username ? `@${user.username}` : "";
}

export function initials(user) {
  const parts = [user?.firstName, user?.lastName].filter(Boolean);
  return parts.map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
const dayYearFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

function startOfDay(ts) {
  const date = new Date(ts);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function dayKey(ts) {
  return startOfDay(ts);
}

export function dayLabel(ts) {
  const today = startOfDay(Date.now());
  const day = startOfDay(ts);
  if (day === today) return "Сегодня";
  if (today - day <= 26 * 60 * 60 * 1000 && today > day) return "Вчера";
  return new Date(ts).getFullYear() === new Date().getFullYear() ? dayFormat.format(ts) : dayYearFormat.format(ts);
}

export function timeLabel(ts) {
  return timeFormat.format(ts);
}

export function shortDate(ts) {
  return `${dayLabel(ts)}, ${timeLabel(ts)}`;
}

// Groups items (newest first) into [{ key, label, items }] by calendar day.
export function groupByDay(items, getTime = (item) => item.createdAt) {
  const groups = [];
  for (const item of items) {
    const key = dayKey(getTime(item));
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: dayLabel(getTime(item)), items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

// Sums friend balances into what others owe me and what I owe, per currency.
export function totals(friends) {
  const owedToMe = new Map();
  const iOwe = new Map();
  for (const friend of friends) {
    for (const { currency, amount } of friend.balances) {
      const target = amount > 0 ? owedToMe : iOwe;
      target.set(currency, (target.get(currency) || 0) + Math.abs(amount));
    }
  }
  const toList = (map) => [...map].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
  return { owedToMe: toList(owedToMe), iOwe: toList(iOwe) };
}

// plural(3, ["заявка", "заявки", "заявок"]) -> "заявки"
export function plural(count, [one, few, many]) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
