import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from 'react-native';

/**
 * Темы оформления. Палитра «rose» — по мотивам Flo (розовый градиент), «sky» — голубая, «sun» — тёплая оранжевая.
 * Герой-солнышко, дорожка недели и кнопки с гранью одинаковы во всех темах.
 * Контраст во всех темах: `text` и `muted` на `bg`/`card` ≥ 4.5:1; белый жирный текст на `primary` ≥ 3:1
 * (норма для крупного жирного текста — поэтому на цветном пишем только крупно и жирно).
 */
export type ThemeName = 'rose' | 'sky' | 'sun';

export const THEME_LABELS: Record<ThemeName, string> = { rose: 'Розовое', sky: 'Голубое', sun: 'Солнечное' };

const BASE = {
  card: '#FFFFFF',
  primaryText: '#FFFFFF',
  teal: '#0E7270',
  tealSoft: '#E8F6F6',
  sun: '#FFD76A',
  sunEdge: '#E0A52E',
  sunLight: '#FFE9A8',
};

const THEMES = {
  rose: {
    ...BASE,
    bg: '#FFF3F5',
    text: '#1F1F24',
    muted: '#5F5F66',
    primary: '#E5487F',
    primaryEdge: '#B93463',
    primaryInk: '#C2255C',
    primarySoft: '#FFE3EA',
    heroFrom: '#E5487F',
    heroTo: '#EE6A86',
    barSoft: '#F7B6C8',
    done: '#0E7270',
    doneEdge: '#0A5654',
    idle: '#F6E3E8',
    warn: '#6B3A1E',
    warnBg: '#FCEFE7',
    border: '#F3DCE2',
  },
  sky: {
    ...BASE,
    bg: '#F2F7FD',
    text: '#1F1F24',
    muted: '#5A6170',
    primary: '#2B7BD6',
    primaryEdge: '#1F5FA8',
    primaryInk: '#1D5FB0',
    primarySoft: '#E1EEFB',
    heroFrom: '#2B7BD6',
    heroTo: '#3F8FE0',
    barSoft: '#B5D3F3',
    done: '#0E7270',
    doneEdge: '#0A5654',
    idle: '#DFE9F5',
    warn: '#6B3A1E',
    warnBg: '#FCEFE7',
    border: '#D7E3F1',
  },
  sun: {
    ...BASE,
    bg: '#FFF4E3',
    text: '#3B2A20',
    muted: '#7A6455',
    primary: '#E8590C',
    primaryEdge: '#B8440A',
    primaryInk: '#C2410C',
    primarySoft: '#FFE8D6',
    heroFrom: '#E8590C',
    heroTo: '#EE6A1B',
    barSoft: '#FFD08A',
    done: '#2F9E44',
    doneEdge: '#237A34',
    idle: '#F6E6D0',
    warn: '#7A4A00',
    warnBg: '#FFF0C9',
    border: '#F0DFC8',
  },
} satisfies Record<ThemeName, Record<string, string>>;

/**
 * Текущая палитра. Объект один на всё приложение и меняется на месте при смене темы (`applyTheme`),
 * поэтому цвета нужно читать из него в момент отрисовки, а не сохранять в константы.
 */
export const colors = { ...THEMES.rose };

let currentTheme: ThemeName = 'rose';

// ---------- Размер шрифта ----------

let fontScale = 1;

/** Размер шрифта с учётом устройства: на планшете текст крупнее, чем на телефоне. */
export function fs(size: number): number {
  return Math.round(size * fontScale);
}

/** Вызывается из корневого layout до отрисовки экранов, как и `applyTheme`. */
export function applyFontScale(scale: number) {
  if (scale === fontScale) return;
  fontScale = scale;
  styles = makeStyles();
}

/** Тема по умолчанию для пола ребёнка; семья может выбрать любую в профиле. */
export function defaultThemeFor(sex?: 'girl' | 'boy'): ThemeName {
  // Пол не указан — розовая тема, как основная; «солнечную» можно выбрать в профиле.
  return sex === 'boy' ? 'sky' : 'rose';
}

/** Переключает палитру. Вызывается из корневого layout до отрисовки экранов. */
export function applyTheme(name: ThemeName) {
  if (name === currentTheme) return;
  currentTheme = name;
  Object.assign(colors, THEMES[name]);
  styles = makeStyles();
}

/** Мягкие подложки для иконок и значков. */
export const tints = { pink: '#FFE3EA', teal: '#E8F6F6', lilac: '#F4E9F6', green: '#E8EFE4', peach: '#FCEFE7', yellow: '#FFF3C9' } as const;

/** Цвет подложки иконки для части занятия. */
export const partTint = { warmup: tints.peach, main: tints.pink, cooldown: tints.teal } as const;
export const partIcon = { warmup: '🤸', main: '💪', cooldown: '🌙' } as const;

const softShadow = Platform.select({
  web: { boxShadow: '0 4px 14px rgba(31, 31, 36, 0.07)' },
  default: {
    shadowColor: '#1F1F24',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
});

/** Стиль шапки экранов: используется в Stack и Tabs, чтобы навигация была в той же палитре. */
export function headerTheme() {
  return {
    headerStyle: { backgroundColor: colors.bg },
    headerShadowVisible: false,
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '700' as const, color: colors.text },
  };
}

/** Ширина окна, с которой включается раскладка для планшета и для компьютера. */
export const BREAKPOINTS = { tablet: 700, desktop: 1100 };

/** Какая раскладка сейчас: телефон, планшет (одна широкая колонка) или компьютер (две колонки и меню слева). */
export function useLayout() {
  const { width } = useWindowDimensions();
  return { width, tablet: width >= BREAKPOINTS.tablet, desktop: width >= BREAKPOINTS.desktop };
}

/**
 * Экран с прокруткой. На телефоне — во всю ширину. На планшете и компьютере содержимое центрируется:
 * обычный экран (форма, текст) — узкой колонкой для удобного чтения, `wide` — на всю рабочую ширину под колонки.
 */
export function Screen({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { tablet } = useLayout();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[
        styles.screen,
        tablet && { width: '100%', maxWidth: wide ? 1120 : 680, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 24 },
      ]}>
      {children}
    </ScrollView>
  );
}

/** Колонки: на телефоне и планшете идут друг под другом во всю ширину, на компьютере — рядом. */
export function Columns({ children }: { children: ReactNode }) {
  const { desktop } = useLayout();
  return <View style={desktop ? { flexDirection: 'row', alignItems: 'flex-start', gap: 20 } : { gap: 14 }}>{children}</View>;
}

export function Col({ children }: { children: ReactNode }) {
  const { desktop } = useLayout();
  return <View style={[{ gap: 14 }, desktop && { flex: 1, minWidth: 0 }]}>{children}</View>;
}

/**
 * Раскладка для планшета: слева список (разделы, статьи), справа содержимое выбранного пункта.
 * Обе части прокручиваются отдельно.
 */
export function SplitView({ master, detail }: { master: ReactNode; detail: ReactNode }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flexGrow: 0, width: '40%', maxWidth: 340, backgroundColor: colors.card, borderRightWidth: 1, borderRightColor: colors.border }}
        contentContainerStyle={{ padding: 12, gap: 6, paddingBottom: 40 }}>
        {master}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 48, width: '100%', maxWidth: 760 }}>
        {detail}
      </ScrollView>
    </View>
  );
}

/** Строка списка в левой части SplitView: иконка, название, необязательное значение справа и стрелка. */
export function NavRow({
  icon,
  title,
  subtitle,
  value,
  right,
  selected,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  value?: string;
  right?: ReactNode;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={[title, subtitle, value].filter(Boolean).join(', ')}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 52,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 14,
        backgroundColor: selected ? colors.primarySoft : 'transparent',
      }}>
      <Text style={{ fontSize: fs(20), width: 28, textAlign: 'center' }}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fs(16), fontWeight: selected ? '700' : '500', color: selected ? colors.primaryInk : colors.text }}>{title}</Text>
        {!!subtitle && <Text style={{ fontSize: fs(13), color: colors.muted }}>{subtitle}</Text>}
      </View>
      {!!value && <Text style={{ fontSize: fs(14), color: colors.muted }}>{value}</Text>}
      {right}
      <Text style={{ fontSize: fs(20), color: colors.muted }}>›</Text>
    </Pressable>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }) {
  return <Text style={styles.h2}>{children}</Text>;
}

export function P({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.p, muted && { color: colors.muted }]}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <View style={styles.notice}>
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: '#E8A27C' }} />
      <Text style={{ flex: 1, color: colors.warn, fontSize: fs(15), lineHeight: fs(22) }}>{children}</Text>
    </View>
  );
}

/** Герой приложения — солнышко. Нарисовано простыми фигурами; позже заменится работой иллюстратора. */
export function Sun({ size = 76 }: { size?: number }) {
  const k = size / 76;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.sunLight }}>
      <View style={[styles.eye, { left: 21 * k, top: 27 * k, width: 8 * k, height: 12 * k, borderRadius: 6 * k }]} />
      <View style={[styles.eye, { right: 21 * k, top: 27 * k, width: 8 * k, height: 12 * k, borderRadius: 6 * k }]} />
      <View
        style={{
          position: 'absolute',
          left: 26 * k,
          top: 40 * k,
          width: 24 * k,
          height: 13 * k,
          borderBottomWidth: 4 * k,
          borderLeftWidth: 4 * k,
          borderRightWidth: 4 * k,
          borderColor: colors.text,
          borderTopWidth: 0,
          borderBottomLeftRadius: 13 * k,
          borderBottomRightRadius: 13 * k,
        }}
      />
    </View>
  );
}

/** Оранжевая карточка с героем: приветствие и короткая подпись в светлой плашке. */
export function HeroCard({ title, chip }: { title: string; chip?: string }) {
  return (
    <LinearGradient colors={[colors.heroFrom, colors.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
      <View style={styles.heroBlob} />
      <View style={{ position: 'absolute', right: 20, bottom: 14 }}>
        <Sun />
      </View>
      <Text accessibilityRole="header" style={styles.heroTitle}>
        {title}
      </Text>
      {!!chip && (
        <View style={styles.heroChip}>
          <Text style={{ fontSize: fs(13), fontWeight: '700', color: colors.text }}>{chip}</Text>
        </View>
      )}
    </LinearGradient>
  );
}

/** Дорожка недели: галочка — занятие сделано, звезда — сегодня. Пустые дни бледные: заниматься каждый день не нужно. */
export function WeekPath({
  days,
  summary,
  streak,
}: {
  days: { label: string; done: boolean; practiced?: boolean; extra?: number; isToday: boolean }[];
  summary: string;
  streak?: string;
}) {
  return (
    <View accessible accessibilityLabel={[summary, streak].filter(Boolean).join('. ')} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 }}>
        <Text style={{ fontSize: fs(14), fontWeight: '700', color: colors.text }}>{summary}</Text>
        {!!streak && <Text style={{ fontSize: fs(14), fontWeight: '700', color: colors.primaryInk }}>{streak}</Text>}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {days.map((d) => {
          const fill = d.done
            ? { backgroundColor: colors.done, borderBottomWidth: 3, borderBottomColor: colors.doneEdge }
            : d.practiced
              ? { backgroundColor: colors.sun, borderBottomWidth: 3, borderBottomColor: colors.sunEdge }
              : d.isToday
                ? { backgroundColor: colors.primary, borderBottomWidth: 3, borderBottomColor: colors.primaryEdge }
                : { backgroundColor: colors.idle };
          return (
            <View key={d.label} style={{ alignItems: 'center', gap: 4, width: 38 }}>
              <View style={[styles.dayCircle, fill]}>
                <Text style={{ color: '#FFFFFF', fontSize: fs(16), fontWeight: '800' }}>{d.done ? '✓' : d.practiced ? '•' : d.isToday ? '★' : ''}</Text>
                {!!d.extra && (
                  <View style={styles.dayBadge}>
                    <Text style={{ fontSize: fs(11), fontWeight: '800', color: colors.text }}>+{d.extra}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: fs(12), fontWeight: '700', color: d.isToday ? colors.text : colors.muted }}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Строка-карточка упражнения: цветная иконка, название, необязательная подпись и элемент справа. */
export function ExerciseRow({
  icon,
  tint,
  title,
  subtitle,
  right,
}: {
  icon: string;
  tint: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.exerciseRow}>
      <View style={[styles.iconTile, { backgroundColor: tint }]}>
        <Text style={{ fontSize: fs(18) }}>{icon}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: fs(16), fontWeight: '600', color: colors.text }}>{title}</Text>
        {!!subtitle && <Text style={{ fontSize: fs(13), color: colors.muted, marginTop: 1 }}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

/** Значок достижения: цветной кружок с иконкой; неполученный — бледный, с подсказкой, как получить. */
export function Badge({
  icon,
  title,
  how,
  earned,
  progress,
  tint,
}: {
  icon: string;
  title: string;
  how: string;
  earned: boolean;
  progress?: string;
  tint: string;
}) {
  const status = earned ? 'Получен' : `Ещё не получен: ${how}${progress ? `, ${progress}` : ''}`;
  return (
    <View accessible accessibilityLabel={`${title}. ${status}`} style={{ width: '31%', alignItems: 'center', gap: 4 }}>
      <View
        style={{
          width: 62,
          height: 62,
          borderRadius: 31,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: earned ? tint : colors.bg,
          borderWidth: 2,
          borderColor: earned ? colors.primary : colors.border,
          borderStyle: earned ? 'solid' : 'dashed',
        }}>
        <Text style={{ fontSize: fs(26), opacity: earned ? 1 : 0.3 }}>{icon}</Text>
      </View>
      <Text style={{ fontSize: fs(13), fontWeight: '700', color: earned ? colors.text : colors.muted, textAlign: 'center' }}>{title}</Text>
      {!earned && <Text style={{ fontSize: fs(12), color: colors.muted, textAlign: 'center' }}>{progress ?? how}</Text>}
    </View>
  );
}

/** Плитка с числом: «42 дня», «3 ч 15 мин». */
export function StatTile({ value, label, tint }: { value: string; label: string; tint: string }) {
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ width: '48%', backgroundColor: tint, borderRadius: 18, padding: 12, gap: 2 }}>
      <Text style={{ fontSize: fs(22), fontWeight: '800', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: fs(13), color: colors.muted }}>{label}</Text>
    </View>
  );
}

/** Шкала динамики: от «снижение» до «улучшение», с отметкой текущего положения (score от −1 до +1). */
export function TrendScale({ score, label }: { score: number; label: string }) {
  const position = Math.max(0.03, Math.min(0.97, (score + 1) / 2));
  const segments = ['#F7B6C8', '#FBD9C6', '#EDEDED', '#BFE3E2', '#57A9A7'];
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Шкала динамики: ${label}`} style={{ gap: 6, paddingTop: 12 }}>
      <View>
        <View style={{ flexDirection: 'row', gap: 3, height: 14 }}>
          {segments.map((c, i) => (
            <View
              key={c}
              style={{
                flex: 1,
                backgroundColor: c,
                borderTopLeftRadius: i === 0 ? 7 : 0,
                borderBottomLeftRadius: i === 0 ? 7 : 0,
                borderTopRightRadius: i === segments.length - 1 ? 7 : 0,
                borderBottomRightRadius: i === segments.length - 1 ? 7 : 0,
              }}
            />
          ))}
        </View>
        <View style={{ position: 'absolute', top: -5, left: `${position * 100}%`, marginLeft: -12 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.card, borderWidth: 4, borderColor: colors.text }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: fs(12), color: colors.muted }}>снижение</Text>
        <Text style={{ fontSize: fs(12), color: colors.muted }}>без изменений</Text>
        <Text style={{ fontSize: fs(12), color: colors.muted }}>улучшение</Text>
      </View>
    </View>
  );
}

/**
 * Простой столбчатый график: скруглённые столбики, последний выделен, значение над каждым.
 * `target` рисует пунктирную линию цели (например, 3 занятия в неделю).
 */
export function BarChart({
  data,
  target,
  summary,
}: {
  data: { label: string; value: number }[];
  target?: number;
  /** Что график показывает словами — для экранных читалок. */
  summary: string;
}) {
  const height = 110;
  const max = Math.max(target ?? 0, ...data.map((d) => d.value), 1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ paddingTop: 6 }}>
      <View style={{ height: height + 22 }}>
        {target !== undefined && (
          <View
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 22 + height - (target / max) * height,
              borderTopWidth: 2,
              borderStyle: 'dashed',
              borderColor: colors.teal,
            }}
          />
        )}
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          {data.map((d, i) => {
            const last = i === data.length - 1;
            return (
              <View key={`${d.label}-${i}`} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: fs(13), fontWeight: '700', color: last ? colors.primaryInk : colors.muted }}>{d.value}</Text>
                <View
                  style={{
                    width: '100%',
                    maxWidth: 44,
                    height: Math.max(6, (d.value / max) * height),
                    borderRadius: 10,
                    backgroundColor: last ? colors.primary : colors.barSoft,
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={{ flex: 1, textAlign: 'center', fontSize: fs(12), color: colors.muted }}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Цвета оценок: легко — бирюзовый, нормально — жёлтый, тяжело — основной цвет темы. */
export function feedbackColor(f: 'easy' | 'ok' | 'hard'): string {
  return f === 'easy' ? '#57A9A7' : f === 'ok' ? colors.sun : colors.primary;
}

const RATE_OPTIONS = [
  { value: 'easy', icon: '😊', label: 'Легко' },
  { value: 'ok', icon: '🙂', label: 'Нормально' },
  { value: 'hard', icon: '😮‍💨', label: 'Тяжело' },
] as const;

/** Оценка упражнения одним нажатием: три крупные плитки. */
export function RateRow({ value, onRate }: { value?: 'easy' | 'ok' | 'hard' | null; onRate: (f: 'easy' | 'ok' | 'hard') => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
      {RATE_OPTIONS.map((o) => {
        const selected = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onRate(o.value)}
            style={({ pressed }) => ({
              flex: 1,
              minHeight: 76,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              borderRadius: 18,
              borderWidth: 2,
              borderBottomWidth: pressed ? 2 : 5,
              marginTop: pressed ? 3 : 0,
              borderColor: selected ? colors.primary : colors.border,
              backgroundColor: selected ? colors.primarySoft : colors.card,
            })}>
            <Text style={{ fontSize: fs(24) }}>{o.icon}</Text>
            <Text style={{ fontSize: fs(15), fontWeight: '700', color: colors.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** График с накоплением: в каждом столбике — сколько упражнений далось легко, нормально и тяжело. */
export function StackedBarChart({
  data,
  summary,
}: {
  data: { label: string; easy: number; ok: number; hard: number }[];
  summary: string;
}) {
  const height = 120;
  const max = Math.max(1, ...data.map((d) => d.easy + d.ok + d.hard));
  const parts = ['hard', 'ok', 'easy'] as const; // сверху вниз
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ paddingTop: 6, gap: 6 }}>
      <View style={{ height: height + 20, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        {data.map((d, i) => {
          const total = d.easy + d.ok + d.hard;
          return (
            <View key={`${d.label}-${i}`} style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: fs(13), fontWeight: '700', color: colors.muted }}>{total > 0 ? total : ''}</Text>
              <View style={{ width: '100%', maxWidth: 44, borderRadius: 10, overflow: 'hidden', backgroundColor: total > 0 ? 'transparent' : colors.idle, height: total > 0 ? undefined : 6 }}>
                {parts.map((p) => (d[p] > 0 ? <View key={p} style={{ height: (d[p] / max) * height, backgroundColor: feedbackColor(p) }} /> : null))}
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {data.map((d, i) => (
          <Text key={`${d.label}-${i}`} style={{ flex: 1, textAlign: 'center', fontSize: fs(12), color: colors.muted }}>
            {d.label}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: 2 }}>
        {(['easy', 'ok', 'hard'] as const).map((p) => (
          <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: feedbackColor(p) }} />
            <Text style={{ fontSize: fs(13), color: colors.text }}>{p === 'easy' ? 'легко' : p === 'ok' ? 'нормально' : 'тяжело'}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Кнопка с нижней гранью: при нажатии «утапливается». */
export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.primary, borderBottomColor: colors.primaryEdge }
          : { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.border, borderBottomColor: colors.border },
        pressed && { borderBottomWidth: 2, marginTop: 3 },
        disabled && { opacity: 0.45 },
      ]}>
      <Text style={{ color: primary ? colors.primaryText : colors.primaryInk, fontSize: primary ? fs(19) : fs(17), fontWeight: '800' }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: fs(14), fontWeight: '600' }}>{label}</Text>
      {/* Свой стиль поля дополняет рамку и фон, а не заменяет их. */}
      <TextInput style={[styles.input, style]} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
      <Text style={{ fontSize: fs(16), color: colors.text, fontWeight: selected ? '700' : '400' }}>{label}</Text>
    </Pressable>
  );
}

/** Небольшая кнопка-метка: выбор из нескольких (признаки, место) или один из трёх (легко/нормально/тяжело). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && { borderColor: colors.primary, backgroundColor: colors.primarySoft }]}>
      <Text style={{ fontSize: fs(14), color: colors.text, fontWeight: selected ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** Галочка с подписью (согласие, подтверждение). */
export function Checkbox({ label, checked, onPress }: { label: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', minHeight: 48, paddingVertical: 4 }}>
      <View style={[styles.checkbox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
        {checked && <Text style={{ color: colors.primaryText, fontSize: fs(18), fontWeight: '800', lineHeight: fs(22) }}>✓</Text>}
      </View>
      <Text style={[styles.p, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

function makeStyles() {
  return StyleSheet.create({
  screen: { padding: 20, gap: 14, paddingBottom: 48 },
  h1: { fontSize: fs(27), lineHeight: fs(33), fontWeight: '800', color: colors.text },
  h2: { fontSize: fs(18), fontWeight: '700', color: colors.text },
  p: { fontSize: fs(16), lineHeight: fs(24), color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 22, padding: 16, gap: 8, ...softShadow },
  notice: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: colors.warnBg,
    borderRadius: 18,
    padding: 14,
  },
  eye: { position: 'absolute', backgroundColor: colors.text },
  hero: {
    borderRadius: 26,
    padding: 18,
    minHeight: 124,
    overflow: 'hidden',
    gap: 10,
    justifyContent: 'center',
  },
  heroBlob: {
    position: 'absolute',
    right: -36,
    bottom: -56,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  heroTitle: { fontSize: fs(23), lineHeight: fs(28), fontWeight: '800', color: colors.primaryText, maxWidth: '58%' },
  heroChip: { alignSelf: 'flex-start', backgroundColor: 'rgba(255, 255, 255, 0.94)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayBadge: {
    position: 'absolute',
    top: -6,
    right: -10,
    minWidth: 22,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sun,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  iconTile: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  button: {
    minHeight: 56,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderBottomWidth: 5,
  },
  input: {
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 13,
    fontSize: fs(16),
    backgroundColor: colors.card,
    color: colors.text,
  },
  choice: { borderWidth: 2, borderColor: colors.border, borderRadius: 18, padding: 15, backgroundColor: colors.card },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.muted,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
}

// Стили зависят от палитры, поэтому пересоздаются при смене темы.
let styles = makeStyles();
