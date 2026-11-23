import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { loadContent, mergedArticles, newContentId, removeItem, saveItem } from '@/src/admin/content';
import { ADMIN, goBack, useGuardedBack } from '@/src/admin/ui';
import { ARTICLES, CATEGORY_LABELS, type Article } from '@/src/content/articles';
import { ARTICLE_CATEGORIES, articleTextChanged, blankArticle, isHeading, readingMinutes, validateArticle, type Origin } from '@/src/domain/library';
import { ArticleBody } from '@/src/ui/ArticleBody';
import { Button, Card, Chip, ChipRow, Col, Columns, Field, H2, Notice, P, Screen, colors, fs, useLayout } from '@/src/ui/kit';

const ICONS = ['🤍', '🌱', '💬', '🧩', '🧠', '🤸', '🏡', '😴', '🍎', '⭐', '📄', '❤️'];

/** Блок текста в редакторе. Разметку «## » администратор не видит — тип блока выбирается кнопкой. */
interface Block {
  key: string;
  heading: boolean;
  text: string;
}

interface Form {
  article: Article;
  blocks: Block[];
}

let blockSeq = 0;
const newBlock = (heading: boolean, text = ''): Block => ({ key: `b${++blockSeq}`, heading, text });
const toBlocks = (body: string[]) => body.map((b) => (isHeading(b) ? newBlock(true, b.slice(3)) : newBlock(false, b)));
const toArticle = (f: Form): Article => {
  const body = f.blocks.map((b) => (b.heading ? `## ${b.text.trim()}` : b.text.trim()));
  return { ...f.article, title: f.article.title.trim(), reviewedBy: f.article.reviewedBy?.trim() || undefined, body, minutes: readingMinutes(body) };
};

function SmallButton({ label, hint, onPress, disabled }: { label: string; hint: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      disabled={disabled}
      onPress={onPress}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 2, borderColor: colors.border, opacity: disabled ? 0.35 : 1 }}>
      <Text style={{ fontSize: fs(16), color: colors.primaryInk, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

/** Редактор статьи: рубрика, заголовок, текст блоками и предпросмотр «как увидит родитель». */
export default function AdminArticleEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { desktop } = useLayout();
  const [form, setForm] = useState<Form | null>(null);
  const [meta, setMeta] = useState<{ origin: Origin | 'new'; builtIn?: Article; saved?: Article; archived: boolean; baseChanged: boolean } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [tab, setTab] = useState<'text' | 'preview'>('text');
  const [errors, setErrors] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initial = useRef('');

  const dirty = !!form && JSON.stringify(form) !== initial.current;
  useGuardedBack(dirty, ADMIN.articles);

  useEffect(() => {
    loadContent()
      .then((c) => {
        const found = id ? mergedArticles(c).find((m) => m.item.id === id) : undefined;
        if (id && !found) {
          setState('missing');
          return;
        }
        const article = found?.item ?? blankArticle(newContentId('custom'));
        const f: Form = { article, blocks: toBlocks(article.body) };
        initial.current = JSON.stringify(f);
        setForm(f);
        setMeta({
          origin: found?.origin ?? 'new',
          builtIn: ARTICLES.find((a) => a.id === id),
          saved: found?.item,
          archived: !!found?.archived,
          baseChanged: !!found?.baseChanged,
        });
        setState('ready');
      })
      .catch(() => setState('failed'));
  }, [id]);

  if (state === 'missing' || state === 'failed') {
    return (
      <Screen>
        {state === 'missing' ? <P>Такой статьи нет — возможно, она удалена.</P> : <Notice>Не удалось прочитать сохранённые статьи. Попробуйте открыть экран ещё раз.</Notice>}
        <Button title="К списку статей" variant="secondary" onPress={() => goBack(ADMIN.articles)} />
      </Screen>
    );
  }
  if (!form || !meta) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const a = form.article;
  const setArticle = (patch: Partial<Article>) => setForm({ ...form, article: { ...a, ...patch } });
  const setBlocks = (blocks: Block[]) => setForm({ ...form, blocks });
  const move = (i: number, by: number) => {
    const next = [...form.blocks];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setBlocks(next);
  };
  const current = toArticle(form);
  // Текст изменили после проверки, а имя проверившего осталось прежним — отметка снимается.
  const reviewWillReset = !!meta.saved?.reviewedBy && current.reviewedBy === meta.saved.reviewedBy && articleTextChanged(meta.saved, current);

  const persist = async (archived: boolean) => {
    const article = reviewWillReset ? { ...current, reviewedBy: undefined } : current;
    const found = validateArticle(article);
    setErrors(found);
    if (found.length > 0) {
      setTab('text');
      return;
    }
    try {
      setProblem('');
      await saveItem('articles', { item: article, archived: archived || undefined, base: meta.builtIn ? JSON.stringify(meta.builtIn) : undefined });
      goBack(ADMIN.articles);
    } catch {
      setProblem('Не удалось сохранить статью на этом устройстве. Попробуйте ещё раз.');
    }
  };

  const remove = async () => {
    try {
      await removeItem('articles', a.id);
      goBack(ADMIN.articles);
    } catch {
      setProblem('Не удалось выполнить действие. Попробуйте ещё раз.');
    }
  };

  const editor = (
    <>
      <Card>
        <H2>О статье</H2>
        <P muted>Рубрика</P>
        <ChipRow>
          {ARTICLE_CATEGORIES.map((c) => (
            <Chip key={c} label={CATEGORY_LABELS[c]} selected={a.category === c} onPress={() => setArticle({ category: c })} />
          ))}
        </ChipRow>
        <Field label="Заголовок" value={a.title} onChangeText={(title) => setArticle({ title })} />
        <P muted>Значок</P>
        <ChipRow>
          {[...new Set([a.icon, ...ICONS])].filter(Boolean).map((icon) => (
            <Chip key={icon} label={icon} selected={a.icon === icon} onPress={() => setArticle({ icon })} />
          ))}
        </ChipRow>
        <P muted>Время чтения считается само: около {current.minutes} мин.</P>
      </Card>

      <Card>
        <H2>Текст</H2>
        {form.blocks.length === 0 && <P muted>Текста пока нет. Добавьте первый абзац.</P>}
        {form.blocks.map((b, i) => (
          <View key={b.key} style={{ gap: 6, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Field
              label={b.heading ? 'Подзаголовок' : 'Абзац'}
              value={b.text}
              onChangeText={(text) => setBlocks(form.blocks.map((x) => (x.key === b.key ? { ...x, text } : x)))}
              multiline={!b.heading}
              style={b.heading ? { fontWeight: '700' } : { minHeight: 110, textAlignVertical: 'top' }}
            />
            <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
              <SmallButton label="↑" hint="Поднять выше" disabled={i === 0} onPress={() => move(i, -1)} />
              <SmallButton label="↓" hint="Опустить ниже" disabled={i === form.blocks.length - 1} onPress={() => move(i, 1)} />
              <SmallButton label="✕" hint="Удалить блок" onPress={() => setBlocks(form.blocks.filter((x) => x.key !== b.key))} />
            </View>
          </View>
        ))}
        <Button title="+ Абзац" variant="secondary" onPress={() => setBlocks([...form.blocks, newBlock(false)])} />
        <Button title="+ Подзаголовок" variant="secondary" onPress={() => setBlocks([...form.blocks, newBlock(true)])} />
      </Card>

      <Card>
        <H2>Проверка специалистом</H2>
        <Field
          label="Кто проверил (фамилия и специальность). Пусто — ещё не проверено"
          value={a.reviewedBy ?? ''}
          onChangeText={(reviewedBy) => setArticle({ reviewedBy })}
        />
        {reviewWillReset && <Notice>Вы изменили текст после проверки. При сохранении отметка о проверке будет снята.</Notice>}
        <P muted>Пока здесь пусто, родитель видит под статьёй пометку «ждёт проверки специалистом». Это пометка на вашем устройстве, а не подпись специалиста.</P>
      </Card>
    </>
  );

  const preview = (
    <Card>
      <P muted>Как увидит родитель</P>
      <ArticleBody article={reviewWillReset ? { ...current, reviewedBy: undefined } : current} />
    </Card>
  );

  return (
    <Screen wide>
      {meta.baseChanged && <Notice>Статья в приложении изменилась после вашей правки. Сверьте текст и сохраните ещё раз.</Notice>}
      {meta.archived && <Notice>Статья в архиве.</Notice>}
      {desktop ? (
        <Columns>
          <Col>{editor}</Col>
          <Col>{preview}</Col>
        </Columns>
      ) : (
        <>
          <ChipRow>
            <Chip label="Текст" selected={tab === 'text'} onPress={() => setTab('text')} />
            <Chip label="Как увидит родитель" selected={tab === 'preview'} onPress={() => setTab('preview')} />
          </ChipRow>
          {tab === 'text' ? editor : preview}
        </>
      )}

      {errors.length > 0 && <Notice>{`Проверьте заполнение:\n${errors.map((x) => `• ${x}`).join('\n')}`}</Notice>}
      {!!problem && <Notice>{problem}</Notice>}
      <Button title="Сохранить статью" onPress={() => persist(meta.archived)} />
      {meta.origin !== 'new' && (
        <Button title={meta.archived ? 'Вернуть из архива' : 'Убрать в архив'} variant="secondary" onPress={() => persist(!meta.archived)} />
      )}
      {meta.origin === 'edited' && <Button title="Сбросить мои правки" variant="secondary" onPress={remove} />}
      {meta.origin === 'custom' &&
        (confirmDelete ? (
          <>
            <Notice>Статья будет удалена без возможности вернуть.</Notice>
            <Button title="Удалить статью" onPress={remove} />
            <Button title="Отмена" variant="secondary" onPress={() => setConfirmDelete(false)} />
          </>
        ) : (
          <Button title="Удалить" variant="secondary" onPress={() => setConfirmDelete(true)} />
        ))}
    </Screen>
  );
}
