import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { loadContent, mergedArticles, type AdminContent } from '@/src/admin/content';
import { ADMIN, ListRow } from '@/src/admin/ui';
import { CATEGORY_LABELS, CATEGORY_TINT } from '@/src/content/articles';
import { ARTICLE_CATEGORIES } from '@/src/domain/library';
import { Button, Chip, ChipRow, Field, H2, Notice, P, Screen, fs } from '@/src/ui/kit';

/** Раздел «Статьи»: статьи для родителей по рубрикам. */
export default function AdminArticles() {
  const [content, setContent] = useState<AdminContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [archive, setArchive] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    loadContent()
      .then(setContent)
      .catch(() => setFailed(true));
  }, []);
  useFocusEffect(load);

  const all = content ? mergedArticles(content) : [];
  const q = query.trim().toLowerCase();
  const rows = all.filter((m) => !!m.archived === archive).filter((m) => !q || m.item.title.toLowerCase().includes(q));
  const archivedCount = all.filter((m) => m.archived).length;

  return (
    <Screen>
      <Notice>
        Правки и новые статьи хранятся только на этом устройстве. Родители видят статьи из приложения: чтобы показать им
        ваши изменения, нужен сервер.
      </Notice>
      <Button title="Написать статью" onPress={() => router.push(ADMIN.articleEdit)} />
      {failed && (
        <>
          <Notice>Не удалось прочитать сохранённые статьи.</Notice>
          <Button title="Повторить" variant="secondary" onPress={load} />
        </>
      )}
      {!content && !failed && <ActivityIndicator />}
      {content && (
        <>
          <Field label="Поиск по заголовку" value={query} onChangeText={setQuery} />
          <ChipRow>
            <Chip label={`Статьи (${all.length - archivedCount})`} selected={!archive} onPress={() => setArchive(false)} />
            <Chip label={`Архив (${archivedCount})`} selected={archive} onPress={() => setArchive(true)} />
          </ChipRow>
          {rows.length === 0 && <P muted>{q ? 'Ничего не нашлось. Измените запрос.' : archive ? 'В архиве пусто.' : 'Статей нет.'}</P>}
          {ARTICLE_CATEGORIES.map((category) => {
            const inCategory = rows.filter((m) => m.item.category === category);
            if (inCategory.length === 0) return null;
            return (
              <View key={category} style={{ gap: 8 }}>
                <H2>{CATEGORY_LABELS[category]}</H2>
                {inCategory.map((m) => {
                  const origin = m.origin === 'builtin' ? 'из приложения' : m.origin === 'edited' ? 'из приложения, изменено вами' : 'написано вами';
                  const review = m.item.reviewedBy ? `проверено: ${m.item.reviewedBy}` : 'ждёт проверки специалистом';
                  return (
                    <ListRow
                      key={m.item.id}
                      title={m.item.title}
                      subtitle={`${m.item.minutes} мин чтения · ${origin} · ${review}`}
                      note={m.baseChanged ? 'Статья в приложении изменилась после вашей правки — проверьте' : undefined}
                      dimmed={m.archived}
                      left={
                        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: CATEGORY_TINT[category] }}>
                          <Text style={{ fontSize: fs(18) }}>{m.item.icon}</Text>
                        </View>
                      }
                      onPress={() => router.push({ pathname: ADMIN.articleEdit, params: { id: m.item.id } })}
                    />
                  );
                })}
              </View>
            );
          })}
        </>
      )}
    </Screen>
  );
}
