import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { articleById } from '@/src/content/articles';
import { useApp } from '@/src/state/AppState';
import { ArticleBody } from '@/src/ui/ArticleBody';
import { Button, P, Screen } from '@/src/ui/kit';

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, markArticleRead } = useApp();
  const article = articleById(id);

  useEffect(() => {
    if (ready && article) markArticleRead(article.id);
  }, [ready, article, markArticleRead]);

  if (!article) {
    return (
      <Screen>
        <P>Статья не найдена.</P>
        <Button title="К списку статей" onPress={() => router.replace('/(tabs)/read')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <ArticleBody article={article} />
      <Button title="К списку статей" variant="secondary" onPress={() => router.replace('/(tabs)/read')} />
    </Screen>
  );
}
