import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { achievements } from '@/src/domain/achievements';
import { EXERCISES } from '@/src/domain/exercises';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { goalRatingLabel } from '@/src/domain/goals';
import { activityStats, formatAge } from '@/src/domain/profile';
import { FLAG_LABELS, RISK_LABELS } from '@/src/domain/questionnaire';
import { TARGET_SESSIONS_PER_WEEK } from '@/src/domain/selection';
import type { Feedback } from '@/src/domain/types';
import { useApp } from '@/src/state/AppState';
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  Col,
  Columns,
  H1,
  H2,
  NavRow,
  Notice,
  P,
  Screen,
  SplitView,
  THEME_LABELS,
  defaultTheme,
  tints,
  useLayout,
  type ThemeName,
} from '@/src/ui/kit';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
const FEEDBACK_LABEL: Record<Feedback, string> = { easy: 'легко', ok: 'нормально', hard: 'тяжело' };
const HISTORY_PREVIEW = 5;

type SectionId = 'child' | 'goal' | 'badges' | 'stats' | 'history' | 'theme' | 'account';

/**
 * Профиль: ребёнок, цель, значки, статистика, история занятий, оформление, аккаунт.
 * На телефоне разделы идут друг под другом,
 * на планшете и компьютере — список разделов слева и выбранный раздел справа.
 */
export default function Profile() {
  const { user, child, assessment, sessions, trackingResults, goal, pastGoals, readArticles, practices, theme, setTheme, resetAll } = useApp();
  const [showAll, setShowAll] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [section, setSection] = useState<SectionId>('child');
  const { tablet } = useLayout();
  if (!user || !child) return null;

  const stats = activityStats(sessions);
  const badges = achievements({ sessions, trackingResults, goal, pastGoals, readArticles, role: user?.role });
  const earnedCount = badges.filter((b) => b.earned).length;
  const BADGE_TINTS = [tints.pink, tints.teal, tints.lilac, tints.peach, tints.yellow, tints.green];
  // История: занятия целиком и отдельные упражнения, от новых к старым.
  const title = (id: string) => EXERCISES.find((e) => e.id === id)?.title ?? id;
  const history = [
    ...sessions.map((s) => ({
      id: s.id,
      date: s.date,
      head: `Занятие · ${FEEDBACK_LABEL[s.feedback]}${s.pain ? ' · была боль' : ''}`,
      body: s.items.map((i) => `${title(i.exerciseId)}${s.itemFeedback?.[i.exerciseId] ? ` — ${FEEDBACK_LABEL[s.itemFeedback[i.exerciseId]]}` : ''}`).join(', '),
    })),
    ...(practices ?? []).map((p) => ({
      id: p.id,
      date: p.date,
      head: `Отдельное упражнение${p.feedback ? ` · ${FEEDBACK_LABEL[p.feedback]}` : ''}`,
      body: `${title(p.exerciseId)}, сложность ${p.difficulty} из 3`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const shown = showAll ? history : history.slice(0, HISTORY_PREVIEW);
  const activeTheme = theme ?? defaultTheme();
  const childLine = `${child.sex === 'girl' ? 'Девочка · ' : child.sex === 'boy' ? 'Мальчик · ' : ''}${formatAge(child.ageYears)}`;

  const cards: Record<SectionId, ReactNode> = {
    child: (
      <Card>
        <H2>{child.name}</H2>
        <P>{childLine}</P>
        {assessment && <P>Группа занятий: {LEVEL_DESCRIPTIONS[assessment.level].title}</P>}
        {assessment && (
          <P muted>
            {assessment.excludedRisks.length > 0
              ? `Не предлагаем: ${assessment.excludedRisks.map((r) => RISK_LABELS[r]).join(', ')}.`
              : 'Запретов врача, которые меняют занятия, нет.'}
          </P>
        )}
        {assessment && assessment.unsureFlags.length > 0 && (
          <P muted>Уточнить у врача: {assessment.unsureFlags.map((f) => FLAG_LABELS[f]).join(', ')}.</P>
        )}
        <Button
          title="Изменить данные ребёнка"
          variant="secondary"
          onPress={() => router.push({ pathname: '/child/new', params: { edit: '1' } })}
        />
        <Button title="Пройти вопросы заново" variant="secondary" onPress={() => router.push('/child/questionnaire')} />
      </Card>
    ),
    goal: (
      <Card>
        <H2>Моя цель</H2>
        {goal ? (
          <>
            <P>🎯 {goal.text}</P>
            <P muted>
              Поставлена {fmt(goal.setAt)}
              {goal.reviews.length > 0
                ? ` · ${goalRatingLabel(goal.reviews[goal.reviews.length - 1].rating).toLowerCase()}`
                : ''}
            </P>
            <Button title="Оценить продвижение" variant="secondary" onPress={() => router.push({ pathname: '/goal', params: { review: '1' } })} />
            <Button title="Сменить цель" variant="secondary" onPress={() => router.push('/goal')} />
          </>
        ) : (
          <>
            <P muted>Цель помогает замечать успехи. Выберите одну на ближайшие 2–3 месяца.</P>
            <Button title="Выбрать цель" variant="secondary" onPress={() => router.push('/goal')} />
          </>
        )}
        {(pastGoals ?? []).length > 0 && (
          <P muted>
            Прежние цели:{' '}
            {(pastGoals ?? [])
              .map((g) => {
                const last = g.reviews[g.reviews.length - 1];
                return last ? `${g.text} (${goalRatingLabel(last.rating).toLowerCase()})` : g.text;
              })
              .join('; ')}
          </P>
        )}
      </Card>
    ),
    badges: (
      <Card>
        <H2>Значки</H2>
        <P muted>
          Получено {earnedCount} из {badges.length}. Значки — за регулярность и заботу, а не за результат.
        </P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 14, paddingTop: 6 }}>
          {badges.map((b, i) => (
            <Badge key={b.id} icon={b.icon} title={b.title} how={b.how} earned={b.earned} progress={b.progress} tint={BADGE_TINTS[i % BADGE_TINTS.length]} />
          ))}
        </View>
      </Card>
    ),
    stats: (
      <Card>
        <H2>Мои успехи</H2>
        {stats.total === 0 ? (
          <P muted>Здесь появится статистика после первого занятия.</P>
        ) : (
          <>
            <P>🌟 Всего занятий: {stats.total}</P>
            <P>
              📅 За последние 7 дней: {stats.thisWeek} из {TARGET_SESSIONS_PER_WEEK}
            </P>
            {stats.weeksInRow > 1 && <P>🌱 Недель подряд с занятиями: {stats.weeksInRow}</P>}
            {stats.firstDate && <P muted>Занимаемся с {fmt(stats.firstDate)}</P>}
          </>
        )}
      </Card>
    ),
    history: (
      <Card>
        <H2>История занятий</H2>
        {history.length === 0 && <P muted>Пока нет выполненных занятий и упражнений.</P>}
        {shown.map((h) => (
          <View key={h.id} style={{ gap: 2, paddingVertical: 6 }}>
            <P>
              {fmt(h.date)} · {h.head}
            </P>
            <P muted>{h.body}</P>
          </View>
        ))}
        {history.length > HISTORY_PREVIEW && (
          <Button
            title={showAll ? 'Свернуть' : `Показать все (${history.length})`}
            variant="secondary"
            onPress={() => setShowAll(!showAll)}
          />
        )}
      </Card>
    ),
    theme: (
      <Card>
        <H2>Оформление</H2>
        <ChipRow>
          {(Object.keys(THEME_LABELS) as ThemeName[]).map((t) => (
            <Chip key={t} label={THEME_LABELS[t]} selected={activeTheme === t} onPress={() => setTheme(t)} />
          ))}
        </ChipRow>
      </Card>
    ),
    account: (
      <Card>
        <H2>Аккаунт</H2>
        <P>{user.name}</P>
        <P muted>{user.email}</P>
        <Button title="Правила занятий" variant="secondary" onPress={() => router.push('/rules')} />
        {confirmExit ? (
          <>
            <Notice>
              Данные хранятся только на этом устройстве. После выхода профиль ребёнка, история занятий и результаты
              тестов будут удалены, и восстановить их не получится.
            </Notice>
            <Button
              title="Выйти и удалить данные"
              onPress={() => {
                resetAll();
                router.replace('/');
              }}
            />
            <Button title="Отмена" variant="secondary" onPress={() => setConfirmExit(false)} />
          </>
        ) : (
          <Button title="Выйти" variant="secondary" onPress={() => setConfirmExit(true)} />
        )}
      </Card>
    ),
  };

  // Планшет и компьютер: слева список разделов, справа выбранный раздел.
  if (tablet) {
    const menu: { id: SectionId; icon: string; title: string; value?: string }[] = [
      { id: 'child', icon: '🧒', title: 'Данные ребёнка' },
      { id: 'goal', icon: '🎯', title: 'Моя цель', value: goal ? undefined : 'нет' },
      { id: 'badges', icon: '🏅', title: 'Значки', value: `${earnedCount} из ${badges.length}` },
      { id: 'stats', icon: '🌟', title: 'Мои успехи', value: stats.total > 0 ? String(stats.total) : undefined },
      { id: 'history', icon: '🗓️', title: 'История занятий', value: history.length > 0 ? String(history.length) : undefined },
      { id: 'theme', icon: '🎨', title: 'Оформление', value: THEME_LABELS[activeTheme] },
      { id: 'account', icon: '👤', title: 'Аккаунт' },
    ];
    return (
      <SplitView
        master={
          <>
            <View style={{ paddingHorizontal: 8, paddingVertical: 10, gap: 2 }}>
              <H2>{child.name}</H2>
              <P muted>{childLine}</P>
            </View>
            {menu.map((m) => (
              <NavRow key={m.id} icon={m.icon} title={m.title} value={m.value} selected={section === m.id} onPress={() => setSection(m.id)} />
            ))}
          </>
        }
        detail={cards[section]}
      />
    );
  }

  return (
    <Screen wide>
      <H1>Профиль</H1>
      <Columns>
        <Col>
          {cards.child}
          {cards.goal}
          {cards.badges}
        </Col>
        <Col>
          {cards.stats}
          {cards.history}
          {cards.theme}
          {cards.account}
        </Col>
      </Columns>
    </Screen>
  );
}
