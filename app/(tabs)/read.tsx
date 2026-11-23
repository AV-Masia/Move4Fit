import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ARTICLES, CATEGORY_LABELS, CATEGORY_TINT, type ArticleCategory } from '@/src/content/articles';
import { useApp } from '@/src/state/AppState';
import { ArticleBody } from '@/src/ui/ArticleBody';
import { Chip, ChipRow, ExerciseRow, H1, H2, NavRow, P, Screen, SplitView, colors, useLayout, fs } from '@/src/ui/kit';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ArticleCategory[];

/** Библиотека статей для родителей. На планшете и компьютере — список слева, выбранная статья справа. */
export default function Read() {
  const { ready, readArticles, markArticleRead } = useApp();
  const [category, setCategory] = useState<ArticleCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { tablet } = useLayout();
  const split = tablet;
  const read = readArticles ?? [];
  const list = ARTICLES.filter((a) => !category || a.category === category);
  const selected = list.find((a) => a.id === selectedId) ?? list[0];

  // В раскладке со статьёй справа открытая статья считается прочитанной.
  useEffect(() => {
    if (split && ready && selected) markArticleRead(selected.id);
  }, [split, ready, selected, markArticleRead]);

  const filter = (
    <ChipRow>
      <Chip label="Все" selected={category === null} onPress={() => setCategory(null)} />
      {CATEGORIES.map((c) => (
        <Chip key={c} label={CATEGORY_LABELS[c]} selected={category === c} onPress={() => setCategory(c)} />
      ))}
    </ChipRow>
  );
  const check = <Text style={{ color: colors.done, fontSize: fs(18), fontWeight: '800' }}>✓</Text>;

  if (split) {
    return (
      <SplitView
        master={
          <>
            <H2>Читать</H2>
            {filter}
            <View style={{ gap: 4, paddingTop: 6 }}>
              {list.map((a) => (
                <NavRow
                  key={a.id}
                  icon={a.icon}
                  title={a.title}
                  subtitle={`${a.minutes} мин`}
                  selected={selected?.id === a.id}
                  right={read.includes(a.id) ? check : undefined}
                  onPress={() => setSelectedId(a.id)}
                />
              ))}
            </View>
          </>
        }
        detail={selected ? <ArticleBody article={selected} /> : <P muted>В этой рубрике пока нет статей.</P>}
      />
    );
  }

  return (
    <Screen wide>
      <H1>Читать</H1>
      <P muted>Короткие статьи: поддержка, простые объяснения и истории людей.</P>
      {filter}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -4 }}>
        {list.map((a) => (
          <Pressable
            key={a.id}
            style={{ width: '100%', padding: 4 }}
            accessibilityRole="link"
            accessibilityLabel={`${a.title}, ${a.minutes} мин`}
            onPress={() => router.push({ pathname: '/article/[id]', params: { id: a.id } })}>
            <ExerciseRow
              icon={a.icon}
              tint={CATEGORY_TINT[a.category]}
              title={a.title}
              subtitle={`${CATEGORY_LABELS[a.category]} · ${a.minutes} мин`}
              right={read.includes(a.id) ? check : undefined}
            />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
