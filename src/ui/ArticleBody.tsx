import { Text, View } from 'react-native';

import { CATEGORY_LABELS, CATEGORY_TINT, type Article } from '@/src/content/articles';

import { H1, H2, Notice, P, colors, fs } from './kit';

/** Текст статьи: рубрика, заголовок, абзацы и пометка о проверке специалистом. */
export function ArticleBody({ article }: { article: Article }) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ backgroundColor: CATEGORY_TINT[article.category], borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ fontSize: fs(13), fontWeight: '700', color: colors.text }}>{CATEGORY_LABELS[article.category]}</Text>
        </View>
        <Text style={{ fontSize: fs(13), color: colors.muted }}>{article.minutes} мин чтения</Text>
      </View>
      <H1>{article.title}</H1>
      {article.body.map((block, i) =>
        block.startsWith('## ') ? <H2 key={i}>{block.slice(3)}</H2> : <P key={i}>{block}</P>,
      )}
      {article.reviewedBy ? (
        <P muted>✓ Проверено специалистом: {article.reviewedBy}</P>
      ) : (
        <Notice>Статья ждёт проверки специалистом. Она не заменяет консультацию врача.</Notice>
      )}
    </>
  );
}
