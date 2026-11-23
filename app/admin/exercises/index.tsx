import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { isLocalVideoAvailable, loadContent, mergedExercises, type AdminContent } from '@/src/admin/content';
import { ADMIN, ListRow, statusText } from '@/src/admin/ui';
import { PART_LABELS } from '@/src/domain/content';
import { LEVEL_DESCRIPTIONS } from '@/src/domain/functionalLevel';
import { Button, Chip, ChipRow, Field, Notice, P, Screen, fs, partIcon, partTint } from '@/src/ui/kit';

type Filter = 'active' | 'mine' | 'archived';

/** Раздел «Упражнения»: упражнения приложения и созданные администратором. */
export default function AdminExercises() {
  const [content, setContent] = useState<AdminContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('active');
  const [query, setQuery] = useState('');

  const load = useCallback(() => {
    setFailed(false);
    loadContent()
      .then(setContent)
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(load);

  const all = content ? mergedExercises(content) : [];
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((m) => (filter === 'archived' ? m.archived : !m.archived && (filter === 'active' || m.origin !== 'builtin')))
    .filter((m) => !q || m.item.title.toLowerCase().includes(q));
  const count = (f: Filter) =>
    all.filter((m) => (f === 'archived' ? m.archived : !m.archived && (f === 'active' || m.origin !== 'builtin'))).length;

  return (
    <Screen>
      <Notice>
        Правки и новые упражнения хранятся только на этом устройстве и родителям не показываются: сервер ещё не
        подключён, а каждое изменение должен утвердить специалист.
      </Notice>
      <Button title="Создать упражнение" onPress={() => router.push(ADMIN.exerciseEdit)} />
      {failed && (
        <>
          <Notice>Не удалось прочитать сохранённые упражнения.</Notice>
          <Button title="Повторить" variant="secondary" onPress={load} />
        </>
      )}
      {!content && !failed && <ActivityIndicator />}
      {content && (
        <>
          <Field label="Поиск по названию" value={query} onChangeText={setQuery} />
          <ChipRow>
            <Chip label={`Все (${count('active')})`} selected={filter === 'active'} onPress={() => setFilter('active')} />
            <Chip label={`Изменённые и мои (${count('mine')})`} selected={filter === 'mine'} onPress={() => setFilter('mine')} />
            <Chip label={`Архив (${count('archived')})`} selected={filter === 'archived'} onPress={() => setFilter('archived')} />
          </ChipRow>
          {rows.length === 0 && (
            <P muted>
              {q
                ? 'Ничего не нашлось. Измените запрос.'
                : filter === 'mine'
                  ? 'Вы пока не меняли и не создавали упражнения.'
                  : filter === 'archived'
                    ? 'В архиве пусто.'
                    : 'Упражнений нет.'}
            </P>
          )}
          {rows.map((m) => {
            const e = m.item;
            const local = content.localVideos[e.id];
            const video = e.videoUrl ? 'видео по ссылке' : local ? (isLocalVideoAvailable(local.uri) ? 'видео с устройства' : 'видео нужно выбрать заново') : 'без видео';
            return (
              <ListRow
                key={e.id}
                title={e.title}
                subtitle={`${PART_LABELS[e.part]} · ${e.levels.map((l) => LEVEL_DESCRIPTIONS[l].title).join(', ')} · ${video}\n${statusText(m)}`}
                note={m.baseChanged ? 'Упражнение в приложении изменилось после вашей правки — проверьте' : undefined}
                dimmed={m.archived}
                left={
                  <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: partTint[e.part] }}>
                    <Text style={{ fontSize: fs(18) }}>{partIcon[e.part]}</Text>
                  </View>
                }
                onPress={() => router.push({ pathname: ADMIN.exerciseEdit, params: { id: e.id } })}
              />
            );
          })}
        </>
      )}
    </Screen>
  );
}
