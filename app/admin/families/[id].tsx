import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';

import { fullCatalog, loadContent } from '@/src/admin/content';
import { addContact, loadFamilyLog, type FamilyLog } from '@/src/admin/familyLog';
import { loadFamily } from '@/src/admin/source';
import {
  CHANNEL_LABELS,
  OUTCOME_LABELS,
  contactDraft,
  handledKey,
  signalsFor,
  type ContactChannel,
  type ContactOutcome,
  type FamilyRecord,
} from '@/src/domain/admin';
import { ROLE_LABELS, trend } from '@/src/domain/achievements';
import { EXERCISES, TRACKING_TESTS } from '@/src/domain/exercises';
import { LEVEL_DESCRIPTIONS, LEVEL_GAP_WARNING, levelGap } from '@/src/domain/functionalLevel';
import { goalRatingLabel } from '@/src/domain/goals';
import { PAIN_AREAS, PAIN_SIGNS, activityStats, formatAge, sessionsByWeek } from '@/src/domain/profile';
import { FLAG_LABELS, GMFCS_ROMAN, MOTOR_ITEMS, walkMotorItems } from '@/src/domain/questionnaire';
import { TARGET_SESSIONS_PER_WEEK } from '@/src/domain/selection';
import type { Exercise, Feedback } from '@/src/domain/types';
import { BarChart, Button, Card, Checkbox, Chip, ChipRow, Col, Columns, H1, H2, Notice, P, Screen, TrendScale, colors, fs } from '@/src/ui/kit';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const FEEDBACK_LABEL: Record<Feedback, string> = { easy: 'легко', ok: 'нормально', hard: 'тяжело' };
const TREND_LABEL = { better: 'улучшение', stable: 'без изменений', worse: 'снижение' } as const;
const HISTORY_PREVIEW = 8;

type State = { family?: FamilyRecord; demo: boolean; log: FamilyLog; catalog: Exercise[] } | 'loading' | 'failed';

/** Карточка семьи: кто это, как идут занятия, что настораживает, как связаться и что уже сделано. */
export default function AdminFamily() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<State>('loading');
  const [showAll, setShowAll] = useState(false);
  const [mailFailed, setMailFailed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [channel, setChannel] = useState<ContactChannel>('email');
  const [outcome, setOutcome] = useState<ContactOutcome | null>(null);
  const [markHandled, setMarkHandled] = useState(true);
  const [saveFailed, setSaveFailed] = useState(false);

  const load = useCallback(() => {
    // Названия упражнений берём из полного каталога администратора; если он не читается — из приложения.
    const catalog = loadContent().then(fullCatalog, () => EXERCISES);
    Promise.all([loadFamily(id), loadFamilyLog(), catalog])
      .then(([result, log, exercises]) => setState({ ...result, log, catalog: exercises }))
      .catch(() => setState('failed'));
  }, [id]);
  useEffect(() => {
    setState('loading');
    load();
  }, [load]);

  if (state === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }
  if (state === 'failed') {
    return (
      <Screen>
        <Notice>Не удалось загрузить данные семьи. Проверьте соединение и попробуйте ещё раз.</Notice>
        <Button title="Повторить" onPress={load} />
      </Screen>
    );
  }
  const f = state.family;
  if (!f) {
    return (
      <Screen>
        <P>Такой семьи нет в списке — возможно, её данные удалены.</P>
      </Screen>
    );
  }

  const handled = new Set(state.log.handled);
  const allSignals = signalsFor(f);
  const signals = allSignals.filter((s) => !handled.has(handledKey(f.id, s)));
  const handledCount = allSignals.length - signals.length;
  const contacts = state.log.contacts.filter((c) => c.familyId === f.id).sort((a, b) => b.at.localeCompare(a.at));
  const stats = activityStats(f.sessions);
  const weeks = sessionsByWeek(f.sessions);
  const dynamics = trend(f.trackingResults);
  const tested = TRACKING_TESTS.map((t) => ({ t, results: f.trackingResults.filter((r) => r.testId === t.id) })).filter(
    (x) => x.results.length > 0,
  );
  const history = [...f.sessions].reverse();
  const shown = showAll ? history : history.slice(0, HISTORY_PREVIEW);
  const lastReview = f.goal?.reviews[f.goal.reviews.length - 1];
  // Пункты теста, которые задавались родителю, с выбранными вариантами.
  const motorAnswers = f.assessment?.answers.motor ?? {};
  const motorShown = walkMotorItems(motorAnswers).visible;
  const exerciseTitle = (exerciseId: string) => state.catalog.find((e) => e.id === exerciseId)?.title ?? 'упражнение удалено';

  const writeEmail = async () => {
    const draft = contactDraft(f, signals);
    try {
      setMailFailed(false);
      await Linking.openURL(
        `mailto:${f.parent.email}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`,
      );
    } catch {
      setMailFailed(true);
    }
  };

  const saveContact = async () => {
    if (!outcome) return;
    try {
      setSaveFailed(false);
      await addContact(
        { familyId: f.id, at: new Date().toISOString(), channel, outcome },
        markHandled ? signals.map((s) => handledKey(f.id, s)) : [],
      );
      setRecording(false);
      setOutcome(null);
      load();
    } catch {
      setSaveFailed(true);
    }
  };

  return (
    <Screen wide>
      <H1>{f.parent.name}</H1>
      <Columns>
        <Col>
          <Card>
            <H2>{signals.length > 0 ? 'Стоит связаться' : 'Связь с семьёй'}</H2>
            {signals.length === 0 && (
              <P muted>{handledCount > 0 ? 'Все сигналы обработаны. Если что-то изменится, они появятся снова.' : 'Настораживающих признаков нет.'}</P>
            )}
            {signals.map((s) => (
              <Text key={s.key} style={{ fontSize: fs(16), lineHeight: fs(23), color: colors.warn, fontWeight: s.severity === 'urgent' ? '700' : '400' }}>
                {s.severity === 'urgent' ? '❗ ' : '• '}
                {s.text}
              </Text>
            ))}
            <Text selectable style={{ fontSize: fs(16), color: colors.text }}>
              {f.parent.email}
            </Text>
            <Button title="Написать на почту" onPress={writeEmail} />
            {mailFailed && <P muted>Почтовая программа не открылась — скопируйте адрес выше и напишите вручную.</P>}
            <P muted>Откроется письмо с черновиком текста. Перед отправкой его можно изменить.</P>
            {!recording && <Button title="Записать, что связались" variant="secondary" onPress={() => setRecording(true)} />}
          </Card>

          {recording && (
            <Card>
              <H2>Запись о связи</H2>
              <P muted>Дата — сегодня. Как связались</P>
              <ChipRow>
                {(Object.keys(CHANNEL_LABELS) as ContactChannel[]).map((c) => (
                  <Chip key={c} label={CHANNEL_LABELS[c]} selected={channel === c} onPress={() => setChannel(c)} />
                ))}
              </ChipRow>
              <P muted>Чем закончилось</P>
              <ChipRow>
                {(Object.keys(OUTCOME_LABELS) as ContactOutcome[]).map((o) => (
                  <Chip key={o} label={OUTCOME_LABELS[o]} selected={outcome === o} onPress={() => setOutcome(o)} />
                ))}
              </ChipRow>
              {signals.length > 0 && (
                <Checkbox
                  label="Сигналы обработаны — убрать семью из списка «Нужно связаться», пока не появится новый"
                  checked={markHandled}
                  onPress={() => setMarkHandled(!markHandled)}
                />
              )}
              <P muted>Подробности разговора сюда не записываются: сведения о здоровье ребёнка не должны храниться на этом устройстве.</P>
              {saveFailed && <Notice>Не удалось сохранить запись. Попробуйте ещё раз.</Notice>}
              <Button title="Сохранить запись" disabled={!outcome} onPress={saveContact} />
              <Button title="Отмена" variant="secondary" onPress={() => setRecording(false)} />
            </Card>
          )}

          <Card>
            <H2>Журнал связи</H2>
            {state.demo && <P muted>Семья выдуманная — журнал здесь только для примера.</P>}
            {contacts.length === 0 && <P muted>Записей пока нет.</P>}
            {contacts.map((c) => (
              <P key={c.id}>
                {fmt(c.at)} · {CHANNEL_LABELS[c.channel].toLowerCase()} · {OUTCOME_LABELS[c.outcome].toLowerCase()}
              </P>
            ))}
          </Card>

          <Card>
            <H2>Родитель</H2>
            <P>
              {f.parent.name}
              {f.parent.role ? ` · ${ROLE_LABELS[f.parent.role].toLowerCase()}` : ''}
            </P>
            <P muted>Регистрация: {fmt(f.registeredAt)}</P>
            <P muted>
              {f.parent.consentAt ? `Согласие на обработку данных: ${fmt(f.parent.consentAt)}` : 'Согласие на обработку данных не получено'}
            </P>
          </Card>

          <Card>
            <H2>Ребёнок</H2>
            {f.child ? (
              <>
                <P>
                  {f.child.name} · {f.child.sex === 'girl' ? 'девочка · ' : f.child.sex === 'boy' ? 'мальчик · ' : ''}
                  {formatAge(f.child.ageYears)}
                </P>
                {f.assessment ? (
                  <>
                    <P>Группа занятий: {LEVEL_DESCRIPTIONS[f.assessment.level].title}</P>
                    <P muted>
                      Уровень от врача (GMFCS): {f.assessment.gmfcsReported ? GMFCS_ROMAN[f.assessment.gmfcsReported] : 'не назван'} · по
                      тесту: {GMFCS_ROMAN[f.assessment.computedLevel]}
                      {levelGap(f.assessment) >= LEVEL_GAP_WARNING ? ' · заметно расходятся' : ''}
                    </P>
                    {motorShown.map((item) => (
                      <P muted key={item.id}>
                        {item.title}: {(item.options.find((o) => o.id === motorAnswers[item.id])?.label ?? 'нет ответа').toLowerCase()}
                      </P>
                    ))}
                    {motorShown.length < MOTOR_ITEMS.length && (
                      <P muted>Остальные пункты теста не задавались: предыдущая ступень не пройдена.</P>
                    )}
                    <P muted>
                      Ограничения и противопоказания:{' '}
                      {f.assessment.safetyFlags.length > 0 ? f.assessment.safetyFlags.map((x) => FLAG_LABELS[x]).join(', ') : 'не отмечены'}
                    </P>
                    {f.assessment.unsureFlags.length > 0 && (
                      <P muted>Родитель не знает, нужно уточнить у врача: {f.assessment.unsureFlags.map((x) => FLAG_LABELS[x]).join(', ')}</P>
                    )}
                    {f.assessment.clearanceRequired && (
                      <P muted>Разрешение врача: {f.child.doctorClearanceConfirmed ? 'родитель подтвердил' : 'не подтверждено'}</P>
                    )}
                  </>
                ) : (
                  <P muted>Вопросы о том, что умеет ребёнок, ещё не пройдены.</P>
                )}
              </>
            ) : (
              <P muted>Профиль ребёнка ещё не заполнен.</P>
            )}
          </Card>

          <Card>
            <H2>Цель семьи</H2>
            {f.goal ? (
              <>
                <P>🎯 {f.goal.text}</P>
                <P muted>
                  Поставлена {fmt(f.goal.setAt)}
                  {lastReview ? ` · ${goalRatingLabel(lastReview.rating).toLowerCase()} (${fmt(lastReview.date)})` : ' · ещё не оценивали'}
                </P>
              </>
            ) : (
              <P muted>Цель не выбрана.</P>
            )}
          </Card>
        </Col>

        <Col>
          <Card>
            <H2>Занятия</H2>
            {stats.total === 0 ? (
              <P muted>Занятий пока не было.</P>
            ) : (
              <>
                <P>
                  Всего: {stats.total} · за последние 7 дней: {stats.thisWeek} из {TARGET_SESSIONS_PER_WEEK}
                </P>
                <BarChart
                  data={weeks.map((w) => ({ label: w.label, value: w.count }))}
                  target={TARGET_SESSIONS_PER_WEEK}
                  summary={`Занятий по неделям: ${weeks.map((w) => `неделя с ${w.label} — ${w.count}`).join(', ')}. Цель — ${TARGET_SESSIONS_PER_WEEK} в неделю`}
                />
              </>
            )}
          </Card>

          <Card>
            <H2>Тесты динамики</H2>
            {tested.length === 0 && <P muted>Тесты ещё не проходили.</P>}
            {dynamics && <TrendScale score={dynamics.score} label={TREND_LABEL[dynamics.kind]} />}
            {dynamics && <P muted>В целом с первого теста: {TREND_LABEL[dynamics.kind]}.</P>}
            {tested.map(({ t, results }) => (
              <View key={t.id} style={{ gap: 2, paddingTop: 6 }}>
                <P>{t.title}</P>
                <P muted>{results.map((r) => `${r.value} ${t.unit} (${fmt(r.date)})`).join(' → ')}</P>
              </View>
            ))}
          </Card>

          <Card>
            <H2>История занятий</H2>
            {history.length === 0 && <P muted>Пока нет выполненных занятий.</P>}
            {shown.map((s) => {
              const signs = (s.painSigns ?? []).map((x) => PAIN_SIGNS.find((p) => p.id === x)?.label.toLowerCase()).filter(Boolean);
              const area = PAIN_AREAS.find((a) => a.id === s.painArea)?.label.toLowerCase();
              return (
                <View key={s.id} style={{ gap: 2, paddingVertical: 6 }}>
                  <P>
                    {fmt(s.date)} · {FEEDBACK_LABEL[s.feedback]}
                    {s.pain ? ' · была боль' : ''}
                  </P>
                  {s.pain && (signs.length > 0 || !!area) && (
                    <P muted>{[signs.join(', '), area ? `где: ${area}` : ''].filter(Boolean).join('; ')}</P>
                  )}
                  <P muted>{s.items.map((i) => exerciseTitle(i.exerciseId)).join(', ')}</P>
                </View>
              );
            })}
            {history.length > HISTORY_PREVIEW && (
              <Button title={showAll ? 'Свернуть' : `Показать все (${history.length})`} variant="secondary" onPress={() => setShowAll(!showAll)} />
            )}
          </Card>
        </Col>
      </Columns>
    </Screen>
  );
}
