import { SymbolView, type AndroidSymbol, type SFSymbol } from "expo-symbols";
import { Text, type ColorValue, type StyleProp, type ViewStyle } from "react-native";

export type AppIconName =
  | "today"
  | "assistant"
  | "projects"
  | "calendar"
  | "review"
  | "more"
  | "microphone"
  | "send"
  | "attachment"
  | "arrow"
  | "check"
  | "clock"
  | "contact"
  | "shield"
  | "sync"
  | "warning"
  | "money";

const symbols: Record<AppIconName, { ios: SFSymbol; android: AndroidSymbol; web: AndroidSymbol }> = {
  today: { ios: "house.fill", android: "home", web: "home" },
  assistant: { ios: "bubble.left.and.text.bubble.right.fill", android: "forum", web: "forum" },
  projects: { ios: "building.2.fill", android: "apartment", web: "apartment" },
  calendar: { ios: "calendar", android: "calendar_month", web: "calendar_month" },
  review: { ios: "checkmark.circle.fill", android: "task_alt", web: "task_alt" },
  more: { ios: "ellipsis", android: "more_horiz", web: "more_horiz" },
  microphone: { ios: "mic.fill", android: "mic", web: "mic" },
  send: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  attachment: { ios: "paperclip", android: "attach_file", web: "attach_file" },
  arrow: { ios: "chevron.right", android: "arrow_forward", web: "arrow_forward" },
  check: { ios: "checkmark", android: "check", web: "check" },
  clock: { ios: "clock.fill", android: "schedule", web: "schedule" },
  contact: { ios: "person.crop.circle.fill", android: "person", web: "person" },
  shield: { ios: "shield.fill", android: "shield", web: "shield" },
  sync: { ios: "arrow.clockwise", android: "sync", web: "sync" },
  warning: { ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" },
  money: { ios: "dollarsign.circle.fill", android: "payments", web: "payments" },
};

export function AppIcon({
  name,
  color,
  size = 22,
  style,
}: {
  name: AppIconName;
  color: ColorValue;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <SymbolView
      name={symbols[name]}
      size={size}
      tintColor={color}
      weight="semibold"
      style={style}
      fallback={<Text style={{ color, fontSize: size * 0.72, fontWeight: "800" }}>•</Text>}
    />
  );
}
