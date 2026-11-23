import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { loadFamilyLog, type FamilyLog } from '@/src/admin/familyLog';
import { loadFamilies, type FamiliesResult } from '@/src/admin/source';
import { overview, registrationsByWeek, sortForAdmin, type FamilyRecord, type Signal } from '@/src/domain/admin';
import { formatAge } from '@/src/domain/profile';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { BarChart, Button, Card, Chip, ChipRow, Col, Columns, Field, H2, Notice, P, Screen, StatTile, colors, fs, tints } from '@/src/ui/kit';

const fmt = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

type Filter = 'all' | 'attention';

/** Раздел «Семьи»: сколько семей зарегистрировалось и с кем стоит связаться. */
export default function AdminFamilies() {
  const [data, setData] = useState<(FamiliesResult & { log: FamilyLog }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setFailed(false);
    Promise.all([loadFamilies(), loadFamilyLog()])
      .then(([families, log]) => setData({ ...families, log }))
      .catch(() => setFailed(true));
  }, []);
  // При возврате из карточки семьи отметки «сигнал обработан» перечитываются.
  useFocusEffect(load);

  if (failed) {
    return (
      <Screen>
        <Notice>Не удалось загрузить список семей. Проверьте соединение и попробуйте ещё раз.</Notice>
        <Button title="Повторить" onPress={load} />
      </Screen>
    );
  }
  if (!data) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const handled = new Set(data.log.handled);
  const today = new Date();
  const stats = overview(data.families, today, handled);
  const weeks = registrationsByWeek(data.families);
  const q = query.trim().toLowerCase();
  const rows = sortForAdmin(data.families, today, handled)
    .filter((r) => filter === 'all' || r.signals.length > 0)
    .filter(
      (r) =>
        !q ||
        [r.family.parent.name, r.family.parent.email, r.family.child?.name ?? ''].some((v) => v.toLowerCase().includes(q)),
    );
  const lastContact = (familyId: string) =>
    data.log.contacts
      .filter((c) => c.familyId === familyId)
      .map((c) => c.at)
      .sort()
      .pop();

  return (
    <Screen wide>
      {data.demo && (
        <Notice>
          Это выдуманные семьи для примера. Сервер ещё не подключён: данные настоящих пользователей хранятся только на
          их телефонах и сюда не попадают.
        </Notice>
      )}
      <Columns>
        <Col>
          <Card>
            <H2>Регистрации</H2>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
              <StatTile value={String(stats.registered)} label="Всего семей" tint={tints.pink} />
              <StatTile value={String(stats.needAttention)} label="Нужно связаться" tint={tints.peach} />
              <StatTile value={`+${stats.newThisWeek}`} label="Новых за 7 дней" tint={tints.teal} />
              <StatTile value={`+${stats.newThisMonth}`} label="Новых за 30 дней" tint={tints.lilac} />
              <StatTile value={String(stats.activeThisWeek)} label="Занимались за 7 дней" tint={tints.green} />
            </View>
          </Card>
          <Card>
            <H2>Новые семьи по неделям</H2>
            <BarChart
              data={weeks}
              summary={`Регистрации по неделям: ${weeks.map((w) => `неделя с ${w.label} — ${w.value}`).join(', ')}`}
            />
          </Card>
        </Col>
        <Col>
          <Field label="Поиск по имени или почте" value={query} onChangeText={setQuery} autoCapitalize="none" />
          <ChipRow>
            <Chip label={`Все (${stats.registered})`} selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip
              label={`Нужно связаться (${stats.needAttention})`}
              selected={filter === 'attention'}
              onPress={() => setFilter('attention')}
            />
          </ChipRow>
          {rows.length === 0 && (
            <P muted>
              {data.families.length === 0
                ? 'Пока никто не зарегистрировался.'
                : filter === 'attention' && !q
                  ? 'Сейчас нет семей, с которыми нужно связаться.'
                  : 'Никого не нашлось. Измените запрос или фильтр.'}
            </P>
          )}
          {rows.map((r) => (
            <FamilyRow key={r.family.id} family={r.family} signals={r.signals} lastContact={lastContact(r.family.id)} />
          ))}
        </Col>
      </Columns>
    </Screen>
  );
}

function FamilyRow({ family, signals, lastContact }: { family: FamilyRecord; signals: Signal[]; lastContact?: string }) {
  const { parent, child, assessment } = family;
  const restricted = !!assessment && assessment.safetyFlags.length + assessment.unsureFlags.length > 0;
  const groupLine = assessment
    ? `${LEVEL_DESCRIPTIONS[assessment.level].title}${restricted ? ' · есть запреты врача' : ''}`
    : 'вопросы не пройдены';
  const urgent = signals.some((s) => s.severity === 'urgent');
  const childLine = child ? `${child.name}, ${formatAge(child.ageYears)} · ${groupLine}` : 'Профиль ребёнка не заполнен';
  const contactLine = lastContact ? `Последний контакт: ${fmt(lastContact)}` : '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[parent.name, childLine, contactLine, ...signals.map((s) => s.text)].filter(Boolean).join('. ')}
      onPress={() => router.push({ pathname: '/admin/families/[id]', params: { id: family.id } })}
      style={{
        backgroundColor: colors.card,
        borderRadius: 18,
        padding: 14,
        gap: 4,
        borderLeftWidth: 5,
        borderLeftColor: urgent ? colors.primary : signals.length > 0 ? colors.sunEdge : colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: fs(16), fontWeight: '700', color: colors.text }}>{parent.name}</Text>
        <Text style={{ fontSize: fs(13), color: colors.muted }}>с {fmt(family.registeredAt)}</Text>
        <Text style={{ fontSize: fs(20), color: colors.muted }}>›</Text>
      </View>
      <Text style={{ fontSize: fs(14), color: colors.muted }}>{childLine}</Text>
      {!!contactLine && <Text style={{ fontSize: fs(14), color: colors.muted }}>{contactLine}</Text>}
      {signals.map((s) => (
        <Text key={s.key} style={{ fontSize: fs(14), lineHeight: fs(20), color: colors.warn, fontWeight: s.severity === 'urgent' ? '700' : '400' }}>
          {s.severity === 'urgent' ? '❗ ' : '• '}
          {s.text}
        </Text>
      ))}
    </Pressable>
  );
}
